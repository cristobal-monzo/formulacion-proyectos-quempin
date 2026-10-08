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
 *  - Eliminar manda a la papelera y el archivo queda; mientras se comparte no hay borrado
 *    definitivo desde la herramienta (igual que en SharePoint).
 */
(function (root) {
  'use strict';

  const ESQUEMA = 'quempin.intercambio/1';
  const RUTA = ['publicado', 'formulador'];
  const LS_ESTADO = 'qpn.formulacion.compartida.v1';
  const MAX_HISTORIA = 50;
  const ESPERA_SUBIDA = 1500;   // ms desde el último guardado hasta copiarlo a la carpeta
  const INTERVALO = 20000;      // cada cuánto se revisa la carpeta con la página visible

  // ---- Decisión (sin efectos: se prueba en node) ----------------------------------------------
  /* L: el proyecto en este navegador, o null. R: { mod, historia } del archivo, o null.
     b: { base, historia } lo último sincronizado aquí, o null.
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
  let inf = { sincronizando: false, ultima: null, error: '', sinCarpeta: false, sinPermiso: false, enCarpeta: 0 };
  function info() { return Object.assign({ pendientes: sucios.size }, inf); }
  function avisar(cambios) {
    Object.assign(inf, cambios);
    if (S()) S().emit({ type: 'sync', pendientes: sucios.size });
  }

  let timer = null, corriendo = null, otraVez = false;
  function programar(ms) {
    if (!activa()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sincronizar(); }, ms);
  }
  /* Una sola sincronización a la vez, también entre pestañas del mismo navegador. */
  function sincronizar() {
    if (corriendo) { otraVez = true; return corriendo; }
    const candado = (fn) => (root.navigator && root.navigator.locks ? root.navigator.locks.request('qpn-formulador-compartida', fn) : fn());
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
      const est = leerEstado();
      const mapa = est.proyectos || (est.proyectos = {});
      const traer = [], conflictos = [];
      for (const uid of new Set([...locales.keys(), ...remotos.keys()])) {
        const L = locales.get(uid) || null, R = remotos.get(uid) || null, b = mapa[uid] || null;
        let d = decidir(L, R, b);
        if (d === 'conflicto' && mismoContenido(L, R.datos)) d = 'bajar';
        // Misma fecha en otro equipo (guardado en el mismo milisegundo) pero otro contenido.
        else if (d === 'igual' && (!b || b.base !== R.mod) && !mismoContenido(L, R.datos)) d = 'conflicto';
        if (d === 'igual') mapa[uid] = { base: R.mod, historia: R.historia };
        else if (d === 'bajar') { traer.push(R); mapa[uid] = { base: R.mod, historia: R.historia }; }
        else if (d === 'subir') {
          const historia = historiaNueva(L, b);
          await escribir(dir, L, historia);
          mapa[uid] = { base: L.modificado, historia };
        } else if (d === 'conflicto') { conflictos.push({ L, R }); mapa[uid] = { base: R.mod, historia: R.historia }; }
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
    decidir, historiaNueva, nombreArchivo, mismoContenido, resumen, estado, info, activa, activar, sincronizar, iniciar,
    enRepositorio, entregado, sinSubir, mensajeFormulacion, descargar
  };
  root.QCompartida = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
