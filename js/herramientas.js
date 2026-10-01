/*
 * herramientas.js — Lo que el formulador intercambia con las demás herramientas de QUEMPIN,
 * además de los costos al Análisis Financiero (ese canal vive en intercambio.js y app.js).
 * Plan de integración del 2026-09-30 (Proyectos Claude/2026-09-30-plan-integracion-herramientas.md):
 *
 *   lee        requerimientos.json        Planilla de Ingreso (N° de requerimiento, presupuesto…)
 *              precios-referencia.json    precios de compra reajustados por UF (Cotizador Histórico)
 *              documentos-comerciales     cotizaciones emitidas en Sistema QUEMPIN
 *              contrapartes / folios      clientes con RUT y último N° de cada tipo de documento
 *              analisis-financiero        (sesgo del presupuesto por categoría, venta cargada)
 *              estado.json                el pulso del procesador del intercambio
 *   envía      borrador-cotizacion        → Sistema QUEMPIN (una persona la revisa y la emite)
 *              venta-proyecto             → Análisis Financiero
 *              registro-documento         → Sistema QUEMPIN (Control de Documentos, tipo 81)
 *              actualizar-requerimiento   → Planilla de Ingreso (sugerencia que una persona pasa)
 *
 * Todo lo que se envía se valida antes con el catálogo de esquemas que el procesador deja en la
 * carpeta (esquemas.json, ver js/esquemas.js). Nada de este archivo pinta: lo usa app.js.
 */
