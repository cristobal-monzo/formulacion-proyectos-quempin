/*
 * datos.js — Las cartas Gantt, guardadas aparte del Formulador (pedido del usuario, 2026-10-20: «que la
 * Carta Gantt dentro del portal sea una herramienta aparte, no una extensión del formulador»).
 *
 * Una carta: { uid, nombre, proyecto, origen, gantt, creado, modificado, modificadoPor, eliminado }
 *   proyecto: el del Formulador al que pertenece ({ uid, codigo, version, titulo, cliente, responsable,
 *             req }, una foto al vincularla) o null si es una carta suelta, con nombre propio.
 *   gantt:    el programa, con el mismo modelo de antes (gantt/gantt.js): inicio, calendario, escala,
 *             noLaborables y tareas.
 *   origen:   { formulador: uid } si se traspasó desde un proyecto del Formulador.
 *
 * Dónde viven:
 *   - En este navegador, 'qpn.gantt.cartas.v1' (localStorage, mismo sitio que el Formulador).
 *   - Con el equipo, en la carpeta de intercambio: «publicado/gantt/<uid>.json», una por carta, con la
 *     misma regla de quién gana que los proyectos del Formulador (js/compartida.js: decidir). Si una
 *     carta cambió aquí y en otro equipo a la vez, queda la de la carpeta y la de aquí como copia.
 *
 * Traspaso: hasta el 2026-10-20 la carta vivía dentro del proyecto (p.gantt). Cada proyecto del
 * Formulador con tareas en p.gantt (de este navegador o de la carpeta del equipo) pasa a ser una carta
 * con uid «f<uid del proyecto>» y fecha de modificación = la del proyecto: dos navegadores que la
 * traspasan llegan a la misma carta, sin conflicto. El Formulador ya no la muestra ni la cambia, pero
 * conserva p.gantt tal como estaba (js/store.js), así que el traspaso se puede hacer en cualquier
 * momento. Una carta traspasada no se vuelve a crear aunque se elimine (queda en la papelera).
 */
