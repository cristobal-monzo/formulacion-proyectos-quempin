// Prueba de la moneda del proyecto (2026-10-07): pesos chilenos, soles, dólares y euros.
// Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/moneda/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = 'http://127.0.0.1:8799/index.html';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ejemplos', 'QPN-EJEMPLO_medidores-gn.json'), 'utf8'));
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, locale: 'es-CL' });
  const usd = Object.assign(JSON.parse(JSON.stringify(EJ)), { uid: 'ejemplousd01', codigo: 'QPN-USD', estado: 'Enviada' });
  usd.parametros = Object.assign({}, usd.parametros, { moneda: 'USD' });
  const clp = Object.assign(JSON.parse(JSON.stringify(EJ)), { estado: 'Enviada' });
  await ctx.addInitScript(([clp, usd]) => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('quempin_formulador_unlocked', '1');
    localStorage.setItem('qpn.formulacion.proyectos.v1', JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: [clp, usd] }));
  }, [clp, usd]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  try {
    // 1. Listado: cada proyecto en su moneda y las sumas separadas por moneda
    await page.goto(BASE + '#/');
    await page.waitForSelector('#list-kpis .kpi-card');
    const kpis = await texto(page, '#list-kpis');
    const lineas = await page.$$eval('#list-kpis .kpi-card:first-child .kpi-linea', (ls) => ls.map((l) => l.textContent));
    check('«Ofertas en curso» suma por moneda, una línea cada una', lineas.length === 2 && /^\$[\d.]+$/.test(lineas[0]) && /^US\$ [\d.]+,\d\d$/.test(lineas[1]), lineas);
    check('el filtro por estado suma con « + »', /\$[\d.]+ \+ US\$ [\d.]+,\d\d/.test(await texto(page, '#list-cartera')), await texto(page, '#list-cartera'));
    check('margen ponderado avisa que solo cuentan los en pesos', (await page.$eval('#list-kpis', (e) => e.innerHTML)).includes('solo cuentan los en pesos chilenos'));
    const filaUsd = await texto(page, 'tr[data-open="ejemplousd01"]');
    const filaClp = await texto(page, 'tr[data-open="ejemplo00001"]');
    check('fila en dólares', /US\$ [\d.]+,\d\d/.test(filaUsd), filaUsd);
    check('fila en pesos sigue igual', /\$[\d.]+/.test(filaClp) && !/US\$|S\/|€/.test(filaClp), filaClp);
    await page.screenshot({ path: path.join(SHOTS, '1-listado.png') });

    // 2. Paso 1: elegir soles en el proyecto en pesos
    await page.goto(BASE + '#/p/ejemplo00001/ficha');
    await page.waitForSelector('#f-parametros\\.moneda');
    check('el proyecto parte en pesos chilenos', (await page.$eval('#f-parametros\\.moneda', (e) => e.value)) === 'CLP');
    await page.selectOption('#f-parametros\\.moneda', 'PEN');
    await wait(400);
    check('elegida la moneda, se mantiene en el selector', (await page.$eval('#f-parametros\\.moneda', (e) => e.value)) === 'PEN');
    const afijos = await page.$$eval('#f-precio .affix, #f-metas .affix', (as) => as.map((a) => a.textContent));
    check('las tarifas y la meta llevan S/', afijos.filter((a) => a === 'S/').length === 4, afijos);
    const res = await texto(page, '#res-f-precio');
    check('el resumen de tarifas va en soles', /S\/ [\d.]+/.test(res), res);
    await wait(1500);
    const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('qpn.formulacion.proyectos.v1')).proyectos.find((p) => p.uid === 'ejemplo00001').parametros.moneda);
    check('la moneda se guarda con el proyecto', guardado === 'PEN', guardado);
    await page.screenshot({ path: path.join(SHOTS, '2-ficha-soles.png'), fullPage: true });

    // 3. Paso 4 en dólares: montos con centavos y valores para la cotización
    await page.selectOption('#f-parametros\\.moneda', 'USD');
    await wait(300);
    await page.goto(BASE + '#/p/ejemplo00001/resumen');
    await page.waitForSelector('#res-precio');
    await wait(500);
    const cot = await texto(page, '#res-precio');
    check('valores para la cotización en US$ con centavos', /US\$ [\d.]+,\d\d/.test(cot) && !/(^|[^S])\$\d/.test(cot), cot.slice(0, 300));
    const th = await texto(page, '.util-tbl thead');
    check('la columna dice «Utilidad en US$»', th.includes('Utilidad en US$'), th);
    const seg = await page.$$eval('.util-tbl .segmentado label span', (s) => s.map((x) => x.textContent));
    check('el selector de utilidad fija dice US$', seg.includes('US$'), seg);
    const copiar = await page.$$eval('[data-act="copiar"]', (b) => b.map((x) => x.dataset.v));
    check('copiar entrega el número con coma decimal', copiar.length > 0 && copiar.every((v) => /^-?\d+(,\d{1,2})?$/.test(v)), copiar);
    await page.screenshot({ path: path.join(SHOTS, '3-resumen-dolares.png'), fullPage: true });

    // 4. Euros en la evaluación
    await page.goto(BASE + '#/p/ejemplo00001/ficha');
    await page.waitForSelector('#f-parametros\\.moneda');
    await page.selectOption('#f-parametros\\.moneda', 'EUR');
    await wait(300);
    await page.goto(BASE + '#/p/ejemplo00001/evaluacion');
    await wait(800);
    const ev = await texto(page, '#tab-body');
    check('la evaluación muestra €', /€ [\d.]+,\d\d/.test(ev), ev.slice(0, 200));

    // 5. Excel: formato de moneda y fila «Moneda» en Parámetros
    const xl = await page.evaluate(async () => {
      const p = window.QStore.get('ejemplo00001');
      const buf = await window.QExcel.exportProject(p, { soloDatos: true });
      const wb = new window.ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const par = wb.getWorksheet('Parámetros');
      const pa = wb.getWorksheet('Partidas');
      return { a4: par.getCell('A4').value, b4: par.getCell('B4').value, fmt: pa.getCell('I5').numFmt };
    });
    check('Excel: fila Moneda en Parámetros', xl.a4 === 'Moneda' && xl.b4 === 'Euros', xl);
    check('Excel: montos con formato €', /€/.test(xl.fmt) && /0\.00/.test(xl.fmt), xl);

    // 6. Configuración: moneda de los proyectos nuevos
    await page.goto(BASE + '#/');
    await page.waitForSelector('#list-kpis .kpi-card');
    await page.evaluate(() => { const b = document.querySelector('[data-act="config"]'); if (b) b.click(); });
    await wait(500);
    if (await page.$('#modal[open] #cfg-moneda')) {
      await page.selectOption('#cfg-moneda', 'PEN');
      const af = await page.$$eval('#modal .cfg-simbolo', (as) => as.map((a) => a.textContent));
      check('Configuración: al elegir soles las tarifas dicen S/', af.length === 4 && af.every((a) => a === 'S/'), af);
      await page.screenshot({ path: path.join(SHOTS, '4-configuracion.png') });
    } else check('Configuración abre con el selector de moneda', false, 'no se abrió');
  } catch (e) {
    check('sin excepciones en la prueba', false, String(e && e.stack || e));
  }
  check('sin errores de la página', errores.length === 0, errores);
  await browser.close();
  console.log(results.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fallas}/${results.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
