/*
 * excel.js — La Carta Gantt en Excel (2026-10-20). Hasta entonces era la hoja «Carta Gantt» del Excel del
 * Formulador (js/excel.js); desde que la Carta Gantt es una herramienta aparte, se descarga sola desde aquí.
 *
 * La misma grilla que la hoja «Carta Gantt» de las planillas .xlsm del equipo: una columna por día (o por
 * semana si el plazo pasa de 10 semanas), pintada donde trabaja cada tarea; en naranja la ruta crítica. Las
 * fechas son las calculadas por la herramienta (gantt/gantt.js). Una segunda hoja oculta guarda la carta en
 * JSON, por si hay que recuperarla.
 */
(function (root) {
  'use strict';

  const LOCAL_LIB = '../vendor/exceljs.min.js';
  const CDN_LIB = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  // Manual de Marca QUEMPIN: Lato para documentos; Orange 021 C #FF5100, Black C, Cool Gray 11 C.
  const FONT = 'Lato';
  const C = { brand: 'FFFF5100', dark: 'FF000000', gray: 'FF54565A', light: 'FFF4F4F4', line: 'FFD9D9DA', white: 'FFFFFFFF' };

  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = mal;
      document.head.appendChild(s);
    });
  }
  let cargando = null;
  function exceljs() {
    if (root.ExcelJS) return Promise.resolve(root.ExcelJS);
    if (!cargando) {
      cargando = cargarScript(LOCAL_LIB).catch(() => cargarScript(CDN_LIB)).then(() => root.ExcelJS)
        .catch(() => { cargando = null; throw new Error('No se pudo cargar la librería ExcelJS.'); });
    }
    return cargando;
  }
  const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  function encabezado(row) {
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
      cell.fill = solid(C.dark);
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: C.brand } } };
    });
    row.height = 30;
  }

  /* c: la carta (gantt/datos.js); info: { titulo, ident, codigos: Map uid de partida -> código, hoy }.
     Devuelve el ArrayBuffer del .xlsx. */
  async function libro(c, info) {
    const ExcelJS = await exceljs();
    const QG = root.QGantt;
    const g = c.gantt;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'QUEMPIN · Carta Gantt';
    wb.title = info.titulo;
    wb.created = new Date();
    const ws = wb.addWorksheet('Carta Gantt', { properties: { tabColor: { argb: C.brand } }, views: [{ state: 'frozen', xSplit: 2, ySplit: 4, showGridLines: false }] });
    const res = QG.calcular(g, info.hoy);
    const nums = new Map(g.tareas.map((tg, i) => [tg.uid, i + 1]));
    const habiles = res.calendario.habiles;
    const DIAMS = 86400000;
    const fecha = (d) => new Date(d * DIAMS);
    ws.getCell('A1').value = 'CARTA GANTT';
    ws.getCell('A1').font = { name: FONT, size: 14, bold: true, color: { argb: C.dark } };
    ws.getCell('A2').value = `${info.ident} — Inicio ${QG.fechaCorta(res.inicio)} · Término ${QG.fechaCorta(res.termino)} · Plazo ${res.plazoLaborable} ${habiles ? `días hábiles (${res.plazoCorrido} corridos)` : 'días corridos'}`;
    ws.getCell('A2').font = { name: FONT, size: 9, italic: true, color: { argb: C.gray } };
    ws.getRow(1).height = 22;
    const porSemana = res.termino - res.inicio + 1 > 70;
    const paso = porSemana ? 7 : 1;
    const d0 = porSemana ? res.inicio - ((fecha(res.inicio).getUTCDay() + 6) % 7) : res.inicio;
    const nCols = Math.max(1, Math.ceil((res.termino + 1 - d0) / paso));
    const fijas = ['N°', 'Tarea', 'Partida', 'Responsable', 'Días', 'Predecesoras', 'Inicio', 'Término', 'Avance'];
    const nF = fijas.length;
    ws.columns = [5, 40, 8, 16, 7, 13, 11, 11, 8].map((w) => ({ width: w })).concat(Array.from({ length: nCols }, () => ({ width: porSemana ? 4.6 : 3.4 })));
    const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    let mesAnterior = -1;
    for (let j = 0; j < nCols; j++) {
      const f = fecha(d0 + j * paso);
      if (f.getUTCMonth() !== mesAnterior) {
        const cel = ws.getRow(3).getCell(nF + 1 + j);
        cel.value = `${MES[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
        cel.font = { name: FONT, size: 9, bold: true, color: { argb: C.dark } };
        mesAnterior = f.getUTCMonth();
      }
    }
    const cab = ws.getRow(4);
    cab.values = fijas.concat(Array.from({ length: nCols }, (_, j) => fecha(d0 + j * paso).getUTCDate()));
    encabezado(cab);
    for (let j = 0; j < nCols; j++) cab.getCell(nF + 1 + j).font = { name: FONT, size: 8, bold: true, color: { argb: C.white } };
    res.tareas.forEach((tg, i) => {
      const row = ws.getRow(5 + i);
      row.values = [tg.n, tg.nombre || 'Sin nombre', tg.partida ? (info.codigos.get(tg.partida) || '') : '', tg.responsable || '', tg.hito ? 'hito' : tg.dur,
        QG.textoPredecesoras(tg, nums), fecha(tg.dIni), fecha(tg.dFin), tg.hito ? '' : (Number(tg.avance) || 0) / 100];
      row.getCell(7).numFmt = 'dd-mm-yyyy';
      row.getCell(8).numFmt = 'dd-mm-yyyy';
      row.getCell(9).numFmt = '0%';
      row.getCell(1).alignment = { horizontal: 'center' };
      [5, 7, 8, 9].forEach((ci) => { row.getCell(ci).alignment = { horizontal: 'center' }; });
      for (let ci = 1; ci <= nF; ci++) row.getCell(ci).font = { name: FONT, size: 10, bold: ci === 2 && tg.hito };
      for (let j = 0; j < nCols; j++) {
        const a = d0 + j * paso, z = a + paso - 1;
        const cel = row.getCell(nF + 1 + j);
        cel.border = { right: { style: 'hair', color: { argb: C.line } }, bottom: { style: 'hair', color: { argb: C.line } } };
        const cubre = tg.hito ? tg.dIni >= a && tg.dIni <= z : tg.dIni <= z && tg.dFin >= a;
        if (cubre && tg.hito) {
          cel.value = '◆';
          cel.alignment = { horizontal: 'center' };
          cel.font = { name: FONT, size: 10, bold: true, color: { argb: tg.critica ? C.brand : C.dark } };
        } else if (cubre) cel.fill = solid(tg.critica ? C.brand : C.gray);
        else if (!porSemana && habiles && !res.calendario.laborable(a)) cel.fill = solid(C.light);
      }
    });
    const ley = ws.getRow(6 + res.tareas.length);
    ley.getCell(2).value = `En naranja, la ruta crítica (tareas sin holgura)${habiles && !porSemana ? '; en gris claro, los días no laborables' : ''}. Columnas por ${porSemana ? 'semana (lunes)' : 'día'}. Predecesoras: 2 = después de que termina la 2; 2CC = cuando empieza la 2; 2FF = termina con la 2; +n / -n = días de desfase.`;
    ley.getCell(2).font = { name: FONT, size: 9, italic: true, color: { argb: C.gray } };
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws.headerFooter = { oddFooter: `&L${info.pie}&RPágina &P de &N` };
    // La carta completa, por si hay que recuperarla
    const wsD = wb.addWorksheet('_datos', { state: 'hidden' });
    wsD.getCell('A1').value = 'quempin-gantt/v1';
    const json = JSON.stringify(c);
    for (let i = 0, r = 2; i < json.length; i += 30000, r++) wsD.getCell(`A${r}`).value = json.slice(i, i + 30000);
    return wb.xlsx.writeBuffer();
  }

  const api = { libro };
  root.QGanttExcel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
