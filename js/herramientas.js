/*
 * herramientas.js — Lo que el formulador intercambia con las demás herramientas de QUEMPIN,
 * además de los costos al Análisis Financiero (ese canal vive en intercambio.js y app.js).
 * Plan de integración del 2026-09-30 (Proyectos Claude/2026-09-30-plan-integracion-herramientas.md):
 *
 *   lee        requerimientos.json        Planilla de Ingreso (N° de requerimiento, presupuesto…); con
 *                                         la biblioteca conectada, la planilla misma (al día)
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
  function olvidar() { cache = {}; buscador = null; planilla = null; }

  // ---- Planilla de Ingreso, leída donde vive ----------------------------------------------------
  /* La planilla está en la raíz de la biblioteca «Formulación de proyectos - Documentos», la misma
     que abre el equipo. Con la biblioteca conectada se lee ahí, al día; si no, se usa la copia que el
     procesador publica cada 2 horas. Mismo formato que publicado/requerimientos.json (requerimientos.py
     de Sistema Intercambio): las columnas se buscan por su encabezado, no por su posición. */
  const PLANILLA = 'Planilla de Ingreso de Requerimientos.xlsx';
  const HOJA = 'Listado Requerimientos';
  const COLUMNAS = {
    n: 'numero', estado: 'estado', canal: 'canal', capt: 'captador', eval: 'evaluador', titulo: 'titulo',
    ubicacion: 'ubicacion', 'id o referencia': 'referencia', apertura: 'apertura', cierre: 'cierre',
    visita: 'visita', visitador: 'visitador', 'presupuesto (iva inc)': 'presupuesto',
    'valor ofertado (iva inc)': 'valorOfertado', 'valor adjudicado (iva inc)': 'valorAdjudicado',
    'entrega (dias)': 'entregaDias', 'plazo oferta (dias)': 'plazoOfertaDias'
  };
  const NUMERICAS = ['presupuesto', 'valorOfertado', 'valorAdjudicado', 'entregaDias', 'plazoOfertaDias'];
  const ERROR_EXCEL = /^#(VALUE|REF|N\/A|NAME|DIV\/0|NUM|NULL|SPILL|CALC)[!?]?$/i;
  let planilla = null;   // { firma, datos (promesa) }: se vuelve a leer solo si el archivo cambió

  const encabezado = (t) => String(t === null || t === undefined ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[°º.]/g, '').replace(/\s+/g, ' ').trim();
  /* Valor de una celda de ExcelJS: el resultado de una fórmula, el texto de un link o texto con formato. */
  function celda(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date || typeof v !== 'object') return v;
    if ('result' in v) return celda(v.result);
    if (v.error) return null;
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return celda(v.text);
    return null;
  }
  const dos = (n) => String(n).padStart(2, '0');
  function valor(v, clave) {
    v = celda(v);
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t || ERROR_EXCEL.test(t)) return null;
      if (!NUMERICAS.includes(clave)) return t;
      const s = t.replace(/\./g, '').replace(/,/g, '.');
      return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : null;
    }
    if (typeof v === 'boolean') return v;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      // ExcelJS entrega las fechas en UTC: así se leen igual que en Excel, sin correrse por la zona horaria
      const f = `${v.getUTCFullYear()}-${dos(v.getUTCMonth() + 1)}-${dos(v.getUTCDate())}`;
      return v.getUTCHours() || v.getUTCMinutes() ? `${f}T${dos(v.getUTCHours())}:${dos(v.getUTCMinutes())}` : f;
    }
    if (typeof v === 'number') return !Number.isFinite(v) ? null : NUMERICAS.includes(clave) ? v : String(v);
    return String(v);
  }
  function numero(v) {
    v = celda(v);
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return v;
    if (typeof v === 'string' && /^\d+$/.test(v.trim()) && parseInt(v, 10) >= 1) return parseInt(v, 10);
    return null;
  }
  /* Partes de la hoja que no hacen falta para leer valores. Sin ellas la planilla real (2 000 filas
     con validaciones, formato condicional y links) se lee en ~0,2 s en vez de ~3 s, y los valores
     quedan como los lee el procesador: el texto de un link y nada repetido en celdas combinadas.
     «Plazo oferta (días)» es una fórmula con HOY() que ExcelJS no entrega: queda vacía (no se usa acá). */
  const SIN_LEER = ['dataValidations', 'conditionalFormatting', 'hyperlinks', 'mergeCells', 'extLst', 'sheetPr', 'dimension',
    'sheetViews', 'sheetFormatPr', 'cols', 'autoFilter', 'rowBreaks', 'pageMargins', 'pageSetup', 'headerFooter',
    'printOptions', 'picture', 'drawing', 'sheetProtection', 'tableParts'];
  async function interpretar(archivo) {
    const ExcelJS = await root.QExcel.ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await archivo.arrayBuffer(), { ignoreNodes: SIN_LEER });
    const ws = wb.getWorksheet(HOJA) || wb.worksheets[0];
    const col = {};
    ws.getRow(1).eachCell((c, i) => {
      const clave = COLUMNAS[encabezado(celda(c.value))];
      if (clave && !col[clave]) col[clave] = i;
    });
    if (!col.numero) throw new Error(`la hoja «${ws.name}» no tiene la columna N°`);
    const lista = [], vistos = new Set(), avisos = [];
    ws.eachRow((row, r) => {
      if (r === 1) return;
      const n = numero(row.getCell(col.numero).value);
      if (n === null) return;
      if (vistos.has(n)) { avisos.push(`El N° ${n} aparece más de una vez en la planilla: se usa la primera fila.`); return; }
      vistos.add(n);
      const reg = { numero: n, estado: null, titulo: null };
      Object.keys(col).forEach((k) => { if (k !== 'numero') reg[k] = valor(row.getCell(col[k]).value, k); });
      lista.push(reg);
    });
    return { fuente: 'Planilla de Ingreso de Requerimientos', actualizado: new Date(archivo.lastModified).toISOString(), requerimientos: lista, avisos, origen: 'planilla' };
  }
  async function leerPlanilla() {
    const bib = X() && X().biblioteca ? await X().biblioteca() : null;
    if (!bib) return null;
    let archivo;
    try { archivo = await (await bib.getFileHandle(PLANILLA)).getFile(); } catch (e) { return null; }
    const firma = `${archivo.lastModified}|${archivo.size}`;
    if (!planilla || planilla.firma !== firma) {
      // También se recuerda si falló: no se reintenta (ni se avisa de nuevo) hasta que el archivo cambie
      planilla = { firma, datos: interpretar(archivo) };
      planilla.datos.catch((e) => console.warn('No se pudo leer la Planilla de Ingreso en la biblioteca; se usa la copia publicada.', e));
    }
    return planilla.datos;
  }
  /* La Planilla de Ingreso como la publica el procesador ({ requerimientos: [...], actualizado… }),
     con origen: 'planilla' (leída en la biblioteca, al día) o 'publicado' (la copia). null si no hay. */
  async function requerimientos(fresca) {
    const d = await leerPlanilla().catch(() => null);
    if (d) return d;
    const pub = await publicacion('requerimientos', fresca);
    return pub ? Object.assign({ origen: 'publicado' }, pub) : null;
  }

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
        : { descripcion: pt.descripcion || pt.code, unidad: pt.unidad || '', cantidad: 1, precioUnitario: Math.max(0, total) })),
      observaciones: [`Valores netos por partida de la formulación ${p.codigo || ''} v${p.version}.`]
    };
    if (datos.plazoEntrega) m.cotizacion.plazoEntrega = String(datos.plazoEntrega);
    if (datos.direccionEntrega) m.cotizacion.direccionEntrega = String(datos.direccionEntrega);
    m.informativo = { precioNeto: cot.neto };
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

  /* Qué sugerir según el estado del proyecto: Enviada → Ofertado; Adjudicada → Adjudicado; Perdida →
     No adjudicado; Descartada → Descartado (estos dos sin valor). Con los perdidos la planilla calcula
     la tasa de adjudicación que usa el Flujo de Caja (requerimientos.py, resumen). */
  function cambiosParaPlanilla(p, valorConIva) {
    // Sin valor (proyecto en otra moneda y sin cotización en pesos) se avisa solo el estado
    const v = valorConIva > 0 ? Math.round(valorConIva) : null;
    if (p.estado === 'Adjudicada') return Object.assign({ estado: 'Adjudicado' }, v ? { valorAdjudicado: v } : {});
    if (p.estado === 'Enviada') return Object.assign({ estado: 'Ofertado' }, v ? { valorOfertado: v } : {});
    if (p.estado === 'Perdida') return { estado: 'No adjudicado' };
    if (p.estado === 'Descartada') return { estado: 'Descartado' };
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
  /* Cuán al día está la carpeta: { nivel: 'ok'|'warn'|'bad', detenido, texto, minutos } o null sin
     estado. La regla vive en js/pulso.js (copia textual de Finanzas QUEMPIN/Sistema Intercambio/pulso.js,
     la misma que usa el tablero del Análisis Financiero): solo las horas hábiles cuentan para decir que
     el procesador está detenido. */
  function lecturaEstado(estado, ahora) {
    return root.QPulso ? root.QPulso.lectura(estado, ahora) : null;
  }

  root.QHerramientas = {
    publicacion, requerimientos, olvidar, paquete, validar, enviar,
    reqDe, tagDe, proyecto,
    mensajeBorrador, mensajeVenta, mensajeRegistro, mensajeSugerencia, cambiosParaPlanilla,
    sensibilidadDesdeSesgo, preciosReferencia, buscarPrecios,
    cotizacionesDe, estadoEnSistema, siguienteFolio, lecturaEstado
  };
})(typeof window !== 'undefined' ? window : globalThis);
