/*
 * store.js — Modelo de datos y persistencia local (localStorage del navegador).
 * Los proyectos viven en el navegador de cada usuario; para compartir o respaldar
 * se exportan a Excel (.xlsx) o JSON y se vuelven a importar.
 */
(function (root) {
  'use strict';

  const SCHEMA = 'quempin-formulacion/v1';
  const LS_PROYECTOS = 'qpn.formulacion.proyectos.v1';
  const LS_CONFIG = 'qpn.formulacion.config.v1';

  const ESTADOS = ['Borrador', 'En revisión', 'Enviada', 'Adjudicada', 'Perdida', 'Descartada'];
  const UNIDADES = ['Un.', 'kg', 'm', 'm2', 'm3', 'gl', 'km', 'día', 'hr', 'lt', 'noche'];

  const DEFAULT_PARAMETROS = {
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

  // ---- Config ---------------------------------------------------------------
  function getConfig() {
    const c = lsGet(LS_CONFIG, null) || {};
    return {
      prefijo: c.prefijo || DEFAULT_CONFIG.prefijo,
      responsable: c.responsable || '',
      parametros: Object.assign(clone(DEFAULT_PARAMETROS), c.parametros || {}),
      catalogoOtros: Array.isArray(c.catalogoOtros) ? c.catalogoOtros : clone(DEFAULT_CATALOGO)
    };
  }
  function setConfig(c) { return lsSet(LS_CONFIG, c); }

  // ---- Proyectos ------------------------------------------------------------
  let cache = null;
  function all() {
    if (!cache) {
      const data = lsGet(LS_PROYECTOS, { proyectos: [] });
      cache = (data.proyectos || []).map(normalize);
    }
    return cache;
  }
  function persist() { return lsSet(LS_PROYECTOS, { schema: SCHEMA, proyectos: cache || [] }); }
  function get(id) { return all().find((p) => p.uid === id) || null; }
  function upsert(p) {
    p.modificado = new Date().toISOString();
    const list = all();
    const i = list.findIndex((x) => x.uid === p.uid);
    if (i >= 0) list[i] = p; else list.unshift(p);
    return persist();
  }
  function remove(id) {
    cache = all().filter((p) => p.uid !== id);
    return persist();
  }

  function nextCodigo(prefijo, anio) {
    const re = new RegExp('^' + prefijo.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '-' + anio + '-(\\d+)$');
    let max = 0;
    all().forEach((p) => {
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
    all, get, upsert, remove, nextCodigo, normalize, cloneProject,
    newProject, newPartida, newMaterial, newEquipo, newManoObra, newOtro, exampleProject,
    _resetCache: () => { cache = null; }
  };
  root.QStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
