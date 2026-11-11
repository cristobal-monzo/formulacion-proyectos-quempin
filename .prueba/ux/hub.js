'use strict';
const R = require('./recorrido.js');
const { foto, chromium } = R;
const url = 'file:///' + 'C:/Users/quemp/OneDrive - QUEMPIN SPA/Escritorio/Proyectos Claude/Finanzas QUEMPIN/Visualizador Web/index.html'.replace(/ /g, '%20');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const [w, h, n] of [[1360, 900, 'hub-escritorio'], [390, 844, 'hub-movil']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(400);
    await foto(page, n, true);
    console.log(n, 'desborde', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  }
  await browser.close();
})();
