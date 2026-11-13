// Prueba de punta a punta del N° de requerimiento (paso 1) con la Planilla de Ingreso leída en la
// biblioteca. La biblioteca se simula en el almacenamiento privado del navegador (OPFS), con una
// planilla FICTICIA armada acá mismo con ExcelJS (N° 1 a 30, en desorden) y una copia publicada
// atrasada (N° 1 a 25): así se ve que la lista sale de la planilla, al día.
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/planilla/e2e.js
'use strict';
const path = require('path');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = process.env.BASE || 'http://127.0.0.1:8798/index.html';
const BIBLIOTECA = 'Formulación de proyectos - Documentos';
const RUTA = [BIBLIOTECA, '.HERRAMIENTAS FORMULACIÓN', 'Intercambio'];
const PLANILLA = 'Planilla de Ingreso de Requerimientos.xlsx';
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rango = (desde, hasta) => Array.from({ length: Math.abs(hasta - desde) + 1 }, (_, i) => String(desde > hasta ? desde - i : desde + i));

const ESTADOS = ['Evaluación', 'Ofertado', 'Adjudicado', 'No adjudicado', 'Descartado'];
const TITULOS = { 3: 'Hospital ficticio de prueba', 7: 'Hospital ficticio dos', 28: 'Hospital ficticio reciente' };
const titulo = (n) => TITULOS[n] || `Requerimiento ficticio ${n}`;
const fila = (n) => ({ numero: n, estado: ESTADOS[n % 5], titulo: titulo(n), ubicacion: 'Ciudad ficticia', referencia: `REF-${n}`, cierre: `2026-09-${String(n).padStart(2, '0')}`, presupuesto: n * 1000000 });
// La copia que publica el procesador, atrasada: todavía no tiene los N° 26 a 30
const PUBLICADO = { esquema: 'quempin.intercambio/1', herramienta: 'planilla-requerimientos', generado: '2026-10-02T10:00:00-03:00',
  datos: { fuente: 'Planilla de Ingreso de Requerimientos', actualizado: '2026-10-02T09:55:00-03:00', requerimientos: Array.from({ length: 25 }, (_, i) => fila(i + 1)) } };

async function escribir(page, ruta, archivos) {
  await page.evaluate(async ([archivos, ruta]) => {
    let base = await navigator.storage.getDirectory();
    for (const n of ruta) base = await base.getDirectoryHandle(n, { create: true });
    for (const [r, texto] of archivos) {
      const w = await (await base.getFileHandle(r, { create: true })).createWritable();
      await w.write(texto); await w.close();
    }
  }, [archivos, ruta]);
}
/* La planilla ficticia, como la del equipo: hoja «Listado Requerimientos», encabezados con tildes y
   N°, filas en desorden, un link, una fila sin N° y un N° repetido (vale la primera fila). */
