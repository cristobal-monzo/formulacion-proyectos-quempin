// «Pegar desde Excel» en las tablas de costos (2026-10-14): vista previa, partida elegida, costos con IVA
// dejados netos y filas agregadas que se suman al precio. Proyecto de ejemplo (datos del Excel original).
// Uso: servir el repo en http://127.0.0.1:8798 y  node .prueba/pegar/e2e.js
'use strict';
const path = require('path');
const R = require(path.join(__dirname, '..', 'ux', 'recorrido.js'));
const { BASE, wait, foto, texto, hay, contexto, chromium, errores } = R;

const results = [];
const check = (n, c, x) => { results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`); };

const PEGADO = [
  'Descripción\tUnidad\tCantidad\tCosto unitario c/IVA\tTotal',
  'Válvula bola 2" (ficticio)\tun\t2\t$11.900\t$23.800',
  'Cañería cobre 3/4" (ficticio)\tmts\t1,5\t5.950\t8.925',
  '\tTotal\t\t\t$32.725'
].join('\n');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { page } = await contexto(browser, { width: 1366, height: 900 });
  try {
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="ejemplo"]');
    await page.click('[data-act="ejemplo"]');
    await page.waitForSelector('#tab-body');
    await wait(800);
    const uid = await page.evaluate(() => location.hash.split('/')[2]);
    const antes = await page.evaluate((uid) => { const p = window.QStore.get(uid); return { n: p.materiales.length, partidas: p.partidas.map((x) => x.uid) }; }, uid);
    await page.goto(`${BASE}#/p/${uid}/materiales`);
    await page.waitForSelector('[data-act="pegar-filas"]');
    check('materiales: botón «Pegar desde Excel»', await hay(page, '[data-act="pegar-filas"][data-list="materiales"]'));
    await page.goto(`${BASE}#/p/${uid}/manoObra`);
    await wait(400);
    check('mano de obra no lo ofrece (otra estructura)', !(await hay(page, '[data-act="pegar-filas"]')));
    await page.goto(`${BASE}#/p/${uid}/materiales`);
    await wait(500);
    await page.click('[data-act="pegar-filas"]');
    await page.waitForSelector('#modal[open] #pg-texto');
    check('el foco queda en el texto', await page.evaluate(() => document.activeElement && document.activeElement.id === 'pg-texto'));
    check('sin texto, el botón está deshabilitado', await page.$eval('#modal .modal-foot .btn-primario', (b) => b.disabled));
    await page.fill('#pg-texto', PEGADO);
    await wait(200);
    const res = await texto(page, '#pg-previa .pg-res');
    check('vista previa: 2 filas y la de total omitida', /2 filas/.test(res) && /1 fila omitida/.test(res), res);
    check('el encabezado «c/IVA» marca dejarlos netos', await page.$eval('#pg-iva', (c) => c.checked));
    const celdas = await page.$$eval('#pg-previa tbody tr:first-child td', (t) => t.map((x) => x.textContent.trim()));
    check('vista previa: costo neto (11.900 / 1,19 = 10.000) y unidad normalizada', celdas.join('|') === 'Válvula bola 2" (ficticio)|Un.|2|$10.000', celdas);
    check('el botón dice cuántas', /Agregar 2 filas/.test(await texto(page, '#modal .modal-foot .btn-primario')));
    await page.selectOption('#pg-partida', antes.partidas[1]);
    await foto(page, 'pegar-previa');
    await page.click('#modal .modal-foot .btn-primario');
    await wait(700);
    const despues = await page.evaluate((uid) => window.QStore.get(uid).materiales.slice(-2), uid);
    check('se agregaron las 2 filas al final', despues.length === 2 && /Válvula/.test(despues[0].descripcion) && /Cañería/.test(despues[1].descripcion), despues);
    check('con la partida elegida', despues.every((x) => x.partida === antes.partidas[1]), despues.map((x) => x.partida));
    check('costos netos y cantidad decimal', despues[0].costoUnitario === 10000 && despues[1].costoUnitario === 5000 && despues[1].cantidad === 1.5 && despues[1].unidad === 'm', despues);
    check('el aviso confirma', /2 filas agregadas a materiales/.test(await texto(page, '#toast')), await texto(page, '#toast'));
    const total = await page.evaluate((uid) => window.QStore.get(uid).materiales.length, uid);
    check('el proyecto guardado tiene 2 materiales más', total === antes.n + 2, { antes: antes.n, total });

    // Sin encabezado, sin IVA; cancelar no agrega nada
    await page.click('[data-act="pegar-filas"]');
    await page.waitForSelector('#modal[open] #pg-texto');
    await page.fill('#pg-texto', 'Regulador (ficticio)\t3\t25.000');
    await wait(150);
    check('sin encabezado: no marca IVA', !(await page.$eval('#pg-iva', (c) => c.checked)));
    await page.click('#modal .modal-foot .btn:not(.btn-primario)');
    await wait(300);
    check('cancelar no agrega filas', (await page.evaluate((uid) => window.QStore.get(uid).materiales.length, uid)) === antes.n + 2);
  } catch (e) {
    check('sin excepción', false, String(e && e.stack || e));
  } finally {
    check('sin errores de JavaScript', !errores.length, errores);
    await browser.close();
    results.forEach((r) => console.log(r));
    const fallas = results.filter((r) => r.startsWith('FAIL')).length;
    console.log(`\n${results.length - fallas}/${results.length} OK`);
    process.exit(fallas ? 1 : 0);
  }
})();
