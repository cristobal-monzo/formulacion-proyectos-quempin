/*
 * compartida.js — Proyectos compartidos con el equipo por la carpeta de intercambio
 * («.Herramientas formulación › Intercambio», oculta en la biblioteca de SharePoint
 * «Formulación de proyectos», que el equipo tiene sincronizada en OneDrive), mientras el
 * formulador trabaja en modo local.
 *
 * Cada navegador sigue guardando sus proyectos en localStorage (la copia de trabajo) y este
 * módulo los refleja en «publicado/formulador/<uid>.json», un archivo por proyecto. OneDrive
 * lleva esos archivos a los demás equipos y el formulador de cada uno los trae a su lista.
 * No hay servidor ni cuentas: es la misma carpeta que se conecta para enviar costos al Análisis
 * Financiero (js/intercambio.js). Con SharePoint configurado no hace nada, porque ahí los
 * proyectos ya son de todo el equipo. Ver docs/INTERCAMBIO.md.
 *
 * Quién gana, sin un reloj común entre equipos:
 *  - Cada archivo lleva la versión del proyecto («modificado») y su «historia»: las versiones
 *    anteriores que pasaron por la carpeta. Este navegador recuerda la última versión que
 *    sincronizó de cada proyecto (su «base»).
 *  - Si la carpeta viene de la base y aquí no se tocó, se trae. Si aquí se editó y la carpeta
 *    sigue en la base, se sube.
 *  - Si cambiaron los dos (edición simultánea, 2026-11-10), se juntan los cambios dato por dato
 *    contra el contenido de la base (js/fusion.js), que este navegador guarda en IndexedDB. Si los
 *    dos cambiaron el mismo dato, o no hay base común (la carpeta perdió una versión que subió este
 *    navegador: un conflicto de OneDrive), se trae la de la carpeta y la app decide: con el
 *    proyecto abierto pregunta dato por dato; si no, los cambios de aquí quedan como una copia del
 *    proyecto. Nunca se pierde trabajo.
 *  - Quién tiene abierto cada proyecto: una marca por persona en «publicado/formulador/editando/»,
 *    renovada mientras el proyecto sigue abierto (presencia()).
 *  - Si aquí no se tocó nada desde la base, nunca es un conflicto, aunque la historia de la
 *    carpeta ya no alcance a la base (2026-10-25): ver decidir().
 *  - Eliminar manda a la papelera y el archivo queda; mientras se comparte no hay borrado
 *    definitivo desde la herramienta (igual que en SharePoint).
 */
