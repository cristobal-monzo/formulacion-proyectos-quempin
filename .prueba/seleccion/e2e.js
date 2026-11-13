// Prueba de la selección de varias filas en las tablas de costos (2026-11-12): una casilla en la
// columna ID de cada fila, «todas» en el encabezado, Mayús + clic marca un tramo y la barra
// «N filas seleccionadas · Eliminar · Quitar selección». Eliminar pide confirmación y Ctrl+Z lo deshace.
// Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/seleccion/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = process.env.BASE || 'http://127.0.0.1:8799/index.html';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
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
  const ids = () => page.$$eval('#tab-body tbody tr[data-row] td.code', (els) => els.map((e) => e.textContent.trim()));
  const casilla = (i) => page.locator('#tab-body tbody tr[data-row] input[data-sel]').nth(i);
  const barra = () => page.$eval('#sel-barra', (b) => (b.hidden ? '' : b.querySelector('.sel-n').textContent));
  const guardados = (lista) => page.evaluate(([k, uid, l]) => JSON.parse(localStorage.getItem(k)).proyectos.find((x) => x.uid === uid)[l].length, [KEY, UID, lista]);
  try {
    await page.goto(`${BASE}#/p/${UID}/otros`);
    await page.waitForSelector('#tab-body input[data-sel-todo="otros"]');
    const n0 = (await ids()).length;
    check('otros: cada fila tiene su casilla', (await page.$$('#tab-body tbody input[data-sel="otros"]')).length === n0 && n0 === 4, n0);
    check('sin selección la barra no se ve', (await barra()) === '');

    // Una casilla
    await casilla(0).click();
    check('al marcar una, la barra dice «1 fila seleccionada»', (await barra()) === '1 fila seleccionada', await barra());
    check('la fila marcada se destaca', await page.$eval('#tab-body tbody tr[data-row]', (tr) => tr.classList.contains('sel')));
    check('«todas» queda a medias', await page.$eval('input[data-sel-todo="otros"]', (c) => c.indeterminate && !c.checked));

    // Mayús + clic: tramo
    await casilla(2).click({ modifiers: ['Shift'] });
    check('Mayús + clic marca el tramo (3 filas)', (await barra()) === '3 filas seleccionadas', await barra());

    // Quitar selección
    await page.click('[data-act="sel-quitar"]');
    check('«Quitar selección» desmarca todo', (await barra()) === '' && (await page.$$('#tab-body tbody input[data-sel]:checked')).length === 0);

    // Todas
    await page.click('input[data-sel-todo="otros"]');
    check('«todas» marca las 4 filas', (await barra()) === '4 filas seleccionadas', await barra());
    await page.click('input[data-sel-todo="otros"]');
    check('desmarcar «todas» las suelta', (await barra()) === '');

    // Con búsqueda, «todas» solo marca lo visible
    await page.fill('#buscar-otros', 'O1');
    await wait(500);
    await page.click('input[data-sel-todo="otros"]');
    check('con búsqueda, «todas» marca solo lo que se ve', (await barra()) === '1 fila seleccionada', await barra());
    await page.fill('#buscar-otros', '');
    await wait(500);
    check('al quitar la búsqueda, la selección sigue', (await barra()) === '1 fila seleccionada', await barra());
    await page.click('[data-act="sel-quitar"]');

    // Eliminar varias: cancelar no borra
    await casilla(1).click();
    await casilla(3).click();
    await page.click('[data-act="del-sel"]');
    await page.waitForSelector('#modal[open]');
    check('pide confirmación con los ID', /Eliminar 2 costos/.test(await page.textContent('#modal h2')) && /O2, O4/.test(await page.textContent('#modal .modal-body')), await page.textContent('#modal'));
    await page.click('#modal .modal-foot .btn.izq');
    await wait(200);
    check('«Cancelar» no borra nada', (await ids()).length === 4 && (await barra()) === '2 filas seleccionadas');

    // Confirmar
    await page.click('[data-act="del-sel"]');
    await page.waitForSelector('#modal[open]');
    await page.click('#modal .modal-foot .btn-danger');
    await wait(700);
    const tras = await ids();
    check('elimina las 2 filas marcadas', tras.length === 2, tras);
    check('la barra se va después de eliminar', (await barra()) === '');
    check('queda guardado', (await guardados('otros')) === 2, await guardados('otros'));
    await page.screenshot({ path: path.join(SHOTS, 'otros-eliminadas.png') });

    // Ctrl+Z las recupera
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Control+z');
    await wait(700);
    check('Ctrl+Z recupera las filas eliminadas', (await ids()).length === 4, await ids());

    // Mano de obra también
    await page.goto(`${BASE}#/p/${UID}/manoObra`);
    await page.waitForSelector('#tab-body input[data-sel-todo="manoObra"]');
    await page.click('input[data-sel-todo="manoObra"]');
    check('mano de obra: «todas» marca las 3 tareas', (await barra()) === '3 filas seleccionadas', await barra());
    await page.screenshot({ path: path.join(SHOTS, 'mano-obra-todas.png') });
    await page.click('[data-act="del-sel"]');
    await page.waitForSelector('#modal[open]');
    check('mano de obra: el título dice «3 tareas»', /Eliminar 3 tareas/.test(await page.textContent('#modal h2')), await page.textContent('#modal h2'));
    await page.click('#modal .modal-foot .btn-danger');
    await wait(700);
    check('mano de obra: quedan 0 tareas', (await ids()).length === 0 && (await guardados('manoObra')) === 0);

    // Otro proyecto o pestaña no hereda la selección
    await page.goto(`${BASE}#/p/${UID}/materiales`);
    await page.waitForSelector('#tab-body input[data-sel-todo="materiales"]');
    check('materiales empieza sin selección', (await barra()) === '');

    // Móvil: la casilla está en la tarjeta
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(300);
    await casilla(0).click();
    check('móvil: la casilla se puede marcar', (await barra()) === '1 fila seleccionada', await barra());
    await page.screenshot({ path: path.join(SHOTS, 'movil.png') });
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
