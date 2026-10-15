/*
 * pegar.js — Filas de costos pegadas desde Excel (o desde la cotización del tablero del Cotizador
 * Histórico) para las tablas de materiales, equipos y otros del paso 3 (2026-10-14). Es el puente
 * con las planillas de formulación antiguas: el 08-10 había 36 .xlsm trabajadas desde el 01-09 contra
 * 3 Excel del Formulador, y copiar sus filas de a una era el trabajo que nadie quería repetir.
 *
 * Solo interpreta el texto: app.js muestra la vista previa y agrega las filas al proyecto.
 *   interpretar(texto) → { filas: [{ descripcion, unidad, cantidad, costoUnitario }], omitidas,
 *                          encabezado (bool), columnas: { descripcion, unidad, cantidad, costo } (índices),
 *                          conIva (true | false | null: los encabezados no lo dicen) }
 */
(function (root) {
  'use strict';

  const norm = (s) => String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  /* Unidades como las escribe la gente → las del Formulador (store.js UNIDADES). Lo que no se reconoce
     queda tal cual: la lista de unidades acepta otras. */
  const UNIDADES = {
    'un.': 'Un.', un: 'Un.', und: 'Un.', unid: 'Un.', unidad: 'Un.', unidades: 'Un.', u: 'Un.', 'c/u': 'Un.', pza: 'Un.', pieza: 'Un.', piezas: 'Un.', uni: 'Un.',
    m: 'm', mt: 'm', mts: 'm', metro: 'm', metros: 'm', ml: 'm', 'm.l.': 'm', mtl: 'm',
    m2: 'm2', 'm²': 'm2', mt2: 'm2', m3: 'm3', 'm³': 'm3', mt3: 'm3',
    kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
    gl: 'gl', glb: 'gl', global: 'gl',
    km: 'km', lt: 'lt', lts: 'lt', l: 'lt', litro: 'lt', litros: 'lt',
    hr: 'hr', hrs: 'hr', h: 'hr', hora: 'hr', horas: 'hr',
    dia: 'día', dias: 'día', 'día': 'día', 'días': 'día', noche: 'noche', noches: 'noche'
  };
  function unidad(t) {
    const s = String(t || '').trim();
    if (!s) return '';
    return UNIDADES[norm(s)] || UNIDADES[norm(s).replace(/\.$/, '')] || s;
  }

  /* Número escrito como en Chile o como en Excel: «$180.000», «180000», «1.234,56», «12,5», «0.5». */
  function numero(t) {
    if (typeof t === 'number') return Number.isFinite(t) ? t : null;
    let s = String(t === null || t === undefined ? '' : t).trim();
    if (!s) return null;
    s = s.replace(/^(clp|us\$|usd|s\/|pen|€|eur)\s*/i, '').replace(/[$\s ]/g, '');
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
    const comas = (s.match(/,/g) || []).length, puntos = (s.match(/\./g) || []).length;
    // Como en Chile: el punto separa miles y la coma, decimales. Con los dos, el último es el decimal.
    if (comas && puntos) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (comas) s = comas > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (puntos > 1 || /^[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  }

  // ---- Encabezados ----------------------------------------------------------------------------------
  const ES = {
    descripcion: /^(descripcion|desc|elemento|item|items|material|materiales|producto|detalle|nombre|equipo|equipos|concepto|insumo|articulo|glosa|partida)\b/,
    unidad: /^(unidad|unid|un|ud|u\.?m\.?|und)\b/,
    cantidad: /^(cantidad|cant|cant\.|qty|n° unidades)\b/,
    costo: /(costo|precio|valor|p\.? ?unit|unitario|c\.? ?unit)/
  };
  const ES_TOTAL = /(sub)?total|importe|monto/;
  /* Puntaje de una columna de costo: el unitario y el actualizado por UF primero; los totales, nunca. */
  function puntajeCosto(h) {
    if (!ES.costo.test(h) || (ES_TOTAL.test(h) && !/unit/.test(h))) return -1;
    let p = 1;
    if (/unit/.test(h)) p += 3;
    if (/actualizado|reajustado|uf/.test(h)) p += 2;
    if (/barato|minimo|maximo|promedio/.test(h)) p -= 1;
    return p;
  }
  function columnasDe(celdas) {
    const h = celdas.map(norm);
    const col = {};
    h.forEach((t, i) => {
      if (col.descripcion === undefined && ES.descripcion.test(t)) col.descripcion = i;
      else if (col.unidad === undefined && ES.unidad.test(t)) col.unidad = i;
      else if (col.cantidad === undefined && ES.cantidad.test(t)) col.cantidad = i;
    });
    let mejor = -1;
    h.forEach((t, i) => {
      if (i === col.descripcion || i === col.unidad || i === col.cantidad) return;
      const p = puntajeCosto(t);
      if (p > mejor) { mejor = p; col.costo = i; }
    });
    const reconocidas = ['descripcion', 'unidad', 'cantidad', 'costo'].filter((k) => col[k] !== undefined).length;
    if (!(col.descripcion !== undefined && reconocidas >= 2)) return null;
    const hc = col.costo !== undefined ? h[col.costo] : '';
    col.conIva = /c\/ ?iva|con iva|iva inc|iva incluido/.test(hc) ? true : /neto|s\/ ?iva|sin iva/.test(hc) ? false : null;
    return col;
  }

  // ---- Filas ------------------------------------------------------------------------------------
  function celdasDe(texto) {
    const lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
    const sep = lineas.some((l) => l.includes('\t')) ? '\t' : lineas.some((l) => l.includes(';')) ? ';' : null;
    return lineas.map((l) => (sep ? l.split(sep) : [l]).map((c) => c.replace(/^"(.*)"$/, '$1').trim()));
  }
  const esTotal = (t) => /^(sub)?total\b|^total general|^neto\b|^iva\b/i.test(norm(t));

  /* Sin encabezado: la primera celda con texto es la descripción; una corta que parece unidad, la unidad;
     de los números, el primero es la cantidad y el siguiente el costo unitario (un tercero que es
     cantidad × costo es el total, y no se usa). Un solo número es el costo, con cantidad 1. */
  function porContenido(c) {
    let descripcion = '', und = '';
    const nums = [];
    c.forEach((t) => {
      const n = numero(t);
      if (n !== null) { nums.push(n); return; }
      if (!t) return;
      if (!descripcion) { descripcion = t; return; }
      if (!und && t.length <= 8 && UNIDADES[norm(t)] !== undefined) und = t;
    });
    let cantidad = 1, costo = null;
    if (nums.length === 1) costo = nums[0];
    else if (nums.length >= 2) { cantidad = nums[0]; costo = nums[1]; }
    return { descripcion, unidad: unidad(und), cantidad, costoUnitario: costo };
  }

  function interpretar(texto) {
    const filas = celdasDe(texto);
    if (!filas.length) return { filas: [], omitidas: 0, encabezado: false, columnas: null, conIva: null };
    const col = columnasDe(filas[0]);
    const datos = col ? filas.slice(1) : filas;
    const out = [];
    let omitidas = 0;
    datos.forEach((c) => {
      let f;
      if (col) {
        const v = (k) => (col[k] !== undefined ? c[col[k]] : undefined);
        const cant = numero(v('cantidad'));
        f = { descripcion: String(v('descripcion') || '').trim(), unidad: unidad(v('unidad')),
          cantidad: cant === null ? 1 : cant, costoUnitario: numero(v('costo')) };
      } else f = porContenido(c);
      if (!f.descripcion || esTotal(f.descripcion) || (f.costoUnitario === null && !f.unidad && c.length > 1 && !col)) { omitidas++; return; }
      if (f.costoUnitario === null || f.costoUnitario < 0) f.costoUnitario = 0;
      if (!(f.cantidad > 0)) f.cantidad = 1;
      f.descripcion = f.descripcion.slice(0, 200);
      out.push(f);
    });
    return { filas: out, omitidas, encabezado: !!col, columnas: col, conIva: col ? col.conIva : null };
  }

  root.QPegar = { interpretar, numero, unidad };
})(typeof window !== 'undefined' ? window : globalThis);
