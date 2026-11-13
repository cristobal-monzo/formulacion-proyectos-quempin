// Prueba: un solo clic abre un proyecto de la lista (2026-11-13). Antes pedía dos clics cuando la
// lista se redibujaba entre apretar y soltar el botón: al salir del campo «Buscar» (evento change)
// o al llegar un cambio de otra ventana o de la carpeta del equipo.
// Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/lista-clic/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = process.env.BASE || 'http://127.0.0.1:8799/index.html';
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ejemplos', 'QPN-EJEMPLO_medidores-gn.json'), 'utf8'));
const KEY = 'qpn.formulacion.proyectos.v1';
const UID = EJ.uid;
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-CL' });
  await ctx.addInitScript(([ej, key]) => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('quempin_formulador_unlocked', '1');
    localStorage.setItem(key, JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: [ej] }));
  }, [EJ, KEY]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  const fila = `#list-body tr[data-open="${UID}"]`;
  const centro = async () => { const b = await page.locator(fila).locator('.proj-title').boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const abierto = () => page.evaluate((uid) => location.hash.startsWith(`#/p/${uid}/`), UID);
  const volver = async () => { await page.evaluate(() => { location.hash = '#/'; }); await page.waitForSelector(fila); await wait(200); };
  try {
    await page.goto(`${BASE}#/`);
    await page.waitForSelector(fila);

    // 1) Escribir en «Buscar» y hacer un solo clic en la fila
    await page.click('#list-search');
    await page.keyboard.type('EJEMPLO');
    await wait(200);
    let [x, y] = await centro();
    await page.mouse.click(x, y);
    await wait(300);
    check('después de buscar, un clic abre el proyecto', await abierto(), await page.evaluate(() => location.hash));

    // 2) Un cambio de otra ventana llega con el botón apretado
    await volver();
    [x, y] = await centro();
    await page.mouse.move(x, y);
    await page.mouse.down();
    const antes = await page.$(fila);
    await page.evaluate(([key, ej]) => {
      const nuevo = JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: [Object.assign({}, ej, { modificado: new Date().toISOString() })] });
      localStorage.setItem(key, nuevo);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: nuevo }));
    }, [KEY, EJ]);
    const misma = await antes.evaluate((tr) => tr.isConnected);
    check('con el botón apretado la fila no se reemplaza', misma);
    await page.mouse.up();
    await wait(300);
    check('el cambio remoto no impide abrir con un clic', await abierto(), await page.evaluate(() => location.hash));

    // 3) Lo que llegó con el botón apretado se pinta después (si no hubo clic que abriera)
    await volver();
    [x, y] = await centro();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 400);   // arrastra fuera: no hay clic
    await page.evaluate(([key, ej]) => {
      const nuevo = JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: [Object.assign({}, ej, { titulo: 'Título cambiado en otra ventana', modificado: new Date().toISOString() })] });
      localStorage.setItem(key, nuevo);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: nuevo }));
    }, [KEY, EJ]);
    await page.mouse.up();
    await wait(300);
    const titulo = await page.$eval(`${fila} .proj-title`, (e) => e.textContent);
    check('el cambio que esperaba se pinta al soltar', titulo === 'Título cambiado en otra ventana', titulo);

    // 4) Filtrar sigue funcionando
    await page.fill('#list-search', 'no-existe-xyz');
    await wait(200);
    check('el filtro sigue redibujando la lista', (await page.$$(fila)).length === 0);
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
