// El tablero de Análisis Financiero conectado con el Formulador (2026-10-06): #proyecto=TAG abre la
// ficha (o «Ingresar datos» si le faltan datos, o un aviso si el tablero aún no lo trae), la ficha
// enlaza a la formulación y la navegación de los tableros lleva al Formulador. Tablero de PRUEBA con
// datos ficticios (scratchpad/af_prueba.py), servido en http://127.0.0.1:8796.
'use strict';
const path = require('path');
const fs = require('fs');
const R = require('./recorrido.js');
const { wait, foto, texto, hay, chromium, SHOTS } = R;
const AF = 'http://127.0.0.1:8796/index.html';
const results = [];
const check = (n, c, x) => { results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const errores = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es-CL' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto(AF + '#proyecto=GIM');
    await page.fill('input[type="password"]', 'prueba ficticia');
    await page.keyboard.press('Enter');
    await page.waitForSelector('tr.doc-row.is-expanded[data-tag="GIM"]', { timeout: 15000 });
    check('#proyecto=GIM abre la pestaña Proyectos con la ficha de GIM', true);
    const enlace = await page.getAttribute('.ficha-cab-acciones a.ficha-boton', 'href');
    check('la ficha enlaza a la formulación por N° de requerimiento', /formulacion-proyectos-quempin\/#\/req\/312$/.test(enlace || ''), enlace);
    await wait(600);
    await foto(page, 'af-ficha-con-enlace');
    // Un proyecto sin N°: por TAG
    await page.evaluate(() => { location.hash = '#proyecto=MED'; });
    await page.waitForSelector('tr.doc-row.is-expanded[data-tag="MED"]', { timeout: 8000 });
    const enlace2 = await page.getAttribute('tr.doc-row.is-expanded + tr .ficha-cab-acciones a.ficha-boton, .ficha-cab-acciones a.ficha-boton', 'href');
    check('sin N° de requerimiento, enlaza por TAG', /#\/tag\/MED$/.test(enlace2 || ''), enlace2);
    // Un proyecto que aún no entra al análisis: «Ingresar datos» con ese proyecto
    await page.evaluate(() => { location.hash = '#proyecto=NUE'; });
    await wait(600);
    const activa = await page.$eval('.viz-tab-btn.active', (b) => b.dataset.tab).catch(() => '');
    check('#proyecto=NUE (le faltan datos) abre «Ingresar datos» con ese proyecto', activa === 'tabIngreso' && (await page.inputValue('#ingBuscar')) === 'NUE', { activa, buscar: await page.inputValue('#ingBuscar') });
    await foto(page, 'af-ingreso-desde-enlace');
    // Un TAG que el tablero no trae todavía
    await page.evaluate(() => { location.hash = '#proyecto=ZZZ'; });
    await wait(500);
    const aviso = await texto(page, '#avisoEnlace');
    check('#proyecto=ZZZ: aviso de que aparece al volver a publicar', aviso.includes('ZZZ') && aviso.includes('todavía no está en este tablero'), aviso);
    await foto(page, 'af-aviso-enlace');
    // La navegación de los tableros lleva al Formulador
    const nav = await page.getAttribute('.viz-modnav-herr', 'href');
    check('la barra de los tableros lleva al Formulador', /formulacion-proyectos-quempin\/$/.test(nav || ''), nav);
    // Teléfono: la barra no se desborda
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { location.hash = '#proyecto=GIM'; });
    await wait(700);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('teléfono: sin desplazamiento horizontal', desborde <= 0, desborde);
    await foto(page, 'af-movil-ficha');
  } catch (e) {
    results.push('FAIL excepción: ' + (e && e.stack || e));
  } finally {
    await browser.close();
    console.log(results.join('\n'));
    console.log(errores.length ? 'Errores de página:\n' + errores.join('\n') : 'Sin errores de página');
    const fallas = results.filter((r) => r.startsWith('FAIL')).length;
    console.log(`\n${results.length - fallas}/${results.length} OK`);
  }
})();
