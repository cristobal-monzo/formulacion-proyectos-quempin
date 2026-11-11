// Costos: al cambiar de tipo de costo (Materiales, Equipos, Mano de obra, Otros) la página no sube;
// la barra de subpestañas queda donde estaba en la pantalla. Los pasos y «Siguiente» sí van arriba.
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/ux/subpestanas.js
'use strict';
const R = require('./recorrido.js');
const { BASE, wait, prepararBiblioteca, contexto, chromium } = R;
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const [nombre, vp] of [['escritorio', { width: 1360, height: 520 }], ['teléfono', { width: 390, height: 700 }]]) {
    const { page } = await contexto(browser, vp);
    page.on('pageerror', (e) => errores.push(`${nombre}: ${e.message}`));
    await page.goto(BASE + '#/guia');
    await prepararBiblioteca(page);
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="ejemplo"]');
    await page.click('[data-act="ejemplo"]');
    await wait(1200);
    await page.evaluate(() => { location.hash = location.hash.replace(/\/[^/]+$/, '/manoObra'); });
    await wait(1000);
    // Bajar hasta que la barra quede cerca del borde de arriba (bajo la barra fija del Formulador)
    const y0 = await page.evaluate(() => {
      const b = document.querySelector('#tab-body .subtabs');
      window.scrollTo(0, Math.max(0, b.getBoundingClientRect().top + window.scrollY - 120));
      return window.scrollY;
    });
    await wait(200);
    const top = () => page.evaluate(() => Math.round(document.querySelector('#tab-body .subtabs').getBoundingClientRect().top));
    const antes = await top();
    check(`${nombre}: la página está bajada antes del cambio`, y0 > 0, y0);
    await page.click('#tab-body .subtab[data-tab="otros"]');
    await wait(400);
    const tab = await page.evaluate(() => location.hash.split('/').pop());
    check(`${nombre}: Mano de obra → Otros cambia de tipo de costo`, tab === 'otros', tab);
    const despues = await top();
    const y1 = await page.evaluate(() => window.scrollY);
    check(`${nombre}: la barra de subpestañas queda donde estaba (${antes}px)`, Math.abs(despues - antes) <= 1 || (y1 > 0 && despues > antes && await page.evaluate(() => window.scrollY + innerHeight >= document.documentElement.scrollHeight - 1)), { antes, despues, y1 });
    check(`${nombre}: la página no volvió arriba`, y1 > 0, y1);
    await page.click('#tab-body .subtab[data-tab="materiales"]');
    await wait(400);
    check(`${nombre}: Otros → Materiales tampoco la mueve`, Math.abs((await top()) - antes) <= 1, { antes, ahora: await top() });
    // Un paso de la barra de pasos (o el pie «Siguiente») sí lleva arriba, como antes
    await page.click('.paso-tab[data-tab="partidas"]');
    await wait(400);
    check(`${nombre}: cambiar de paso sí vuelve arriba`, (await page.evaluate(() => window.scrollY)) === 0, await page.evaluate(() => window.scrollY));
    await page.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  if (errores.length) console.log('\nERRORES:\n' + errores.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length + errores.length;
  console.log(`\n${results.length - results.filter((r) => r.startsWith('FAIL')).length}/${results.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
