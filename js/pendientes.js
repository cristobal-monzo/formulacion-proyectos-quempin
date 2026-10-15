/*
 * pendientes.js — Lo que espera a una persona del equipo, leído de la carpeta de intercambio y de
 * la Planilla de Ingreso, para la sección «Pendientes del equipo» de la lista de proyectos
 * (pedido del usuario, 2026-10-14: mejorar la interacción de datos entre las herramientas).
 *
 *   Por ofertar        requerimientos «En evaluación» de la Planilla, por fecha de cierre, con su
 *                      proyecto del Formulador si ya existe
 *   Pasar a la Planilla  sugerencias «actualizar-requerimiento» que esperan en el buzón (del
 *                      Formulador y del monitor de Mercado Público). Nadie escribe la Planilla por
 *                      programa (requerimientos.py explica por qué): una persona copia el valor y el
 *                      procesador cierra la sugerencia cuando la Planilla ya lo muestra
 *   En Sistema QUEMPIN borradores de cotización que esperan que alguien los emita
 *
 * Hasta hoy esto solo lo veía Claude (bandeja.py, /Sugerencias_Requerimientos): el 14-10 había 23
 * sugerencias esperando desde el 05-10. Solo calcula: no lee la carpeta ni pinta (lo hace app.js).
 * La comparación con la Planilla es la de requerimientos.py (decidir_sugerencia, _igual).
 */
