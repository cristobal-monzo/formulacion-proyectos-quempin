/*
 * store.js — Modelo de datos y persistencia.
 * Dos modos:
 *  - 'local': los proyectos viven en el navegador (localStorage). Es el modo por defecto
 *    y el que se usa si la nube no está configurada o se abre index.html sin servidor.
 *  - 'nube': los proyectos viven en SharePoint (ver js/cloud.js). La memoria de esta
 *    página es la copia de trabajo; cloud.js la llena con lo que llega de SharePoint
 *    (applyRemote) y recibe cada cambio local a través del "backend".
 * La interfaz es síncrona en ambos modos: upsert() actualiza la copia en memoria de
 * inmediato y la nube se sincroniza en segundo plano.
 * Eliminar un proyecto lo manda a la papelera (eliminado: true); se puede restaurar.
 * En modo local también se puede eliminar definitivamente; en SharePoint el archivo queda.
 */
(function (root) {
  'use strict';

  const SCHEMA = 'quempin-formulacion/v1';
  const LS_PROYECTOS = 'qpn.formulacion.proyectos.v1';
  const LS_CONFIG = 'qpn.formulacion.config.v1';

  const ESTADOS = ['Borrador', 'En revisión', 'Enviada', 'Adjudicada', 'Perdida', 'Descartada'];
  const UNIDADES = ['Un.', 'kg', 'm', 'm2', 'm3', 'gl', 'km', 'día', 'hr', 'lt', 'noche'];

  const DEFAULT_PARAMETROS = {
    moneda: 'CLP',
    iva: 19,
    gastosGenerales: 0,
    imprevistos: 0,
    tarifaN1: 45000,
    tarifaN2: 60000,
    tarifaN3: 75000,
    margenObjetivo: 30,
    margenMinimo: 20,
    metaUtilidadDH: 0,
    umbralAjustado: 95,
    presupuestoMaximo: null,
    presupuestoIncluyeIva: false,
    sensibilidad: { mat: 0, eq: 0, mo: 10, otros: 0 }
  };

  const DEFAULT_CATALOGO = [
    { descripcion: 'Desgaste de vehículo por km', unidad: 'km', costoUnitario: 50 },
    { descripcion: 'Viático por persona diario', unidad: 'día', costoUnitario: 10000 },
    { descripcion: 'Hospedaje por noche', unidad: 'noche', costoUnitario: 25000 },
    { descripcion: 'Almuerzo por persona diario', unidad: 'día', costoUnitario: 10000 }
  ];

  const DEFAULT_CONFIG = {
    prefijo: 'QPN',
    responsable: '',
    parametros: DEFAULT_PARAMETROS,
    catalogoOtros: DEFAULT_CATALOGO
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () =>
    (root.crypto && root.crypto.randomUUID)
      ? root.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  const hoy = () => {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };

  // ---- Almacenamiento seguro ------------------------------------------------
  function lsGet(key, fallback) {
    try {
      const raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { root.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  // ---- Modo, usuario y avisos -------------------------------------------------
  let mode = 'local';
  let backend = null;   // { saveProject(p), deleteProject(id), saveConfig(shared) } en modo nube
  let usuario = null;   // { email, nombre, rol } en modo nube
  const listeners = [];
  /* Eventos: {type:'remote', ids, autores, origen} al llegar cambios de otros usuarios, de la
     carpeta compartida (origen 'carpeta') o de otra pestaña (origen 'ventana'); con
     conflicto: true y local: proyecto sin subir, si chocan con cambios de esta página,
     {type:'local', ids} al guardar en este navegador (modo local; lo usa js/compartida.js),
     {type:'reset'} al cambiar de modo, {type:'config'} al cambiar la configuración compartida,
     {type:'sync', pendientes} al cambiar el estado de sincronización,
     {type:'error', mensaje} si la nube rechaza un cambio. */
  function on(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
  function emit(ev) { listeners.slice().forEach((fn) => { try { fn(ev); } catch (e) { console.error(e); } }); }

  // ---- Config ---------------------------------------------------------------
  /* En modo nube, prefijo, parámetros y catálogo son de la empresa (un documento compartido);
     el responsable por defecto es personal y queda en el navegador. */
  let sharedConfig = null;
  function getConfig() {
    const local = lsGet(LS_CONFIG, null) || {};
    const c = mode === 'nube' ? (sharedConfig || {}) : local;
    return {
      prefijo: c.prefijo || DEFAULT_CONFIG.prefijo,
      responsable: local.responsable || (usuario && usuario.nombre) || '',
      parametros: Object.assign(clone(DEFAULT_PARAMETROS), c.parametros || {}),
      catalogoOtros: Array.isArray(c.catalogoOtros) ? c.catalogoOtros : clone(DEFAULT_CATALOGO)
    };
  }
  function setConfig(c) {
    if (mode !== 'nube') return lsSet(LS_CONFIG, c);
    const local = lsGet(LS_CONFIG, null) || {};
    local.responsable = c.responsable || '';
    lsSet(LS_CONFIG, local);
    const shared = { prefijo: c.prefijo || DEFAULT_CONFIG.prefijo };
    if (c.parametros) shared.parametros = c.parametros;
    if (c.catalogoOtros) shared.catalogoOtros = c.catalogoOtros;
    const prev = sharedConfig || {};
    const cambia = ['prefijo', 'parametros', 'catalogoOtros'].some((k) => JSON.stringify(shared[k]) !== JSON.stringify(prev[k]));
    if (cambia) backend.saveConfig(shared);
    return true;
  }
  function setSharedConfig(c) { sharedConfig = c || {}; emit({ type: 'config' }); }

  // ---- Proyectos ------------------------------------------------------------
  // cache: todos los proyectos, incluidos los de la papelera.
  let cache = null;
  function full() {
    if (!cache) {
      if (mode === 'nube') cache = [];
      else {
        const data = lsGet(LS_PROYECTOS, { proyectos: [] });
        cache = (data.proyectos || []).map(normalize);
      }
    }
    return cache;
  }
  function all() { return full().filter((p) => !p.eliminado); }
  function trash() { return full().filter((p) => p.eliminado); }
  function persist() {
    if (mode === 'nube') return true;
    return lsSet(LS_PROYECTOS, { schema: SCHEMA, proyectos: cache || [] });
  }
  function get(id) { return full().find((p) => p.uid === id) || null; }
  function firma() { return usuario ? usuario.email : ''; }
  /* Fecha de modificación siempre posterior a la anterior del mismo proyecto: identifica cada
     versión (la carpeta compartida y SharePoint comparan por ella), aunque se guarde dos veces
     en el mismo milisegundo. */
  function marca(anterior) {
    let t = Date.now();
    const a = Date.parse(anterior || '');
    if (Number.isFinite(a) && t <= a) t = a + 1;
    return new Date(t).toISOString();
  }
  function upsert(p) {
    p.modificado = marca(p.modificado);
    if (usuario) {
      p.modificadoPor = firma();
      if (!p.creadoPor) p.creadoPor = firma();
    }
    const list = full();
    const i = list.findIndex((x) => x.uid === p.uid);
    if (i >= 0) list[i] = p; else list.unshift(p);
    if (mode === 'nube') { backend.saveProject(p); return true; }
    const ok = persist();
    emit({ type: 'local', ids: [p.uid] });
    return ok;
  }
  /* Enviar a la papelera. */
  function remove(id) {
    const p = get(id);
    if (!p) return true;
    p.eliminado = true;
    p.eliminadoEn = new Date().toISOString();
    p.eliminadoPor = firma();
    return upsert(p);
  }
  function restore(id) {
    const p = get(id);
    if (!p) return true;
    delete p.eliminado; delete p.eliminadoEn; delete p.eliminadoPor;
    return upsert(p);
  }
  /* Eliminar definitivamente (solo en modo local). */
  function purge(id) {
    cache = full().filter((p) => p.uid !== id);
    if (mode === 'nube') { backend.deleteProject(id); return true; }
    const ok = persist();
    emit({ type: 'local', ids: [id] });
    return ok;
  }

  // ---- Nube -------------------------------------------------------------------
  function useCloud(b, u) {
    mode = 'nube'; backend = b; usuario = u; cache = []; sharedConfig = null;
    emit({ type: 'reset' });
  }
  function useLocal() {
    mode = 'local'; backend = null; usuario = null; cache = null; sharedConfig = null;
    emit({ type: 'reset' });
  }
  /* Cambios que llegan del servidor o de la carpeta compartida. borrados: uids cuyo archivo ya
     no existe. opts.conflicto: la versión llegó mientras había cambios sin subir (opts.local).
     opts.autores / opts.origen: quién y de dónde, para los avisos. En modo local se guardan
     en este navegador. */
  function applyRemote(proyectos, borrados, opts) {
    const list = full();
    const ids = [], autores = new Set((opts && opts.autores) || []);
    (proyectos || []).forEach((raw) => {
      const p = normalize(raw);
      const i = list.findIndex((x) => x.uid === p.uid);
      if (i >= 0) list[i] = p; else list.push(p);
      ids.push(p.uid);
      if (p.modificadoPor && p.modificadoPor !== firma()) autores.add(p.modificadoPor);
    });
    if (borrados && borrados.length) {
      cache = list.filter((p) => !borrados.includes(p.uid));
      ids.push(...borrados);
    }
    if (ids.length) {
      if (mode === 'local') persist();
      emit({
        type: 'remote', ids, autores: Array.from(autores), inicial: !!(opts && opts.inicial),
        conflicto: !!(opts && opts.conflicto), local: (opts && opts.local) || null,
        origen: (opts && opts.origen) || ''
      });
    }
  }

  /* Otra pestaña de este navegador guardó proyectos (modo local): tomar su versión, para no
     sobrescribirla con la copia vieja de esta página. Los que no cambiaron conservan su objeto. */
  if (root.addEventListener) {
    root.addEventListener('storage', (e) => {
      if (mode !== 'local' || !cache || e.key !== LS_PROYECTOS) return;
      let data;
      try { data = JSON.parse(e.newValue || 'null'); } catch (err) { return; }
      const antes = new Map(cache.map((p) => [p.uid, p]));
      const ids = [];
      cache = ((data && data.proyectos) || []).map((raw) => {
        const a = antes.get(raw.uid);
        if (a && a.modificado === raw.modificado) { antes.delete(raw.uid); return a; }
        antes.delete(raw.uid);
        ids.push(raw.uid);
        return normalize(raw);
      });
      ids.push(...antes.keys());
      if (ids.length) emit({ type: 'remote', ids, autores: [], origen: 'ventana' });
    });
  }
  /* Proyectos guardados en este navegador en modo local (para subirlos a la nube).
     No se borran al subirlos: quedan como respaldo y se ofrecen solo los que falten en la nube. */
  function localProjects() {
    const data = lsGet(LS_PROYECTOS, { proyectos: [] });
    return (data.proyectos || []).map(normalize);
  }
  const getMode = () => mode;
  const getUser = () => usuario;

  function nextCodigo(prefijo, anio) {
    const re = new RegExp('^' + prefijo.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '-' + anio + '-(\\d+)$');
    let max = 0;
    full().forEach((p) => {
      const m = re.exec(p.codigo || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `${prefijo}-${anio}-${String(max + 1).padStart(3, '0')}`;
  }

  function newProject(overrides) {
    const cfg = getConfig();
    const p = {
      schema: SCHEMA,
      uid: uid(),
      codigo: nextCodigo(cfg.prefijo, new Date().getFullYear()),
      version: 1,
      titulo: '',
      cliente: '',
      ubicacion: '',
      responsable: cfg.responsable,
      fecha: hoy(),
      estado: 'Borrador',
      descripcion: '',
      parametros: clone(cfg.parametros),
      catalogoOtros: clone(cfg.catalogoOtros),
      partidas: [],
      materiales: [],
      equipos: [],
      manoObra: [],
      otros: [],
      creado: new Date().toISOString(),
      modificado: new Date().toISOString()
    };
    return Object.assign(p, overrides || {});
  }

  const newPartida = () => ({ uid: uid(), descripcion: '', unidad: 'Un.', cantidad: 1, utilidadTipo: 'pct', utilidadValor: 0 });
  const newMaterial = (partida) => ({ uid: uid(), descripcion: '', partida: partida || '', unidad: 'Un.', cantidad: 1, costoUnitario: 0 });
  const newEquipo = (partida) => ({ uid: uid(), descripcion: '', partida: partida || '', unidad: 'día', cantidad: 1, costoUnitario: 0 });
  const newManoObra = (partida) => ({ uid: uid(), descripcion: '', partida: partida || '', n1p: 0, n1d: 0, n2p: 0, n2d: 0, n3p: 0, n3d: 0 });
  const newOtro = (partida) => ({ uid: uid(), descripcion: '', partida: partida || '', unidad: 'Un.', cantidad: 1, costoUnitario: 0 });

  /* Completa campos faltantes (proyectos importados o de versiones anteriores). */
  function normalize(p) {
    const base = newProjectShape();
    const out = Object.assign(base, p || {});
    out.schema = SCHEMA;
    out.uid = out.uid || uid();
    out.version = parseInt(out.version, 10) || 1;
    out.parametros = Object.assign(clone(DEFAULT_PARAMETROS), (p && p.parametros) || {});
    out.parametros.sensibilidad = Object.assign({ mat: 0, eq: 0, mo: 10, otros: 0 }, out.parametros.sensibilidad || {});
    out.catalogoOtros = Array.isArray(out.catalogoOtros) ? out.catalogoOtros : clone(DEFAULT_CATALOGO);
    ['partidas', 'materiales', 'equipos', 'manoObra', 'otros'].forEach((k) => {
      out[k] = Array.isArray(out[k]) ? out[k].map((it) => Object.assign({}, it, { uid: it.uid || uid() })) : [];
    });
    return out;
  }
  function newProjectShape() {
    return {
      schema: SCHEMA, uid: '', codigo: '', version: 1, titulo: '', cliente: '', ubicacion: '',
      responsable: '', fecha: hoy(), estado: 'Borrador', descripcion: '',
      parametros: clone(DEFAULT_PARAMETROS), catalogoOtros: clone(DEFAULT_CATALOGO),
      partidas: [], materiales: [], equipos: [], manoObra: [], otros: [],
      creado: new Date().toISOString(), modificado: new Date().toISOString()
    };
  }

  /* Copia con nuevos identificadores internos (para duplicar o crear versión). */
  function cloneProject(p, overrides) {
    const c = normalize(clone(p));
    c.uid = uid();
    const map = {};
    c.partidas.forEach((pt) => { const n = uid(); map[pt.uid] = n; pt.uid = n; });
    ['materiales', 'equipos', 'manoObra', 'otros'].forEach((k) => {
      c[k].forEach((it) => { it.uid = uid(); it.partida = map[it.partida] || ''; });
    });
    c.creado = new Date().toISOString();
    ['creadoPor', 'modificadoPor', 'eliminado', 'eliminadoEn', 'eliminadoPor'].forEach((k) => { delete c[k]; });
    return Object.assign(c, overrides || {});
  }

  /* Proyecto de ejemplo: mismos datos que el Excel original. */
  function exampleProject() {
    const p = newProject({
      codigo: 'QPN-EJEMPLO',
      titulo: 'Instalación de medidores de gas natural (ejemplo del Excel)',
      cliente: 'Cliente de ejemplo',
      ubicacion: 'Santiago',
      descripcion: 'Proyecto de ejemplo con los mismos datos del Excel original, para verificar que los resultados coinciden.'
    });
    p.parametros = Object.assign(clone(DEFAULT_PARAMETROS), { gastosGenerales: 0, imprevistos: 0 });
    p.catalogoOtros = clone(DEFAULT_CATALOGO);
    const P1 = uid(), P2 = uid(), P3 = uid();
    p.partidas = [
      { uid: P1, descripcion: "Instalación Medidores GN de 2''", unidad: 'Un.', cantidad: 3, utilidadTipo: 'pct', utilidadValor: 100 },
      { uid: P2, descripcion: "Instalación Medidores GN de 1''", unidad: 'Un.', cantidad: 1, utilidadTipo: 'pct', utilidadValor: 100 },
      { uid: P3, descripcion: "Instalación Medidores GN de 1 1/2''", unidad: 'Un.', cantidad: 2, utilidadTipo: 'pct', utilidadValor: 100 }
    ];
    p.materiales = [
      { uid: uid(), descripcion: "Flanges de 2''", partida: P1, unidad: 'Un.', cantidad: 2, costoUnitario: 14580 },
      { uid: uid(), descripcion: "Flanges de 1 1/2''", partida: P3, unidad: 'Un.', cantidad: 2, costoUnitario: 6131 },
      { uid: uid(), descripcion: "Flanges de 1''", partida: P2, unidad: 'Un.', cantidad: 2, costoUnitario: 7200 }
    ];
    p.equipos = [];
    p.manoObra = [
      { uid: uid(), descripcion: "Instalación Medidores GN de 2''", partida: P1, n1p: 0, n1d: 0, n2p: 0, n2d: 0, n3p: 2, n3d: 2 },
      { uid: uid(), descripcion: "Instalación Medidores GN de 1''", partida: P2, n1p: 0, n1d: 0, n2p: 0, n2d: 0, n3p: 2, n3d: 2 },
      { uid: uid(), descripcion: "Instalación Medidores GN de 1 1/2''", partida: P3, n1p: 0, n1d: 0, n2p: 0, n2d: 0, n3p: 2, n3d: 2 }
    ];
    p.otros = [
      { uid: uid(), descripcion: 'Almuerzo por persona diario', partida: P1, unidad: 'día', cantidad: 2, costoUnitario: 10000 },
      { uid: uid(), descripcion: 'Almuerzo por persona diario', partida: P2, unidad: 'día', cantidad: 2, costoUnitario: 10000 },
      { uid: uid(), descripcion: 'Almuerzo por persona diario', partida: P3, unidad: 'día', cantidad: 2, costoUnitario: 10000 },
      { uid: uid(), descripcion: 'Desgaste de vehículo Citroen por km', partida: '', unidad: 'km', cantidad: 0, costoUnitario: 0 }
    ];
    return p;
  }

  const api = {
    SCHEMA, ESTADOS, UNIDADES, DEFAULT_PARAMETROS, DEFAULT_CATALOGO,
    uid, hoy, clone, getConfig, setConfig,
    all, trash, get, upsert, remove, restore, purge, nextCodigo, normalize, cloneProject,
    newProject, newPartida, newMaterial, newEquipo, newManoObra, newOtro, exampleProject,
    on, emit, getMode, getUser, useCloud, useLocal, applyRemote, setSharedConfig, localProjects,
    _resetCache: () => { cache = null; }
  };
  root.QStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
