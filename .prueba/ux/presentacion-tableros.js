// Capturas para la presentación (2026-10-06): el tablero de Análisis Financiero de PRUEBA (datos
// ficticios, scratchpad/af_prueba.py, en http://127.0.0.1:8796) y el índice «Herramientas QUEMPIN».
'use strict';
const R = require('./recorrido.js');
const { wait, foto, chromium } = R;
const AF = 'http://127.0.0.1:8796/index.html';
const HUB = 'file:///' + 'C:/Users/quemp/OneDrive - QUEMPIN SPA/Escritorio/Proyectos Claude/Finanzas QUEMPIN/Visualizador Web/index.html'.replace(/ /g, '%20');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CL', deviceScaleFactor: 1.5 });
    const page = await ctx.newPage();
    await page.goto(AF + '#proyecto=GIM');
    await page.fill('input[type="password"]', 'prueba ficticia');
    await page.keyboard.press('Enter');
    await page.waitForSelector('tr.doc-row.is-expanded[data-tag="GIM"]', { timeout: 15000 });
    await wait(900);
    await foto(page, 'af-ficha');
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(400);
    await foto(page, 'af-cabecera');
    const hub = await ctx.newPage();
    await hub.goto(HUB);
    await wait(500);
    await foto(hub, 'hub');
    await hub.evaluate(() => window.scrollTo(0, 560));
    await wait(300);
    await foto(hub, 'hub-tableros');
  } catch (e) {
    console.error('ERROR', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
