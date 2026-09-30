/*
 * excel.js — Exportación e importación de proyectos.
 *
 * Exportar proyecto (.xlsx): hojas Ficha, Partidas, Materiales, Equipos, Mano de obra,
 * Otros y Parámetros, con fórmulas vivas (el Excel recalcula si se editan valores) y
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
    line: 'FFD9D9DA', input: 'FF0000FF', link: 'FF008000', white: 'FFFFFFFF'
  };
  const FMT = {
    clp: '"$"#,##0;-"$"#,##0;"-"',
    pct: '0.0%;-0.0%;"-"',
    num: '#,##0.##;-#,##0.##;"-"',
    int: '#,##0;-#,##0;"-"'
  };

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
    return `${p.codigo || 'SIN-CODIGO'}_v${p.version || 1}_${slug(p.titulo)}`;
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
  /* Genera el Excel del proyecto y lo descarga; con opts.soloDatos devuelve el archivo (ArrayBuffer) sin descargarlo. */
  async function exportProject(p, opts) {
    const ExcelJS = await ensureExcelJS();
    const r = root.QCalc.computeProject(p);
    const par = p.parametros;
    const num = root.QCalc.num;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'QUEMPIN · Formulación de proyectos';
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
    const wsD = wb.addWorksheet('_datos', { state: 'hidden' });
    const ident = `${p.codigo} · v${p.version} · ${p.titulo || 'Sin título'}`;

    // ---------------- Parámetros ----------------
    styleTitle(wsPar, 'PARÁMETROS DEL PROYECTO', ident, 3);
    wsPar.columns = [{ width: 42 }, { width: 18 }, { width: 70 }];
    const hp = wsPar.getRow(3); hp.values = ['Parámetro', 'Valor', 'Nota']; styleHeader(hp);
    const PR = {}; // dirección de cada parámetro
    const params = [
      ['iva', 'IVA', num(par.iva) / 100, FMT.pct, 'Tasa de IVA vigente.'],
      ['gg', 'Gastos generales (% del costo directo)', num(par.gastosGenerales) / 100, FMT.pct, 'Estructura de la empresa asignada al proyecto. 0 % = igual al Excel original.'],
      ['imp', 'Imprevistos (% del costo directo)', num(par.imprevistos) / 100, FMT.pct, 'Reserva para riesgos. 0 % = igual al Excel original.'],
      ['t1', 'Tarifa día-hombre Nivel 1', num(par.tarifaN1), FMT.clp, 'Costo empresa por día de una persona de nivel 1.'],
      ['t2', 'Tarifa día-hombre Nivel 2', num(par.tarifaN2), FMT.clp, 'Costo empresa por día de una persona de nivel 2.'],
      ['t3', 'Tarifa día-hombre Nivel 3', num(par.tarifaN3), FMT.clp, 'Costo empresa por día de una persona de nivel 3.'],
      ['pres', 'Presupuesto máximo del mandante', num(par.presupuestoMaximo), FMT.clp, 'Dejar en 0 si no se conoce.'],
      ['presIva', 'Presupuesto incluye IVA (Sí/No)', par.presupuestoIncluyeIva ? 'Sí' : 'No', null, 'Define si la competitividad se mide con precio bruto o neto.'],
      ['mObj', 'Margen objetivo', num(par.margenObjetivo) / 100, FMT.pct, 'Sobre este margen el semáforo queda en verde.'],
      ['mMin', 'Margen mínimo', num(par.margenMinimo) / 100, FMT.pct, 'Bajo este margen el semáforo queda en rojo.'],
      ['metaDH', 'Meta de utilidad por día-hombre', num(par.metaUtilidadDH), FMT.clp, '0 = sin meta.'],
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
      const c = wsPar.getCell(`B${rc}`); c.value = num(it.costoUnitario); input(c, FMT.clp);
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

    styleTitle(wsP, 'PARTIDAS Y RESUMEN DE COSTOS', `${ident} — Las cantidades de detalle se ingresan por unidad de partida.`, 17);
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
      link(row.getCell(5), FMT.clp); row.getCell(5).value = F(`SUMIF(${S.M}!$C$5:$C$${mEnd},A${rr},${S.M}!$H$5:$H$${mEnd})`, pt.mat);
      link(row.getCell(6), FMT.clp); row.getCell(6).value = F(`SUMIF(${S.E}!$C$5:$C$${eEnd},A${rr},${S.E}!$H$5:$H$${eEnd})`, pt.eq);
      link(row.getCell(7), FMT.clp); row.getCell(7).value = F(`SUMIF(${S.H}!$C$5:$C$${hEnd},A${rr},${S.H}!$M$5:$M$${hEnd})`, pt.mo);
      link(row.getCell(8), FMT.clp); row.getCell(8).value = F(`SUMIF(${S.O}!$C$5:$C$${oEnd},A${rr},${S.O}!$H$5:$H$${oEnd})`, pt.otros);
      calc(row.getCell(9), FMT.clp); row.getCell(9).value = F(`SUM(E${rr}:H${rr})`, pt.cd);
      link(row.getCell(10), FMT.num); row.getCell(10).value = F(`SUMIF(${S.H}!$C$5:$C$${hEnd},A${rr},${S.H}!$L$5:$L$${hEnd})`, pt.dh);
      row.getCell(11).value = pt.utilidadTipo === 'monto' ? '$' : '%';
      row.getCell(11).alignment = { horizontal: 'center' };
      input(row.getCell(11));
      if (pt.utilidadTipo === 'monto') { row.getCell(12).value = pt.utilidadValor; input(row.getCell(12), FMT.clp); }
      else { row.getCell(12).value = pt.utilidadValor / 100; input(row.getCell(12), FMT.pct); }
      calc(row.getCell(13), FMT.clp); row.getCell(13).value = F(`IF(K${rr}="%",I${rr}*L${rr},L${rr})`, pt.utilidad);
      calc(row.getCell(14), FMT.clp); row.getCell(14).value = F(`I${rr}*(${PR.gg}+${PR.imp})`, pt.ggimp);
      calc(row.getCell(15), FMT.clp); row.getCell(15).value = F(`I${rr}+M${rr}+N${rr}`, pt.precio);
      calc(row.getCell(16), FMT.clp); row.getCell(16).value = F(`IFERROR(O${rr}/D${rr},0)`, pt.pu || 0);
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
    Object.keys(totCols).forEach((ci) => { tP.getCell(+ci).numFmt = +ci === 10 ? FMT.num : FMT.clp; });
    tP.getCell(17).value = F(`IFERROR(O${pTot}/$O$${pTot},0)`, T.precioNeto ? 1 : 0); tP.getCell(17).numFmt = FMT.pct;
    const PT = (L) => `Partidas!$${L}$${pTot}`;

    // ---------------- Detalle: Materiales / Equipos / Otros ----------------
    const qtyFormula = (rr) => `IFERROR(INDEX(${S.P}!$D$5:$D$${pEnd},MATCH(C${rr},${S.P}!$A$5:$A$${pEnd},0)),0)`;
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
        input(row.getCell(6), FMT.clp); row.getCell(6).value = num(it.costoUnitario);
        link(row.getCell(7), FMT.num); row.getCell(7).value = F(qtyFormula(rr), ln.qtyPartida);
        calc(row.getCell(8), FMT.clp); row.getCell(8).value = F(`G${rr}*E${rr}*F${rr}`, ln.subtotal);
        if (!ln.partidaCode) {
          row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2DD' } };
          row.getCell(3).note = 'Sin partida asociada: este ítem no suma al costo.';
        }
      });
      const tot = ws.getRow(end + 1);
      tot.getCell(2).value = 'TOTAL';
      tot.getCell(8).value = F(`SUM(H5:H${end})`, lines.reduce((a, l) => a + l.subtotal, 0));
      styleTotal(tot); tot.getCell(8).numFmt = FMT.clp;
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
      calc(row.getCell(13), FMT.clp);
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
    styleTotal(tH); tH.getCell(12).numFmt = FMT.num; tH.getCell(13).numFmt = FMT.clp;

    // ---------------- Ficha ----------------
    wsF.columns = [{ width: 36 }, { width: 20 }, { width: 26 }, { width: 46 }, { width: 90 }];
    // Encabezado: logo oficial en la columna A (170 px ≈ 4,5 cm, sobre el mínimo de 4 cm del manual)
    for (let rr = 1; rr <= 7; rr++) wsF.getRow(rr).height = 20;
    const logo = logoOficial();
    if (logo) {
      const imgId = wb.addImage({ base64: logo.png, extension: 'png' });
      wsF.addImage(imgId, { tl: { col: 0.12, row: 0.35 }, ext: { width: 170, height: Math.round(170 * logo.alto / logo.ancho) } });
    }
    const head = [
      ['B2', 'FORMULACIÓN DE PROYECTO', { size: 16, bold: true, color: { argb: C.dark } }],
      ['B3', `${p.codigo} · versión ${p.version}`, { size: 12, bold: true, color: { argb: C.brand } }],
      ['B4', p.titulo || 'Sin título', { size: 11, bold: true, color: { argb: C.dark } }],
      ['B5', [p.cliente, p.ubicacion, p.responsable, p.fecha, p.estado].filter(Boolean).join(' · '), { size: 9, color: { argb: C.gray } }]
    ];
    head.forEach(([addr, val, font]) => {
      const r0 = addr.slice(1);
      wsF.mergeCells(`B${r0}:E${r0}`);
      wsF.getCell(addr).value = val;
      wsF.getCell(addr).font = Object.assign({ name: FONT }, font);
      wsF.getCell(addr).alignment = { vertical: 'middle' };
    });
    for (let ci = 1; ci <= 5; ci++) wsF.getRow(7).getCell(ci).border = { bottom: { style: 'medium', color: { argb: C.brand } } };

    let fr = 9;
    const section = (text) => {
      const c = wsF.getCell(`A${fr}`);
      c.value = text;
      c.font = { name: FONT, size: 11, bold: true, color: { argb: C.brand } };
      wsF.getRow(fr).border = {};
      for (let ci = 1; ci <= 5; ci++) wsF.getRow(fr).getCell(ci).border = { bottom: { style: 'thin', color: { argb: C.brand } } };
      fr++;
    };
    section('IDENTIFICACIÓN DEL PROYECTO');
    const idRows = [
      ['Código', p.codigo], ['Versión', p.version], ['Título', p.titulo], ['Cliente / mandante', p.cliente],
      ['Ubicación', p.ubicacion], ['Responsable', p.responsable], ['Fecha de formulación', p.fecha],
      ['Estado', p.estado], ['Descripción', p.descripcion],
      ['Exportado el', new Date().toLocaleString('es-CL')], ['ID interno', p.uid]
    ];
    idRows.forEach(([k, v]) => {
      wsF.getCell(`A${fr}`).value = k;
      wsF.getCell(`A${fr}`).font = { name: FONT, size: 10, bold: true, color: { argb: C.gray } };
      wsF.mergeCells(`B${fr}:E${fr}`);
      wsF.getCell(`B${fr}`).value = v === undefined || v === null ? '' : v;
      wsF.getCell(`B${fr}`).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
      fr++;
    });
    fr++;

    const K = root.QKPIs.byKey;
    const kpiHeader = () => {
      const h = wsF.getRow(fr);
      h.values = ['Indicador', 'Valor', 'Evaluación', 'Fórmula', 'Qué mide y cómo aporta a la evaluación'];
      styleHeader(h); fr++;
    };
    const A = {}; // dirección de cada resultado en Ficha
    const kpiRow = (key, label, formula, result, fmt, evalFormula, formulaText, desc) => {
      const row = wsF.getRow(fr);
      row.getCell(1).value = label;
      row.getCell(1).font = { name: FONT, size: 10, bold: true };
      row.getCell(2).value = F(formula, result);
      calc(row.getCell(2), fmt);
      row.getCell(2).font = { name: FONT, size: 10, bold: true };
      if (evalFormula) { row.getCell(3).value = F(evalFormula, ''); }
      row.getCell(4).value = formulaText || '';
      row.getCell(5).value = desc || '';
      [3, 4, 5].forEach((ci) => {
        row.getCell(ci).alignment = { wrapText: true, vertical: 'top' };
        row.getCell(ci).font = { name: FONT, size: 9, color: { argb: C.gray } };
      });
      row.getCell(1).alignment = { vertical: 'top' }; row.getCell(2).alignment = { vertical: 'top' };
      A[key] = `$B$${fr}`;
      fr++;
    };
    const txt = (k) => (K[k] ? `${K[k].queMide} ${K[k].aporte}` : '');

    section('RESULTADO ECONÓMICO');
    kpiHeader();
    kpiRow('mat', 'Materiales', PT('E'), T.mat, FMT.clp, null, 'Σ subtotales de materiales', '');
    kpiRow('eq', 'Equipos', PT('F'), T.eq, FMT.clp, null, 'Σ subtotales de equipos', '');
    kpiRow('mo', 'Mano de obra', PT('G'), T.mo, FMT.clp, null, 'Σ subtotales de mano de obra', '');
    kpiRow('ot', 'Otros', PT('H'), T.otros, FMT.clp, null, 'Σ subtotales de otros', '');
    kpiRow('cd', 'Costo directo', PT('I'), T.cd, FMT.clp, null, K.cd.formula, txt('cd'));
    kpiRow('gg', 'Gastos generales', `${A.cd}*${PR.gg}`, T.gg, FMT.clp, null, 'Costo directo × % GG', '');
    kpiRow('imp', 'Imprevistos', `${A.cd}*${PR.imp}`, T.imp, FMT.clp, null, 'Costo directo × % imprevistos', '');
    kpiRow('ct', 'Costo total', `${A.cd}+${A.gg}+${A.imp}`, T.costoTotal, FMT.clp, null, K.costoTotal.formula, txt('costoTotal'));
    kpiRow('ut', 'Utilidad', PT('M'), T.utilidad, FMT.clp, null, K.utilidad.formula, txt('utilidad'));
    kpiRow('pn', 'Precio de venta neto', `${A.ct}+${A.ut}`, T.precioNeto, FMT.clp, null, K.precioNeto.formula, txt('precioNeto'));
    kpiRow('iva', 'IVA', `${A.pn}*${PR.iva}`, T.iva, FMT.clp, null, K.iva.formula, txt('iva'));
    kpiRow('pb', 'Precio de venta bruto', `${A.pn}+${A.iva}`, T.precioBruto, FMT.clp, null, K.precioBruto.formula, txt('precioBruto'));
    fr++;

    section('INDICADORES DE EVALUACIÓN');
    kpiHeader();
    const k = r.kpis;
    kpiRow('margen', 'Margen sobre venta', `IFERROR(${A.ut}/${A.pn},0)`, k.margen, FMT.pct,
      `IF(${A.pn}=0,"—",IF(${A.ut}/${A.pn}>=${PR.mObj},"✔ Sobre el objetivo",IF(${A.ut}/${A.pn}>=${PR.mMin},"▲ Entre mínimo y objetivo","✖ Bajo el mínimo")))`,
      K.margen.formula, txt('margen'));
    kpiRow('markup', 'Recargo sobre costo (markup)', `IFERROR(${A.ut}/${A.ct},0)`, k.markup, FMT.pct, null, K.markup.formula, txt('markup'));
    kpiRow('dh', 'Días-Hombre de ejecución', PT('J'), k.dh, FMT.num, null, K.dh.formula, txt('dh'));
    kpiRow('rentDH', 'Utilidad por día-hombre', `IFERROR(${A.ut}/${A.dh},0)`, k.rentDH, FMT.clp,
      `IF(${PR.metaDH}<=0,"Sin meta definida",IF(IFERROR(${A.ut}/${A.dh},0)>=${PR.metaDH},"✔ Cumple la meta","✖ Bajo la meta"))`,
      K.rentDH.formula, txt('rentDH'));
    kpiRow('incMO', 'Incidencia de MO sobre venta', `IFERROR(${A.mo}/${A.pn},0)`, k.incidenciaMO, FMT.pct, null, K.incidenciaMO.formula, txt('incidenciaMO'));
    kpiRow('holMO', 'Holgura de mano de obra', `IFERROR(${A.ut}/${A.mo},0)`, k.holguraMO, FMT.pct, null, K.holguraMO.formula, txt('holguraMO'));
    const deltaF = `(${A.mat}*${PR.sMat}+${A.eq}*${PR.sEq}+${A.mo}*${PR.sMo}+${A.ot}*${PR.sOt})`;
    kpiRow('sens', 'Sensibilidad de la utilidad', `IFERROR(-${deltaF}/${A.ut},0)`, k.sensVarUtilidad, FMT.pct, null, K.sensibilidad.formula, txt('sensibilidad'));
    kpiRow('sensU', '   Utilidad en el escenario', `${A.ut}-${deltaF}`, k.sensUtilidad, FMT.clp,
      `IF(${A.ut}-${deltaF}<0,"✖ El escenario genera pérdida",IF(IFERROR((${A.ut}-${deltaF})/${A.pn},0)<${PR.mMin},"▲ Margen bajo el mínimo","✔ Resiste el escenario"))`,
      'Utilidad − Σ(costo × variación)', 'Variaciones simuladas definidas en la hoja Parámetros.');
    kpiRow('sensM', '   Margen en el escenario', `IFERROR((${A.ut}-${deltaF})/${A.pn},0)`, k.sensMargen, FMT.pct, null, 'Utilidad escenario ÷ Precio neto', '');
    const compF = `IF(${PR.pres}>0,IF(${PR.presIva}="Sí",${A.pb},${A.pn})/${PR.pres},0)`;
    kpiRow('comp', 'Competitividad de la oferta', compF, k.competitividad || 0, FMT.pct,
      `IF(${PR.pres}<=0,"Sin presupuesto informado",IF(${compF}>1,"✖ Excede el presupuesto",IF(${compF}>=${PR.ajust},"▲ Oferta ajustada","✔ Con holgura")))`,
      K.competitividad.formula, txt('competitividad'));
    fr++;

    section('ALERTAS DE VALIDACIÓN');
    if (r.warnings.length === 0) {
      wsF.getCell(`A${fr}`).value = 'Sin alertas.'; fr++;
    } else {
      r.warnings.forEach((w) => {
        wsF.getCell(`A${fr}`).value = w.level === 'error' ? 'Error' : (w.level === 'warn' ? 'Advertencia' : 'Info');
        wsF.getCell(`A${fr}`).font = { name: FONT, size: 10, bold: true, color: { argb: w.level === 'error' ? 'FFC62828' : 'FF9A6700' } };
        wsF.mergeCells(`B${fr}:E${fr}`);
        wsF.getCell(`B${fr}`).value = w.msg;
        fr++;
      });
    }
    fr++;
    wsF.getCell(`A${fr}`).value = 'Convención de colores: azul = dato ingresado · negro = fórmula · verde = vínculo a otra hoja. Los valores se recalculan al abrir el archivo.';
    wsF.getCell(`A${fr}`).font = { name: FONT, size: 8, italic: true, color: { argb: C.gray } };

    // ---------------- Datos para re-importar ----------------
    const json = JSON.stringify(p);
    wsD.getCell('A1').value = root.QStore.SCHEMA;
    const CH = 30000;
    for (let i = 0, rr = 2; i < json.length; i += CH, rr++) wsD.getCell(`A${rr}`).value = json.slice(i, i + CH);

    [wsF, wsPar, wsP, wsM, wsE, wsH, wsO].forEach(baseFont);
    [wsP, wsM, wsE, wsH, wsO, wsPar].forEach((ws) => {
      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
      ws.headerFooter = { oddFooter: `&L${p.codigo} v${p.version}&RPágina &P de &N` };
    });
    wsF.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

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
      [9, 10, 11, 12, 13, 17].forEach((c) => { row.getCell(c).numFmt = FMT.clp; });
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

  const api = { ensureExcelJS, exportProject, exportPortfolio, importFile, downloadJSON, fileBase, slug };
  root.QExcel = api;
})(typeof window !== 'undefined' ? window : globalThis);
