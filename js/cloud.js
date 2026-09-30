/*
 * cloud.js — Proyectos compartidos en SharePoint (biblioteca del sitio «Formulación de proyectos»).
 *
 * Cada persona entra con su cuenta Microsoft de QUEMPIN (MSAL) y la herramienta lee y escribe con
 * Microsoft Graph, con los mismos permisos que esa persona tiene en SharePoint.
 * Si js/m365-config.js no tiene clientId, o la página se abre como archivo, sigue en modo local.
 *
 * Dónde queda cada proyecto: en un archivo «Formulación <código> v<versión>.json» dentro de la carpeta
 * de su oferta (p. ej. «301. Mantención calderas hospital»), junto al Excel de siempre. Si la carpeta se mueve
 * (a Adjudicadas o a Cerradas), el proyecto la sigue.
 *
 * Reglas que protegen los documentos reales. Se aplican en crearArchivo, reemplazarArchivo y
 * crearCarpeta, las únicas funciones que escriben:
 *  - Solo se escriben archivos «Formulación … .json/.xlsx» y «Formulador - configuración.json».
 *  - Reemplazar exige que el archivo sea de la herramienta y que no haya cambiado desde que se leyó
 *    (If-Match). Crear nunca sobrescribe.
 *  - Nunca se elimina, mueve ni renombra nada. «Eliminar» marca el proyecto dentro de su archivo.
 *  - Con «raiz» configurada (piloto), nada se lee ni se escribe fuera de esa carpeta.
 *  - Carpetas: solo se crean carpetas de oferta nuevas («N°. Título») y nunca se reemplaza una existente.
 *
 * Sincronización: la consulta delta de Graph trae la primera vez la lista de carpetas y archivos, y
 * después solo lo que cambió. Esa lista y los proyectos quedan en IndexedDB para abrir rápido.
 * Los cambios se suben tras unos segundos sin editar; cada subida es una versión en el historial de
 * SharePoint. Hasta subirse quedan también en este navegador, así que no se pierden al cerrar.
 */