(function (root) {
  'use strict';

  const X = () => root.QIntercambio;
  const ESQUEMA = 'quempin.intercambio/1';
  const HERRAMIENTA = 'formulador';
  const VIGENCIA_MS = 60 * 1000;   // una publicación leída se reutiliza un minuto
  let cache = {};

  // ---- Lectura de lo publicado ----------------------------------------------------------------
  async function publicacion(nombre, fresca) {
    const c = cache[nombre];
    if (!fresca && c && Date.now() - c.t < VIGENCIA_MS) return c.datos;
    let datos = null;
    try { datos = await X().leerPublicacion(nombre); } catch (e) { datos = null; }
    cache[nombre] = { t: Date.now(), datos };
    return datos;
  }
  function olvidar() { cache = {}; buscador = null; }

  async function paquete() {
    const c = cache['__esquemas'];
    if (c && Date.now() - c.t < VIGENCIA_MS) return c.datos;
    let datos = null;
    try { datos = await X().leerRaiz('esquemas.json'); } catch (e) { datos = null; }
    cache['__esquemas'] = { t: Date.now(), datos };
    return datos;
  }
  /* Errores del mensaje contra el catálogo de la carpeta ([] si no hay catálogo todavía). */
  async function validar(m) {
    const pq = await paquete();
    return pq && root.QEsquemas ? root.QEsquemas.validarMensaje(m, pq) : [];
  }
  async function enviar(m) {
    const errores = await validar(m);
    if (errores.length) throw new Error('el envío no tiene el formato acordado (' + errores.slice(0, 3).join('; ') + ')');
    return X().enviar(m);
  }

  // ---- Claves comunes del proyecto -------------------------------------------------------------
  /* N° de requerimiento de la Planilla de Ingreso: la clave común de proyecto entre herramientas. */
  function reqDe(p) {
    const r = p && p.vinculos && p.vinculos.requerimiento;
    const n = r && typeof r === 'object' ? r.numero : r;
    if (n !== undefined && n !== null && /^\d{1,6}$/.test(String(n))) return String(n);
    // En el modo SharePoint el código del proyecto ya es el N° de la planilla de ingreso.
    return p && /^\d{1,6}$/.test(String(p.codigo || '')) ? String(p.codigo) : null;
  }
  const tagDe = (p) => ((p && p.vinculos && p.vinculos.analisisFinanciero) || {}).tag || null;
  function proyecto(p) {
    const o = {};
    const r = reqDe(p), t = tagDe(p);
    if (r) o.req = r;
    if (t) o.tag = t;
    return o;
  }
  const fuente = (p) => ({ uid: p.uid, codigo: p.codigo || '', version: p.version, titulo: p.titulo || '' });

  function sobre(tipo, destino, usuario) {
    return {
      esquema: ESQUEMA, id: X().nuevoId(), tipo, destino,
      origen: { herramienta: HERRAMIENTA, usuario: usuario || '', enviado: X().isoLocal(new Date()) }
    };
  }

  // ---- Mensajes --------------------------------------------------------------------------------
  /* Cotización prellenada para Sistema QUEMPIN, desde los valores por partida del paso 4.
     cot: la de app.js cotizacion() ({ lineas: [{ pt, pu, total }], neto }).
     datos: { pais, moneda, referencia, cliente: { razon_social, rut… }, plazoEntrega, direccionEntrega } */
  function mensajeBorrador(p, cot, datos, usuario) {
    const m = sobre('borrador-cotizacion', 'sistema-quempin', usuario);
    m.proyecto = proyecto(p);
    m.fuente = Object.assign(fuente(p), { estado: p.estado || '' });
    const cliente = { razon_social: String(datos.cliente.razon_social || '').trim() };
    ['rut', 'contacto', 'correo', 'telefono', 'direccion', 'ciudad'].forEach((k) => {
      const v = String(datos.cliente[k] || '').trim();
      if (v) cliente[k] = v;
    });
    m.cotizacion = {
      pais: datos.pais, moneda: datos.moneda || 'CLP', referencia: String(datos.referencia || '').trim(),
      cliente,
      items: cot.lineas.map(({ pt, pu, total }) => (pu !== null && pt.cantidad > 0
        ? { descripcion: pt.descripcion || pt.code, unidad: pt.unidad || '', cantidad: pt.cantidad, precioUnitario: pu }
        : { descripcion: pt.descripcion || pt.code, unidad: pt.unidad || '', cantidad: 1, precioUnitario: Math.max(0, Math.round(total)) })),
      observaciones: [`Valores netos por partida de la formulación ${p.codigo || ''} v${p.version}.`]
    };
    if (datos.plazoEntrega) m.cotizacion.plazoEntrega = String(datos.plazoEntrega);
    if (datos.direccionEntrega) m.cotizacion.direccionEntrega = String(datos.direccionEntrega);
    m.informativo = { precioNeto: Math.round(cot.neto) };
    return m;
  }

  /* Monto de venta sin IVA para el Análisis Financiero. desde: { herramienta: 'sistema-quempin',
     folio, pais, fecha } si sale de una cotización emitida, o { herramienta: 'formulador' }.
     visto: lo que mostró la lista del Análisis Financiero (null = vacío; undefined = sin If-Match). */
  function mensajeVenta(p, monto, desde, tag, visto, usuario) {
    const m = sobre('venta-proyecto', 'analisis-financiero', usuario);
    m.proyecto = Object.assign({ tag }, reqDe(p) ? { req: reqDe(p) } : {});
    m.venta = { montoSinIva: Math.round(monto), moneda: 'CLP' };
    m.fuente = Object.assign(fuente(p), desde);
    if (visto !== undefined) m.reemplaza = { montoSinIva: visto };
    return m;
  }

  /* Registro de la evaluación de costos (tipo 81) en el Control de Documentos. */
  function mensajeRegistro(p, doc, usuario) {
    const m = sobre('registro-documento', 'sistema-quempin', usuario);
    m.documento = {
      tipo: '81', pais: doc.pais, folio: String(doc.folio), fecha: doc.fecha, autor: String(doc.autor || '').trim().toUpperCase(),
      referencia: String(doc.referencia || '').trim(), nombreArchivo: String(doc.nombreArchivo || '').trim()
    };
    m.proyecto = proyecto(p);
    m.fuente = fuente(p);
    return m;
  }

  /* Sugerencia para la Planilla de Ingreso: estado y valor ofertado o adjudicado (con IVA). */
  function mensajeSugerencia(p, numero, cambios, reemplaza, usuario) {
    const m = sobre('actualizar-requerimiento', 'planilla-requerimientos', usuario);
    m.requerimiento = { numero: Number(numero) };
    m.cambios = cambios;
    if (reemplaza) m.reemplaza = reemplaza;
    m.fuente = { herramienta: HERRAMIENTA, uid: p.uid, codigo: p.codigo || '' };
    return m;
  }

  /* Qué sugerir según el estado del proyecto: Enviada → Ofertado; Adjudicada → Adjudicado. */
  function cambiosParaPlanilla(p, valorConIva) {
    if (p.estado === 'Adjudicada') return { estado: 'Adjudicado', valorAdjudicado: Math.round(valorConIva) };
    if (p.estado === 'Enviada') return { estado: 'Ofertado', valorOfertado: Math.round(valorConIva) };
    return null;
  }

  // ---- Sesgo del presupuesto (Análisis Financiero) ---------------------------------------------
  const SESGO_A_SENS = { Materiales: 'mat', Equipos: 'eq', 'Mano de Obra': 'mo', Otros: 'otros' };
  /* {mat, eq, mo, otros} en % (1 decimal) desde el sesgo publicado; null si no hay base. */
  function sensibilidadDesdeSesgo(sesgo) {
    if (!sesgo || !(sesgo.proyectosTerminados > 0) || !sesgo.porCategoria) return null;
    const o = {};
    let alguno = false;
    Object.keys(SESGO_A_SENS).forEach((cat) => {
      const v = sesgo.porCategoria[cat];
      o[SESGO_A_SENS[cat]] = typeof v === 'number' && isFinite(v) ? Math.round(v * 1000) / 10 : 0;
      if (typeof v === 'number') alguno = true;
    });
    return alguno ? o : null;
  }

  // ---- Precios de referencia (Cotizador Histórico) ---------------------------------------------
  let buscador = null, buscadorDe = null;
  async function preciosReferencia(fresca) { return publicacion('precios-referencia', fresca); }
  /* Las hojas más parecidas a 'texto' (busqueda.js, el mismo motor del tablero del Cotizador). */
  async function buscarPrecios(texto, n) {
    const datos = await preciosReferencia();
    if (!datos || !Array.isArray(datos.hojas) || !root.CHBusqueda || !String(texto || '').trim()) return { datos, resultados: [] };
    if (buscadorDe !== datos) { buscador = root.CHBusqueda.crear(datos.hojas, datos.busqueda || {}); buscadorDe = datos; }
    const r = buscador.buscar(String(texto));
    return { datos, resultados: (r.resultados || []).slice(0, n || 8).map((x) => x.item), sugerencias: r.sugerencias || [] };
  }

  // ---- Documentos de Sistema QUEMPIN --------------------------------------------------------------
  /* Cotizaciones emitidas que salieron de este proyecto o comparten su N° de requerimiento. */
  function cotizacionesDe(p, datos) {
    const docs = (datos && datos.documentos) || [];
    const req = reqDe(p);
    return docs.filter((d) => d.tipo === '60' && (((d.origen || {}).uid && d.origen.uid === p.uid) || (req && (d.proyecto || {}).req === req)))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.folio).localeCompare(String(a.folio)));
  }
  /* Estado de un mensaje enviado a Sistema QUEMPIN (la publicación trae los atendidos y los en espera). */
  function estadoEnSistema(datos, id) {
    return (datos && datos.mensajes && datos.mensajes[id]) || null;
  }
  /* El N° que corresponde para un tipo de documento y país, según el Control de Documentos. */
  function siguienteFolio(datos, tipo, pais) {
    const t = datos && datos.tipos && datos.tipos[tipo];
    const p = t && t.paises && t.paises[pais];
    return p ? { siguiente: p.siguiente, ultimo: p.ultimo, fecha: p.fecha, autor: p.autor } : null;
  }

  // ---- Pulso del procesador ----------------------------------------------------------------------
  /* Cuán al día está la carpeta: { nivel: 'ok'|'warn'|'bad', texto, minutos } o null sin estado. */
  function lecturaEstado(estado, ahora) {
    const ultima = estado && estado.procesador && estado.procesador.ultimaCorrida;
    const t = ultima ? new Date(ultima) : null;
    if (!t || isNaN(t)) return null;
    const min = Math.max(0, Math.round(((ahora || new Date()) - t) / 60000));
    const hace = min < 1 ? 'hace menos de un minuto' : min < 60 ? `hace ${min} min` : min < 48 * 60 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`;
    const fallas = Object.keys(estado.procesador.pasos || {}).filter((k) => estado.procesador.pasos[k] && estado.procesador.pasos[k].ok === false);
    const nivel = fallas.length ? 'warn' : min <= 60 ? 'ok' : min <= 24 * 60 ? 'warn' : 'bad';
    const texto = `Las demás herramientas revisaron la carpeta ${hace}` + (fallas.length ? ` (con problemas en: ${fallas.join(', ')})` : '') + '.';
    return { nivel, texto, minutos: min };
  }

  root.QHerramientas = {
    publicacion, olvidar, paquete, validar, enviar,
    reqDe, tagDe, proyecto,
    mensajeBorrador, mensajeVenta, mensajeRegistro, mensajeSugerencia, cambiosParaPlanilla,
    sensibilidadDesdeSesgo, preciosReferencia, buscarPrecios,
    cotizacionesDe, estadoEnSistema, siguienteFolio, lecturaEstado
  };
})(typeof window !== 'undefined' ? window : globalThis);