(function (root) {
  'use strict';

  const ESQUEMA = 'quempin.intercambio/1';
  const RUTA = ['publicado', 'formulador'];
  const LS_ESTADO = 'qpn.formulacion.compartida.v1';
  // Cada guardado que llega a la carpeta es una versión: con 50, una tarde de trabajo llenaba la
  // historia (el 2026-10-22, 50 versiones en 16 minutos) y los demás equipos ya no reconocían la suya.
  const MAX_HISTORIA = 200;
  const HISTORIA_RECORTADA = 50; // el tope hasta el 2026-10-25: una historia así de larga pudo perder su comienzo
  const ESPERA_SUBIDA = 1500;   // ms desde el último guardado hasta copiarlo a la carpeta
  const INTERVALO = 20000;      // cada cuánto se revisa la carpeta con la página visible
  // Sin una revisión completa en este tiempo, el indicador lo dice (2026-10-27: un equipo mostró «guardado en la
  // carpeta» mientras otro cambiaba el precio, y nunca le llegó; el aviso solo hablaba de lo que subía él).
  const ATRASO = 120000;
  const INICIO = Date.now();

  // ---- Decisión (sin efectos: se prueba en node) ----------------------------------------------
  /* L: el proyecto en este navegador, o null. R: { mod, historia } del archivo, o null.
     b: { base, historia, propio } lo último sincronizado aquí, o null; propio: true si esa versión
     la subió este navegador, false si la trajo de la carpeta (sin el dato: no se sabe).
     Devuelve 'igual' | 'subir' | 'bajar' | 'conflicto' | 'nada'. */
  function decidir(L, R, b) {
    if (!R) return L ? 'subir' : 'nada';
    if (!L) return 'bajar';
    const lm = L.modificado || '';
    if (lm === R.mod) return 'igual';
    const hist = R.historia || [];
    const base = b && b.base;
    if (base && (R.mod === base || hist.includes(base))) {   // la carpeta viene de lo que ya teníamos
      if (lm === base) return 'bajar';
      if (R.mod === base) return 'subir';
      return 'conflicto';
    }
    if (hist.includes(lm)) return 'bajar';                    // la carpeta ya incluye esta versión
    if (b && (b.historia || []).includes(R.mod)) return 'subir'; // la carpeta quedó atrás de lo subido
    // Aquí no se tocó nada desde la base y la carpeta trae otra versión cuya historia ya no la nombra:
    // otra persona siguió trabajando y la historia dejó atrás la base. Antes era un conflicto, y cada
    // equipo que volvía dejaba una copia «(cambios sin subir)» con un código nuevo, sin haber editado
    // nada (2026-10-22: tres copias de la 310). Una base traída de la carpeta no tiene nada que perder;
    // una que subió este navegador pudo perderla OneDrive, así que se trae solo si la historia está
    // llena y empieza después de ella.
    if (base && lm === base && (b.propio === false ||
        (hist.length >= HISTORIA_RECORTADA && String(hist[0]) > String(base)))) return 'bajar';
    return 'conflicto';
  }
  /* Historia del archivo que se sube: la de la base más la base misma. */
  function historiaNueva(L, b) {
    const h = b && Array.isArray(b.historia) ? b.historia.slice() : [];
    if (b && b.base && b.base !== L.modificado && !h.includes(b.base)) h.push(b.base);
    return h.slice(-MAX_HISTORIA);
  }
  const nombreArchivo = (uid) => String(uid).replace(/[^A-Za-z0-9_-]/g, '_') + '.json';

  /* Igual contenido salvo la fecha de modificación (dos equipos que guardaron lo mismo). */
  function estable(v) {
    if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).filter((k) => k !== 'modificado' && k !== 'modificadoPor').sort()
        .map((k) => JSON.stringify(k) + ':' + estable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  const mismoContenido = (a, b) => estable(a) === estable(b);

  // ---- Estado de este navegador ---------------------------------------------------------------
  /* { proyectos: { uid: { base, historia } } lo sincronizado con la carpeta,
       entregas: { uid: modificado } versiones descargadas como archivo para el buzón } */
  function leerEstado() {
    try { return JSON.parse(root.localStorage.getItem(LS_ESTADO)) || {}; } catch (e) { return {}; }
  }
  function guardarEstado(e) {
    try { root.localStorage.setItem(LS_ESTADO, JSON.stringify(e)); } catch (err) { /* sin almacenamiento */ }
  }

  const S = () => root.QStore;
  const X = () => root.QIntercambio;
  const enModoLocal = () => !!(S() && S().getMode() === 'local');
  /* Compartir es obligatorio (pedido del usuario, 2026-09-30): en modo local, todo navegador que
     puede abrir carpetas sincroniza con la del equipo en cuanto está conectada. */
  function activa() {
    return enModoLocal() && !!X() && X().disponible();
  }
  /* ¿Esta versión del proyecto ya está en la carpeta del equipo, o se entregó como archivo? */
  function enRepositorio(p, est) {
    const b = ((est || leerEstado()).proyectos || {})[p.uid];
    return !!b && b.base === p.modificado;
  }
  function entregado(p, est) { return ((est || leerEstado()).entregas || {})[p.uid] === p.modificado; }
  /* Los proyectos de la lista que solo están en este navegador. */
  function sinSubir(lista) {
    const est = leerEstado();
    return lista.filter((p) => !enRepositorio(p, est) && !entregado(p, est));
  }

  /* Números del proyecto para quien lee la carpeta sin el formulador (Claude, el Análisis
     Financiero): los calcula el mismo motor de la página, así no hay dos cálculos que diverjan. */
  function resumen(p) {
    const C = root.QCalc;
    if (!C || !C.computeProject) return null;
    try {
      const r = C.computeProject(p), t = r.totals;
      const moneda = C.monedaDe(p);
      const n = (v) => (Number.isFinite(v) ? C.redondear(v, moneda) : null);
      return {
        moneda, costoDirecto: n(t.cd), gastosGenerales: n(t.gg), imprevistos: n(t.imp),
        costoTotal: n(t.costoTotal), utilidad: n(t.utilidad), precioNeto: n(t.precioNeto),
        margen: Number.isFinite(r.kpis.margen) ? Math.round(r.kpis.margen * 10000) / 10000 : null,
        costosAF: X() ? X().costosAF(t) : null,
        errores: r.warnings.filter((w) => w.level === 'error').length,
        alertas: r.warnings.filter((w) => w.level === 'warn').length
      };
    } catch (e) { return null; }
  }

  // ---- Contenido de la base de cada proyecto ---------------------------------------------------
  /* Las últimas versiones sincronizadas de cada proyecto, enteras: de ahí sale la base común con la que
     se juntan los cambios de aquí y los de la carpeta. Se guardan varias porque el caso más común de
     edición simultánea es que los dos suban casi a la vez y OneDrive se quede con una: la base de este
     navegador es entonces su propia subida, que la otra persona nunca vio, y la base común es la
     anterior. Van en IndexedDB y no en localStorage, que comparte cupo con los tableros y el Portal.
     Sin IndexedDB (las pruebas en node), en memoria. */
  const VERSIONES_BASE = 3;
  const bases = (() => {
    const mem = new Map();   // uid -> [{ mod, datos }], la más nueva al final
    let db = null;
    const sumar = (lista, x) => (lista || []).filter((v) => v.mod !== x.mod).concat([{ mod: x.mod, datos: x.datos }]).slice(-VERSIONES_BASE);
    const elegir = (lista, sirve) => { const l = lista || []; for (let i = l.length - 1; i >= 0; i--) if (sirve(l[i].mod)) return l[i].datos; return null; };
    function abrir() {
      if (db) return db;
      const idb = root.indexedDB;
      db = !idb ? Promise.resolve(null) : new Promise((ok) => {
        let rq;
        try { rq = idb.open('qpn-formulador-bases', 1); } catch (e) { ok(null); return; }
        rq.onupgradeneeded = () => rq.result.createObjectStore('bases');
        rq.onsuccess = () => ok(rq.result);
        rq.onerror = rq.onblocked = () => ok(null);
      });
      return db;
    }
    /* La versión guardada más nueva de este proyecto cuya fecha cumple sirve(mod), o null. */
    async function leer(uid, sirve) {
      const d = await abrir();
      if (!d) { const v = elegir(mem.get(uid), sirve); return v ? JSON.parse(JSON.stringify(v)) : null; }
      return new Promise((ok) => {
        try {
          const rq = d.transaction('bases', 'readonly').objectStore('bases').get(uid);
          rq.onsuccess = () => ok(elegir(rq.result, sirve));
          rq.onerror = () => ok(null);
        } catch (e) { ok(null); }
      });
    }
    /* lista: [{ uid, mod, datos }]. true si quedaron guardadas. */
    async function guardar(lista) {
      if (!lista.length) return true;
      const d = await abrir();
      if (!d) { lista.forEach((x) => mem.set(x.uid, sumar(mem.get(x.uid), { mod: x.mod, datos: JSON.parse(JSON.stringify(x.datos)) }))); return true; }
      return new Promise((ok) => {
        try {
          const t = d.transaction('bases', 'readwrite'), st = t.objectStore('bases');
          lista.forEach((x) => {
            const rq = st.get(x.uid);
            rq.onsuccess = () => st.put(sumar(Array.isArray(rq.result) ? rq.result : [], x), x.uid);
          });
          t.oncomplete = () => ok(true);
          t.onerror = t.onabort = () => ok(false);
        } catch (e) { ok(false); }
      });
    }
    return { leer, guardar };
  })();

  /* Los cambios de aquí (L) y los de la carpeta (R): { base, resultado, choques } con lo de los dos
     juntos, contra la versión guardada aquí más nueva por la que pasó también la carpeta (R.historia).
     null si no hay ninguna (nunca se sincronizó aquí, o es muy antigua) o si alguno mandó el proyecto a
     la papelera o lo sacó de ella. */
  async function juntar(L, R) {
    const F = root.QFusion;
    if (!F) return null;
    const hist = new Set(R.historia || []);
    const crudo = await bases.leer(L.uid, (mod) => hist.has(mod) && mod !== L.modificado);
    if (!crudo) return null;
    const base = S().normalize(crudo), suyo = S().normalize(JSON.parse(JSON.stringify(R.datos)));
    if (!!base.eliminado !== !!L.eliminado || !!base.eliminado !== !!suyo.eliminado) return null;
    const f = F.fusionar(base, L, suyo);
    return { base, resultado: f.resultado, choques: f.choques };
  }

  // ---- Lectura y escritura de la carpeta ------------------------------------------------------
  const memo = new Map();   // nombre de archivo -> { lastModified, size, R }: solo se relee lo que cambió
  async function subcarpeta(h) {
    let d = h;
    for (const n of RUTA) d = await d.getDirectoryHandle(n, { create: true });
    return d;
  }
  function valido(sobre, nombre) {
    const p = sobre && sobre.esquema === ESQUEMA && sobre.tipo === 'proyecto' ? sobre.datos : null;
    if (!p || typeof p !== 'object' || !p.uid || nombreArchivo(p.uid) !== nombre) return null;
    return {
      uid: p.uid, mod: String(p.modificado || ''), datos: p, autor: String(sobre.autor || ''),
      historia: Array.isArray(sobre.historia) ? sobre.historia.filter((x) => typeof x === 'string') : []
    };
  }
  /* uid -> { uid, mod, historia, datos, autor }. Solo cuenta el archivo con el nombre de su uid:
     las copias que deja OneDrive en un conflicto («…-EQUIPO.json») se ignoran. */
  async function leerRemotos(dir) {
    const out = new Map();
    for await (const [nombre, h] of dir.entries()) {
      if (h.kind !== 'file' || !/\.json$/i.test(nombre)) continue;
      let f;
      try { f = await h.getFile(); } catch (e) { continue; }
      let m = memo.get(nombre);
      if (!m || m.lastModified !== f.lastModified || m.size !== f.size) {
        let sobre = null;
        try { sobre = JSON.parse((await f.text()).replace(/^﻿/, '')); } catch (e) { sobre = null; }
        m = { lastModified: f.lastModified, size: f.size, R: valido(sobre, nombre) };
        memo.set(nombre, m);
      }
      if (m.R && !out.has(m.R.uid)) out.set(m.R.uid, m.R);
    }
    return out;
  }
  function autor() {
    try { return S().getConfig().responsable || ''; } catch (e) { return ''; }
  }
  /* ¿El archivo del proyecto cambió en la carpeta desde que se leyó en esta vuelta? (2026-11-10: subir
     justo cuando OneDrive traía la versión de otra persona la pisaba sin que nadie lo notara) */
  async function cambioEnCarpeta(dir, uid) {
    const nombre = nombreArchivo(uid), m = memo.get(nombre);
    let f;
    try { f = await (await dir.getFileHandle(nombre)).getFile(); } catch (e) { return !!(m && m.R); }   // no está: cambió si estaba
    return !m || m.lastModified !== f.lastModified || m.size !== f.size;
  }
  /* nombre de archivo -> { lastModified, size } del archivo tal como lo dejó este navegador al subirlo */
  const escritos = new Map();
  /* ¿Otro escribió el archivo de este proyecto después de la última subida de este navegador? */
  function reescrito(uid) {
    const nombre = nombreArchivo(uid), e = escritos.get(nombre), m = memo.get(nombre);
    return !!e && !!m && (m.lastModified !== e.lastModified || m.size !== e.size);
  }
  async function escribir(dir, p, historia) {
    const nombre = nombreArchivo(p.uid);
    const sobre = { esquema: ESQUEMA, herramienta: 'formulador', tipo: 'proyecto', generado: new Date().toISOString(), autor: autor(), historia, resumen: resumen(p), datos: p };
    const fh = await dir.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(sobre) + '\n');
    await w.close();
    try {
      const f = await fh.getFile();
      memo.set(nombre, { lastModified: f.lastModified, size: f.size, R: valido(JSON.parse(JSON.stringify(sobre)), nombre) });
      escritos.set(nombre, { lastModified: f.lastModified, size: f.size });
    } catch (e) { memo.delete(nombre); escritos.delete(nombre); }
  }

  // ---- Sincronización -------------------------------------------------------------------------
  const sucios = new Set();   // guardados aquí que aún no se copian a la carpeta
  const vistos = new Map();   // uid -> { mod, autor }: la versión de cada proyecto en la carpeta, en la última revisión
  let inf = { sincronizando: false, ultima: null, error: '', sinCarpeta: false, sinPermiso: false, enCarpeta: 0 };
  /* true si hace más de ATRASO que no se completa una revisión de la carpeta, sin una en curso a tiempo:
     lo que guardaron los demás puede no estar llegando. Con la página oculta no se revisa, y no cuenta. */
  function atrasada(ahora) {
    if (!activa() || inf.sinCarpeta || inf.sinPermiso || inf.error) return false;
    if (root.document && root.document.visibilityState === 'hidden') return false;
    const t = ahora || Date.now();
    if (t - Math.max(Date.parse(inf.ultima || '') || 0, INICIO) <= ATRASO) return false;
    return !(corriendo && t - desde <= ATRASO);
  }
  function info() { return Object.assign({ pendientes: sucios.size, atrasada: atrasada() }, inf); }
  /* { mod, autor } de la versión de este proyecto que había en la carpeta en la última revisión, o null. */
  const enCarpeta = (uid) => vistos.get(uid) || null;
  function avisar(cambios) {
    Object.assign(inf, cambios);
    if (S()) S().emit({ type: 'sync', pendientes: sucios.size });
  }

  let timer = null, corriendo = null, otraVez = false, desde = 0;   // desde: cuándo empezó la vuelta en curso
  let reintentos = 0;   // vueltas seguidas que dejaron de subir algo porque cambió en la carpeta
  function programar(ms) {
    if (!activa()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sincronizar(); }, ms);
  }
  /* Una sola sincronización a la vez, también entre pestañas del mismo navegador. */
  function sincronizar() {
    if (corriendo) { otraVez = true; return corriendo; }
    const candado = (fn) => (root.navigator && root.navigator.locks ? root.navigator.locks.request('qpn-formulador-compartida', fn) : fn());
    desde = Date.now();
    corriendo = (async () => {
      try { do { otraVez = false; await candado(correr); } while (otraVez); } finally { corriendo = null; }
    })();
    return corriendo;
  }

  async function correr() {
    if (!activa()) return;
    const h = await X().carpeta();
    if (!h) {
      const st = await X().estado();
      avisar({ sincronizando: false, sinCarpeta: !st.conectada, sinPermiso: !!st.conectada, error: '' });
      return;
    }
    const tomados = Array.from(sucios);
    sucios.clear();
    avisar({ sincronizando: true, sinCarpeta: false, sinPermiso: false });
    try {
      const dir = await subcarpeta(h);
      const remotos = await leerRemotos(dir);
      // Lo de este navegador se lee de localStorage, no de la memoria de esta página: si otra
      // pestaña acaba de guardar, manda su versión.
      const locales = new Map(S().localProjects().map((p) => [p.uid, p]));
      vistos.clear();
      remotos.forEach((R, uid) => vistos.set(uid, { mod: R.mod, autor: R.autor }));
      const est = leerEstado();
      const mapa = est.proyectos || (est.proyectos = {});
      let reintento = false;   // se dejó de subir algo porque cambió en la carpeta (cambioEnCarpeta)
      const traer = [], conflictos = [], juntados = [];
      const porGuardar = [];   // contenido de las bases nuevas, para juntar cambios simultáneos después
      for (const uid of new Set([...locales.keys(), ...remotos.keys()])) {
        const L = locales.get(uid) || null, R = remotos.get(uid) || null, b = mapa[uid] || null;
        let d = decidir(L, R, b);
        if (d === 'conflicto' && mismoContenido(L, R.datos)) d = 'bajar';
        // Misma fecha en otro equipo (guardado en el mismo milisegundo) pero otro contenido. También si
        // la fecha es la que subió este navegador pero otro reescribió el archivo después (2026-11-10).
        else if (d === 'igual' && (!b || b.base !== R.mod || reescrito(uid)) && !mismoContenido(L, R.datos)) d = 'conflicto';
        const traida = () => { porGuardar.push({ uid, mod: R.mod, datos: R.datos }); return { base: R.mod, historia: R.historia, propio: false, copia: true }; };
        // «propio»: si la base la subió este navegador (decidir() lo usa cuando la historia no alcanza)
        if (d === 'igual') {
          const sigue = b && b.base === R.mod;
          mapa[uid] = { base: R.mod, historia: R.historia, propio: sigue ? b.propio : undefined, copia: !!(sigue && b.copia) };
          if (!mapa[uid].copia) { porGuardar.push({ uid, mod: R.mod, datos: R.datos }); mapa[uid].copia = true; }
        } else if (d === 'bajar') { traer.push(R); mapa[uid] = traida(); }
        else if (d === 'subir') {
          // OneDrive trajo otra versión mientras se decidía: no se sube encima, se revisa de nuevo
          if (reintentos < 3 && await cambioEnCarpeta(dir, uid)) { sucios.add(uid); otraVez = true; reintento = true; continue; }
          const historia = historiaNueva(L, b);
          await escribir(dir, L, historia);
          mapa[uid] = { base: L.modificado, historia, propio: true, copia: true };
          porGuardar.push({ uid, mod: L.modificado, datos: L });
          vistos.set(uid, { mod: L.modificado, autor: autor() });
        } else if (d === 'conflicto') {
          const j = await juntar(L, R).catch(() => null);
          if (j && !j.choques.length) juntados.push({ L, R, M: j.resultado });
          else conflictos.push({ L, R, base: j ? j.base : null });
          mapa[uid] = traida();
        }
      }
      reintentos = reintento ? reintentos + 1 : 0;   // tres seguidas como máximo: con fechas inestables, igual se sube
      if (!(await bases.guardar(porGuardar))) porGuardar.forEach((x) => { if (mapa[x.uid]) mapa[x.uid].copia = false; });
      guardarEstado(est);
      const copia = (R) => JSON.parse(JSON.stringify(R.datos));
      if (traer.length) {
        S().applyRemote(traer.map(copia), [], { autores: Array.from(new Set(traer.map((R) => R.autor).filter(Boolean))), origen: 'carpeta' });
      }
      // Cambios hechos aquí y en otro equipo a la vez, en datos distintos: se guardan juntos aquí (y
      // en la próxima vuelta suben, porque la base ya es la versión de la carpeta).
      juntados.forEach(({ L, R, M }) => {
        M.modificado = String(L.modificado) > String(R.mod) ? L.modificado : R.mod;   // upsert la deja posterior a las dos
        S().upsert(M);
        S().emit({ type: 'remote', ids: [M.uid], autores: R.autor ? [R.autor] : [], origen: 'carpeta', juntado: true });
      });
      // En los mismos datos, o sin base común: la app pregunta (proyecto abierto) o guarda los de aquí como copia.
      conflictos.forEach(({ L, R, base }) => {
        S().applyRemote([copia(R)], [], L.eliminado ? { origen: 'carpeta' } : { conflicto: true, local: L, base, autores: R.autor ? [R.autor] : [], origen: 'carpeta' });
      });
      await presencia(dir).catch((e) => console.warn('Carpeta compartida (quién edita):', e));
      avisar({ sincronizando: false, ultima: new Date().toISOString(), error: '', enCarpeta: remotos.size });
    } catch (e) {
      tomados.forEach((uid) => sucios.add(uid));
      console.error('Carpeta compartida:', e);
      avisar({ sincronizando: false, error: (e && e.message) || String(e) });
    }
  }

  // ---- Quién tiene abierto cada proyecto ------------------------------------------------------
  /* Cada persona deja en «publicado/formulador/editando/» una marca chica por el proyecto que tiene
     abierto («<uid>~<persona>.json») y la renueva en cada vuelta mientras siga ahí; al cerrarlo la
     borra. Una marca vieja (página cerrada sin avisar) deja de contar sola. Las demás herramientas
     no la ven: leen solo los «*.json» de publicado/formulador, no las subcarpetas. */
  const EDITANDO = 'editando';
  const PRESENCIA_CADA = 120000;   // cada cuánto se renueva la marca propia
  const PRESENCIA_VALE = 300000;   // una marca sin renovar en este tiempo ya no cuenta
  let abierto = () => null;        // la app dice qué proyecto tiene abierto (alAbrir)
  let marcaPropia = { nombre: '', escrita: 0 };
  let dirPresencia = null;         // para borrar la marca al cerrar la página
  const presentes = new Map();     // uid -> [{ usuario, visto }] de los demás
  const sufijoPersona = (p) => '~' + String(p).normalize('NFD').replace(/[^A-Za-z0-9_-]/g, '_') + '.json';
  async function presencia(dir) {
    const yo = autor();
    const d = await dir.getDirectoryHandle(EDITANDO, { create: true });
    const uid = abierto();
    const propio = yo && uid ? nombreArchivo(uid).replace(/\.json$/, '') + sufijoPersona(yo) : '';
    const ahora = Date.now();
    const vistas = new Map();
    for await (const [nombre, h] of d.entries()) {
      if (h.kind !== 'file' || !/\.json$/i.test(nombre)) continue;
      if (yo && nombre.endsWith(sufijoPersona(yo))) {   // marcas propias de otro proyecto (o de una página que se cerró)
        if (nombre !== propio && d.removeEntry) { try { await d.removeEntry(nombre); } catch (e) { /* OneDrive la tiene tomada */ } }
        continue;
      }
      let m = null;
      try { m = JSON.parse((await (await h.getFile()).text()).replace(/^﻿/, '')); } catch (e) { continue; }
      const t = Date.parse(m && m.visto);
      if (!m || !m.uid || !m.usuario || !(Math.abs(ahora - t) < PRESENCIA_VALE)) continue;
      if (!vistas.has(m.uid)) vistas.set(m.uid, []);
      vistas.get(m.uid).push({ usuario: String(m.usuario), visto: m.visto });
    }
    presentes.clear();
    vistas.forEach((v, k) => presentes.set(k, v));
    dirPresencia = d;
    if (!propio) { marcaPropia = { nombre: '', escrita: 0 }; return; }
    if (marcaPropia.nombre === propio && ahora - marcaPropia.escrita < PRESENCIA_CADA) return;
    const fh = await d.getFileHandle(propio, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify({ esquema: ESQUEMA, tipo: 'editando', uid, usuario: yo, visto: new Date(ahora).toISOString() }) + '\n');
    await w.close();
    marcaPropia = { nombre: propio, escrita: ahora };
  }
  /* Las demás personas que tienen abierto este proyecto, según la última revisión: [{ usuario, visto }]. */
  const editando = (uid) => (presentes.get(uid) || []).slice();
  /* fn: () => uid del proyecto abierto en esta página, o null. Sin fn: se abrió o cerró un proyecto, y la
     marca se pone al día en una vuelta próxima (la misma espera que una subida, no una vuelta por cada
     navegación). */
  function alAbrir(fn) {
    if (typeof fn === 'function') { abierto = fn; return; }
    if (!timer) programar(ESPERA_SUBIDA);
  }

  // ---- Acciones desde la interfaz -------------------------------------------------------------
  async function estado() {
    const base = X() ? await X().estado() : { disponible: false, conectada: false };
    return Object.assign({}, base, { local: enModoLocal() });
  }
  /* Conectar (o dar permiso a) la carpeta y sincronizar. Debe llamarse desde un clic. */
  async function activar() {
    const I = X();
    if (!I || !I.disponible()) throw new Error('Este navegador no puede abrir carpetas: usa Chrome o Edge de escritorio.');
    const st = await I.estado();
    if (!st.conectada) await I.conectar();   // AbortError si se cierra el selector
    else if (st.permiso !== 'granted' && !(await I.permitir())) throw new Error('Sin permiso para usar la carpeta compartida.');
    await sincronizar();
    return info();
  }

  /* Sin carpeta (otro navegador, o sin la biblioteca en este computador): el presupuesto se
     descarga como mensaje «formulacion» para dejarlo en el buzón. Claude lo incorpora a la
     carpeta del equipo (Finanzas QUEMPIN: driver.py formulaciones incorporar). */
  function mensajeFormulacion(p) {
    const I = X();
    const b = (leerEstado().proyectos || {})[p.uid] || null;
    return {
      esquema: ESQUEMA, id: I.nuevoId(), tipo: 'formulacion', destino: 'formulador',
      origen: { herramienta: 'formulador', usuario: autor(), enviado: I.isoLocal(new Date()) },
      historia: historiaNueva(p, b), resumen: resumen(p), datos: JSON.parse(JSON.stringify(p))
    };
  }
  function descargar(p) {
    const m = mensajeFormulacion(p);
    X().descargar(m);
    const e = leerEstado();
    (e.entregas || (e.entregas = {}))[p.uid] = p.modificado;
    guardarEstado(e);
    avisar({});
    return X().nombreArchivo(m);
  }

  function iniciar() {
    if (!S() || !X()) return;
    S().on((ev) => {
      if (ev.type !== 'local' || !activa()) return;
      ev.ids.forEach((uid) => sucios.add(uid));
      avisar({});
      programar(ESPERA_SUBIDA);
    });
    // Otra carpeta (o la misma elegida de nuevo): empezar de cero la memoria de lo sincronizado.
    X().onCambio(() => {
      memo.clear();
      const e = leerEstado();
      e.proyectos = {};
      guardarEstado(e);
      programar(0);
    });
    const revisar = () => { if (!root.document || root.document.visibilityState !== 'hidden') programar(0); };
    root.addEventListener('focus', revisar);
    // Al cerrar la página, sacar la marca de «está editando» (si no alcanza, vence sola)
    root.addEventListener('pagehide', () => {
      if (marcaPropia.nombre && dirPresencia && dirPresencia.removeEntry) dirPresencia.removeEntry(marcaPropia.nombre).catch(() => {});
    });
    if (root.document) root.document.addEventListener('visibilitychange', revisar);
    setInterval(revisar, INTERVALO);
    programar(0);
  }

  const api = {
    decidir, historiaNueva, nombreArchivo, mismoContenido, resumen, estado, info, enCarpeta, activa, activar, sincronizar, iniciar,
    enRepositorio, entregado, sinSubir, mensajeFormulacion, descargar, editando, alAbrir
  };
  root.QCompartida = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