(function (root) {
  'use strict';

  const norm = (s) => String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[°º.]/g, '').replace(/\s+/g, ' ').trim();
  const dos = (n) => String(n).padStart(2, '0');

  /* Columnas de la Planilla que una sugerencia puede cambiar, con su título en la Planilla. */
  const CAMPOS = {
    estado: 'Estado',
    valorOfertado: 'Valor ofertado (IVA inc)',
    valorAdjudicado: 'Valor adjudicado (IVA inc)'
  };
  const ORDEN_CAMPOS = ['estado', 'valorOfertado', 'valorAdjudicado'];

  /* ¿Muestra la Planilla lo mismo? Igual que _igual de requerimientos.py: montos a medio peso,
     textos sin tildes ni mayúsculas, y vacío con vacío. */
  function igual(a, b) {
    const esNum = (x) => typeof x === 'number' && Number.isFinite(x);
    if (esNum(a) && esNum(b)) return Math.abs(a - b) < 0.5;
    if (typeof a === 'string' && typeof b === 'string') return norm(a) === norm(b);
    return (a === null || a === undefined || a === '') && (b === null || b === undefined || b === '');
  }

  // ---- Fechas de cierre ------------------------------------------------------------------------
  /* La fecha de cierre como la publica la Planilla: «2026-10-15», «2026-10-15T17:00» o, si alguien la
     escribió como texto, «15-10-2026» / «15/10/2026». → { fecha: 'AAAA-MM-DD', hora: 'HH:MM' | '' } */
  function fechaDe(txt) {
    const s = String(txt === null || txt === undefined ? '' : txt).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
    if (m) return valida(+m[1], +m[2], +m[3], m[4] ? `${m[4]}:${m[5]}` : '');
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
    if (m) return valida(+m[3], +m[2], +m[1], m[4] ? `${dos(m[4])}:${m[5]}` : '');
    return null;
  }
  function valida(a, mes, d, hora) {
    const f = new Date(a, mes - 1, d);
    if (f.getFullYear() !== a || f.getMonth() !== mes - 1 || f.getDate() !== d) return null;
    return { fecha: `${a}-${dos(mes)}-${dos(d)}`, hora: hora === '00:00' ? '' : hora };
  }
  const local = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
  const hoyISO = (hoy) => { const d = hoy || new Date(); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };
  /* Días de calendario de hoy al cierre (0 = hoy, 1 = mañana, negativo = ya cerró). null sin fecha. */
  function diasHasta(cierre, hoy) {
    const f = fechaDe(cierre);
    if (!f) return null;
    return Math.round((local(f.fecha) - local(hoyISO(hoy))) / 86400000);
  }
  function textoPlazo(dias) {
    if (dias === null || dias === undefined) return '';
    if (dias === 0) return 'Cierra hoy';
    if (dias === 1) return 'Cierra mañana';
    if (dias > 1) return `Cierra en ${dias} días`;
    if (dias === -1) return 'Cerró ayer';
    return `Cerró hace ${-dias} días`;
  }
  /* Color del aviso: hasta 2 días, rojo; hasta 5, ámbar; después, neutro. Ya cerrado: neutro. */
  function nivelPlazo(dias) {
    if (dias === null || dias === undefined || dias < 0) return 'na';
    return dias <= 2 ? 'bad' : dias <= 5 ? 'warn' : 'info';
  }
  /* «15-10-2026 17:00» */
  function fechaCierre(cierre) {
    const f = fechaDe(cierre);
    if (!f) return '';
    const [a, m, d] = f.fecha.split('-');
    return `${d}-${m}-${a}${f.hora ? ` ${f.hora}` : ''}`;
  }

  // ---- Por ofertar -------------------------------------------------------------------------------
  /* Estados de la Planilla en que la oferta todavía se prepara. Una fila sin estado cuenta solo si
     su cierre no pasó (una fila vieja a medio llenar no es trabajo pendiente). */
  const EN_EVALUACION = new Set(['evaluacion', 'en evaluacion']);
  /* reqs: filas de la Planilla. proyectosDe(numero) → proyectos del Formulador con ese N°. */
  function porOfertar(reqs, proyectosDe, hoy) {
    const out = [];
    (reqs || []).forEach((r) => {
      if (!r || !r.numero) return;
      const e = norm(r.estado);
      const dias = diasHasta(r.cierre, hoy);
      if (!(EN_EVALUACION.has(e) || (!e && dias !== null && dias >= 0))) return;
      out.push({
        numero: r.numero, titulo: r.titulo || '', ubicacion: r.ubicacion || '', referencia: r.referencia || '',
        cierre: r.cierre || '', dias, nivel: nivelPlazo(dias), plazo: textoPlazo(dias), fechaCierre: fechaCierre(r.cierre),
        proyectos: proyectosDe ? proyectosDe(String(r.numero)) : []
      });
    });
    // Lo que cierra primero arriba; lo ya cerrado y lo sin fecha, al final (del N° más nuevo al más viejo)
    const clave = (x) => (x.dias === null ? 1e6 : x.dias < 0 ? 1e5 - x.dias : x.dias);
    return out.sort((a, b) => clave(a) - clave(b) || b.numero - a.numero);
  }

  // ---- Sugerencias para la Planilla ----------------------------------------------------------------
  const enviado = (m) => String((m && m.origen && m.origen.enviado) || '');
  /* Agrupa las sugerencias por N° y, para cada columna, se queda con la más nueva (una oferta que se
     marcó «Ofertado» y después «Adjudicado» deja un solo estado por escribir). Compara con la fila de
     la Planilla: lo que ya muestra no se pide.
     → [{ numero, titulo, enPlanilla, estadoPlanilla, campos: [{ campo, titulo, valor, actual, fuente }],
          alDia, mensajes, ultimo }]   (campos = lo que falta escribir) */
  function sugerencias(mensajes, reqPorNumero) {
    const grupos = new Map();
    (mensajes || []).forEach((m) => {
      const n = m && m.requerimiento && Number(m.requerimiento.numero);
      if (!n || !m.cambios || typeof m.cambios !== 'object') return;
      if (!grupos.has(n)) grupos.set(n, []);
      grupos.get(n).push(m);
    });
    const out = [];
    grupos.forEach((ms, numero) => {
      ms.sort((a, b) => enviado(a).localeCompare(enviado(b)));
      const ultimo = {};
      ms.forEach((m) => Object.keys(m.cambios).forEach((k) => { if (CAMPOS[k]) ultimo[k] = { valor: m.cambios[k], m }; }));
      const r = reqPorNumero ? reqPorNumero(numero) : null;
      const campos = ORDEN_CAMPOS.filter((k) => ultimo[k]).map((k) => {
        const u = ultimo[k], f = u.m.fuente || {};
        return {
          campo: k, titulo: CAMPOS[k], valor: u.valor, actual: r ? (r[k] === undefined ? null : r[k]) : null,
          fuente: { herramienta: f.herramienta || (u.m.origen || {}).herramienta || '', codigo: f.codigo || '', motivo: f.motivo || '',
            enviado: enviado(u.m), usuario: (u.m.origen || {}).usuario || '' }
        };
      }).filter((c) => !r || !igual(c.actual, c.valor));
      out.push({
        numero, titulo: r ? r.titulo || '' : '', enPlanilla: !!r, estadoPlanilla: r ? r.estado || '' : '',
        campos, alDia: !!r && !campos.length, mensajes: ms.length, ultimo: enviado(ms[ms.length - 1])
      });
    });
    // Lo que falta escribir primero; dentro, del N° más nuevo al más viejo
    return out.sort((a, b) => (a.alDia - b.alDia) || b.numero - a.numero);
  }
  /* El valor tal como se escribe en la celda: el estado como texto y los montos como número entero
     sin separadores (Excel lo toma como número en cualquier configuración regional). */
  function valorParaCopiar(c) {
    return typeof c.valor === 'number' ? String(Math.round(c.valor)) : String(c.valor === null || c.valor === undefined ? '' : c.valor);
  }

  // ---- Borradores en Sistema QUEMPIN -------------------------------------------------------------
  /* Borradores de cotización que todavía esperan en el buzón de Sistema QUEMPIN (el buzón ya trae
     solo los que nadie emitió ni descartó). */
  function borradores(mensajes) {
    return (mensajes || []).filter((m) => m && m.tipo === 'borrador-cotizacion' && m.destino === 'sistema-quempin')
      .map((m) => {
        const f = m.fuente || {}, c = m.cotizacion || {};
        return {
          id: m.id, uid: f.uid || '', codigo: f.codigo || '', version: f.version, titulo: f.titulo || c.referencia || '',
          cliente: ((c.cliente || {}).razon_social) || '', enviado: enviado(m), usuario: (m.origen || {}).usuario || '',
          req: (m.proyecto || {}).req || ''
        };
      })
      .sort((a, b) => a.enviado.localeCompare(b.enviado));
  }

  /* Días desde una fecha ISO (con hora) hasta hoy, en días de calendario. */
  function diasDesde(iso, hoy) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    return Math.round((local(hoyISO(hoy)) - local(`${m[1]}-${m[2]}-${m[3]}`)) / 86400000);
  }
  function hace(dias) {
    if (dias === null || dias === undefined) return '';
    return dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
  }

  root.QPendientes = {
    CAMPOS, igual, fechaDe, diasHasta, textoPlazo, nivelPlazo, fechaCierre,
    porOfertar, sugerencias, valorParaCopiar, borradores, diasDesde, hace
  };
})(typeof window !== 'undefined' ? window : globalThis);
