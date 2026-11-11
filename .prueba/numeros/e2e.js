// Cajas de números en el Formulador y la Gantt (pedido del usuario, 2026-11-10): un clic selecciona todo
// y lo que se escribe lleva punto de miles; el proyecto guarda el número sin formato.
// Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/numeros/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = (process.env.QP_BASE || 'http://127.0.0.1:8799') + '/index.html';
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ejemplos', 'QPN-EJEMPLO_medidores-gn.json'), 'utf8'));
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const visto = (page, sel) => page.$eval(sel, (e) => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(e));
const seleccion = (page, sel) => page.$eval(sel, (e) => [e.selectionStart, e.selectionEnd, Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(e).length]);
const guardado = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('qpn.formulacion.proyectos.v1')).proyectos.find((p) => p.uid === 'ejemplo00001'));

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, locale: 'es-CL' });
  const proyecto = Object.assign(JSON.parse(JSON.stringify(EJ)), { estado: 'Borrador' });
  await ctx.addInitScript((p) => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('quempin_formulador_unlocked', '1');
    localStorage.setItem('qpn.formulacion.proyectos.v1', JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: [p] }));
  }, proyecto);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  try {
    const m0 = EJ.materiales[0];
    const costo = `[data-list="materiales"][data-uid="${m0.uid}"][data-k="costoUnitario"]`;
    const cant = `[data-list="materiales"][data-uid="${m0.uid}"][data-k="cantidad"]`;
    await page.goto(BASE + '#/p/ejemplo00001/materiales');
    await page.waitForSelector(costo);
    check('el costo unitario se ve con punto de miles', (await visto(page, costo)) === '14.580', await visto(page, costo));
    check('la caja ya no es type=number', (await page.$eval(costo, (e) => e.type)) === 'text');

    await page.click(cant);
    const s = await seleccion(page, cant);
    check('un clic en la cantidad la selecciona entera', s[0] === 0 && s[1] === s[2] && s[2] > 0, s);

    await page.click(costo);
    await page.keyboard.type('1250000');
    check('lo escrito reemplaza al valor y lleva miles', (await visto(page, costo)) === '1.250.000', await visto(page, costo));
    await wait(700);
    let p = await guardado(page);
    let m = p.materiales.find((x) => x.uid === m0.uid);
    check('el proyecto guarda el número sin formato', m.costoUnitario === 1250000, m.costoUnitario);

    await page.click(cant);
    await page.keyboard.type('2,5');
    await page.keyboard.press('Tab');
    await wait(700);
    p = await guardado(page);
    m = p.materiales.find((x) => x.uid === m0.uid);
    check('coma decimal en la cantidad', m.cantidad === 2.5 && (await visto(page, cant)) === '2,5', [m.cantidad, await visto(page, cant)]);

    // Gantt: días con miles no hacen falta, pero el clic selecciona todo y el número se lee igual
    await page.goto((process.env.QP_BASE || 'http://127.0.0.1:8799') + '/gantt/index.html');
    await wait(1500);
    const dias = await page.$('[data-g="duracion"]');
    if (dias) {
      await dias.click();
      const sg = await seleccion(page, '[data-g="duracion"]');
      check('Gantt: un clic en «Días» lo selecciona entero', sg[0] === 0 && sg[1] === sg[2], sg);
    } else check('Gantt: carga (sin tareas que probar)', true);
  } catch (e) {
    check('sin excepciones en la prueba', false, String(e && e.stack || e));
  }
  check('sin errores de JavaScript', errores.length === 0, errores);
  await browser.close();
  results.forEach((r) => console.log(r));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fallas}/${results.length} verificaciones`);
  process.exit(fallas ? 1 : 0);
})();
