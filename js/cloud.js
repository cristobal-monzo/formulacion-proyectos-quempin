/*
 * cloud.js — Almacenamiento compartido en Firebase (Firestore + Authentication).
 *
 * Si js/firebase-config.js no tiene la configuración del proyecto Firebase, o la página
 * se abre como archivo (file://), la herramienta sigue en modo local (localStorage).
 *
 * Colecciones en Firestore (reglas en firestore.rules):
 *   usuarios/{correo}   { rol: 'admin' | 'editor', nombre }  → quién puede entrar
 *   proyectos/{uid}     { uid, codigo, version, titulo, estado, modificado, modificadoPor,
 *                         eliminado, sesion, actualizado, datos }  → datos = proyecto en JSON
 *   config/empresa      { prefijo, parametros, catalogoOtros }  → valores predeterminados
 *
 * Sincronización: al abrir se leen los proyectos del caché local de Firestore (IndexedDB) y
 * se escuchan solo los documentos con "actualizado" posterior al más reciente del caché.
 * Así cada apertura lee del servidor solo lo que cambió, no la cartera completa.
 * Eliminar definitivamente deja una lápida (purgado: true) para que las demás sesiones lo sepan.
 */
(function (root) {
  'use strict';

  const S = root.QStore;
  const CFG = root.QPN_FIREBASE || {};
  const LS_EMAIL_ENLACE = 'qpn.formulacion.correoEnlace';
  const MARGEN_MS = 5 * 60 * 1000; // relectura de seguridad al reanudar la escucha
  const SESION = S.uid() + S.uid();

  const configurado = !!(CFG.apiKey && CFG.projectId) && root.location.protocol !== 'file:';
  const sdk = configurado && typeof root.firebase !== 'undefined';

  let auth = null, db = null;
  let estado = configurado ? 'cargando' : 'local';
  let detalle = '';
  let usuario = null;
  let pendientes = 0;
  let enLinea = root.navigator ? root.navigator.onLine !== false : true;
  let desuscribir = [];
  const purgados = new Set(); // eliminados definitivamente: no se vuelven a ofrecer para subir
  const oyentes = [];

  function setEstado(e, d) {
    estado = e; detalle = d || '';
    oyentes.slice().forEach((fn) => { try { fn(info()); } catch (err) { console.error(err); } });
  }
  function info() { return { estado, detalle, usuario, pendientes, enLinea, configurado }; }
  function onEstado(fn) { oyentes.push(fn); fn(info()); }

  function mensajeError(err) {
    const code = (err && err.code) || '';
    if (code.includes('permission-denied')) return 'No tienes permiso para hacer este cambio.';
    if (code.includes('unavailable')) return 'Sin conexión con la nube.';
    if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) return 'Se cerró la ventana de ingreso.';
    if (code.includes('unauthorized-domain')) return 'Este sitio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).';
    if (code.includes('operation-not-allowed')) return 'Este método de ingreso no está habilitado en Firebase (Authentication → Método de acceso).';
    if (code.includes('invalid-email')) return 'El correo no es válido.';
    if (code.includes('invalid-action-code') || code.includes('expired-action-code')) return 'El enlace ya se usó o venció. Pide uno nuevo.';
    return (err && err.message) || String(err);
  }

  // ---- Conversión proyecto ⇄ documento --------------------------------------------
  function aDoc(p) {
    const datos = JSON.stringify(p);
    if (datos.length > 900000) throw new Error('El proyecto supera el tamaño máximo de un documento (≈ 1 MB). Divídelo en dos proyectos.');
    return {
      uid: p.uid, codigo: p.codigo || '', version: parseInt(p.version, 10) || 1,
      titulo: p.titulo || '', cliente: p.cliente || '', estado: p.estado || '',
      modificado: p.modificado || '', modificadoPor: p.modificadoPor || usuario.email,
      eliminado: !!p.eliminado, sesion: SESION,
      actualizado: root.firebase.firestore.FieldValue.serverTimestamp(),
      datos
    };
  }
  function deDoc(d) {
    try { return JSON.parse(d.datos); } catch (e) { return null; }
  }

  // ---- Escrituras (backend de QStore) -------------------------------------------------
  function seguir(promesa, errorMsg) {
    pendientes++; S.emit({ type: 'sync', pendientes, enLinea }); setEstado(estado, detalle);
    return promesa.then(() => true, (err) => {
      console.error(err);
      S.emit({ type: 'error', mensaje: (errorMsg ? errorMsg + ' ' : '') + mensajeError(err) });
      return false;
    }).finally(() => {
      pendientes--; S.emit({ type: 'sync', pendientes, enLinea }); setEstado(estado, detalle);
    });
  }
  const backend = {
    saveProject(p) {
      let doc;
      try { doc = aDoc(p); } catch (err) { S.emit({ type: 'error', mensaje: err.message }); return; }
      seguir(db.collection('proyectos').doc(p.uid).set(doc), 'No se guardó en la nube.');
    },
    deleteProject(id) {
      seguir(db.collection('proyectos').doc(id).set({
        uid: id, purgado: true, eliminado: true, datos: '', sesion: SESION,
        modificado: new Date().toISOString(), modificadoPor: usuario.email,
        actualizado: root.firebase.firestore.FieldValue.serverTimestamp()
      }), 'No se eliminó en la nube.');
    },
    saveConfig(shared) {
      const doc = JSON.parse(JSON.stringify(shared));
      doc.modificadoPor = usuario.email;
      doc.actualizado = root.firebase.firestore.FieldValue.serverTimestamp();
      seguir(db.collection('config').doc('empresa').set(doc),
        usuario.rol === 'admin' ? 'No se guardó la configuración de la empresa.' : 'Solo un administrador puede cambiar la configuración de la empresa.');
    }
  };

  // ---- Lectura y escucha --------------------------------------------------------------
  function procesar(docs, opts) {
    const proyectos = [], borrados = [];
    let max = 0;
    docs.forEach((snap) => {
      const d = snap.data({ serverTimestamps: 'estimate' });
      if (!d) return;
      const t = d.actualizado && d.actualizado.toMillis ? d.actualizado.toMillis() : 0;
      if (!snap.metadata.hasPendingWrites) max = Math.max(max, t);
      if (d.purgado) purgados.add(d.uid || snap.id);
      if (d.sesion === SESION) return; // eco de un cambio hecho en esta misma página
      if (d.purgado) { purgados.add(d.uid || snap.id); borrados.push(d.uid || snap.id); return; }
      const p = deDoc(d);
      if (p) proyectos.push(p);
    });
    S.applyRemote(proyectos, borrados, opts);
    return max;
  }

  async function sincronizar() {
    setEstado('sincronizando');
    const col = db.collection('proyectos');
    let desde = 0;
    try {
      const cache = await col.get({ source: 'cache' });
      desde = procesar(cache.docs, { inicial: true });
    } catch (e) { /* sin caché: se lee todo del servidor */ }
    const q = desde ? col.where('actualizado', '>=', root.firebase.firestore.Timestamp.fromMillis(Math.max(0, desde - MARGEN_MS))) : col;
    let primera = true;
    let espera = null;
    const listo = (d) => { if (!primera) return; primera = false; clearTimeout(espera); setEstado('listo', d); };
    desuscribir.push(q.onSnapshot({ includeMetadataChanges: true }, (snap) => {
      const cambios = snap.docChanges().filter((c) => c.type !== 'removed').map((c) => c.doc);
      if (cambios.length) procesar(cambios, { inicial: primera });
      if (!snap.metadata.fromCache) listo('');
      else if (!enLinea) listo('sin-conexion');
      // Conexión lenta o intermitente: abrir con lo que hay en el caché y seguir escuchando.
      else if (primera && !espera) espera = setTimeout(() => listo('sin-conexion'), 8000);
    }, (err) => {
      console.error(err);
      setEstado('error', mensajeError(err));
    }));
    desuscribir.push(db.collection('config').doc('empresa').onSnapshot((snap) => {
      const c = snap.exists ? snap.data() : {};
      delete c.actualizado; delete c.modificadoPor;
      S.setSharedConfig(c);
    }, (err) => console.error(err)));
  }

  function detener() {
    desuscribir.forEach((fn) => { try { fn(); } catch (e) { /* ya cerrada */ } });
    desuscribir = [];
  }

  // ---- Sesión ----------------------------------------------------------------------------
  async function alEntrar(u) {
    detener();
    if (!u) { usuario = null; S.useCloud(backend, null); setEstado('sin-sesion'); return; }
    const email = String(u.email || '').toLowerCase();
    if (!u.emailVerified) { setEstado('no-autorizado', email); return; }
    setEstado('cargando');
    let reg = null;
    try {
      const snap = await db.collection('usuarios').doc(email).get();
      if (snap.exists) reg = snap.data();
    } catch (err) {
      if (!String(err.code || '').includes('permission-denied')) { setEstado('error', mensajeError(err)); return; }
    }
    if (!reg) { usuario = { email, nombre: u.displayName || email }; setEstado('no-autorizado', email); return; }
    usuario = { email, nombre: reg.nombre || u.displayName || email, rol: reg.rol === 'admin' ? 'admin' : 'editor' };
    S.useCloud(backend, usuario);
    sincronizar();
  }

  function iniciar() {
    if (!configurado) return;
    if (!sdk) { setEstado('error', 'No se pudo cargar la librería de Firebase.'); return; }
    // Sin sesión todavía: modo nube vacío, para no mostrar ni editar los proyectos locales.
    S.useCloud(backend, null);
    root.firebase.initializeApp(CFG);
    auth = root.firebase.auth();
    auth.languageCode = 'es';
    db = root.firebase.firestore();
    db.settings({ cacheSizeBytes: root.firebase.firestore.CACHE_SIZE_UNLIMITED, merge: true });
    db.enablePersistence({ synchronizeTabs: true }).catch((e) => console.warn('Caché sin conexión no disponible:', e.code || e));
    root.addEventListener('online', () => { enLinea = true; S.emit({ type: 'sync', pendientes, enLinea }); setEstado(estado, detalle === 'sin-conexion' ? '' : detalle); });
    root.addEventListener('offline', () => { enLinea = false; S.emit({ type: 'sync', pendientes, enLinea }); setEstado(estado, detalle); });
    if (auth.isSignInWithEmailLink(root.location.href)) completarEnlaceGuardado();
    auth.getRedirectResult().catch((err) => setEstado('sin-sesion', mensajeError(err)));
    auth.onAuthStateChanged(alEntrar);
  }

  // ---- Ingreso ---------------------------------------------------------------------------
  async function entrarConGoogle() {
    const prov = new root.firebase.auth.GoogleAuthProvider();
    prov.setCustomParameters({ prompt: 'select_account' });
    try { await auth.signInWithPopup(prov); } catch (err) {
      if (String(err.code || '').includes('popup-blocked')) return auth.signInWithRedirect(prov);
      throw new Error(mensajeError(err));
    }
  }
  async function enviarEnlace(email) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo válido.');
    try {
      await auth.sendSignInLinkToEmail(email, { url: root.location.href.split('#')[0], handleCodeInApp: true });
    } catch (err) { throw new Error(mensajeError(err)); }
    try { root.localStorage.setItem(LS_EMAIL_ENLACE, email); } catch (e) { /* sin almacenamiento */ }
    return email;
  }
  function correoEnlacePendiente() {
    return auth && auth.isSignInWithEmailLink(root.location.href);
  }
  async function completarEnlace(email) {
    try {
      await auth.signInWithEmailLink(String(email).trim().toLowerCase(), root.location.href);
    } catch (err) { throw new Error(mensajeError(err)); }
    try { root.localStorage.removeItem(LS_EMAIL_ENLACE); } catch (e) { /* sin almacenamiento */ }
    root.history.replaceState(null, '', root.location.pathname + root.location.hash);
  }
  function completarEnlaceGuardado() {
    let email = null;
    try { email = root.localStorage.getItem(LS_EMAIL_ENLACE); } catch (e) { /* sin almacenamiento */ }
    if (email) completarEnlace(email).catch((err) => setEstado('sin-sesion', err.message));
    else setEstado('sin-sesion', 'confirmar-correo'); // se abrió el enlace en otro navegador: pedir el correo
  }
  async function salir() {
    detener();
    await auth.signOut();
  }

  // ---- Usuarios (administradores) --------------------------------------------------------
  function escucharUsuarios(fn) {
    return db.collection('usuarios').onSnapshot((snap) => {
      fn(snap.docs.map((d) => Object.assign({ email: d.id }, d.data())).sort((a, b) => a.email.localeCompare(b.email)));
    }, (err) => fn(null, mensajeError(err)));
  }
  async function guardarUsuario(email, datos) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo válido.');
    try {
      await db.collection('usuarios').doc(email).set({
        nombre: datos.nombre || '', rol: datos.rol === 'admin' ? 'admin' : 'editor',
        agregadoPor: usuario.email, agregado: new Date().toISOString()
      });
    } catch (err) { throw new Error(mensajeError(err)); }
  }
  async function quitarUsuario(email) {
    if (email === usuario.email) throw new Error('No puedes quitarte a ti mismo.');
    try { await db.collection('usuarios').doc(email).delete(); } catch (err) { throw new Error(mensajeError(err)); }
  }

  // ---- Migración de proyectos guardados en el navegador ------------------------------
  function proyectosLocalesPendientes() {
    const enNube = new Set(S.all().concat(S.trash()).map((p) => p.uid));
    return S.localProjects().filter((p) => !enNube.has(p.uid) && !purgados.has(p.uid));
  }
  function subirLocales(lista) {
    lista.forEach((p) => S.upsert(p));
    return lista.length;
  }

  root.QCloud = {
    configurado, iniciar, onEstado, info,
    entrarConGoogle, enviarEnlace, correoEnlacePendiente, completarEnlace, salir,
    escucharUsuarios, guardarUsuario, quitarUsuario,
    proyectosLocalesPendientes, subirLocales,
    esAdmin: () => !!(usuario && usuario.rol === 'admin')
  };
})(window);
