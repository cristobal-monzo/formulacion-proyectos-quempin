// Qué elementos se salen del ancho de la ventana (diagnóstico de desborde en el teléfono).
'use strict';
const R = require('./recorrido.js');
const { BASE, wait, prepararBiblioteca, contexto, chromium } = R;
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { page } = await contexto(browser, { width: 390, height: 844 });
  await page.goto(BASE + '#/guia');
  await prepararBiblioteca(page);
  await page.goto(BASE + '#/');
  await page.waitForSelector('[data-act="ejemplo"]');
  await page.click('[data-act="ejemplo"]');
  await wait(1200);
  for (const tab of (process.argv[2] || 'materiales,seguimiento').split(',')) {
    await page.evaluate((t) => { location.hash = location.hash.replace(/\/[^/]+$/, '/' + t); }, tab);
    await wait(1200);
    const r = await page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const out = [];
      document.querySelectorAll('body *').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.right > W + 1 && b.width > 0) {
          const st = getComputedStyle(el);
          if (st.position === 'fixed') return;
          let anc = el.parentElement, recortado = false;
          while (anc) { const s = getComputedStyle(anc); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { recortado = true; break; } anc = anc.parentElement; }
          if (!recortado) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}#${el.id} right=${Math.round(b.right)} w=${Math.round(b.width)}`);
        }
      });
      return { W, sw: document.documentElement.scrollWidth, out: out.slice(0, 15) };
    });
    console.log(tab, JSON.stringify(r, null, 1));
  }
  await browser.close();
})();