(function (root) {
  'use strict';

  const LS = 'qpn.gantt.cartas.v1';
  const LS_ESTADO = 'qpn.gantt.compartida.v1';
  const LS_FORMULADOR = 'qpn.formulacion.proyectos.v1';
  const ESQUEMA = 'quempin.intercambio/1';
  const RUTA = ['publicado', 'gantt'];
  const RUTA_FORMULADOR = ['publicado', 'formulador'];
  const ESPERA_SUBIDA = 1500;   // ms desde el último guardado hasta copiarlo a la carpeta
  const INTERVALO = 20000;      // cada cuánto se revisa la carpeta con la página visible

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => ((root.crypto && root.crypto.randomUUID)
    ? root.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14));
  const hoy = () => {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };
  const usuario = () => (root.QUsuario ? root.QUsuario.actual() || '' : '');
  function lsGet(key, fallback) {
    try { const raw = root.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { root.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  // ---- Modelo ---------------------------------------------------------------------------------
  const GANTT_VACIO = () => ({ inicio: '', calendario: 'habiles', escala: 'auto', noLaborables: [], tareas: [] });
  /* El mismo saneamiento que hacía js/store.js con p.gantt */
  function normalizarGantt(g) {
    g = g && typeof g === 'object' ? g : {};
    return {
      inicio: typeof g.inicio === 'string' ? g.inicio : '',
      calendario: g.calendario === 'corridos' ? 'corridos' : 'habiles',
      escala: ['dias', 'semanas', 'meses'].includes(g.escala) ? g.escala : 'auto',
      noLaborables: Array.isArray(g.noLaborables) ? g.noLaborables.filter((x) => typeof x === 'string') : [],
      tareas: (Array.isArray(g.tareas) ? g.tareas : []).filter((t) => t && typeof t === 'object').map((t) => Object.assign(
        { nombre: '', partida: '', responsable: '', duracion: 1, hito: false, avance: 0, noAntesDe: '' }, t,
        { uid: t.uid || uid(), predecesoras: Array.isArray(t.predecesoras) ? t.predecesoras.filter((d) => d && d.uid) : [] }))
    };
  }
  /* Lo que la carta recuerda del proyecto del Formulador (para mostrarlo aunque el proyecto no esté aquí) */
  function fotoProyecto(p) {
    if (!p) return null;
    // El N° de requerimiento, como lo lee el Formulador (js/herramientas.js: reqDe)
    const r = p.vinculos && p.vinculos.requerimiento;
    const n = r && typeof r === 'object' ? r.numero : r;
    const req = n !== undefined && n !== null && /^\d{1,6}$/.test(String(n)) ? n : '';
    return {
      uid: p.uid, codigo: p.codigo || '', version: parseInt(p.version, 10) || 1, titulo: p.titulo || '',
      cliente: p.cliente || '', responsable: p.responsable || '', req: req ? String(req) : ''
    };
  }
  function normalizar(c) {
    const out = Object.assign({}, c);
    out.uid = out.uid || uid();
    out.nombre = typeof out.nombre === 'string' ? out.nombre : '';
    out.proyecto = out.proyecto && out.proyecto.uid ? Object.assign({}, out.proyecto) : null;
    out.gantt = normalizarGantt(out.gantt);
    out.creado = out.creado || new Date().toISOString();
    out.modificado = out.modificado || out.creado;
    if (!out.eliminado) delete out.eliminado;
    return out;
  }

  // ---- Las cartas de este navegador -----------------------------------------------------------
  const oyentes = [];
  /* Eventos: { type: 'local', ids } al guardar aquí; { type: 'remote', ids, conflictos } al llegar de
     la carpeta o de otra pestaña; { type: 'sync' } al cambiar el estado de la carpeta. */
  function on(fn) { oyentes.push(fn); }
  function emit(ev) { oyentes.slice().forEach((fn) => { try { fn(ev); } catch (e) { console.error(e); } }); }

  let cache = null;
  function todas() {
    if (!cache) cache = ((lsGet(LS, null) || {}).cartas || []).map(normalizar);
    return cache;
  }
  function escribirTodas() { lsSet(LS, { esquema: 'quempin-gantt/v1', cartas: cache }); }
  const all = () => todas().filter((c) => !c.eliminado);
  const papelera = () => todas().filter((c) => c.eliminado);
  const get = (id) => todas().find((c) => c.uid === id) || null;
  /* La carta (no eliminada) de un proyecto del Formulador */
  const deProyecto = (puid) => all().find((c) => c.proyecto && c.proyecto.uid === puid) || null;

  /* Guarda una carta (nueva o cambiada): queda con la fecha y el autor de este cambio */
  function guardar(c) {
    const lista = todas();
    // Siempre después del guardado anterior, aunque caiga en el mismo milisegundo: la carpeta compara
    // estas fechas para saber quién tiene la versión nueva
    const antes = Date.parse(c.modificado || '') || 0;
    c.modificado = new Date(Math.max(Date.now(), antes + 1)).toISOString();
    c.modificadoPor = usuario();
    const i = lista.findIndex((x) => x.uid === c.uid);
    if (i >= 0) lista[i] = c; else lista.unshift(c);
    escribirTodas();
    emit({ type: 'local', ids: [c.uid] });
    return c;
  }
  function nueva(o) {
    const ahora = new Date().toISOString();
    return normalizar(Object.assign({ uid: uid(), nombre: '', proyecto: null, gantt: GANTT_VACIO(), creado: ahora, modificado: ahora, creadoPor: usuario() }, o || {}));
  }
  function eliminar(id) {
    const c = get(id);
    if (!c) return;
    c.eliminado = new Date().toISOString();
    guardar(c);
  }
  function restaurar(id) {
    const c = get(id);
    if (!c) return;
    delete c.eliminado;
    guardar(c);
  }
  /* Copia de una carta, con otros uid en las tareas (y sus predecesoras apuntando a las nuevas) */
  function duplicar(c, o) {
    const g = clone(c.gantt);
    const mapa = new Map(g.tareas.map((t) => [t.uid, uid()]));
    g.tareas.forEach((t) => {
      t.uid = mapa.get(t.uid);
      t.predecesoras = t.predecesoras.map((d) => Object.assign({}, d, { uid: mapa.get(d.uid) })).filter((d) => d.uid);
    });
    return nueva(Object.assign({ nombre: c.nombre, proyecto: c.proyecto ? clone(c.proyecto) : null, gantt: g }, o || {}));
  }
  /* Lo que llega de la carpeta (o de otra pestaña) reemplaza la copia de aquí */
  function aplicarRemotas(cartas) {
    const lista = todas();
    cartas.map(normalizar).forEach((c) => {
      const i = lista.findIndex((x) => x.uid === c.uid);
      if (i >= 0) lista[i] = c; else lista.push(c);
    });
    escribirTodas();
  }
  /* Otra pestaña guardó: se vuelve a leer */
  function releer() { cache = null; }
  if (root.addEventListener) {
    root.addEventListener('storage', (e) => {
      if (e.key !== LS) return;
      releer();
      emit({ type: 'remote', ids: [], origen: 'ventana' });
    });
  }

  // ---- Proyectos del Formulador (solo se leen) ------------------------------------------------
  /* Los de este navegador y, si la carpeta del equipo está conectada, los de ella (el más nuevo de cada
     uno). Sin los de la papelera. */
  let remotosFormulador = new Map();
  function proyectosFormulador() {
    const porUid = new Map();
    const poner = (p) => {
      if (!p || !p.uid) return;
      const x = porUid.get(p.uid);
      if (!x || String(p.modificado || '') > String(x.modificado || '')) porUid.set(p.uid, p);
    };
    ((lsGet(LS_FORMULADOR, null) || {}).proyectos || []).forEach(poner);
    remotosFormulador.forEach(poner);
    return Array.from(porUid.values()).filter((p) => !p.eliminado)
      .sort((a, b) => String(b.modificado || '').localeCompare(String(a.modificado || '')));
  }
  const proyecto = (puid) => proyectosFormulador().find((p) => p.uid === puid) || null;
  /* Partidas con el código que les da el Formulador (js/calc.js: PB la base, P1, P2… las demás) */
  function partidasDe(p) {
    const ps = (p && p.partidas) || [];
    const iBase = ps.findIndex((pt) => pt && pt.base);
    let n = 0;
    return ps.map((pt, i) => Object.assign({}, pt, { code: i === iBase ? 'PB' : 'P' + (++n), base: i === iBase }));
  }

  // ---- Traspaso desde p.gantt -----------------------------------------------------------------
  const uidTraspaso = (puid) => 'f' + String(puid).replace(/[^A-Za-z0-9_-]/g, '_');
  /* Cartas nuevas para los proyectos con tareas en p.gantt que todavía no tienen la suya. Deterministas:
     el mismo proyecto da la misma carta en cualquier navegador. Devuelve cuántas creó. */
  function traspasar(proyectos) {
    const lista = todas();
    const ya = new Set(lista.map((c) => c.uid));
    lista.forEach((c) => { if (c.origen && c.origen.formulador) ya.add(uidTraspaso(c.origen.formulador)); });
    const nuevas = [];
    proyectos.forEach((p) => {
      if (!p || !p.gantt || !Array.isArray(p.gantt.tareas) || !p.gantt.tareas.length) return;
      const id = uidTraspaso(p.uid);
      if (ya.has(id)) return;
      ya.add(id);
      const fecha = p.modificado || p.creado || new Date().toISOString();
      nuevas.push(normalizar({
        uid: id, nombre: '', proyecto: fotoProyecto(p), origen: { formulador: p.uid },
        gantt: clone(p.gantt), creado: fecha, modificado: fecha, modificadoPor: ''
      }));
    });
    if (!nuevas.length) return 0;
    nuevas.forEach((c) => lista.push(c));
    escribirTodas();
    emit({ type: 'local', ids: nuevas.map((c) => c.uid), traspaso: true });
    return nuevas.length;
  }

  // ---- Carpeta del equipo ---------------------------------------------------------------------
  const X = () => root.QIntercambio;
  const C = () => root.QCompartida;   // solo sus funciones puras: decidir, historiaNueva, mismoContenido
  const nombreArchivo = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_') + '.json';
  function leerEstado() { return lsGet(LS_ESTADO, null) || {}; }
  function guardarEstado(e) { lsSet(LS_ESTADO, e); }
  const disponible = () => !!X() && X().disponible();

  async function bajarA(h, ruta, crear) {
    let d = h;
    for (const n of ruta) {
      try { d = await d.getDirectoryHandle(n, { create: !!crear }); } catch (e) { return null; }
    }
    return d;
  }
  const memo = new Map();   // nombre -> { lastModified, size, R }: solo se relee lo que cambió
  /* Los archivos de una carpeta, como { uid, mod, historia, datos, autor }; solo el que se llama como su uid */
  async function leerSobres(dir, tipo, clave) {
    const out = new Map();
    for await (const [nombre, h] of dir.entries()) {
      if (h.kind !== 'file' || !/\.json$/i.test(nombre)) continue;
      let f;
      try { f = await h.getFile(); } catch (e) { continue; }
      const k = clave + '/' + nombre;
      let m = memo.get(k);
      if (!m || m.lastModified !== f.lastModified || m.size !== f.size) {
        let sobre = null;
        try { sobre = JSON.parse((await f.text()).replace(/^﻿/, '')); } catch (e) { sobre = null; }
        const d = sobre && sobre.esquema === ESQUEMA && sobre.tipo === tipo ? sobre.datos : null;
        const R = d && typeof d === 'object' && d.uid && nombreArchivo(d.uid) === nombre ? {
          uid: d.uid, mod: String(d.modificado || ''), datos: d, autor: String(sobre.autor || ''),
          historia: Array.isArray(sobre.historia) ? sobre.historia.filter((x) => typeof x === 'string') : []
        } : null;
        m = { lastModified: f.lastModified, size: f.size, R };
        memo.set(k, m);
      }
      if (m.R && !out.has(m.R.uid)) out.set(m.R.uid, m.R);
    }
    return out;
  }
  /* Lo que lee quien no tiene la herramienta (Claude, el Portal): el plazo y el avance */
  function resumen(c) {
    const QG = root.QGantt;
    if (!QG || !c.gantt.tareas.length) return { tareas: c.gantt.tareas.length };
    try {
      const r = QG.calcular(c.gantt, hoy());
      return { tareas: r.tareas.length, inicio: QG.aIso(r.inicio), termino: QG.aIso(r.termino), plazo: r.plazoLaborable, avance: avanceDe(r) };
    } catch (e) { return { tareas: c.gantt.tareas.length }; }
  }
  /* Avance ponderado por la duración (los hitos no cuentan), de 0 a 100 */
  function avanceDe(res) {
    const con = res.tareas.filter((t) => !t.hito);
    const dur = con.reduce((a, t) => a + t.dur, 0);
    return dur ? Math.round(con.reduce((a, t) => a + t.dur * Math.max(0, Math.min(100, Number(t.avance) || 0)), 0) / dur) : 0;
  }
  async function escribir(dir, c, historia) {
    const nombre = nombreArchivo(c.uid);
    const sobre = { esquema: ESQUEMA, herramienta: 'gantt', tipo: 'carta-gantt', generado: new Date().toISOString(), autor: usuario(), historia, resumen: resumen(c), datos: c };
    const fh = await dir.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(sobre) + '\n');
    await w.close();
    memo.delete('gantt/' + nombre);
  }

  const sucias = new Set();
  let inf = { sincronizando: false, ultima: null, error: '', sinCarpeta: false, sinPermiso: false, enCarpeta: 0 };
  const info = () => Object.assign({ pendientes: sucias.size, disponible: disponible() }, inf);
  function avisar(cambios) { Object.assign(inf, cambios); emit({ type: 'sync' }); }

  let timer = null, corriendo = null, otraVez = false;
  function programar(ms) {
    if (!disponible()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sincronizar(); }, ms);
  }
  /* Una sola sincronización a la vez, también entre pestañas */
  function sincronizar() {
    if (corriendo) { otraVez = true; return corriendo; }
    const candado = (fn) => (root.navigator && root.navigator.locks ? root.navigator.locks.request('qpn-gantt-compartida', fn) : fn());
    corriendo = (async () => {
      try { do { otraVez = false; await candado(correr); } while (otraVez); } finally { corriendo = null; }
    })();
    return corriendo;
  }
  async function correr() {
    if (!disponible()) return;
    const h = await X().carpeta();
    if (!h) {
      const st = await X().estado();
      avisar({ sincronizando: false, sinCarpeta: !st.conectada, sinPermiso: !!st.conectada, error: '' });
      // Sin la carpeta, el traspaso sale de los proyectos de este navegador
      traspasar(proyectosFormulador());
      return;
    }
    const tomadas = Array.from(sucias);
    sucias.clear();
    avisar({ sincronizando: true, sinCarpeta: false, sinPermiso: false });
    try {
      // Los proyectos del Formulador que están en la carpeta: para elegir, para crear desde las partidas
      // y para el traspaso de los que tenían carta
      const dirF = await bajarA(h, RUTA_FORMULADOR, false);
      remotosFormulador = new Map();
      if (dirF) (await leerSobres(dirF, 'proyecto', 'formulador')).forEach((R) => remotosFormulador.set(R.uid, R.datos));
      const dir = await bajarA(h, RUTA, true);
      let remotas = await leerSobres(dir, 'carta-gantt', 'gantt');
      // Primero lo que ya está en la carpeta: así un traspaso hecho en otro equipo llega como es
      const lista = todas();
      const ids = new Set(lista.map((c) => c.uid));
      const llegadas = Array.from(remotas.values()).filter((R) => !ids.has(R.uid)).map((R) => clone(R.datos));
      if (llegadas.length) {
        aplicarRemotas(llegadas);
        const est = leerEstado();
        const mapa = est.cartas || (est.cartas = {});
        llegadas.forEach((c) => { const R = remotas.get(c.uid); mapa[c.uid] = { base: R.mod, historia: R.historia }; });
        guardarEstado(est);
      }
      traspasar(proyectosFormulador());
      const est = leerEstado();
      const mapa = est.cartas || (est.cartas = {});
      const locales = new Map(todas().map((c) => [c.uid, c]));
      const traer = [], conflictos = [];
      for (const id of new Set([...locales.keys(), ...remotas.keys()])) {
        const L = locales.get(id) || null, R = remotas.get(id) || null, b = mapa[id] || null;
        let d = C().decidir(L, R, b);
        if (d === 'conflicto' && C().mismoContenido(L, R.datos)) d = 'bajar';
        else if (d === 'igual' && (!b || b.base !== R.mod) && !C().mismoContenido(L, R.datos)) d = 'conflicto';
        if (d === 'igual') mapa[id] = { base: R.mod, historia: R.historia };
        else if (d === 'bajar') { traer.push(clone(R.datos)); mapa[id] = { base: R.mod, historia: R.historia }; }
        else if (d === 'subir') {
          const historia = C().historiaNueva(L, b);
          await escribir(dir, L, historia);
          mapa[id] = { base: L.modificado, historia };
        } else if (d === 'conflicto') { conflictos.push({ L, R }); mapa[id] = { base: R.mod, historia: R.historia }; }
      }
      guardarEstado(est);
      if (traer.length) aplicarRemotas(traer);
      // Cambiada aquí y en otro equipo a la vez: queda la de la carpeta y la de aquí como copia
      const copias = conflictos.filter(({ L }) => !L.eliminado).map(({ L }) => duplicar(L, {
        nombre: `${L.nombre || (L.proyecto ? L.proyecto.titulo || L.proyecto.codigo : 'Carta Gantt')} (copia de este equipo)`
      }));
      if (conflictos.length) aplicarRemotas(conflictos.map(({ R }) => clone(R.datos)));
      copias.forEach((c) => guardar(c));
      if (traer.length || conflictos.length || llegadas.length) emit({ type: 'remote', ids: traer.concat(llegadas).map((c) => c.uid), conflictos: copias.length });
      remotas = null;
      avisar({ sincronizando: false, ultima: new Date().toISOString(), error: '', enCarpeta: locales.size });
    } catch (e) {
      tomadas.forEach((id) => sucias.add(id));
      console.error('Carpeta del equipo (Carta Gantt):', e);
      avisar({ sincronizando: false, error: (e && e.message) || String(e) });
    }
  }
  /* Conectar (o dar permiso a) la carpeta y sincronizar. Debe llamarse desde un clic. */
  async function activar() {
    const I = X();
    if (!I || !I.disponible()) throw new Error('Este navegador no puede abrir carpetas: usa Chrome o Edge de escritorio.');
    const st = await I.estado();
    if (!st.conectada) await I.conectar();   // AbortError si se cierra el selector
    else if (st.permiso !== 'granted' && !(await I.permitir())) throw new Error('Sin permiso para usar la carpeta del equipo.');
    await sincronizar();
    return info();
  }
  function iniciar() {
    on((ev) => {
      if (ev.type !== 'local') return;
      ev.ids.forEach((id) => sucias.add(id));
      programar(ESPERA_SUBIDA);
    });
    if (!disponible()) { traspasar(proyectosFormulador()); return; }
    if (X().onCambio) X().onCambio(() => { memo.clear(); const e = leerEstado(); e.cartas = {}; guardarEstado(e); programar(0); });
    const revisar = () => { if (!root.document || root.document.visibilityState !== 'hidden') programar(0); };
    root.addEventListener('focus', revisar);
    if (root.document) root.document.addEventListener('visibilitychange', revisar);
    setInterval(revisar, INTERVALO);
    programar(0);
  }

  const api = {
    GANTT_VACIO, normalizarGantt, normalizar, fotoProyecto, uid, hoy, all, papelera, get, deProyecto, guardar, nueva,
    eliminar, restaurar, duplicar, on, emit, proyectosFormulador, proyecto, partidasDe, traspasar, uidTraspaso,
    avanceDe, resumen, info, activar, sincronizar, iniciar, releer
  };
  root.QGanttDatos = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
