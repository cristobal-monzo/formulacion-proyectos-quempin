/*
 * excel.js — Exportación e importación de proyectos.
 *
 * Exportar proyecto (.xlsx): hojas Ficha (resumen visual: tarjetas, cascada del precio,
 * semáforos y barras), Parámetros, Partidas, Materiales, Equipos, Mano de obra, Otros y
 * Guía (qué mide cada indicador), con fórmulas vivas (el Excel recalcula si se editan valores) y
 * una hoja oculta "_datos" con el proyecto completo en JSON para volver a importarlo.
 *
 * Importar: JSON de la herramienta, Excel exportado por la herramienta, o el Excel
 * antiguo "Excel General Proyectos_CLP.xlsm" (hojas Costos / Resumen / Referencias).
 */
(function (root) {
  'use strict';

  const LOCAL_LIB = 'vendor/exceljs.min.js';
  const CDN_LIB = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  // Manual de Marca QUEMPIN: Lato para documentos; Orange 021 C #FF5100, Black C, Cool Gray 11 C.
  const FONT = 'Lato';
  const C = {
    brand: 'FFFF5100', dark: 'FF000000', gray: 'FF54565A', light: 'FFF4F4F4',
    line: 'FFD9D9DA', input: 'FF0000FF', link: 'FF008000', white: 'FFFFFFFF',
    zebra: 'FFFAFAFA', bar: 'FFFFB58A',
    // Semáforo de la Ficha (fondo claro + texto oscuro del mismo tono)
    okBg: 'FFE3F4E8', okFg: 'FF1E7B34', warnBg: 'FFFFF1D6', warnFg: 'FF9A6700', badBg: 'FFFDE2DD', badFg: 'FFC62828'
  };
  const FMT = {
    clp: '"$"#,##0;-"$"#,##0;"-"',
    pct: '0.0%;-0.0%;"-"',
    num: '#,##0.##;-#,##0.##;"-"',
    int: '#,##0;-#,##0;"-"'
  };
  /* Formato de monto en la moneda del proyecto: pesos y soles enteros, dólares y euros con centavos */
  function fmtMoneda(p) {
    const C = root.QCalc, m = C.monedaDe(p), x = C.MONEDAS[m];
    if (m === 'CLP') return FMT.clp;
    const s = `"${x.simbolo} "`, n = x.decimales ? '#,##0.' + '0'.repeat(x.decimales) : '#,##0';
    return `${s}${n};-${s}${n};"-"`;
  }

  // ---- Carga diferida de ExcelJS -------------------------------------------
  let loading = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => { s.remove(); rej(new Error(src)); };
      document.head.appendChild(s);
    });
  }
  function ensureExcelJS() {
    if (root.ExcelJS) return Promise.resolve(root.ExcelJS);
    if (!loading) {
      loading = loadScript(LOCAL_LIB)
        .catch(() => loadScript(CDN_LIB))
        .then(() => root.ExcelJS)
        .catch(() => { loading = null; throw new Error('No se pudo cargar la librería ExcelJS.'); });
    }
    return loading;
  }

  // ---- Utilidades -------------------------------------------------------------
  function slug(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .slice(0, 40).replace(/^-+|-+$/g, '') || 'proyecto';
  }
  function fileBase(p) {
    // Registrada en el Control de Documentos (tipo 81): el archivo lleva ese número adelante,
    // como los demás documentos de QUEMPIN («812602_…»). Solo si es de esta misma versión.
    const reg = p.vinculos && p.vinculos.controlDocumentos;
    const folio = reg && /^81\d{4,}$/.test(String(reg.folio || '')) && String(reg.nombreArchivo || '').indexOf(`v${p.version || 1}`) >= 0 ? `${reg.folio}_` : '';
    return `${folio}${p.codigo || 'SIN-CODIGO'}_v${p.version || 1}_${slug(p.titulo)}`;
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function downloadJSON(obj, name) {
    download(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), name);
  }
  /* Logo oficial embebido en js/logo-data.js (funciona también abriendo index.html sin servidor). */
  function logoOficial() { return root.QLogo && root.QLogo.png ? root.QLogo : null; }

  const sheetRef = (name) => `'${name.replace(/'/g, "''")}'`;
  const colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  function styleTitle(ws, text, sub, width) {
    ws.getCell('A1').value = text;
    ws.getCell('A1').font = { name: FONT, size: 14, bold: true, color: { argb: C.dark } };
    if (sub) {
      ws.getCell('A2').value = sub;
      ws.getCell('A2').font = { name: FONT, size: 9, italic: true, color: { argb: C.gray } };
    }
    ws.getRow(1).height = 22;
  }
  function styleHeader(row) {
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: C.brand } } };
    });
    row.height = 30;
  }
  function styleTotal(row) {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.dark } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.light } };
      cell.border = { top: { style: 'thin', color: { argb: C.dark } } };
    });
  }
  function baseFont(ws) {
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      if (!cell.font || !cell.font.name) cell.font = Object.assign({}, cell.font || {}, { name: FONT, size: 10 });
    }));
  }
  const input = (cell, fmt) => { cell.font = { name: FONT, size: 10, color: { argb: C.input } }; if (fmt) cell.numFmt = fmt; };
  const calc = (cell, fmt) => { cell.font = { name: FONT, size: 10, color: { argb: 'FF000000' } }; if (fmt) cell.numFmt = fmt; };
  const link = (cell, fmt) => { cell.font = { name: FONT, size: 10, color: { argb: C.link } }; if (fmt) cell.numFmt = fmt; };
  const F = (formula, result) => ({ formula, result: (result === null || result === undefined || Number.isNaN(result)) ? 0 : result });

  // =====================================================================
  //  EXPORTAR PROYECTO
  // =====================================================================
  /* Genera el Excel del proyecto y lo descarga; con opts.soloDatos devuelve el archivo (ArrayBuffer) sin descargarlo.
     opts.copiaOferta: es la copia que se mantiene al día en la carpeta de la oferta (js/oferta.js). */
  async function exportProject(p, opts) {
    const ExcelJS = await ensureExcelJS();
    const r = root.QCalc.computeProject(p);
    const par = p.parametros;
    const FMT_M = fmtMoneda(p);
    const num = root.QCalc.num;
    const copia = !!(opts && opts.copiaOferta);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'QUEMPIN · Formulación de proyectos';
    wb.lastModifiedBy = 'QUEMPIN · Formulación de proyectos';
    wb.title = `${p.codigo} ${p.titulo}`;
    wb.subject = 'Formulación de proyecto';
    wb.keywords = p.codigo;
    wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };

    const wsF = wb.addWorksheet('Ficha', { properties: { tabColor: { argb: C.brand } }, views: [{ showGridLines: false }] });
    const wsPar = wb.addWorksheet('Parámetros', { views: [{ showGridLines: false }] });
    const wsP = wb.addWorksheet('Partidas', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    const wsM = wb.addWorksheet('Materiales', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    const wsE = wb.addWorksheet('Equipos', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    const wsH = wb.addWorksheet('Mano de obra', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    const wsO = wb.addWorksheet('Otros', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    const wsG = wb.addWorksheet('Guía', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    const wsD = wb.addWorksheet('_datos', { state: 'hidden' });
    const ident = `${p.codigo} · v${p.version} · ${p.titulo || 'Sin título'}`;

    // ---------------- Parámetros ----------------
    styleTitle(wsPar, 'PARÁMETROS DEL PROYECTO', ident, 3);
    wsPar.columns = [{ width: 42 }, { width: 18 }, { width: 70 }];
    const hp = wsPar.getRow(3); hp.values = ['Parámetro', 'Valor', 'Nota']; styleHeader(hp);
    const PR = {}; // dirección de cada parámetro
    const params = [
      ['moneda', 'Moneda', root.QCalc.MONEDAS[root.QCalc.monedaDe(p)].nombre, null, 'Todos los montos del proyecto están en esta moneda (se elige en el Formulador).'],
      ['iva', 'IVA', num(par.iva) / 100, FMT.pct, 'Tasa de IVA vigente.'],
      ['gg', 'Gastos generales (% del costo directo)', num(par.gastosGenerales) / 100, FMT.pct, 'Estructura de la empresa asignada al proyecto. 0 % = igual al Excel original.'],
      ['imp', 'Imprevistos (% del costo directo)', num(par.imprevistos) / 100, FMT.pct, 'Reserva para riesgos. 0 % = igual al Excel original.'],
      ['t1', 'Tarifa día-hombre Nivel 1', num(par.tarifaN1), FMT_M, 'Costo empresa por día de una persona de nivel 1.'],
      ['t2', 'Tarifa día-hombre Nivel 2', num(par.tarifaN2), FMT_M, 'Costo empresa por día de una persona de nivel 2.'],
      ['t3', 'Tarifa día-hombre Nivel 3', num(par.tarifaN3), FMT_M, 'Costo empresa por día de una persona de nivel 3.'],
      ['pres', 'Presupuesto máximo del mandante', num(par.presupuestoMaximo), FMT_M, 'Dejar en 0 si no se conoce.'],
      ['presIva', 'Presupuesto incluye IVA (Sí/No)', par.presupuestoIncluyeIva ? 'Sí' : 'No', null, 'Define si la competitividad se mide con precio bruto o neto.'],
      ['mObj', 'Margen objetivo', num(par.margenObjetivo) / 100, FMT.pct, 'Sobre este margen el semáforo queda en verde.'],
      ['mMin', 'Margen mínimo', num(par.margenMinimo) / 100, FMT.pct, 'Bajo este margen el semáforo queda en rojo.'],
      ['metaDH', 'Meta de utilidad por día-hombre', num(par.metaUtilidadDH), FMT_M, '0 = sin meta.'],
      ['ajust', 'Umbral de oferta ajustada', num(par.umbralAjustado || 95) / 100, FMT.pct, 'Sobre este % del presupuesto la oferta se considera ajustada.'],
      ['sMat', 'Sensibilidad: variación costo Materiales', num(par.sensibilidad.mat) / 100, FMT.pct, 'Escenario de sobrecosto a simular.'],
      ['sEq', 'Sensibilidad: variación costo Equipos', num(par.sensibilidad.eq) / 100, FMT.pct, ''],
      ['sMo', 'Sensibilidad: variación costo Mano de obra', num(par.sensibilidad.mo) / 100, FMT.pct, 'El Excel original usaba +10 % fijo.'],
      ['sOt', 'Sensibilidad: variación costo Otros', num(par.sensibilidad.otros) / 100, FMT.pct, '']
    ];
    params.forEach((row, i) => {
      const rr = 4 + i;
      wsPar.getCell(`A${rr}`).value = row[1];
      const c = wsPar.getCell(`B${rr}`); c.value = row[2]; input(c, row[3]);
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      wsPar.getCell(`C${rr}`).value = row[4];
      wsPar.getCell(`C${rr}`).font = { name: FONT, size: 9, color: { argb: C.gray } };
      PR[row[0]] = `Parámetros!$B$${rr}`;
    });
    let rc = 4 + params.length + 2;
    wsPar.getCell(`A${rc}`).value = 'CATÁLOGO DE OTROS COSTOS (REFERENCIAS)';
    wsPar.getCell(`A${rc}`).font = { name: FONT, size: 11, bold: true, color: { argb: C.brand } };
    rc++;
    const hc = wsPar.getRow(rc); hc.values = ['Descripción', 'Costo unitario', 'Unidad']; styleHeader(hc);
    (p.catalogoOtros || []).forEach((it) => {
      rc++;
      wsPar.getCell(`A${rc}`).value = it.descripcion;
      const c = wsPar.getCell(`B${rc}`); c.value = num(it.costoUnitario); input(c, FMT_M);
      wsPar.getCell(`C${rc}`).value = it.unidad || '';
    });

    // ---------------- Partidas ----------------
    const nP = r.partidas.length;
    const pEnd = 4 + Math.max(nP, 1);
    const pTot = pEnd + 1;
    const lineEnd = (n) => 4 + Math.max(n, 1);
    const mEnd = lineEnd(r.lines.materiales.length);
    const eEnd = lineEnd(r.lines.equipos.length);
    const hEnd = lineEnd(r.lines.manoObra.length);
    const oEnd = lineEnd(r.lines.otros.length);
    const S = { M: sheetRef('Materiales'), E: sheetRef('Equipos'), H: sheetRef('Mano de obra'), O: sheetRef('Otros'), P: sheetRef('Partidas') };
    // Partida base: bloque propio bajo el total; cada partida suma su parte (costo ÷ partidas) en cada columna
    const bRow = r.base ? pTot + 3 : null;
    const cuota = (L) => (r.base ? `+IFERROR($${L}$${bRow}/$K$${bRow},0)` : '');

    styleTitle(wsP, 'PARTIDAS Y RESUMEN DE COSTOS', `${ident} — Las cantidades de detalle se ingresan por unidad de partida.${r.base ? ' Los costos incluyen la parte de la partida base (abajo).' : ''}`, 17);
    wsP.columns = [
      { width: 7 }, { width: 44 }, { width: 8 }, { width: 9 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 },
      { width: 16 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 16 }, { width: 15 }, { width: 10 }
    ];
    const hP = wsP.getRow(4);
    hP.values = ['ID', 'Descripción partida', 'Unid.', 'Cant.', 'Materiales', 'Equipos', 'Mano de obra', 'Otros', 'Costo directo',
      'Días-Hombre', 'Utilidad tipo (% / $)', 'Utilidad valor', 'Utilidad $', 'GG + Imprevistos', 'Precio neto', 'Precio unitario', '% del precio'];
    styleHeader(hP);
    r.partidas.forEach((pt, i) => {
      const rr = 5 + i;
      const row = wsP.getRow(rr);
      row.getCell(1).value = pt.code;
      row.getCell(2).value = pt.descripcion;
      row.getCell(3).value = pt.unidad;
      input(row.getCell(4), FMT.num); row.getCell(4).value = pt.cantidad;
      link(row.getCell(5), FMT_M); row.getCell(5).value = F(`SUMIF(${S.M}!$C$5:$C$${mEnd},A${rr},${S.M}!$H$5:$H$${mEnd})${cuota('E')}`, pt.mat);
      link(row.getCell(6), FMT_M); row.getCell(6).value = F(`SUMIF(${S.E}!$C$5:$C$${eEnd},A${rr},${S.E}!$H$5:$H$${eEnd})${cuota('F')}`, pt.eq);
      link(row.getCell(7), FMT_M); row.getCell(7).value = F(`SUMIF(${S.H}!$C$5:$C$${hEnd},A${rr},${S.H}!$M$5:$M$${hEnd})${cuota('G')}`, pt.mo);
      link(row.getCell(8), FMT_M); row.getCell(8).value = F(`SUMIF(${S.O}!$C$5:$C$${oEnd},A${rr},${S.O}!$H$5:$H$${oEnd})${cuota('H')}`, pt.otros);
      calc(row.getCell(9), FMT_M); row.getCell(9).value = F(`SUM(E${rr}:H${rr})`, pt.cd);
      link(row.getCell(10), FMT.num); row.getCell(10).value = F(`SUMIF(${S.H}!$C$5:$C$${hEnd},A${rr},${S.H}!$L$5:$L$${hEnd})${cuota('J')}`, pt.dh);
      row.getCell(11).value = pt.utilidadTipo === 'monto' ? '$' : '%';
      row.getCell(11).alignment = { horizontal: 'center' };
      input(row.getCell(11));
      if (pt.utilidadTipo === 'monto') { row.getCell(12).value = pt.utilidadValor; input(row.getCell(12), FMT_M); }
      else { row.getCell(12).value = pt.utilidadValor / 100; input(row.getCell(12), FMT.pct); }
      calc(row.getCell(13), FMT_M); row.getCell(13).value = F(`IF(K${rr}="%",I${rr}*L${rr},L${rr})`, pt.utilidad);
      calc(row.getCell(14), FMT_M); row.getCell(14).value = F(`I${rr}*(${PR.gg}+${PR.imp})`, pt.ggimp);
      calc(row.getCell(15), FMT_M); row.getCell(15).value = F(`I${rr}+M${rr}+N${rr}`, pt.precio);
      calc(row.getCell(16), FMT_M); row.getCell(16).value = F(`IFERROR(O${rr}/D${rr},0)`, pt.pu || 0);
      calc(row.getCell(17), FMT.pct); row.getCell(17).value = F(`IFERROR(O${rr}/$O$${pTot},0)`, pt.pctPrecio || 0);
    });
    const tP = wsP.getRow(pTot);
    tP.getCell(2).value = 'TOTAL';
    const T = r.totals;
    const totCols = { 5: ['E', T.mat], 6: ['F', T.eq], 7: ['G', T.mo], 8: ['H', T.otros], 9: ['I', T.cd], 10: ['J', T.dh], 13: ['M', T.utilidad], 14: ['N', T.gg + T.imp], 15: ['O', T.precioNeto] };
    Object.entries(totCols).forEach(([ci, [L, v]]) => {
      tP.getCell(+ci).value = F(`SUM(${L}5:${L}${pEnd})`, v);
    });
    styleTotal(tP);
    Object.keys(totCols).forEach((ci) => { tP.getCell(+ci).numFmt = +ci === 10 ? FMT.num : FMT_M; });
    tP.getCell(17).value = F(`IFERROR(O${pTot}/$O$${pTot},0)`, T.precioNeto ? 1 : 0); tP.getCell(17).numFmt = FMT.pct;
    const PT = (L) => `Partidas!$${L}$${pTot}`;

    if (r.base) {
      const b = r.base;
      const hB = wsP.getRow(bRow - 1);
      hB.values = ['ID', 'Partida base (no se cotiza sola)', 'Unid.', 'Cant.', 'Materiales', 'Equipos', 'Mano de obra', 'Otros', 'Costo directo',
        'Días-Hombre', 'Se divide entre', 'Parte de cada partida'];
      styleHeader(hB);
      const row = wsP.getRow(bRow);
      row.getCell(1).value = b.code;
      row.getCell(2).value = b.descripcion;
      row.getCell(3).value = b.unidad;
      input(row.getCell(4), FMT.num); row.getCell(4).value = b.cantidad;
      link(row.getCell(5), FMT_M); row.getCell(5).value = F(`SUMIF(${S.M}!$C$5:$C$${mEnd},A${bRow},${S.M}!$H$5:$H$${mEnd})`, b.mat);
      link(row.getCell(6), FMT_M); row.getCell(6).value = F(`SUMIF(${S.E}!$C$5:$C$${eEnd},A${bRow},${S.E}!$H$5:$H$${eEnd})`, b.eq);
      link(row.getCell(7), FMT_M); row.getCell(7).value = F(`SUMIF(${S.H}!$C$5:$C$${hEnd},A${bRow},${S.H}!$M$5:$M$${hEnd})`, b.mo);
      link(row.getCell(8), FMT_M); row.getCell(8).value = F(`SUMIF(${S.O}!$C$5:$C$${oEnd},A${bRow},${S.O}!$H$5:$H$${oEnd})`, b.otros);
      calc(row.getCell(9), FMT_M); row.getCell(9).value = F(`SUM(E${bRow}:H${bRow})`, b.cd);
      link(row.getCell(10), FMT.num); row.getCell(10).value = F(`SUMIF(${S.H}!$C$5:$C$${hEnd},A${bRow},${S.H}!$L$5:$L$${hEnd})`, b.dh);
      calc(row.getCell(11), FMT.int); row.getCell(11).value = F(`COUNTA($A$5:$A$${pEnd})`, b.partes);
      calc(row.getCell(12), FMT_M); row.getCell(12).value = F(`IFERROR(I${bRow}/K${bRow},0)`, b.cuota);
      const nota = wsP.getCell(`B${bRow + 1}`);
      nota.value = b.partes
        ? `Su costo se divide en partes iguales entre las ${b.partes} partidas de arriba y ya está sumado en sus columnas de costo y días-hombre.`
        : 'No hay otras partidas entre las que dividirla: su costo no se suma al proyecto.';
      nota.font = { name: FONT, size: 9, italic: true, color: { argb: b.partes ? C.gray : C.badFg } };
    }

    // ---------------- Detalle: Materiales / Equipos / Otros ----------------
    // Los costos de la partida base (PB) buscan su cantidad en el bloque de la base
    const qtyFormula = (rr) => `IFERROR(INDEX(${S.P}!$D$5:$D$${pEnd},MATCH(C${rr},${S.P}!$A$5:$A$${pEnd},0)),${r.base ? `IF(C${rr}=${S.P}!$A$${bRow},${S.P}!$D$${bRow},0)` : '0'})`;
    function detailSheet(ws, titulo, key, lines, items, end) {
      styleTitle(ws, titulo, `${ident} — Cantidad por unidad de partida × Cant. partida × Costo unitario.`, 8);
      ws.columns = [{ width: 7 }, { width: 44 }, { width: 10 }, { width: 8 }, { width: 14 }, { width: 15 }, { width: 12 }, { width: 16 }];
      const h = ws.getRow(4);
      h.values = ['ID', 'Descripción', 'Partida', 'Unid.', 'Cant. por unid. de partida', 'Costo unitario', 'Cant. partida', 'Subtotal'];
      styleHeader(h);
      lines.forEach((ln, i) => {
        const it = items[i];
        const rr = 5 + i;
        const row = ws.getRow(rr);
        row.getCell(1).value = ln.code;
        row.getCell(2).value = it.descripcion || '';
        row.getCell(3).value = ln.partidaCode || '';
        row.getCell(3).alignment = { horizontal: 'center' };
        input(row.getCell(3));
        row.getCell(4).value = it.unidad || '';
        input(row.getCell(5), FMT.num); row.getCell(5).value = num(it.cantidad);
        input(row.getCell(6), FMT_M); row.getCell(6).value = num(it.costoUnitario);
        link(row.getCell(7), FMT.num); row.getCell(7).value = F(qtyFormula(rr), ln.qtyPartida);
        calc(row.getCell(8), FMT_M); row.getCell(8).value = F(`G${rr}*E${rr}*F${rr}`, ln.subtotal);
        if (!ln.partidaCode) {
          row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2DD' } };
          row.getCell(3).note = 'Sin partida asociada: este ítem no suma al costo.';
        }
      });
      const tot = ws.getRow(end + 1);
      tot.getCell(2).value = 'TOTAL';
      tot.getCell(8).value = F(`SUM(H5:H${end})`, lines.reduce((a, l) => a + l.subtotal, 0));
      styleTotal(tot); tot.getCell(8).numFmt = FMT_M;
    }
    detailSheet(wsM, 'MATERIALES (M)', 'materiales', r.lines.materiales, p.materiales, mEnd);
    detailSheet(wsE, 'EQUIPOS (E)', 'equipos', r.lines.equipos, p.equipos, eEnd);
    detailSheet(wsO, 'OTROS (O) — SERVICIOS, TRANSPORTE, LOGÍSTICA, ETC.', 'otros', r.lines.otros, p.otros, oEnd);

    // ---------------- Mano de obra ----------------
    styleTitle(wsH, 'MANO DE OBRA (H)', `${ident} — Personas y días por unidad de partida. Tarifas en hoja Parámetros.`, 13);
    wsH.columns = [{ width: 7 }, { width: 40 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 13 }, { width: 12 }, { width: 16 }];
    const hH = wsH.getRow(4);
    hH.values = ['ID', 'Descripción tarea', 'Partida', 'Personal N1', 'Días N1', 'Personal N2', 'Días N2', 'Personal N3', 'Días N3', 'Cant. partida', 'DH por unid. de partida', 'Días-Hombre', 'Subtotal'];
    styleHeader(hH);
    r.lines.manoObra.forEach((ln, i) => {
      const it = p.manoObra[i];
      const rr = 5 + i;
      const row = wsH.getRow(rr);
      row.getCell(1).value = ln.code;
      row.getCell(2).value = it.descripcion || '';
      row.getCell(3).value = ln.partidaCode || ''; row.getCell(3).alignment = { horizontal: 'center' }; input(row.getCell(3));
      ['n1p', 'n1d', 'n2p', 'n2d', 'n3p', 'n3d'].forEach((f, j) => { const c = row.getCell(4 + j); c.value = num(it[f]); input(c, FMT.num); });
      link(row.getCell(10), FMT.num); row.getCell(10).value = F(qtyFormula(rr), ln.qtyPartida);
      calc(row.getCell(11), FMT.num); row.getCell(11).value = F(`D${rr}*E${rr}+F${rr}*G${rr}+H${rr}*I${rr}`, ln.dhPorUnidadPartida);
      calc(row.getCell(12), FMT.num); row.getCell(12).value = F(`J${rr}*K${rr}`, ln.dh);
      calc(row.getCell(13), FMT_M);
      row.getCell(13).value = F(`J${rr}*(D${rr}*E${rr}*${PR.t1}+F${rr}*G${rr}*${PR.t2}+H${rr}*I${rr}*${PR.t3})`, ln.subtotal);
      if (!ln.partidaCode) {
        row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2DD' } };
        row.getCell(3).note = 'Sin partida asociada: este ítem no suma al costo.';
      }
    });
    const tH = wsH.getRow(hEnd + 1);
    tH.getCell(2).value = 'TOTAL';
    tH.getCell(12).value = F(`SUM(L5:L${hEnd})`, T.dh);
    tH.getCell(13).value = F(`SUM(M5:M${hEnd})`, T.mo);
    styleTotal(tH); tH.getCell(12).numFmt = FMT.num; tH.getCell(13).numFmt = FMT_M;

    // ---------------- Ficha: resumen visual de una página ----------------
    // Rejilla de 8 columnas iguales; cada tarjeta de indicador ocupa 2 columnas.
    wsF.columns = Array.from({ length: 8 }, () => ({ width: 15 }));
    const NC = 8;
    const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const rowCells = (rr, fn) => { for (let ci = 1; ci <= NC; ci++) fn(wsF.getRow(rr).getCell(ci), ci); };
    /* Escribe en un rango (lo combina si tiene más de una celda) y devuelve la celda principal. */
    const put = (rng, value, font, extra) => {
      if (rng.indexOf(':') > 0) wsF.mergeCells(rng);
      const c = wsF.getCell(rng.split(':')[0]);
      c.value = value;
      c.font = Object.assign({ name: FONT, size: 10, color: { argb: C.dark } }, font || {});
      c.alignment = Object.assign({ vertical: 'middle' }, (extra && extra.alignment) || {});
      if (extra && extra.numFmt) c.numFmt = extra.numFmt;
      return c;
    };
    const semaforo = (ref, cellRef) => wsF.addConditionalFormatting({
      ref,
      rules: [['✔', C.okBg, C.okFg], ['▲', C.warnBg, C.warnFg], ['✖', C.badBg, C.badFg]].map(([s, bg, fg], i) => ({
        type: 'expression', priority: i + 1, formulae: [`LEFT(${cellRef},1)="${s}"`],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: bg } }, font: { color: { argb: fg } } }
      }))
    });
    const barras = (ref, max) => wsF.addConditionalFormatting({
      ref,
      rules: [{
        type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, gradient: false, border: false,
        cfvo: [{ type: 'num', value: 0 }, max === undefined ? { type: 'max' } : { type: 'num', value: max }],
        color: { argb: C.bar }
      }]
    });

    // Encabezado: logo oficial en A:B (160 px ≈ 4,2 cm, sobre el mínimo de 4 cm del manual)
    for (let rr = 1; rr <= 7; rr++) wsF.getRow(rr).height = 20;
    const logo = logoOficial();
    if (logo) {
      const imgId = wb.addImage({ base64: logo.png, extension: 'png' });
      wsF.addImage(imgId, { tl: { col: 0.15, row: 0.4 }, ext: { width: 160, height: Math.round(160 * logo.alto / logo.ancho) } });
    }
    put('C2:H2', 'FORMULACIÓN DE PROYECTO', { size: 16, bold: true });
    put('C3:H3', `${p.codigo} · versión ${p.version}`, { size: 12, bold: true, color: { argb: C.brand } });
    put('C4:H4', p.titulo || 'Sin título', { size: 11, bold: true }, { alignment: { wrapText: true } });
    put('C5:H5', [p.cliente, p.ubicacion, p.responsable, p.fecha, p.estado].filter(Boolean).join(' · '), { size: 9, color: { argb: C.gray } });
    // La copia de la carpeta de la oferta se reescribe con cada cambio: avisarlo antes de que alguien la edite
    if (copia) {
      put('C6:H6', 'Copia automática del Formulador: se actualiza sola al guardar el presupuesto. Lo que se cambie en este archivo se reemplaza; para cambiar el presupuesto, usa el Formulador.',
        { size: 8, italic: true, color: { argb: C.gray } }, { alignment: { wrapText: true } });
      wsF.getRow(6).height = 26;
    }
    rowCells(7, (c) => { c.border = { bottom: { style: 'medium', color: { argb: C.brand } } }; });

    const nErr = r.warnings.filter((w) => w.level === 'error').length;
    const nWarn = r.warnings.filter((w) => w.level === 'warn').length;
    if (nErr + nWarn) {
      put('A8:H8', `⚠  ${nErr + nWarn} alerta(s) de validación${nErr ? ` (${nErr} error${nErr > 1 ? 'es' : ''})` : ''}: revísalas en «Alertas» al final de esta hoja.`,
        { size: 9, bold: true, color: { argb: nErr ? C.badFg : C.warnFg } }, { alignment: { indent: 1 } });
      rowCells(8, (c) => { c.fill = solid(nErr ? C.badBg : C.warnBg); });
      wsF.getRow(8).height = 20;
    } else wsF.getRow(8).height = 8;

    // Las tarjetas (filas 9–15) leen celdas de las tablas de abajo: primero se arman las tablas.
    const CARDS1 = 9, CARDS2 = 13;
    wsF.getRow(12).height = 8; wsF.getRow(16).height = 10;
    let fr = 17;
    const section = (text, sub) => {
      put(`A${fr}:E${fr}`, text, { size: 11, bold: true, color: { argb: C.brand } }, { alignment: { vertical: 'bottom' } });
      if (sub) put(`F${fr}:H${fr}`, sub, { size: 8, italic: true, color: { argb: C.gray } }, { alignment: { vertical: 'bottom', horizontal: 'right' } });
      rowCells(fr, (c) => { c.border = { bottom: { style: 'thin', color: { argb: C.brand } } }; });
      wsF.getRow(fr).height = 24;
      fr++;
    };
    const header = (cols) => {
      cols.forEach(([rng, text, right]) => put(rng.split(':').map((L) => L + fr).join(':'), text,
        { size: 9, bold: true, color: { argb: C.white } }, { alignment: { horizontal: right ? 'right' : 'left', indent: 1, wrapText: true } }));
      rowCells(fr, (c) => { c.fill = solid(C.dark); });
      wsF.getRow(fr).height = 20;
      fr++;
    };
    const hairline = (rr) => rowCells(rr, (c) => { c.border = Object.assign({}, c.border, { bottom: { style: 'hair', color: { argb: C.line } } }); });

    // ---- ¿Cómo se forma el precio? (cascada con barras) ----
    const A = {}; // dirección de cada resultado en Ficha
    const EV = {}; // dirección de cada evaluación (semáforo)
    section('¿CÓMO SE FORMA EL PRECIO?', 'Barras: % del precio de venta neto');
    header([['A:C', 'Concepto'], ['D', 'Monto', true], ['E:H', '% del precio neto']]);
    const cascada = [
      ['mat', 'Materiales', () => PT('E'), T.mat, 'item'],
      ['eq', 'Equipos', () => PT('F'), T.eq, 'item'],
      ['mo', 'Mano de obra', () => PT('G'), T.mo, 'item'],
      ['ot', 'Otros', () => PT('H'), T.otros, 'item'],
      ['cd', 'Costo directo', () => PT('I'), T.cd, 'sub'],
      ['gg', 'Gastos generales', () => `${A.cd}*${PR.gg}`, T.gg, 'item'],
      ['imp', 'Imprevistos', () => `${A.cd}*${PR.imp}`, T.imp, 'item'],
      ['ct', 'Costo total', () => `${A.cd}+${A.gg}+${A.imp}`, T.costoTotal, 'sub'],
      ['ut', 'Utilidad', () => PT('M'), T.utilidad, 'util'],
      ['pn', 'Precio de venta neto', () => `${A.ct}+${A.ut}`, T.precioNeto, 'total'],
      ['iva', 'IVA', () => `${A.pn}*${PR.iva}`, T.iva, 'item'],
      ['pb', 'Precio de venta bruto (con IVA)', () => `${A.pn}+${A.iva}`, T.precioBruto, 'sub']
    ];
    const cFrom = fr;
    cascada.forEach(([key], i) => { A[key] = `$D$${cFrom + i}`; });
    cascada.forEach(([key, label, formula, result, kind]) => {
      const total = kind === 'total', sub = kind === 'sub', util = kind === 'util';
      const color = { argb: total ? C.white : (util ? C.brand : C.dark) };
      const bold = kind !== 'item';
      put(`A${fr}:C${fr}`, label, { bold, color, size: total ? 11 : 10 }, { alignment: { indent: kind === 'item' ? 2 : 1 } });
      put(`D${fr}`, F(formula(), result), { bold, color, size: total ? 11 : 10 }, { numFmt: FMT_M });
      put(`E${fr}:H${fr}`, F(`IFERROR(${A[key]}/${A.pn},0)`, T.precioNeto ? result / T.precioNeto : 0), { size: 9, color: { argb: total ? C.white : C.gray } }, { numFmt: FMT.pct, alignment: { indent: 1 } });
      if (total) rowCells(fr, (c) => { c.fill = solid(C.dark); });
      else if (sub) rowCells(fr, (c) => { c.fill = solid(C.light); c.border = { top: { style: 'thin', color: { argb: C.gray } } }; });
      else hairline(fr);
      wsF.getRow(fr).height = total ? 22 : 18;
      fr++;
    });
    barras(`E${cFrom}:E${fr - 1}`, 1);
    fr++;

    // ---- Indicadores de evaluación (con semáforo) ----
    section('INDICADORES DE EVALUACIÓN', 'Qué mide cada uno: hoja «Guía»');
    header([['A:C', 'Indicador'], ['D', 'Valor', true], ['E:F', 'Evaluación'], ['G:H', 'Referencia']]);
    const k = r.kpis;
    const m = (x) => (x || 0);
    const fmtDH = Number.isInteger(Math.round(m(k.dh) * 100) / 100) ? FMT.int : '#,##0.0#';
    const mObj = num(par.margenObjetivo) / 100, mMin = num(par.margenMinimo) / 100;
    const metaDH = num(par.metaUtilidadDH), pres = num(par.presupuestoMaximo), ajust = num(par.umbralAjustado || 95) / 100;
    const deltaF = `(${A.mat}*${PR.sMat}+${A.eq}*${PR.sEq}+${A.mo}*${PR.sMo}+${A.ot}*${PR.sOt})`;
    const compF = `IF(${PR.pres}>0,IF(${PR.presIva}="Sí",${A.pb},${A.pn})/${PR.pres},0)`;
    const indicadores = [
      ['margen', 'Margen sobre venta', `IFERROR(${A.ut}/${A.pn},0)`, m(k.margen), FMT.pct,
        [`IF(${A.pn}=0,"—",IF(${A.ut}/${A.pn}>=${PR.mObj},"✔ Sobre el objetivo",IF(${A.ut}/${A.pn}>=${PR.mMin},"▲ Entre mínimo y objetivo","✖ Bajo el mínimo")))`,
          !T.precioNeto ? '—' : (m(k.margen) >= mObj ? '✔ Sobre el objetivo' : (m(k.margen) >= mMin ? '▲ Entre mínimo y objetivo' : '✖ Bajo el mínimo'))],
        [`"Objetivo "&TEXT(${PR.mObj},"0%")&" · mínimo "&TEXT(${PR.mMin},"0%")`, `Objetivo ${Math.round(mObj * 100)}% · mínimo ${Math.round(mMin * 100)}%`]],
      ['markup', 'Recargo sobre costo (markup)', `IFERROR(${A.ut}/${A.ct},0)`, m(k.markup), FMT.pct, null,
        'Cuánto pueden subir los costos sin pérdida'],
      ['dh', 'Días-hombre de ejecución', PT('J'), k.dh, fmtDH, null, 'Esfuerzo total, no el plazo'],
      ['rentDH', 'Utilidad por día-hombre', `IFERROR(${A.ut}/${A.dh},0)`, m(k.rentDH), FMT_M,
        [`IF(${PR.metaDH}<=0,"Sin meta definida",IF(IFERROR(${A.ut}/${A.dh},0)>=${PR.metaDH},"✔ Cumple la meta","✖ Bajo la meta"))`,
          metaDH <= 0 ? 'Sin meta definida' : (m(k.rentDH) >= metaDH ? '✔ Cumple la meta' : '✖ Bajo la meta')],
        [`IF(${PR.metaDH}>0,"Meta $"&FIXED(${PR.metaDH},0),"Meta en hoja Parámetros")`, metaDH > 0 ? `Meta $${Math.round(metaDH).toLocaleString('es-CL')}` : 'Meta en hoja Parámetros']],
      ['incMO', 'Incidencia de MO sobre venta', `IFERROR(${A.mo}/${A.pn},0)`, m(k.incidenciaMO), FMT.pct, null, 'Peso de la mano de obra en el precio'],
      ['holMO', 'Holgura de mano de obra', `IFERROR(${A.ut}/${A.mo},0)`, m(k.holguraMO), FMT.pct, null, 'Cuánto puede crecer la MO antes de perder'],
      ['sens', 'Sensibilidad de la utilidad', `IFERROR(-${deltaF}/${A.ut},0)`, m(k.sensVarUtilidad), FMT.pct, null, 'Variación de la utilidad en el escenario'],
      ['sensU', 'Utilidad en el escenario', `${A.ut}-${deltaF}`, m(k.sensUtilidad), FMT_M,
        [`IF(${A.ut}-${deltaF}<0,"✖ El escenario genera pérdida",IF(IFERROR((${A.ut}-${deltaF})/${A.pn},0)<${PR.mMin},"▲ Margen bajo el mínimo","✔ Resiste el escenario"))`,
          m(k.sensUtilidad) < 0 ? '✖ El escenario genera pérdida' : (m(k.sensMargen) < mMin ? '▲ Margen bajo el mínimo' : '✔ Resiste el escenario')],
        [`"Sobrecosto simulado $"&FIXED(${deltaF},0)`, `Sobrecosto simulado $${Math.round(m(T.utilidad) - m(k.sensUtilidad)).toLocaleString('es-CL')}`]],
      ['sensM', 'Margen en el escenario', `IFERROR((${A.ut}-${deltaF})/${A.pn},0)`, m(k.sensMargen), FMT.pct, null, 'Variaciones en hoja Parámetros'],
      ['comp', 'Competitividad de la oferta', compF, m(k.competitividad), FMT.pct,
        [`IF(${PR.pres}<=0,"Sin presupuesto informado",IF(${compF}>1,"✖ Excede el presupuesto",IF(${compF}>=${PR.ajust},"▲ Oferta ajustada","✔ Con holgura")))`,
          pres <= 0 ? 'Sin presupuesto informado' : (m(k.competitividad) > 1 ? '✖ Excede el presupuesto' : (m(k.competitividad) >= ajust ? '▲ Oferta ajustada' : '✔ Con holgura'))],
        [`IF(${PR.pres}>0,"Presupuesto $"&FIXED(${PR.pres},0)&IF(${PR.presIva}="Sí"," con IVA"," neto"),"Sin presupuesto del mandante")`,
          pres > 0 ? `Presupuesto $${Math.round(pres).toLocaleString('es-CL')}${par.presupuestoIncluyeIva ? ' con IVA' : ' neto'}` : 'Sin presupuesto del mandante']]
    ];
    indicadores.forEach(([key, label, formula, result, fmt, ev, ref]) => {
      const sub = key === 'sensU' || key === 'sensM';
      put(`A${fr}:C${fr}`, label, { bold: !sub }, { alignment: { indent: sub ? 2 : 1 } });
      put(`D${fr}`, F(formula, result), { bold: true }, { numFmt: fmt });
      A[key] = `$D$${fr}`;
      if (ev) {
        put(`E${fr}:F${fr}`, F(ev[0], ev[1]), { size: 9, bold: true, color: { argb: C.gray } }, { alignment: { indent: 1 } });
        EV[key] = `$E$${fr}`;
        semaforo(`E${fr}:F${fr}`, EV[key]);
      }
      put(`G${fr}:H${fr}`, Array.isArray(ref) ? F(ref[0], ref[1]) : ref, { size: 8, color: { argb: C.gray } }, { alignment: { indent: 1, wrapText: true } });
      hairline(fr);
      wsF.getRow(fr).height = 20;
      fr++;
    });
    fr++;

    // ---- Partidas: dónde está el precio ----
    const TOP = 12;
    section('PARTIDAS: DÓNDE ESTÁ EL PRECIO', r.partidas.length > TOP ? `Las ${TOP} de mayor precio de ${r.partidas.length}` : 'Ordenadas por precio');
    header([['A', 'ID'], ['B:D', 'Partida'], ['E', 'Costo directo', true], ['F', 'Precio neto', true], ['G:H', '% del precio']]);
    const orden = r.partidas.map((pt, i) => ({ pt, rr: 5 + i })).sort((a, b) => b.pt.precio - a.pt.precio);
    const pFrom = fr;
    if (!orden.length) {
      put(`A${fr}:H${fr}`, 'Sin partidas.', { color: { argb: C.gray } }, { alignment: { indent: 1 } }); fr++;
    }
    orden.slice(0, TOP).forEach(({ pt, rr }, i) => {
      put(`A${fr}`, pt.code, { size: 9, color: { argb: C.gray } }, { alignment: { indent: 1 } });
      put(`B${fr}:D${fr}`, pt.descripcion || '(sin descripción)', {}, { alignment: { indent: 1 } });
      put(`E${fr}`, F(`Partidas!$I$${rr}`, pt.cd), { color: { argb: C.gray } }, { numFmt: FMT_M });
      put(`F${fr}`, F(`Partidas!$O$${rr}`, pt.precio), { bold: true }, { numFmt: FMT_M });
      put(`G${fr}:H${fr}`, F(`IFERROR(F${fr}/${A.pn},0)`, pt.pctPrecio || 0), { size: 9 }, { numFmt: FMT.pct, alignment: { indent: 1 } });
      if (i % 2) rowCells(fr, (c) => { c.fill = solid(C.zebra); });
      hairline(fr);
      wsF.getRow(fr).height = 18;
      fr++;
    });
    if (orden.length > TOP) {
      const resto = orden.slice(TOP);
      put(`A${fr}`, '…', { size: 9, color: { argb: C.gray } }, { alignment: { indent: 1 } });
      put(`B${fr}:D${fr}`, `Otras ${resto.length} partidas`, { italic: true, color: { argb: C.gray } }, { alignment: { indent: 1 } });
      put(`E${fr}`, F(`${A.cd}-SUM(E${pFrom}:E${fr - 1})`, resto.reduce((a, x) => a + x.pt.cd, 0)), { color: { argb: C.gray } }, { numFmt: FMT_M });
      put(`F${fr}`, F(`${A.pn}-SUM(F${pFrom}:F${fr - 1})`, resto.reduce((a, x) => a + x.pt.precio, 0)), { bold: true }, { numFmt: FMT_M });
      put(`G${fr}:H${fr}`, F(`IFERROR(F${fr}/${A.pn},0)`, resto.reduce((a, x) => a + (x.pt.pctPrecio || 0), 0)), { size: 9 }, { numFmt: FMT.pct, alignment: { indent: 1 } });
      hairline(fr);
      fr++;
    }
    if (orden.length) barras(`G${pFrom}:G${fr - 1}`);
    fr++;

    // ---- Alertas ----
    section('ALERTAS DE VALIDACIÓN');
    if (r.warnings.length === 0) {
      put(`A${fr}:H${fr}`, '✔  Sin alertas: todos los ítems tienen partida, cantidad y costo.', { bold: true, color: { argb: C.okFg } }, { alignment: { indent: 1 } });
      rowCells(fr, (c) => { c.fill = solid(C.okBg); });
      wsF.getRow(fr).height = 20;
      fr++;
    } else {
      r.warnings.forEach((w) => {
        const [txt, bg, fg] = w.level === 'error' ? ['✖ Error', C.badBg, C.badFg] : (w.level === 'warn' ? ['▲ Advertencia', C.warnBg, C.warnFg] : ['Info', C.light, C.gray]);
        put(`A${fr}`, txt, { size: 9, bold: true, color: { argb: fg } }, { alignment: { indent: 1 } });
        wsF.getCell(`A${fr}`).fill = solid(bg);
        put(`B${fr}:H${fr}`, w.msg, { size: 9 }, { alignment: { indent: 1, wrapText: true } });
        hairline(fr);
        wsF.getRow(fr).height = w.msg.length > 100 ? 30 : 18;
        fr++;
      });
    }
    fr++;

    // ---- Datos del proyecto ----
    section('DATOS DEL PROYECTO');
    const idRows = [
      ['Código', p.codigo], ['Versión', p.version], ['Título', p.titulo], ['Cliente / mandante', p.cliente],
      ['ID de licitación', p.idLicitacion], ['Ubicación', p.ubicacion], ['Responsable', p.responsable], ['Fecha de formulación', p.fecha],
      ['Estado', p.estado], ['Descripción', p.descripcion],
      [copia ? 'Actualizado el' : 'Exportado el', new Date().toLocaleString('es-CL')], ['ID interno', p.uid]
    ];
    idRows.forEach(([key, v]) => {
      put(`A${fr}:B${fr}`, key, { size: 9, bold: true, color: { argb: C.gray } }, { alignment: { vertical: 'top', indent: 1 } });
      const val = v === undefined || v === null ? '' : v;
      put(`C${fr}:H${fr}`, val, { size: key === 'ID interno' ? 8 : 10, color: { argb: key === 'ID interno' ? C.gray : C.dark } },
        { alignment: { vertical: 'top', horizontal: 'left', wrapText: true } });
      const largo = String(val).length;
      if (largo > 90) wsF.getRow(fr).height = Math.min(15 * Math.ceil(largo / 90), 120);
      hairline(fr);
      fr++;
    });
    fr++;
    put(`A${fr}:H${fr}`, 'Convención de colores: azul = dato ingresado · negro = fórmula · verde = vínculo a otra hoja. Los valores se recalculan al abrir el archivo.',
      { size: 8, italic: true, color: { argb: C.gray } }, { alignment: { wrapText: true } });
    const ultimaFila = fr;

    // ---- Tarjetas de indicadores (arriba de todo) ----
    const card = (slot, top, o) => {
      const L1 = colL(1 + 2 * slot), L2 = colL(2 + 2 * slot);
      put(`${L1}${top}:${L2}${top}`, o.label.toUpperCase(), { size: 8, bold: true, color: { argb: o.dark ? C.brand : C.gray } }, { alignment: { indent: 1, vertical: 'bottom' } });
      put(`${L1}${top + 1}:${L2}${top + 1}`, o.value, { size: 18, bold: true, color: { argb: o.dark ? C.white : C.dark } }, { numFmt: o.fmt, alignment: { indent: 1, horizontal: 'left' } });
      if (o.subValue !== undefined) {
        put(`${L1}${top + 2}`, o.sub, { size: 8, color: { argb: o.dark ? C.line : C.gray } }, { alignment: { indent: 1 } });
        put(`${L2}${top + 2}`, o.subValue, { size: 9, bold: true, color: { argb: o.dark ? C.white : C.dark } }, { numFmt: o.subFmt, alignment: { horizontal: 'right', indent: 1 } });
      } else {
        put(`${L1}${top + 2}:${L2}${top + 2}`, o.sub, { size: 8, bold: true, color: { argb: C.gray } }, { alignment: { indent: 1 } });
      }
      // Relleno y bordes después de combinar: al combinar, las celdas secundarias pierden su estilo
      const bg = o.fill || (o.dark ? C.dark : C.light);
      for (let rr = top; rr <= top + 2; rr++) {
        [L1, L2].forEach((L) => {
          const c = wsF.getCell(`${L}${rr}`);
          c.fill = solid(bg);
          const b = {};
          if (rr === top) b.top = { style: 'thick', color: { argb: o.accent || C.brand } };
          if (L === L2 && slot < 3) b.right = { style: 'thick', color: { argb: C.white } };
          c.border = b;
        });
      }
      if (o.semaforo) semaforo(`${L1}${top}:${L2}${top + 2}`, o.semaforo);
    };
    const val = (key, v) => F(A[key], v);
    const evv = (key, v) => F(EV[key], v);
    [CARDS1, CARDS2].forEach((t) => { wsF.getRow(t).height = 18; wsF.getRow(t + 1).height = 32; wsF.getRow(t + 2).height = 18; });
    const evText = (key) => indicadores.find((x) => x[0] === key)[5][1];
    card(0, CARDS1, { dark: true, label: 'Precio de venta neto', value: val('pn', T.precioNeto), fmt: FMT_M, sub: 'Con IVA', subValue: val('pb', T.precioBruto), subFmt: FMT_M });
    card(1, CARDS1, { label: 'Costo total', value: val('ct', T.costoTotal), fmt: FMT_M, sub: 'Costo directo', subValue: val('cd', T.cd), subFmt: FMT_M, accent: C.gray });
    card(2, CARDS1, { label: 'Utilidad', value: val('ut', T.utilidad), fmt: FMT_M, sub: 'Recargo s/costo', subValue: val('markup', m(k.markup)), subFmt: FMT.pct });
    card(3, CARDS1, { label: 'Margen sobre venta', value: val('margen', m(k.margen)), fmt: FMT.pct, sub: evv('margen', evText('margen')), semaforo: EV.margen });
    card(0, CARDS2, { label: 'Días-hombre', value: val('dh', k.dh), fmt: fmtDH, sub: 'Utilidad por DH', subValue: val('rentDH', m(k.rentDH)), subFmt: FMT_M, accent: C.gray });
    card(1, CARDS2, { label: 'Competitividad', value: val('comp', m(k.competitividad)), fmt: FMT.pct, sub: evv('comp', evText('comp')), semaforo: EV.comp, accent: C.gray });
    card(2, CARDS2, { label: 'Utilidad si suben los costos', value: val('sensU', m(k.sensUtilidad)), fmt: FMT_M, sub: evv('sensU', evText('sensU')), semaforo: EV.sensU, accent: C.gray });
    card(3, CARDS2, {
      label: 'Alertas', value: nErr + nWarn, fmt: FMT.int, accent: C.gray,
      sub: nErr + nWarn ? `${nErr ? '✖' : '▲'} ${nErr} error(es) · ${nWarn} advertencia(s)` : '✔ Sin alertas',
      fill: nErr ? C.badBg : (nWarn ? C.warnBg : C.okBg)
    });

    // ---------------- Guía de indicadores ----------------
    styleTitle(wsG, 'GUÍA DE INDICADORES', `${ident} — Qué mide cada indicador de la Ficha y cómo se lee.`);
    wsG.columns = [{ width: 30 }, { width: 42 }, { width: 55 }, { width: 70 }, { width: 45 }];
    const hg = wsG.getRow(4); hg.values = ['Indicador', 'Fórmula', 'Qué mide', 'Cómo aporta a la evaluación', 'Cómo se lee']; styleHeader(hg);
    let gr = 5;
    [['economico', 'RESULTADO ECONÓMICO'], ['indicador', 'INDICADORES DE EVALUACIÓN']].forEach(([grupo, titulo]) => {
      wsG.getCell(`A${gr}`).value = titulo;
      wsG.getCell(`A${gr}`).font = { name: FONT, size: 10, bold: true, color: { argb: C.brand } };
      gr++;
      root.QKPIs.KPIS.filter((x) => x.grupo === grupo).forEach((x, i) => {
        const row = wsG.getRow(gr);
        row.values = [x.nombre, x.formula, x.queMide, x.aporte, x.lectura || ''];
        row.eachCell({ includeEmpty: true }, (c, ci) => {
          c.alignment = { wrapText: true, vertical: 'top' };
          c.font = { name: FONT, size: ci === 1 ? 10 : 9, bold: ci === 1, color: { argb: ci === 1 ? C.dark : C.gray } };
          if (i % 2) c.fill = solid(C.zebra);
        });
        gr++;
      });
      gr++;
    });

    // ---------------- Datos para re-importar ----------------
    const json = JSON.stringify(p);
    wsD.getCell('A1').value = root.QStore.SCHEMA;
    const CH = 30000;
    for (let i = 0, rr = 2; i < json.length; i += CH, rr++) wsD.getCell(`A${rr}`).value = json.slice(i, i + CH);

    [wsF, wsPar, wsP, wsM, wsE, wsH, wsO, wsG].forEach(baseFont);
    // Filas alternadas en las tablas de detalle (sin tapar los rellenos de aviso)
    [[wsP, pEnd, 17], [wsM, mEnd, 8], [wsE, eEnd, 8], [wsH, hEnd, 13], [wsO, oEnd, 8]].forEach(([ws, end, nc]) => {
      for (let rr = 5; rr <= end; rr++) {
        for (let ci = 1; ci <= nc; ci++) {
          const c = ws.getRow(rr).getCell(ci);
          if ((rr - 5) % 2 && !c.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
          c.border = { bottom: { style: 'hair', color: { argb: C.line } } };
        }
      }
    });
    [wsP, wsM, wsE, wsH, wsO, wsPar, wsG].forEach((ws) => {
      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
      ws.headerFooter = { oddFooter: `&L${p.codigo} v${p.version}&RPágina &P de &N` };
    });
    wsF.pageSetup = {
      orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, horizontalCentered: true,
      printArea: `A1:H${ultimaFila}`, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 }
    };
    wsF.headerFooter = { oddFooter: `&L&8${p.codigo} v${p.version}&R&8Página &P de &N` };

    const buf = await wb.xlsx.writeBuffer();
    if (opts && opts.soloDatos) return buf;
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase(p) + '.xlsx');
    return null;
  }

  // =====================================================================
  //  EXPORTAR CARTERA (listado de proyectos con KPIs)
  // =====================================================================
  async function exportPortfolio(projects) {
    const ExcelJS = await ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'QUEMPIN · Formulación de proyectos';
    const ws = wb.addWorksheet('Cartera', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
    styleTitle(ws, 'CARTERA DE PROYECTOS FORMULADOS', `Exportado el ${new Date().toLocaleString('es-CL')} · ${projects.length} proyecto(s)`, 21);
    const cols = [
      ['Código', 16], ['Versión', 8], ['Título', 40], ['Cliente', 24], ['Ubicación', 16], ['Responsable', 20], ['Fecha', 12], ['Estado', 13],
      ['Costo directo', 15], ['Costo total', 15], ['Utilidad', 15], ['Precio neto', 15], ['Precio bruto', 15],
      ['Margen', 9], ['Markup', 9], ['Días-Hombre', 10], ['Utilidad / DH', 13], ['Incidencia MO', 11], ['Competitividad', 12], ['Alertas', 8], ['Modificado', 18]
    ];
    ws.columns = cols.map(([, w]) => ({ width: w }));
    const h = ws.getRow(3); h.values = cols.map(([n]) => n); styleHeader(h);
    projects.forEach((p, i) => {
      const r = root.QCalc.computeProject(p);
      const t = r.totals, k = r.kpis;
      const row = ws.getRow(4 + i);
      row.values = [p.codigo, p.version, p.titulo, p.cliente, p.ubicacion, p.responsable, p.fecha, p.estado,
        t.cd, t.costoTotal, t.utilidad, t.precioNeto, t.precioBruto,
        k.margen || 0, k.markup || 0, k.dh, k.rentDH || 0, k.incidenciaMO || 0, k.competitividad === null ? '' : k.competitividad,
        r.warnings.filter((w) => w.level !== 'info').length, p.modificado ? new Date(p.modificado).toLocaleString('es-CL') : ''];
      [9, 10, 11, 12, 13, 17].forEach((c) => { row.getCell(c).numFmt = fmtMoneda(p); });
      [14, 15, 18, 19].forEach((c) => { row.getCell(c).numFmt = FMT.pct; });
      row.getCell(16).numFmt = FMT.num;
    });
    ws.autoFilter = { from: 'A3', to: `${colL(cols.length)}3` };
    baseFont(ws);
    const buf = await wb.xlsx.writeBuffer();
    const d = new Date();
    download(new Blob([buf]), `Cartera-proyectos-QUEMPIN_${d.toISOString().slice(0, 10)}.xlsx`);
  }

  // =====================================================================
  //  IMPORTAR
  // =====================================================================
  function cellValue(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if ('error' in v) return null;
      if ('result' in v) return (v.result && typeof v.result === 'object' && 'error' in v.result) ? null : v.result;
      if ('formula' in v || 'sharedFormula' in v) return null;
      if (v.richText) return v.richText.map((t) => t.text).join('');
      if ('text' in v) return v.text;
      return null;
    }
    return v;
  }
  const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  /* Importa un archivo; devuelve { proyectos: [...], informe: [líneas] } */
  async function importFile(file) {
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'json') {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data.proyectos) ? data.proyectos : [data];
      if (!list.every((x) => x && (x.partidas || x.codigo))) throw new Error('El JSON no corresponde a un proyecto de esta herramienta.');
      return { proyectos: list.map(root.QStore.normalize), informe: [`${list.length} proyecto(s) leídos desde ${name}.`] };
    }
    if (ext !== 'xlsx' && ext !== 'xlsm') throw new Error('Formato no soportado. Usa .json, .xlsx o .xlsm.');
    const ExcelJS = await ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());

    const datos = wb.getWorksheet('_datos');
    if (datos) {
      let json = '';
      for (let rr = 2; rr <= datos.rowCount; rr++) json += str(cellValue(datos.getCell(`A${rr}`).value));
      const p = root.QStore.normalize(JSON.parse(json));
      return { proyectos: [p], informe: [`Proyecto ${p.codigo} v${p.version} recuperado desde ${name}.`] };
    }
    if (wb.getWorksheet('Costos') && wb.getWorksheet('Resumen')) return importLegacy(wb, name);
    throw new Error('El Excel no tiene el formato de la herramienta ni el del Excel QUEMPIN original (hojas Costos y Resumen).');
  }

  /* Identificador del proyecto de un Excel exportado por la herramienta (hoja oculta _datos), o
     null si el archivo no es de la herramienta. Así se sabe de quién es un Excel antes de reemplazarlo. */
  async function uidDeExcel(buf) {
    const ExcelJS = await ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf); } catch (e) { return null; }
    const datos = wb.getWorksheet('_datos');
    if (!datos) return null;
    let json = '';
    for (let rr = 2; rr <= datos.rowCount; rr++) json += str(cellValue(datos.getCell(`A${rr}`).value));
    try { const p = JSON.parse(json); return p && typeof p.uid === 'string' ? p.uid : null; } catch (e) { return null; }
  }

  function importLegacy(wb, fileName) {
    const S = root.QStore;
    const cs = wb.getWorksheet('Costos');
    const rs = wb.getWorksheet('Resumen');
    const ref = wb.getWorksheet('Referencias');
    const v = (ws, addr) => (ws ? cellValue(ws.getCell(addr).value) : null);
    const informe = [];

    const titulo = str(v(cs, 'B1'));
    const resp = str(v(cs, 'C2'));
    const p = S.newProject({
      titulo: titulo && titulo !== 'TÍTULO DEL PROYECTO' ? titulo : fileName.replace(/\.[^.]+$/, ''),
      responsable: resp && resp !== 'NOMBRE DEL RESPONSABLE' ? resp : S.getConfig().responsable,
      descripcion: `Importado desde el Excel "${fileName}" el ${new Date().toLocaleDateString('es-CL')}.`
    });
    if (ref) {
      const t1 = numOrNull(v(ref, 'B3')), t2 = numOrNull(v(ref, 'B4')), t3 = numOrNull(v(ref, 'B5'));
      if (t1 !== null) p.parametros.tarifaN1 = t1;
      if (t2 !== null) p.parametros.tarifaN2 = t2;
      if (t3 !== null) p.parametros.tarifaN3 = t3;
      const cat = [];
      for (let rr = 9; rr <= Math.max(ref.rowCount, 9); rr++) {
        const d = str(v(ref, `A${rr}`));
        const c = numOrNull(v(ref, `B${rr}`));
        if (d && c !== null) cat.push({ descripcion: d, unidad: /km/i.test(d) ? 'km' : (/noche/i.test(d) ? 'noche' : 'día'), costoUnitario: c });
      }
      if (cat.length) p.catalogoOtros = cat;
    }
    const iva = numOrNull(v(rs, 'F4'));
    if (iva !== null) p.parametros.iva = iva <= 1 ? iva * 100 : iva;
    const pres = numOrNull(v(rs, 'G6'));
    if (pres) p.parametros.presupuestoMaximo = pres;
    p.parametros.gastosGenerales = 0;
    p.parametros.imprevistos = 0;

    const last = Math.min(cs.rowCount, 1000);
    const codeToUid = {};
    // Partidas: la utilidad está en Resumen!I(fila+4), igual que INDEX(ListaPartidas, …)
    for (let rr = 6; rr <= last; rr++) {
      const desc = str(v(cs, `B${rr}`));
      if (!desc) continue;
      const code = str(v(cs, `A${rr}`)) || `P${rr - 5}`;
      const u = root.QCalc.parseUtilidadExcel(v(rs, `I${rr + 4}`));
      const pt = S.newPartida();
      Object.assign(pt, {
        descripcion: desc, unidad: str(v(cs, `C${rr}`)) || 'Un.', cantidad: numOrNull(v(cs, `D${rr}`)) || 0,
        utilidadTipo: u.tipo, utilidadValor: u.valor
      });
      if (u.nota) informe.push(`Utilidad de ${code}: ${u.nota}.`);
      codeToUid[code] = pt.uid;
      p.partidas.push(pt);
    }
    const partidaDe = (raw, etiqueta) => {
      const c = str(raw);
      if (!c) return '';
      if (codeToUid[c]) return codeToUid[c];
      informe.push(`${etiqueta}: la partida "${c}" no existe; quedó sin partida.`);
      return '';
    };
    for (let rr = 6; rr <= last; rr++) {
      // Materiales E:K
      const mDesc = str(v(cs, `F${rr}`));
      const mCant = numOrNull(v(cs, `I${rr}`)), mCost = numOrNull(v(cs, `J${rr}`));
      if (mDesc || (mCant && mCost)) {
        const it = S.newMaterial();
        Object.assign(it, { descripcion: mDesc, partida: partidaDe(v(cs, `G${rr}`), `Material fila ${rr}`), unidad: str(v(cs, `H${rr}`)) || 'Un.', cantidad: mCant || 0, costoUnitario: mCost || 0 });
        p.materiales.push(it);
      }
      // Equipos L:Q
      const eDesc = str(v(cs, `M${rr}`));
      const eCant = numOrNull(v(cs, `O${rr}`)), eCost = numOrNull(v(cs, `P${rr}`));
      if (eDesc || (eCant && eCost)) {
        const it = S.newEquipo();
        Object.assign(it, { descripcion: eDesc, partida: partidaDe(v(cs, `N${rr}`), `Equipo fila ${rr}`), unidad: '', cantidad: eCant || 0, costoUnitario: eCost || 0 });
        p.equipos.push(it);
      }
      // Mano de obra R:AB
      const hDesc = str(v(cs, `S${rr}`));
      const niveles = ['U', 'V', 'W', 'X', 'Y', 'Z'].map((L) => numOrNull(v(cs, `${L}${rr}`)) || 0);
      if (hDesc || niveles.some((n) => n)) {
        const it = S.newManoObra();
        Object.assign(it, {
          descripcion: hDesc, partida: partidaDe(v(cs, `T${rr}`), `Mano de obra fila ${rr}`),
          n1p: niveles[0], n1d: niveles[1], n2p: niveles[2], n2d: niveles[3], n3p: niveles[4], n3d: niveles[5]
        });
        p.manoObra.push(it);
      }
      // Otros AC:AH
      const oDesc = str(v(cs, `AD${rr}`));
      const oCant = numOrNull(v(cs, `AF${rr}`)), oCost = numOrNull(v(cs, `AG${rr}`));
      if (oDesc || (oCant && oCost)) {
        const it = S.newOtro();
        const catMatch = (p.catalogoOtros || []).find((c) => c.descripcion.toLowerCase() === oDesc.toLowerCase());
        Object.assign(it, { descripcion: oDesc, partida: partidaDe(v(cs, `AE${rr}`), `Otro fila ${rr}`), unidad: catMatch ? catMatch.unidad : 'Un.', cantidad: oCant || 0, costoUnitario: oCost || 0 });
        p.otros.push(it);
      }
    }

    // Verificación contra los totales guardados en el Excel
    const r = root.QCalc.computeProject(p);
    const fmt = (n) => '$' + Math.round(n).toLocaleString('es-CL');
    const excelCD = numOrNull(v(rs, 'G210')) ?? numOrNull(v(rs, 'G1'));
    const excelPN = numOrNull(v(rs, 'K210')) ?? numOrNull(v(rs, 'G3'));
    informe.unshift(`${p.partidas.length} partidas, ${p.materiales.length} materiales, ${p.equipos.length} equipos, ${p.manoObra.length} tareas de MO y ${p.otros.length} otros costos importados.`);
    if (excelCD !== null) {
      const ok = Math.abs(excelCD - r.totals.cd) < 1;
      informe.push(`Costo directo — Excel: ${fmt(excelCD)} · Herramienta: ${fmt(r.totals.cd)} ${ok ? '✔ coincide' : '✖ difiere (revisa las alertas)'}.`);
    }
    if (excelPN !== null) {
      const ok = Math.abs(excelPN - r.totals.precioNeto) < 1;
      informe.push(`Precio neto — Excel: ${fmt(excelPN)} · Herramienta: ${fmt(r.totals.precioNeto)} ${ok ? '✔ coincide' : '✖ difiere (revisa las alertas)'}.`);
    }
    return { proyectos: [p], informe };
  }

  const api = { ensureExcelJS, exportProject, exportPortfolio, importFile, uidDeExcel, downloadJSON, fileBase, slug };
  root.QExcel = api;
})(typeof window !== 'undefined' ? window : globalThis);