(function (root) {
  'use strict';

  const S = root.QStore;
  const CFG = root.QPN_M365 || {};
  const enLocalhost = /^(localhost|127\.0\.0\.1)$/.test(root.location.hostname);
  const prueba = !!CFG.prueba && enLocalhost; // pruebas automáticas contra un Graph simulado
  const configurado = !!(CFG.sitio && (prueba || (CFG.clientId && CFG.tenantId))) && root.location.protocol !== 'file:';
  const GRAPH = (prueba && CFG.graph) || 'https://graph.microsoft.com/v1.0';
  const SCOPES = ['User.Read', 'Files.ReadWrite.All', 'Sites.Read.All'];
  const MSAL_LIB = 'vendor/msal/msal-browser.min.js';
  const NOMBRE_CONFIG = 'Formulador - configuración.json';
  const RE_PROPIO = /^Formulación .+\.(json|xlsx)$/;
  const RE_JSON = /^Formulación .+\.json$/;
  const RE_CARPETA_OFERTA = /^(\d+)\s*[.\-]\s*(.*)$/;
  const SELECT = 'id,name,parentReference,file,folder,root,deleted,eTag,cTag,webUrl,lastModifiedDateTime,lastModifiedBy';
  const ESPERA_SUBIDA = 8000;  // subir tras 8 s sin editar…
  const ESPERA_MAX = 60000;    // …y al menos una vez por minuto mientras se edita
  const CADA_SYNC = 30000;     // revisar cambios de otros cada 30 s con la página visible
  const REINTENTO = 30000;     // sin conexión o SharePoint ocupado: reintentar cada 30 s

  // ---- Estado --------------------------------------------------------------------------
  let pca = null, cuenta = null, usuario = null;
  let driveId = null, rootId = null, raizId = null, sitioUrl = '';
  let estado = configurado ? 'cargando' : 'local';
  let detalle = '';
  let enLinea = root.navigator ? root.navigator.onLine !== false : true;
  const oyentes = [];

  const items = new Map();      // id → { id, name, parentId, folder, eTag, cTag, webUrl, mod, modPor }
  const archivos = new Map();   // id de archivo de proyecto → { uid, cTag }
  const porUid = new Map();     // uid → id de su archivo
  const contenidos = new Map(); // id de archivo → texto (para el caché local)
  const asignadas = new Map();  // uid → id de carpeta, para proyectos aún sin archivo
  let deltaLink = null;
  let config = { id: null, cTag: null };
  let configDatos = {};          // contenido de la configuración del equipo
  let planillaCache = null;     // { cTag, mapa }

  const cola = new Map();       // uid → { p, base, desde, timer, enCurso, otraVez, bloqueado }
  let ocupado = 0;              // otras escrituras en curso (configuración)
  let relojSync = null;

  function setEstado(e, d) {
    estado = e; detalle = d || '';
    oyentes.slice().forEach((fn) => { try { fn(info()); } catch (err) { console.error(err); } });
  }
  function pendientes() { return cola.size + ocupado; }
  function info() { return { estado, detalle, usuario, pendientes: pendientes(), enLinea, configurado, sitioUrl }; }
  function onEstado(fn) { oyentes.push(fn); fn(info()); }
  function avisarSync() { S.emit({ type: 'sync', pendientes: pendientes(), enLinea }); }

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const nfc = (s) => String(s || '').normalize('NFC');
  const limpiarNombre = (s) => nfc(s).replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');

  function mensajeError(err) {
    if (!err) return 'Error desconocido.';
    if (err.red) return 'Sin conexión con SharePoint.';
    switch (err.status) {
      case 401: return 'La sesión venció. Vuelve a entrar.';
      case 403: return 'Tu cuenta no tiene permiso en SharePoint para este cambio.';
      case 404: return 'No se encontró en SharePoint.';
      case 409: return 'Ya existe un elemento con ese nombre en SharePoint.';
      case 412: return 'Otra persona cambió el archivo en SharePoint.';
      case 423: return 'El archivo está bloqueado en SharePoint (desprotegido o abierto por otra persona).';
      case 507: return 'La biblioteca de SharePoint no tiene espacio.';
      default: break;
    }
    const code = String(err.errorCode || '');
    if (code) return `No se pudo entrar con Microsoft (${code}).`;
    return err.message || String(err);
  }

  // ---- Ingreso con Microsoft ---------------------------------------------------------------
  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => { s.remove(); mal(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  let ultimoToken = null;
  async function token(forzar) {
    if (prueba) return 'prueba';
    const req = { scopes: SCOPES, account: cuenta, forceRefresh: !!forzar };
    try {
      const r = await pca.acquireTokenSilent(req);
      ultimoToken = r.accessToken;
      return r.accessToken;
    } catch (err) {
      const interaccion = (root.msal.InteractionRequiredAuthError && err instanceof root.msal.InteractionRequiredAuthError) ||
        /interaction_required|login_required|consent_required|no_account|no_tokens_found/.test(String(err.errorCode || ''));
      if (!interaccion) throw err;
      guardarPendientes();
      await pca.acquireTokenRedirect({ scopes: SCOPES, account: cuenta });
      return new Promise(() => {}); // la página navega al ingreso de Microsoft
    }
  }

  async function graph(metodo, ruta, op) {
    op = op || {};
    const url = /^https?:/.test(ruta) ? ruta : GRAPH + ruta;
    for (let intento = 0; ; intento++) {
      const tk = op.keepalive && ultimoToken ? ultimoToken : await token(intento > 0 && op.renovado);
      const headers = Object.assign({ Authorization: 'Bearer ' + tk }, op.headers || {});
      let res;
      try {
        res = await fetch(url, { method: metodo, headers, body: op.body, cache: 'no-store', keepalive: !!op.keepalive });
      } catch (e) {
        throw Object.assign(new Error('Sin conexión con SharePoint.'), { red: true });
      }
      if ((res.status === 429 || res.status === 503 || res.status === 504) && intento < 3) {
        const s = parseInt(res.headers.get('Retry-After'), 10);
        await dormir((Number.isFinite(s) ? s : 2 ** intento) * 1000);
        continue;
      }
      if (res.status === 401 && !op.renovado && !prueba) { op = Object.assign({}, op, { renovado: true }); continue; }
      if (!res.ok) {
        let msg = '';
        try { const j = await res.json(); msg = (j.error && j.error.message) || ''; } catch (e) { /* sin cuerpo */ }
        const err = new Error(msg || `SharePoint respondió ${res.status}.`);
        err.status = res.status;
        throw err;
      }
      if (op.tipo === 'buffer') return res.arrayBuffer();
      if (op.tipo === 'texto') return res.text();
      if (res.status === 204) return null;
      return res.json();
    }
  }

  /* Descarga el contenido de un archivo. Desde el navegador no sirve GET …/content: responde con una
     redirección que el navegador bloquea cuando la petición lleva el token. Se pide en cambio el enlace
     de descarga preautorizado (@microsoft.graph.downloadUrl, válido por poco tiempo) y se baja sin token. */
  async function descargar(id, tipo) {
    const meta = await graph('GET', `/drives/${driveId}/items/${id}?$select=id,@microsoft.graph.downloadUrl`);
    const url = meta && meta['@microsoft.graph.downloadUrl'];
    if (!url) throw Object.assign(new Error('SharePoint no entregó el enlace de descarga.'), { status: 404 });
    let res;
    try { res = await fetch(url, { cache: 'no-store' }); } catch (e) {
      throw Object.assign(new Error('Sin conexión con SharePoint.'), { red: true });
    }
    if (!res.ok) throw Object.assign(new Error(`SharePoint respondió ${res.status}.`), { status: res.status });
    return tipo === 'buffer' ? res.arrayBuffer() : res.text();
  }

  // ---- Árbol de carpetas y archivos ----------------------------------------------------------
  function quien(by) {
    const u = by && by.user;
    return u ? String(u.email || u.displayName || '').toLowerCase() : '';
  }
  function registrar(g) {
    if (!g || !g.id) return null;
    const prev = items.get(g.id) || {};
    const x = {
      id: g.id,
      name: g.name !== undefined ? nfc(g.name) : prev.name,
      parentId: (g.parentReference && g.parentReference.id) || prev.parentId || null,
      folder: g.folder || g.root ? true : (g.file ? false : !!prev.folder),
      eTag: g.eTag || prev.eTag,
      cTag: g.cTag || prev.cTag,
      webUrl: g.webUrl || prev.webUrl,
      mod: g.lastModifiedDateTime || prev.mod,
      modPor: quien(g.lastModifiedBy) || prev.modPor || ''
    };
    if (g.root) x.parentId = null;
    items.set(g.id, x);
    return x;
  }
  function hijosDe(id) {
    const out = [];
    items.forEach((x) => { if (x.parentId === id) out.push(x); });
    return out;
  }
  /* Carpetas desde la raíz de trabajo (excluida) hasta id (incluida). null si está fuera de ella. */
  function cadena(id) {
    const out = [];
    for (let x = items.get(id), n = 0; x && n < 60; x = items.get(x.parentId), n++) {
      if (x.id === raizId) return out;
      out.unshift(x);
    }
    return null;
  }
  function dentroDeRaiz(id) { return id === raizId || cadena(id) !== null; }

  function grupoDe(nombre, previo) {
    if (!/^0 /.test(nombre)) return previo;
    if (/adjudicad/i.test(nombre)) return 'Adjudicada';
    const m = /cerradas\s*(\d{4})?/i.exec(nombre);
    if (m) return 'Cerrada' + (m[1] ? ' ' + m[1] : '');
    if (/presentadas/i.test(nombre)) return 'Presentada';
    return previo;
  }
  function numeroDe(nombre) { const m = RE_CARPETA_OFERTA.exec(nombre || ''); return m ? m[1] : ''; }

  /* Carpetas de oferta: las que cuelgan de la raíz o de una carpeta «0 …» (Presentadas,
     Adjudicadas, Cerradas 2025…). Se omiten «1 CARPETA MODELO», «2 ARCHIVOS…» y similares. */
  function carpetas() {
    const out = [];
    const recorrer = (id, grupo, ruta, prof) => {
      if (prof > 4) return;
      hijosDe(id).forEach((c) => {
        if (!c.folder) return;
        if (/^0 /.test(c.name)) { recorrer(c.id, grupoDe(c.name, grupo), ruta.concat(c.name), prof + 1); return; }
        if (/^[1-9] /.test(c.name) && !numeroDe(c.name)) return;
        const m = RE_CARPETA_OFERTA.exec(c.name);
        out.push({
          id: c.id, nombre: c.name, numero: m ? m[1] : '', titulo: m ? m[2] : c.name,
          grupo, ruta: ruta.concat(c.name).join(' / '), webUrl: c.webUrl || ''
        });
      });
    };
    if (raizId) recorrer(raizId, 'En curso', [], 0);
    return out;
  }

  /* Dónde está un proyecto: su carpeta de oferta y su archivo. */
  function ubicacion(uid) {
    const id = porUid.get(uid);
    const archivo = id ? items.get(id) : null;
    const carpetaId = archivo ? archivo.parentId : asignadas.get(uid);
    const carpeta = carpetaId ? items.get(carpetaId) : null;
    if (!carpeta) return null;
    const c = cadena(carpeta.id) || [];
    let grupo = 'En curso';
    c.forEach((x) => { grupo = grupoDe(x.name, grupo); });
    return {
      carpetaId: carpeta.id, carpeta: carpeta.name, numero: numeroDe(carpeta.name), grupo,
      ruta: c.map((x) => x.name).join(' / '), webUrl: carpeta.webUrl || '',
      archivo: archivo ? archivo.name : '', archivoUrl: archivo ? archivo.webUrl || '' : ''
    };
  }
  function asignarCarpeta(uid, carpetaId) {
    const c = items.get(carpetaId);
    if (!c || !c.folder || !dentroDeRaiz(carpetaId)) throw new Error('Esa carpeta no está en la biblioteca de la herramienta.');
    asignadas.set(uid, carpetaId);
  }
  function carpetaDe(uid) { const u = ubicacion(uid); return u ? u.carpetaId : null; }

  function carpetaConfigId() {
    const c = hijosDe(raizId).find((x) => x.folder && x.name === nfc(CFG.carpetaConfig || ''));
    return c ? c.id : raizId;
  }
  function planillaItem() {
    return hijosDe(rootId).find((x) => !x.folder && x.name === nfc(CFG.planilla || '')) || null;
  }

  /* Un archivo es de la herramienta si es su configuración, un proyecto que la herramienta leyó
     (esquema propio) o el Excel generado junto a uno de esos proyectos. */
  function esPropio(x) {
    if (!x || x.folder) return false;
    if (x.id === config.id) return true;
    if (RE_JSON.test(x.name)) return archivos.has(x.id);
    if (RE_PROPIO.test(x.name)) {
      const base = x.name.replace(/\.xlsx$/, '.json');
      return hijosDe(x.parentId).some((y) => y.name === base && archivos.has(y.id));
    }
    return false;
  }

  // ---- Escrituras (únicos puntos que escriben en SharePoint) ---------------------------------
  function permitido(nombre) { return RE_PROPIO.test(nombre) || nombre === NOMBRE_CONFIG; }

  async function crearArchivo(carpetaId, nombre, cuerpo, tipo, siExiste) {
    nombre = nfc(nombre);
    if (!permitido(nombre)) throw new Error('La herramienta solo crea sus propios archivos.');
    const carpeta = items.get(carpetaId);
    if (!carpeta || !carpeta.folder || !dentroDeRaiz(carpetaId)) throw new Error('La carpeta no está en la biblioteca de la herramienta.');
    const modo = siExiste === 'fail' ? 'fail' : 'rename'; // nunca 'replace'
    const g = await graph('PUT', `/drives/${driveId}/items/${carpetaId}:/${encodeURIComponent(nombre)}:/content?@microsoft.graph.conflictBehavior=${modo}`,
      { body: cuerpo, headers: { 'Content-Type': tipo } });
    return registrar(g);
  }

  async function reemplazarArchivo(id, cuerpo, tipo, eTag, keepalive) {
    const x = items.get(id);
    if (!x || !permitido(x.name) || !esPropio(x) || !dentroDeRaiz(id)) throw new Error('La herramienta solo modifica sus propios archivos.');
    if (!eTag) throw new Error('Falta la versión del archivo para reemplazarlo sin pisar cambios.');
    const g = await graph('PUT', `/drives/${driveId}/items/${id}/content`,
      { body: cuerpo, headers: { 'Content-Type': tipo, 'If-Match': eTag }, keepalive });
    return registrar(g);
  }

  async function crearCarpeta(numero, titulo) {
    const n = String(numero || '').trim();
    const t = limpiarNombre(titulo);
    if (!/^\d+$/.test(n)) throw new Error('El número de la oferta debe ser un número, como en la planilla de ingreso.');
    if (!t) throw new Error('Escribe el título de la oferta.');
    const nombre = `${n}. ${t}`.slice(0, 180);
    if (carpetas().some((c) => c.numero === n)) throw new Error(`Ya existe una carpeta con el número ${n}.`);
    const g = await graph('POST', `/drives/${driveId}/items/${raizId}/children`, {
      body: JSON.stringify({ name: nombre, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      headers: { 'Content-Type': 'application/json' }
    });
    const x = registrar(g);
    guardarCacheLuego();
    return { id: x.id, nombre: x.name, numero: n, titulo: t, grupo: 'En curso', ruta: x.name, webUrl: x.webUrl || '' };
  }

  // ---- Subida de proyectos --------------------------------------------------------------------
  function nombreArchivo(p) {
    return `Formulación ${limpiarNombre(p.codigo) || 'S-N'} v${parseInt(p.version, 10) || 1}.json`;
  }

  function encolar(p, base) {
    const uid = p.uid;
    let e = cola.get(uid);
    if (!e) {
      const id = porUid.get(uid);
      e = { desde: Date.now(), base: base !== undefined ? base : (id && items.get(id) ? items.get(id).eTag : null) };
      cola.set(uid, e);
    }
    e.p = p;
    e.bloqueado = false;
    programar(uid, Math.max(0, Math.min(ESPERA_SUBIDA, e.desde + ESPERA_MAX - Date.now())));
    guardarPendientes();
    avisarSync();
  }
  function programar(uid, ms) {
    const e = cola.get(uid);
    if (!e) return;
    clearTimeout(e.timer);
    e.timer = setTimeout(() => { subir(uid); }, ms);
  }

  async function subir(uid, keepalive) {
    const e = cola.get(uid);
    if (!e || e.bloqueado) return;
    clearTimeout(e.timer);
    if (e.enCurso) { e.otraVez = true; return; }
    e.enCurso = true;
    const p = e.p;
    try {
      const cuerpo = JSON.stringify(p, null, 1);
      const id = porUid.get(uid);
      let x;
      if (id && items.get(id)) {
        try {
          x = await reemplazarArchivo(id, cuerpo, 'application/json', e.base || items.get(id).eTag, keepalive);
        } catch (err) {
          if (err.status !== 404) throw err;
          // El archivo ya no está (se borró en SharePoint): volver a crearlo en su carpeta
          const carpeta = items.get(id).parentId;
          items.delete(id); archivos.delete(id); porUid.delete(uid);
          if (items.get(carpeta)) asignadas.set(uid, carpeta);
          x = null;
        }
      }
      if (!x) {
        const carpeta = asignadas.get(uid);
        if (!carpeta) throw new Error('Este proyecto no tiene una carpeta de oferta asignada.');
        x = await crearArchivo(carpeta, nombreArchivo(p), cuerpo, 'application/json', 'rename');
        asignadas.delete(uid);
      }
      archivos.set(x.id, { uid, cTag: x.cTag });
      porUid.set(uid, x.id);
      contenidos.set(x.id, cuerpo);
      e.base = x.eTag;
      if (e.p === p && !e.otraVez) cola.delete(uid);
      guardarCacheLuego();
    } catch (err) {
      if (err.status === 412) {
        cola.delete(uid);
        await alConflicto(uid, p).catch((e2) => {
          console.error(e2);
          S.emit({ type: 'error', mensaje: 'Otra persona modificó este proyecto y no se pudo leer su versión. ' + mensajeError(e2) });
        });
      } else if (err.red || err.status === 423 || err.status >= 500) {
        programar(uid, REINTENTO);
      } else {
        console.error(err);
        e.bloqueado = true;
        S.emit({ type: 'error', mensaje: `No se guardó «${p.codigo} v${p.version}» en SharePoint: ${mensajeError(err)} Los cambios quedan en este navegador.` });
      }
    } finally {
      e.enCurso = false;
      if (e.otraVez && cola.get(uid) === e) { e.otraVez = false; programar(uid, 1000); }
      guardarPendientes();
      avisarSync();
    }
  }

  /* Sube ya todo lo pendiente (al salir de un proyecto, cerrar la página o antes de exportar). */
  function vaciar(keepalive) {
    return Promise.all(Array.from(cola.keys()).map((uid) => subir(uid, keepalive)));
  }

  /* Otra persona guardó el mismo proyecto: se entrega su versión y la de esta página a la interfaz,
     que pregunta qué hacer (app.js → resolverConflicto). */
  async function alConflicto(uid, local) {
    const id = porUid.get(uid);
    const antes = items.get(id);
    const meta = registrar(await graph('GET', `/drives/${driveId}/items/${id}?$select=${SELECT}`));
    if (antes && antes.cTag && antes.cTag === meta.cTag) { encolar(local, meta.eTag); return; } // solo cambió el nombre o la ubicación
    const texto = await descargar(id, 'texto');
    const remoto = JSON.parse(texto);
    archivos.set(id, { uid, cTag: meta.cTag });
    contenidos.set(id, texto);
    S.applyRemote([remoto], [], { conflicto: true, local });
    guardarCacheLuego();
  }

  // ---- Pendientes guardados en el navegador --------------------------------------------------
  function clavePendientes() { return 'qpn.sp.pendientes.' + (usuario ? usuario.email : ''); }
  function guardarPendientes() {
    if (!usuario) return;
    const out = {};
    cola.forEach((e, uid) => { out[uid] = { p: e.p, base: e.base || null, carpeta: asignadas.get(uid) || null }; });
    try {
      if (Object.keys(out).length) root.localStorage.setItem(clavePendientes(), JSON.stringify(out));
      else root.localStorage.removeItem(clavePendientes());
    } catch (err) { /* sin almacenamiento */ }
  }
  function restaurarPendientes() {
    let data = null;
    try { data = JSON.parse(root.localStorage.getItem(clavePendientes()) || 'null'); } catch (e) { /* sin almacenamiento */ }
    if (!data) return;
    const lista = [];
    Object.keys(data).forEach((uid) => {
      const d = data[uid];
      if (!d || !d.p) return;
      if (d.carpeta && items.get(d.carpeta)) asignadas.set(uid, d.carpeta);
      if (!porUid.has(uid) && !asignadas.has(uid)) return; // su carpeta ya no existe
      lista.push(d);
    });
    if (!lista.length) return;
    S.applyRemote(lista.map((d) => d.p), [], { inicial: true });
    lista.forEach((d) => encolar(S.get(d.p.uid) || d.p, d.base || undefined));
  }

  // ---- Caché local (IndexedDB) -------------------------------------------------------------------
  const IDB_NOMBRE = 'qpn-formulacion-sharepoint';
  function idb() {
    return new Promise((ok, mal) => {
      if (!root.indexedDB) { mal(new Error('Sin IndexedDB')); return; }
      const r = root.indexedDB.open(IDB_NOMBRE, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('cache');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  }
  async function idbOp(modo, fn) {
    const db = await idb();
    try {
      return await new Promise((ok, mal) => {
        const tx = db.transaction('cache', modo);
        const req = fn(tx.objectStore('cache'));
        tx.oncomplete = () => ok(req && req.result);
        tx.onerror = () => mal(tx.error);
      });
    } finally { db.close(); }
  }
  function claveCache() { return [CFG.sitio, CFG.raiz || '', usuario ? usuario.email : ''].join('|'); }

  let relojCache = null;
  function guardarCacheLuego() {
    clearTimeout(relojCache);
    relojCache = setTimeout(guardarCache, 1500);
  }
  async function guardarCache() {
    if (!usuario || !driveId) return;
    const datos = {
      v: 1, driveId, rootId, raizId, sitioUrl, deltaLink,
      items: Array.from(items.values()),
      archivos: Array.from(archivos.entries()),
      contenidos: Object.fromEntries(contenidos),
      config, configDatos
    };
    try { await idbOp('readwrite', (st) => st.put(datos, claveCache())); } catch (err) { console.warn('Caché local no disponible:', err); }
  }
  async function cargarCache() {
    let d = null;
    try { d = await idbOp('readonly', (st) => st.get(claveCache())); } catch (err) { return false; }
    if (!d || d.v !== 1) return false;
    ({ driveId, rootId, raizId, deltaLink } = d);
    sitioUrl = d.sitioUrl || '';
    config = d.config || { id: null, cTag: null };
    configDatos = d.configDatos || {};
    S.setSharedConfig(configDatos);
    d.items.forEach((x) => items.set(x.id, x));
    d.archivos.forEach(([id, a]) => { archivos.set(id, a); porUid.set(a.uid, id); });
    const proyectos = [];
    Object.keys(d.contenidos || {}).forEach((id) => {
      if (!archivos.has(id)) return;
      contenidos.set(id, d.contenidos[id]);
      try { proyectos.push(JSON.parse(d.contenidos[id])); } catch (e) { /* dañado: se relee */ }
    });
    if (proyectos.length) S.applyRemote(proyectos, [], { inicial: true });
    return true;
  }
  async function borrarCache() {
    try { await idbOp('readwrite', (st) => st.delete(claveCache())); } catch (err) { /* sin caché */ }
  }
  function limpiarEstado() {
    items.clear(); archivos.clear(); porUid.clear(); contenidos.clear(); asignadas.clear();
    cola.forEach((e) => clearTimeout(e.timer));
    cola.clear();
    driveId = rootId = raizId = null; deltaLink = null; sitioUrl = '';
    config = { id: null, cTag: null }; configDatos = {}; planillaCache = null;
  }

  // ---- Sincronización ----------------------------------------------------------------------------
  async function ubicarBiblioteca() {
    try {
      const sitio = await graph('GET', `/sites/${CFG.sitio}?$select=id,webUrl`);
      const drive = await graph('GET', `/sites/${sitio.id}/drive?$select=id,webUrl`);
      driveId = drive.id;
      sitioUrl = drive.webUrl || sitio.webUrl || '';
    } catch (err) {
      if (err.status === 403 || err.status === 404) {
        throw Object.assign(new Error('Tu cuenta no tiene acceso a la biblioteca «Formulación de proyectos» en SharePoint.'), { sinAcceso: true });
      }
      throw err;
    }
    const r = await graph('GET', `/drives/${driveId}/root?$select=${SELECT}`);
    rootId = registrar(r).id;
    raizId = rootId;
    if (CFG.raiz) {
      try {
        const ruta = String(CFG.raiz).split('/').map(encodeURIComponent).join('/');
        const c = await graph('GET', `/drives/${driveId}/root:/${ruta}?$select=${SELECT}`);
        raizId = registrar(c).id;
        if (c.webUrl) sitioUrl = c.webUrl;
      } catch (err) {
        if (err.status === 404) throw new Error(`No existe la carpeta «${CFG.raiz}» en la biblioteca. Créala o corrige «raiz» en js/m365-config.js.`);
        throw err;
      }
    }
  }

  let sincronizando = null;
  function sincronizar(avance) {
    if (!sincronizando) sincronizando = sync(avance).finally(() => { sincronizando = null; });
    return sincronizando;
  }

  async function sync(avance) {
    const completo = !deltaLink;
    let url = deltaLink || `/drives/${driveId}/root/delta?$select=${SELECT}`;
    const aLeer = new Set(), quitados = new Set(), vistos = new Set();
    const cambios = { carpetas: false };
    let n = 0;
    for (;;) {
      let r;
      try { r = await graph('GET', url); } catch (err) {
        if (err.status === 410 && deltaLink) { deltaLink = null; return sync(avance); } // hay que volver a leer todo
        throw err;
      }
      (r.value || []).forEach((g) => { procesar(g, aLeer, quitados, vistos, cambios); });
      n += (r.value || []).length;
      if (avance && completo) avance(n);
      if (r['@odata.nextLink']) { url = r['@odata.nextLink']; continue; }
      deltaLink = r['@odata.deltaLink'] || null;
      break;
    }
    // En una lectura completa, lo que no apareció ya no existe
    if (completo) {
      Array.from(items.keys()).forEach((id) => {
        if (vistos.has(id) || id === rootId || id === raizId) return;
        if (archivos.has(id)) quitados.add(id);
        items.delete(id);
      });
    }

    const proyectos = [], borrados = [];
    await enParalelo(Array.from(aLeer), 4, async (id) => {
      const x = items.get(id);
      if (!x || !dentroDeRaiz(id)) return;
      const previo = archivos.get(id);
      if (previo && cola.has(previo.uid) && cola.get(previo.uid).enCurso) return; // se está subiendo desde aquí
      let texto, p;
      try {
        texto = await descargar(id, 'texto');
        p = JSON.parse(texto);
      } catch (err) { console.warn('No se pudo leer', x.name, err); return; }
      if (!p || p.schema !== S.SCHEMA || !p.uid) { archivos.delete(id); contenidos.delete(id); return; } // no es de la herramienta
      const otro = porUid.get(p.uid);
      if (otro && otro !== id && items.has(otro) && archivos.has(otro)) {
        console.warn(`«${x.name}» es una copia de otro archivo de proyecto (mismo identificador) y se ignora.`);
        return;
      }
      archivos.set(id, { uid: p.uid, cTag: x.cTag });
      porUid.set(p.uid, id);
      contenidos.set(id, texto);
      const e = cola.get(p.uid);
      if (e && !e.enCurso) {
        // Llegó una versión de otra persona mientras aquí había cambios sin subir
        clearTimeout(e.timer);
        cola.delete(p.uid);
        S.applyRemote([p], [], { conflicto: true, local: e.p });
      } else proyectos.push(p);
    });
    quitados.forEach((id) => {
      const a = archivos.get(id);
      archivos.delete(id); contenidos.delete(id);
      if (a && porUid.get(a.uid) === id) { porUid.delete(a.uid); if (!cola.has(a.uid)) borrados.push(a.uid); }
    });
    if (proyectos.length || borrados.length) S.applyRemote(proyectos, borrados, { inicial: completo });
    if (cambios.carpetas && !completo) S.emit({ type: 'carpetas' }); // se movió o renombró una carpeta de oferta

    await revisarConfig();
    if (aLeer.size || quitados.size || completo || n) guardarCacheLuego();
    guardarPendientes();
    avisarSync();
  }

  function procesar(g, aLeer, quitados, vistos, cambios) {
    if (g.deleted) {
      if (items.get(g.id) && items.get(g.id).folder) cambios.carpetas = true;
      if (archivos.has(g.id)) quitados.add(g.id);
      items.delete(g.id); aLeer.delete(g.id);
      return;
    }
    const nombre = nfc(g.name);
    const carpeta = !!(g.folder || g.root);
    const json = !!g.file && RE_JSON.test(nombre);
    const util = !!g.file && (RE_PROPIO.test(nombre) || nombre === NOMBRE_CONFIG || nombre === nfc(CFG.planilla || ''));
    if (!carpeta && !json && !util) {
      // No interesa a la herramienta (o se renombró y dejó de ser un archivo de proyecto)
      if (items.has(g.id)) { if (archivos.has(g.id)) quitados.add(g.id); items.delete(g.id); }
      return;
    }
    vistos.add(g.id);
    const antes = items.get(g.id);
    const x = registrar(g);
    if (x.folder && (!antes || antes.parentId !== x.parentId || antes.name !== x.name)) cambios.carpetas = true;
    if (json && (!antes || antes.cTag !== x.cTag || !archivos.has(g.id))) aLeer.add(g.id);
    if (json && archivos.has(g.id) && archivos.get(g.id).cTag === x.cTag) aLeer.delete(g.id);
  }

  async function enParalelo(lista, n, fn) {
    let i = 0;
    const trabajador = async () => { while (i < lista.length) { const k = i++; await fn(lista[k]); } };
    await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabajador));
  }

  async function revisarConfig() {
    const carpeta = carpetaConfigId();
    const c = hijosDe(carpeta).find((x) => !x.folder && x.name === NOMBRE_CONFIG);
    if (!c) {
      if (config.id !== null || config.cTag !== 'vacio') { config = { id: null, cTag: 'vacio' }; configDatos = {}; S.setSharedConfig({}); }
      return;
    }
    if (config.id === c.id && config.cTag === c.cTag) return;
    try {
      const d = JSON.parse(await descargar(c.id, 'texto'));
      config = { id: c.id, cTag: c.cTag };
      delete d.modificado; delete d.modificadoPor;
      configDatos = d;
      S.setSharedConfig(d);
    } catch (err) { console.warn('No se pudo leer la configuración del equipo', err); }
  }

  function vigilar() {
    clearInterval(relojSync);
    relojSync = setInterval(() => {
      if (root.document.visibilityState === 'visible' && enLinea && estado === 'listo') sincronizar().catch((e) => console.warn(e));
    }, CADA_SYNC);
  }

  // ---- Backend de QStore ---------------------------------------------------------------------
  const backend = {
    saveProject(p) { encolar(p); },
    deleteProject() {
      S.emit({ type: 'error', mensaje: 'La herramienta no borra archivos de SharePoint. El proyecto sigue en la carpeta de su oferta.' });
    },
    saveConfig(shared) {
      const cuerpo = JSON.stringify(Object.assign({}, shared, { modificadoPor: usuario.email, modificado: new Date().toISOString() }), null, 1);
      ocupado++; avisarSync();
      (async () => {
        const c = config.id ? items.get(config.id) : null;
        const x = c
          ? await reemplazarArchivo(c.id, cuerpo, 'application/json', c.eTag)
          : await crearArchivo(carpetaConfigId(), NOMBRE_CONFIG, cuerpo, 'application/json', 'fail');
        config = { id: x.id, cTag: x.cTag };
        configDatos = JSON.parse(JSON.stringify(shared));
        guardarCacheLuego();
      })().catch((err) => {
        console.error(err);
        const msg = err.status === 412 || err.status === 409
          ? 'Otra persona cambió la configuración del equipo al mismo tiempo. Vuelve a abrir Configuración y revisa los valores.'
          : 'No se guardó la configuración del equipo. ' + mensajeError(err);
        S.emit({ type: 'error', mensaje: msg });
        sincronizar().catch(() => {});
      }).finally(() => { ocupado--; avisarSync(); });
    }
  };

  // ---- Sesión ----------------------------------------------------------------------------------
  async function alEntrar() {
    usuario = {
      email: String(cuenta.username || '').toLowerCase(),
      nombre: cuenta.name || cuenta.username || '',
      rol: 'editor'
    };
    S.useCloud(backend, usuario);
    setEstado('sincronizando', 'Cargando los proyectos del equipo…');
    const conCache = await cargarCache();
    try {
      if (!driveId) await ubicarBiblioteca();
      await sincronizar((n) => setEstado('sincronizando', `Leyendo la biblioteca de SharePoint… ${n.toLocaleString('es-CL')} elementos`));
    } catch (err) {
      console.error(err);
      if (err.sinAcceso) { setEstado('no-autorizado', err.message); return; }
      if (!(err.red && conCache)) { setEstado('error', mensajeError(err)); return; }
      restaurarPendientes();
      setEstado('listo', 'sin-conexion');
      vigilar();
      return;
    }
    restaurarPendientes();
    setEstado('listo');
    vigilar();
  }

  async function iniciar() {
    if (!configurado) return;
    S.useCloud(backend, null); // sin sesión: no se muestran ni editan los proyectos del navegador
    root.addEventListener('online', () => {
      enLinea = true; avisarSync();
      if (estado === 'listo') { sincronizar().catch(() => {}); vaciar(); }
    });
    root.addEventListener('offline', () => { enLinea = false; avisarSync(); });
    root.document.addEventListener('visibilitychange', () => {
      if (estado !== 'listo') return;
      if (root.document.visibilityState === 'hidden') vaciar(true);
      else sincronizar().catch(() => {});
    });
    try {
      if (prueba) {
        const u = CFG.pruebaUsuario || {};
        cuenta = u.email ? { username: u.email, name: u.nombre } : null;
      } else {
        await cargarScript(MSAL_LIB);
        pca = new root.msal.PublicClientApplication({
          auth: {
            clientId: CFG.clientId,
            authority: 'https://login.microsoftonline.com/' + CFG.tenantId,
            redirectUri: new URL('redirect.html', root.location.href).href
          },
          cache: { cacheLocation: 'localStorage' }
        });
        await pca.initialize();
        const r = await pca.handleRedirectPromise();
        cuenta = (r && r.account) || pca.getActiveAccount() ||
          pca.getAllAccounts().find((a) => a.tenantId === CFG.tenantId) || null;
        if (cuenta) pca.setActiveAccount(cuenta);
      }
      if (!cuenta) { setEstado('sin-sesion'); return; }
      await alEntrar();
    } catch (err) {
      console.error(err);
      setEstado('error', mensajeError(err));
    }
  }

  async function entrar() {
    if (prueba) return;
    await pca.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
  }

  async function salir() {
    if (cola.size) {
      await vaciar();
      if (cola.size) throw new Error('Hay cambios que aún no se suben a SharePoint. Revisa la conexión y vuelve a intentarlo.');
    }
    clearInterval(relojSync);
    await borrarCache();
    try { root.localStorage.removeItem(clavePendientes()); } catch (e) { /* sin almacenamiento */ }
    const c = cuenta;
    limpiarEstado();
    usuario = null; cuenta = null;
    S.useCloud(backend, null);
    if (pca && c) await pca.clearCache({ account: c });
    setEstado('sin-sesion');
  }

  // ---- Planilla de ingreso (solo lectura) ---------------------------------------------------------
  function valorCelda(v) {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('result' in v) return v.result;
      if (v.richText) return v.richText.map((t) => t.text).join('');
      if ('text' in v) return v.text;
      if (v.error) return null;
    }
    return v;
  }
  async function planilla() {
    const it = planillaItem();
    if (!it) return null;
    if (planillaCache && planillaCache.cTag === it.cTag) return planillaCache.mapa;
    const buf = await descargar(it.id, 'buffer');
    const ExcelJS = await root.QExcel.ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Listado Requerimientos') || wb.worksheets[0];
    const clave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const col = {};
    ws.getRow(1).eachCell((c, i) => { const k = clave(valorCelda(c.value)); if (k && !col[k]) col[k] = i; });
    const buscar = (exactos, prefijo) => {
      for (const k of exactos) if (col[k]) return col[k];
      if (prefijo) for (const k of Object.keys(col)) if (k.startsWith(prefijo)) return col[k];
      return 0;
    };
    const C = {
      n: buscar(['n', 'no', 'nro', 'numero']), estado: buscar(['estado']), titulo: buscar(['titulo']),
      ubicacion: buscar(['ubicacion']), referencia: buscar(['idoreferencia'], 'id'), cierre: buscar(['cierre']),
      presupuesto: buscar([], 'presupuesto'), ofertado: buscar([], 'valorofertado')
    };
    const leer = (row, c) => (c ? valorCelda(row.getCell(c).value) : null);
    const mapa = new Map();
    ws.eachRow((row, r) => {
      if (r === 1) return;
      const n = parseInt(leer(row, C.n), 10);
      if (!Number.isFinite(n) || n <= 0) return;
      const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
      const ubic = txt(leer(row, C.ubicacion));
      mapa.set(String(n), {
        numero: String(n), estado: txt(leer(row, C.estado)), titulo: txt(leer(row, C.titulo)),
        ubicacion: /^#/.test(ubic) ? '' : ubic, referencia: txt(leer(row, C.referencia)),
        cierre: leer(row, C.cierre) instanceof Date ? leer(row, C.cierre) : null,
        presupuesto: num(leer(row, C.presupuesto)), ofertado: num(leer(row, C.ofertado))
      });
    });
    planillaCache = { cTag: it.cTag, mapa };
    return mapa;
  }

  // ---- Excel del proyecto junto a su archivo ---------------------------------------------------
  async function guardarExcel(uid, datos) {
    await vaciar();
    if (cola.has(uid)) throw new Error('El proyecto aún no se sube a SharePoint. Revisa la conexión y vuelve a intentarlo.');
    const id = porUid.get(uid);
    const json = id ? items.get(id) : null;
    if (!json) throw new Error('El proyecto aún no está guardado en SharePoint.');
    const nombre = json.name.replace(/\.json$/, '.xlsx');
    const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const existente = hijosDe(json.parentId).find((x) => !x.folder && x.name === nombre);
    let x;
    if (existente) {
      try { x = await reemplazarArchivo(existente.id, datos, tipo, existente.eTag); } catch (err) {
        if (err.status !== 412) throw err;
        const meta = registrar(await graph('GET', `/drives/${driveId}/items/${existente.id}?$select=${SELECT}`));
        x = await reemplazarArchivo(existente.id, datos, tipo, meta.eTag);
      }
    } else x = await crearArchivo(json.parentId, nombre, datos, tipo, 'rename');
    guardarCacheLuego();
    return { nombre: x.name, webUrl: x.webUrl || '' };
  }

  // ---- Proyectos guardados en el navegador antes de usar SharePoint --------------------------------
  function proyectosLocalesPendientes() {
    const enNube = new Set(S.all().concat(S.trash()).map((p) => p.uid));
    return S.localProjects().filter((p) => !enNube.has(p.uid) && !p.eliminado);
  }

  root.QCloud = {
    configurado, prueba, iniciar, onEstado, info, entrar, salir, vaciar,
    carpetas, ubicacion, asignarCarpeta, carpetaDe, crearCarpeta, planilla, guardarExcel,
    proyectosLocalesPendientes
  };
})(window);
