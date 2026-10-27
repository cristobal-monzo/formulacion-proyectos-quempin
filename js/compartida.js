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
 *    sigue en la base, se sube. Si cambiaron los dos, o la carpeta perdió una versión que subió
 *    este navegador (un conflicto de OneDrive), se trae la de la carpeta y los cambios de aquí
 *    quedan como una copia del proyecto: nunca se pierde trabajo.
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
    } catch (e) { memo.delete(nombre); }
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
      const traer = [], conflictos = [];
      for (const uid of new Set([...locales.keys(), ...remotos.keys()])) {
        const L = locales.get(uid) || null, R = remotos.get(uid) || null, b = mapa[uid] || null;
        let d = decidir(L, R, b);
        if (d === 'conflicto' && mismoContenido(L, R.datos)) d = 'bajar';
        // Misma fecha en otro equipo (guardado en el mismo milisegundo) pero otro contenido.
        else if (d === 'igual' && (!b || b.base !== R.mod) && !mismoContenido(L, R.datos)) d = 'conflicto';
        // «propio»: si la base la subió este navegador (decidir() lo usa cuando la historia no alcanza)
        if (d === 'igual') mapa[uid] = { base: R.mod, historia: R.historia, propio: b && b.base === R.mod ? b.propio : undefined };
        else if (d === 'bajar') { traer.push(R); mapa[uid] = { base: R.mod, historia: R.historia, propio: false }; }
        else if (d === 'subir') {
          const historia = historiaNueva(L, b);
          await escribir(dir, L, historia);
          mapa[uid] = { base: L.modificado, historia, propio: true };
          vistos.set(uid, { mod: L.modificado, autor: autor() });
        } else if (d === 'conflicto') { conflictos.push({ L, R }); mapa[uid] = { base: R.mod, historia: R.historia, propio: false }; }
      }
      guardarEstado(est);
      const copia = (R) => JSON.parse(JSON.stringify(R.datos));
      if (traer.length) {
        S().applyRemote(traer.map(copia), [], { autores: Array.from(new Set(traer.map((R) => R.autor).filter(Boolean))), origen: 'carpeta' });
      }
      // Cambios hechos aquí y en otro equipo a la vez: la app guarda los de aquí como copia.
      conflictos.forEach(({ L, R }) => {
        S().applyRemote([copia(R)], [], L.eliminado ? { origen: 'carpeta' } : { conflicto: true, local: L, autores: R.autor ? [R.autor] : [], origen: 'carpeta' });
      });
      avisar({ sincronizando: false, ultima: new Date().toISOString(), error: '', enCarpeta: remotos.size });
    } catch (e) {
      tomados.forEach((uid) => sucios.add(uid));
      console.error('Carpeta compartida:', e);
      avisar({ sincronizando: false, error: (e && e.message) || String(e) });
    }
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
    if (root.document) root.document.addEventListener('visibilitychange', revisar);
    setInterval(revisar, INTERVALO);
    programar(0);
  }

  const api = {
    decidir, historiaNueva, nombreArchivo, mismoContenido, resumen, estado, info, enCarpeta, activa, activar, sincronizar, iniciar,
    enRepositorio, entregado, sinSubir, mensajeFormulacion, descargar
  };
  root.QCompartida = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