async function escribirPlanilla(page) {
  await page.evaluate(async ([bib, nombre, filas, titulos]) => {
    const ExcelJS = await window.QExcel.ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Listado Requerimientos');
    ws.addRow(['N°', 'Estado', 'Título', 'Ubicación', 'ID o Referencia', 'Cierre', 'Presupuesto (IVA inc)']);
    filas.forEach((f) => ws.addRow([f.numero, f.estado, f.titulo, f.ubicacion, f.referencia, new Date(f.cierre + 'T00:00:00Z'), f.presupuesto]));
    ws.getCell('E2').value = { text: filas[0].referencia, hyperlink: 'https://example.com/ficticio' };
    ws.addRow([null, 'Evaluación', 'Fila sin N°']);
    ws.addRow([filas[0].numero, 'Evaluación', 'Repetido: no vale']);
    wb.addWorksheet('Resumen').addRow(['nada que leer']);
    const buf = await wb.xlsx.writeBuffer();
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true });
    const w = await (await d.getFileHandle(nombre, { create: true })).createWritable();
    await w.write(buf); await w.close();
  }, [BIBLIOTECA, PLANILLA, [30, 12, 29, 1, 2, 28, 3, 27, 4, 26, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map(fila), TITULOS]);
}
// La lista del N° es la propia del Formulador (#pop), no un <datalist>
const opciones = (page) => page.$$eval('#pop:not([hidden]) .pop-item .pcode', (o) => o.map((x) => x.textContent.trim()));
const abrirLista = async (page) => { await page.click('#f-req + .combo-btn'); await wait(150); };
const cerrarLista = async (page) => { await page.keyboard.press('Escape'); await wait(100); };
const SHOTS = process.env.SHOTS || '';
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent).catch(() => '');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, locale: 'es-CL' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('quempin_viz_unlocked', '1'); } catch (e) { /* */ }
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Formulación de proyectos - Documentos', { create: true });
    FileSystemHandle.prototype.queryPermission = async function () { return 'granted'; };
    FileSystemHandle.prototype.requestPermission = async function () { return 'granted'; };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  try {
    await page.goto(BASE + '#/guia');
    await escribir(page, RUTA, [['intercambio.json', JSON.stringify({ esquema: 'quempin.intercambio/1', descripcion: 'prueba' })]]);
    await escribir(page, [...RUTA, 'publicado'], [['requerimientos.json', JSON.stringify(PUBLICADO)]]);
    await escribirPlanilla(page);

    // 1. Proyecto nuevo con la biblioteca conectada
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="nuevo"]');
    await page.click('[data-act="nuevo"]');
    await wait(400);
    if (await page.$('#modal[open]')) { await page.click('#modal button:has-text("Conectar la biblioteca")'); await wait(800); }
    // «Nuevo proyecto» (2026-10-19): pregunta si se crea la carpeta de la oferta; aquí se sigue sin carpeta
    await page.waitForSelector('#modal[open] #np-num', { timeout: 8000 });
    // Sin N° el diálogo ya no crea proyectos (2026-11-12): un proyecto sin N° es uno de antes, que ya existía
    await page.click('#modal .modal-foot button:not(.btn-primario)'); await wait(300);
    await page.evaluate(() => { const p = window.QStore.newProject(); window.QStore.upsert(p); location.hash = `#/p/${p.uid}/ficha`; });
    await page.waitForSelector('#f-req', { timeout: 10000 });
    await page.waitForFunction(async () => (await window.QHerramientas.requerimientos()).requerimientos.length > 0, null, { timeout: 10000 });
    await wait(300);
    await abrirLista(page);

    // 2. La lista: los 20 últimos ingresados, del más nuevo al más antiguo, desde la planilla misma
    check('la lista trae los 20 últimos N° (30 a 11), del más nuevo al más antiguo', (await opciones(page)).join(',') === rango(30, 11).join(','), await opciones(page));
    const etiqueta = await page.evaluate(() => { const b = [...document.querySelectorAll('#pop .pop-item')].find((x) => x.querySelector('.pcode').textContent === '28'); return b ? `${b.querySelector('.pi-title').textContent} (${b.querySelector('.pi-right').textContent})` : ''; });
    check('cada opción muestra el título y el estado', etiqueta === 'Hospital ficticio reciente (No adjudicado)', etiqueta);
    check('la flecha deja el foco en la lista (se recorre con las flechas)', await page.evaluate(() => !!document.activeElement.closest('#pop')));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/req-lista.png' });
    await cerrarLista(page);
    check('Esc cierra la lista y vuelve al campo', await page.evaluate(() => document.getElementById('pop').hidden && document.activeElement.id === 'f-req'));
    check('la pista explica la lista y cómo buscar uno anterior', (await texto(page, '#req-hint')).includes('20 últimos ingresados'), await texto(page, '#req-hint'));
    const datos = await page.evaluate(async () => { const d = await window.QHerramientas.requerimientos(); return { origen: d.origen, n: d.requerimientos.length, avisos: d.avisos, r1: d.requerimientos.find((r) => r.numero === 30) }; });
    check('se leyó la planilla de la biblioteca (no la copia publicada)', datos.origen === 'planilla' && datos.n === 30, datos);
    check('un N° repetido: vale la primera fila y queda el aviso', datos.avisos.length === 1 && /N° 30/.test(datos.avisos[0]) && datos.r1.titulo === 'Requerimiento ficticio 30', datos);
    check('el link y la fecha se leen como en la copia publicada', datos.r1.referencia === 'REF-30' && datos.r1.cierre === '2026-09-30' && datos.r1.presupuesto === 30000000, datos.r1);

    // 3. Escribir filtra la lista y busca también entre los anteriores, que van detrás
    await page.fill('#f-req', 'hosp');
    await wait(150);
    check('«hosp» deja el 28 y suma los hospitales anteriores (7 y 3)', (await opciones(page)).join(',') === '28,7,3', await opciones(page));
    check('mientras se escribe, el foco sigue en el campo', await page.evaluate(() => document.activeElement.id === 'f-req'));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/req-escribir.png' });
    await page.fill('#f-req', '1');
    await wait(150);
    const con1 = rango(30, 11).filter((n) => n.startsWith('1') || titulo(+n).includes('1'));
    check('«1» deja los que calzan y suma los anteriores que empiezan con 1 (10 y 1)', (await opciones(page)).join(',') === con1.concat(['10', '1']).join(','), await opciones(page));
    await page.fill('#f-req', 'zzz');
    await wait(150);
    check('sin coincidencias la lista se cierra', await page.evaluate(() => document.getElementById('pop').hidden));

    // 4. Un N° que la copia publicada todavía no tiene
    await page.fill('[data-f="titulo"]', '');
    await page.dispatchEvent('[data-f="titulo"]', 'input');
    await page.fill('#f-req', '29');
    await wait(150);
    await page.click('#pop .pop-item:has(.pcode:text-is("29"))');
    await wait(500);
    check('elegir el 29 de la lista lo deja en el campo', (await page.inputValue('#f-req')) === '29', await page.inputValue('#f-req'));
    check('la pista muestra el N° 29, que todavía no está publicado', (await texto(page, '#req-hint')).includes('Requerimiento ficticio 29'), await texto(page, '#req-hint'));
    await page.click('[data-act="req-completar"]');
    await wait(500);
    check('«Completar desde la planilla» trae el título del N° 29', (await page.inputValue('[data-f="titulo"]')) === 'Requerimiento ficticio 29', await page.inputValue('[data-f="titulo"]'));
    check('…y el presupuesto con IVA', (await page.inputValue('[data-f="parametros.presupuestoMaximo"]')) === '29.000.000', await page.inputValue('[data-f="parametros.presupuestoMaximo"]'));
    check('…el ID de licitación («ID o Referencia» de la planilla)', (await page.inputValue('[data-f="idLicitacion"]')) === 'REF-29', await page.inputValue('[data-f="idLicitacion"]'));
    const anio = (await page.inputValue('[data-f="fecha"]')).slice(0, 4);
    check('…y el código «N°. Nombre» en vez del correlativo (2026-10-19)', (await page.inputValue('[data-f="codigo"]')) === '29. Requerimiento ficticio 29', await page.inputValue('[data-f="codigo"]'));
    check('la pista del código lo explica', (await texto(page, '#codigo-hint')).includes('N° y nombre, como la carpeta de la oferta'), await texto(page, '#codigo-hint'));
    check('el año sigue a mano para el correlativo', /^\d{4}$/.test(anio));
    // Otro N° (2026-11-12, pedido del equipo): lo que la planilla dice distinto se muestra y se reemplaza lo marcado
    const otroReq = async (n) => { await page.fill('#f-req', n); await page.dispatchEvent('#f-req', 'change'); await page.keyboard.press('Escape'); await wait(300); await page.click('[data-act="req-completar"]'); await wait(500); };
    const filasDlg = () => page.$$eval('#modal[open] .xp-tabla tbody tr', (trs) => trs.map((tr) => tr.children[1].textContent.trim()));
    const botonDlg = async (texto) => { await page.click(`#modal[open] .modal-foot button:text-is("${texto}")`); await wait(500); };
    await otroReq('28');
    const distintas28 = await filasDlg();
    check('con otro N° (28), lo distinto se muestra antes de reemplazarlo', distintas28.includes('Título') && distintas28.some((x) => /^ID de/.test(x)) && distintas28.includes('Presupuesto (con IVA)'), distintas28);
    await page.uncheck(`#modal[open] #cp-${distintas28.indexOf('Título')}`);
    await botonDlg('Completar');
    check('…lo desmarcado (el título) se queda', (await page.inputValue('[data-f="titulo"]')) === 'Requerimiento ficticio 29', await page.inputValue('[data-f="titulo"]'));
    check('…lo marcado se reemplaza: el ID de licitación pasa a REF-28', (await page.inputValue('[data-f="idLicitacion"]')) === 'REF-28', await page.inputValue('[data-f="idLicitacion"]'));
    check('…y el presupuesto a 28.000.000', (await page.inputValue('[data-f="parametros.presupuestoMaximo"]')) === '28.000.000', await page.inputValue('[data-f="parametros.presupuestoMaximo"]'));
    check('el código pasa a «28. …»', (await page.inputValue('[data-f="codigo"]')) === '28. Requerimiento ficticio 29', await page.inputValue('[data-f="codigo"]'));
    await page.click('[data-act="req-completar"]');
    await wait(500);
    const distintas28b = await filasDlg();
    check('de nuevo, solo queda distinto el título', distintas28b.join('|') === 'Título', distintas28b);
    await botonDlg('Cancelar');
    check('«Cancelar» no cambia nada', (await page.inputValue('[data-f="titulo"]')) === 'Requerimiento ficticio 29', await page.inputValue('[data-f="titulo"]'));
    // Un código escrito a mano no se toca
    await page.fill('[data-f="codigo"]', 'OBRA-ESPECIAL');
    await page.dispatchEvent('[data-f="codigo"]', 'change');
    await wait(200);
    check('la pista avisa que un código a mano no cambia', (await texto(page, '#codigo-hint')).includes('a mano'), await texto(page, '#codigo-hint'));
    await page.fill('[data-f="idLicitacion"]', '');
    await page.dispatchEvent('[data-f="idLicitacion"]', 'change');
    await otroReq('27');
    const distintas27 = await filasDlg();
    check('el ID vacío no se pregunta: se llena', !distintas27.some((x) => /^ID de/.test(x)) && /ID de/.test(await texto(page, '#modal[open] .modal-body')), distintas27);
    await botonDlg('Completar');
    check('el título se reemplaza por el del 27', (await page.inputValue('[data-f="titulo"]')) === 'Requerimiento ficticio 27', await page.inputValue('[data-f="titulo"]'));
    check('un código escrito a mano se respeta', (await page.inputValue('[data-f="codigo"]')) === 'OBRA-ESPECIAL', await page.inputValue('[data-f="codigo"]'));
    check('el ID de licitación vacío se completa (REF-27)', (await page.inputValue('[data-f="idLicitacion"]')) === 'REF-27', await page.inputValue('[data-f="idLicitacion"]'));
    await wait(600);
    const guardado = await page.evaluate(() => { const uid = location.hash.split('/')[2]; const p = window.QStore.get(uid); return { codigo: p.codigo, id: p.idLicitacion }; });
    check('el ID de licitación queda guardado en el proyecto', guardado.id === 'REF-27' && guardado.codigo === 'OBRA-ESPECIAL', guardado);
    // Sin N° de requerimiento el correlativo también es QMPN (2026-10-13), y no cuenta los QMPN-año-N°
    const pref = await page.evaluate((anio) => {
      const S = window.QStore;
      const antes = S.getConfig().prefijo;
      const cfg = S.getConfig(); S.setConfig(Object.assign({}, cfg, { prefijo: 'QPN' }));
      const antiguo = S.getConfig().prefijo;
      S.setConfig(Object.assign({}, cfg, { prefijo: antes }));
      const p = S.newProject(); p.codigo = `QMPN-${anio}-280`; p.vinculos = { requerimiento: { numero: '280', titulo: 'x' } }; S.upsert(p);
      const siguiente = S.nextCodigo('QMPN', anio);
      S.remove(p.uid); S.purge && S.purge(p.uid);
      return { antes, antiguo, siguiente, nuevo: S.newProject().codigo };
    }, anio);
    check('el prefijo por defecto es QMPN', pref.antes === 'QMPN', pref);
    check('un «QPN» guardado de antes se lee como QMPN', pref.antiguo === 'QMPN', pref);
    check('el correlativo no salta al N° de requerimiento (no da QMPN-año-281)', /^QMPN-\d{4}-0\d\d$/.test(pref.siguiente), pref);
    check('un proyecto nuevo sin N° parte con QMPN', pref.nuevo.startsWith(`QMPN-${anio}-`), pref);

    // 5. Sin la planilla, o con un archivo que no se puede leer: la copia publicada
    const respaldo = async () => page.evaluate(async () => { window.QHerramientas.olvidar(); const d = await window.QHerramientas.requerimientos(); return { origen: d.origen, n: d.requerimientos.length }; });
    await page.evaluate(async ([bib, nombre]) => (await (await navigator.storage.getDirectory()).getDirectoryHandle(bib)).removeEntry(nombre), [BIBLIOTECA, PLANILLA]);
    const sinPlanilla = await respaldo();
    check('sin la planilla en la biblioteca: usa la copia publicada', sinPlanilla.origen === 'publicado' && sinPlanilla.n === 25, sinPlanilla);
    await escribir(page, [BIBLIOTECA], [[PLANILLA, 'esto no es un Excel']]);
    const rota = await respaldo();
    check('con un archivo que no es Excel: usa la copia publicada', rota.origen === 'publicado' && rota.n === 25, rota);
    const uid = (await page.evaluate(() => location.hash)).split('/')[2];
    await page.goto(`${BASE}#/p/${uid}/partidas`);
    await page.goto(`${BASE}#/p/${uid}/ficha`);
    await page.waitForSelector('#f-req', { timeout: 10000 });
    await page.fill('#f-req', '');
    await wait(800);
    if (await page.evaluate(() => document.getElementById('pop').hidden)) await abrirLista(page);
    check('la lista sale de la copia publicada (25 a 6)', (await opciones(page)).join(',') === rango(25, 6).join(','), await opciones(page));
    check('sin errores de JavaScript', !errores.length, errores);
  } catch (e) {
    errores.push('prueba: ' + (e && e.stack || e));
  }
  await browser.close();
  console.log(results.join('\n'));
  if (errores.length) console.log('\nERRORES:\n' + errores.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length + errores.length;
  console.log(`\n${results.length - results.filter((r) => r.startsWith('FAIL')).length}/${results.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
