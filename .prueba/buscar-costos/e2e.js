// Prueba del buscador, el orden y el total filtrado de las tablas de costos (2026-11-10): en materiales,
// equipos, mano de obra y otros hay un buscador (descripción o ID) y un «Ordenar» (como se ingresaron,
// mayor a menor costo, menor a mayor, alfabético). Con un filtro de partida o una búsqueda, el total de
// abajo suma solo las filas que se ven y dice cuántas son.
// Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/buscar-costos/e2e.js
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
const clp = (s) => Number(String(s).replace(/[^\d-]/g, ''));

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
  const descs = () => page.$$eval('#tab-body tbody tr[data-row] td:nth-child(2) input', (els) => els.map((e) => e.value));
  const ids = () => page.$$eval('#tab-body tbody tr[data-row] td.code', (els) => els.map((e) => e.textContent.trim()));
  const total = async () => clp(await page.textContent('#tab-body tfoot td[data-label="Total"]'));
  const etiqueta = () => page.textContent('#tab-body tfoot tr td:nth-child(2)');
  try {
    await page.goto(`${BASE}#/p/${UID}/materiales`);
    await page.waitForSelector('#buscar-materiales');
    const totalProyecto = await total();
    check('sin filtro, el total es el del proyecto (126.404)', totalProyecto === 126404, totalProyecto);
    check('sin filtro, la etiqueta dice «del proyecto»', /del proyecto/.test(await etiqueta()));
    const idsAntes = await ids();

    // Ordenar
    await page.selectOption('#orden-materiales', 'mayor');
    await wait(200);
    check('mayor a menor costo', JSON.stringify(await descs()) === JSON.stringify(["Flanges de 2''", "Flanges de 1 1/2''", "Flanges de 1''"]), await descs());
    check('al ordenar, cada fila conserva su ID', JSON.stringify((await ids()).slice().sort()) === JSON.stringify(idsAntes.slice().sort()) && (await ids())[1] === 'M2', await ids());
    check('ordenar no cambia el total', (await total()) === totalProyecto);
    await page.selectOption('#orden-materiales', 'menor');
    await wait(200);
    check('menor a mayor costo', (await descs())[0] === "Flanges de 1''", await descs());
    await page.selectOption('#orden-materiales', 'az');
    await wait(200);
    check('alfabético', JSON.stringify(await descs()) === JSON.stringify(["Flanges de 1 1/2''", "Flanges de 1''", "Flanges de 2''"]), await descs());
    await page.selectOption('#orden-materiales', '');
    await wait(200);
    check('«Como se ingresaron» vuelve al orden original', JSON.stringify(await ids()) === JSON.stringify(idsAntes), await ids());

    // Buscar: sin tildes ni mayúsculas, sin perder el foco ni lo escrito
    await page.click('#buscar-materiales');
    await page.keyboard.type('FLANGES DE 2', { delay: 30 });
    await wait(500);
    check('la búsqueda filtra por descripción', JSON.stringify(await descs()) === JSON.stringify(["Flanges de 2''"]), await descs());
    check('el buscador sigue con el foco y el texto completo', await page.evaluate(() => document.activeElement && document.activeElement.id === 'buscar-materiales' && document.activeElement.value === 'FLANGES DE 2'));
    check('con búsqueda, el total suma solo lo visible (87.480)', (await total()) === 87480, await total());
    check('la etiqueta dice «filtrado · 1 de 3»', /filtrado\s*·\s*1 de 3/.test(await etiqueta()), await etiqueta());
    await page.screenshot({ path: path.join(SHOTS, 'materiales-busqueda.png') });

    await page.fill('#buscar-materiales', 'm3');
    await wait(500);
    check('la búsqueda también encuentra por ID', JSON.stringify(await ids()) === JSON.stringify(['M3']), await ids());
    await page.fill('#buscar-materiales', 'zzz');
    await wait(500);
    check('sin coincidencias avisa y el total es $0', /No hay ítems con este filtro/.test(await page.textContent('#tab-body tbody')) && (await total()) === 0);
    await page.fill('#buscar-materiales', '');
    await wait(500);
    check('al borrar la búsqueda vuelve el total del proyecto', (await total()) === totalProyecto && /del proyecto/.test(await etiqueta()));

    // Filtro de partida: el total también es el filtrado
    await page.selectOption('#filtro-materiales', EJ.partidas[0].uid);
    await wait(200);
    check('con filtro de partida, el total es el de la partida (87.480)', (await total()) === 87480, await total());
    // Editar un costo con filtro actualiza el total filtrado
    const uidVis = await page.$eval('#tab-body tbody tr[data-row]', (tr) => tr.dataset.row);
    await page.fill(`[data-list="materiales"][data-uid="${uidVis}"][data-k="costoUnitario"]`, '10000');
    await wait(400);
    check('editar con filtro actualiza el total filtrado (2×10.000×3)', (await total()) === 60000, await total());
    await page.selectOption('#filtro-materiales', '');
    await wait(200);

    // Agregar una fila con búsqueda activa limpia la búsqueda para que se vea
    await page.fill('#buscar-materiales', 'flanges');
    await wait(500);
    await page.click('.tbl-toolbar [data-act="add-row"][data-list="materiales"]');
    await wait(400);
    check('agregar con búsqueda la limpia y muestra la fila nueva', (await page.inputValue('#buscar-materiales')) === '' && (await descs()).length === 4, await descs());

    // Mano de obra: buscador, orden y días-hombre filtrados
    await page.goto(`${BASE}#/p/${UID}/manoObra`);
    await page.waitForSelector('#buscar-manoObra');
    const totMO = await total();
    const dhMO = clp(await page.textContent('#tab-body tfoot td[data-label="Días-hombre"]'));
    await page.click('#buscar-manoObra');
    await page.keyboard.type("1''", { delay: 30 });
    await wait(500);
    const n = (await page.$$('#tab-body tbody tr[data-row]')).length;
    check('mano de obra: la búsqueda filtra', n === 1, n);
    const totF = await total();
    check('mano de obra: el total filtrado es menor que el del proyecto', totF > 0 && totF < totMO, [totF, totMO]);
    check('mano de obra: los días-hombre también se filtran', clp(await page.textContent('#tab-body tfoot td[data-label="Días-hombre"]')) < dhMO);
    await page.screenshot({ path: path.join(SHOTS, 'mano-obra.png') });

    // Equipos y otros tienen los controles
    for (const tab of ['equipos', 'otros']) {
      await page.goto(`${BASE}#/p/${UID}/${tab}`);
      await page.waitForSelector('#tab-body');
      await wait(300);
      check(`${tab}: tiene buscador y orden`, !!(await page.$(`#buscar-${tab}`)) && !!(await page.$(`#orden-${tab}`)));
    }
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
