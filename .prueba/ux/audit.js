// Auditoría UX automática de la herramienta de formulación.
// Uso: node audit.js <etiqueta>   → escribe metrics-<etiqueta>.json
// Mide cada sección funcional en escritorio (1366×900) y móvil (390×844).
const { chromium } = require(require('path').join(process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas'), 'node_modules', 'playwright-core'));
const fs = require('fs');
const label = process.argv[2] || 'base';
const URL = 'http://127.0.0.1:8792/index.html';
const SHOTS = __dirname + '/shots/';

/* Se ejecuta dentro de la página: mide la vista actual */
function medir({ precio, margen }) {
  const root = document.querySelector('dialog[open]') || document.querySelector('#app');
  const vis = (el) => el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const EXCL = 'select, option, script, style, .print-only, #tooltip, #toast, #pop, [hidden]';
  const JR = /(^|[^\p{L}])(DH|MO|APU|GG|PU|markup|Cant\.|unid\.|c\/u)(?=[^\p{L}]|$)/gu;
  let words = 0, jargon = 0, dupPrecio = 0, dupMargen = 0;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement;
    if (!p || p.closest(EXCL) || !vis(p)) continue;
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    words += t.split(' ').filter((x) => /[\p{L}\p{N}]/u.test(x)).length;
    if (!p.closest('abbr[title], [data-tip], [title]')) { const m = t.match(JR); if (m) jargon += m.length; }
    if (precio && t.includes(precio)) dupPrecio++;
    if (margen && t.includes(margen)) dupMargen++;
  }
  const SEL = 'a[href], button, input:not([type=hidden]):not([type=radio]), select, textarea, summary, [tabindex="0"], label:has(> input[type=radio])';
  const ctrls = Array.from(root.querySelectorAll(SEL)).filter(vis);
  const H = window.innerHeight;
  const fold = ctrls.filter((c) => { const r = c.getBoundingClientRect(); return r.top < H && r.bottom > 0; });
  const small = ctrls.filter((c) => {
    if (getComputedStyle(c).display === 'inline') return false; // enlaces dentro de un texto: exentos (WCAG 2.5.8)
    const r = c.getBoundingClientRect();
    return r.width < 24 || r.height < 24;
  });
  const nombre = (c) => {
    if (c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || c.getAttribute('title')) return true;
    if (c.id && document.querySelector(`label[for="${CSS.escape(c.id)}"]`)) return true;
    if (c.closest('label')) return true;
    if ((c.textContent || '').trim()) return true;
    if (c.querySelector && c.querySelector('img[alt]')) return true;
    return false;
  };
  const unnamed = ctrls.filter((c) => !nombre(c)).length;
  const scrollers = Array.from(root.querySelectorAll('*')).filter((e) => {
    const s = getComputedStyle(e);
    return (s.overflowX === 'auto' || s.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1 && vis(e) && !e.matches('.tabs, .pasos-bar, .viz-modnav-inner');
  }).length;
  const pageOverflow = document.documentElement.scrollWidth > window.innerWidth + 1 ? 1 : 0;
  const primary = Array.from(root.querySelectorAll('.btn-primario')).filter(vis).length;
  const screens = document.querySelector('dialog[open]') ? 1 : document.documentElement.scrollHeight / H;
  return { words, screens: Math.round(screens * 100) / 100, ctrlFold: fold.length, ctrlTotal: ctrls.length, primary,
    overflow: scrollers + pageOverflow, small: small.length, unnamed, jargon, dupPrecio, dupMargen,
    smallList: small.slice(0, 40).map((c) => (c.className || c.tagName) + ':' + Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height)) };
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const result = {};
  for (const [dev, vp] of [['desk', { width: 1366, height: 900 }], ['mob', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: dev === 'mob', hasTouch: dev === 'mob' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const go = async (h) => { await page.goto(URL + h); await page.waitForTimeout(350); };
    const tabIds = () => page.$$eval('#tabs [data-tab]', (els) => els.map((e) => e.dataset.tab));
    const view = async (tab) => {
      const b = await page.$(`#tabs [data-tab="${tab}"]`);
      if (b) await b.click(); else await page.evaluate((t) => { location.hash = location.hash.replace(/\/[^/]*$/, '/' + t); }, tab);
      await page.waitForTimeout(250);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(120);
    };
    const out = {};
    const med = async (sec, precio, margen, shot) => {
      const m = await page.evaluate(medir, { precio, margen });
      if (shot) await page.screenshot({ path: `${SHOTS}${label}-${dev}-${shot}.png`, fullPage: true });
      (out[sec] = out[sec] || []).push(m);
    };
    await go('#/');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('quempin_fp_theme', 'light'); });
    await go('#/');
    await med('inicio', null, null, 'inicio');
    // Proyecto nuevo, vacío
    await page.click('[data-act="nuevo"]');
    await page.waitForTimeout(400);
    const idsNuevo = await tabIds();
    await view('partidas'); await med('vacio-partidas', null, null, 'vacio-partidas');
    await view('materiales'); await med('vacio-costos', null, null, 'vacio-costos');
    // Ejemplo
    await page.evaluate(() => { const S = window.QStore; const ex = S.exampleProject(); S.upsert(ex); location.hash = `#/p/${ex.uid}/ficha`; });
    await page.waitForTimeout(500);
    const ids = await tabIds();
    const P = '$4.092.808', M = '50,0 %';
    await view(ids[0]); await med('ficha', P, M, 'ficha');
    await view('partidas'); await med('partidas', P, M, 'partidas');
    await view('materiales'); await med('materiales', P, M, 'materiales');
    await view('manoObra'); await med('manoObra', P, M, 'manoObra');
    await view('otros'); await med('otros', P, M, 'otros');
    const finales = ids.filter((t) => !['ficha', 'partidas', 'materiales', 'equipos', 'manoObra', 'otros'].includes(t));
    for (const t of finales) { await view(t); await med('resumen', P, M, 'res-' + t); }
    await go('#/'); await med('listado', null, null, 'listado');
    await go('#/guia'); await med('guia', null, null, 'guia');
    await go('#/papelera'); await med('papelera', null, null, 'papelera');
    await go('#/');
    await page.click('[data-act="config"]');
    await page.waitForTimeout(300);
    await med('config', null, null, 'config');
    await page.keyboard.press('Escape');
    result[dev] = { secciones: out, tabsNuevo: idsNuevo, tabs: ids, errores: errs };
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${__dirname}/metrics-${label}.json`, JSON.stringify(result, null, 1));
  // Resumen por sección (suma de vistas cuando una sección se divide en varias)
  const K = ['words', 'screens', 'ctrlFold', 'ctrlTotal', 'primary', 'overflow', 'small', 'unnamed', 'jargon', 'dupPrecio', 'dupMargen'];
  for (const dev of ['desk', 'mob']) {
    console.log(`\n== ${dev} ==  errores: ${result[dev].errores.length}`);
    console.log('sección'.padEnd(16) + K.map((k) => k.padStart(9)).join(''));
    const tot = {};
    for (const [s, arr] of Object.entries(result[dev].secciones)) {
      const agg = {};
      K.forEach((k) => { agg[k] = arr.reduce((a, m) => a + m[k], 0); tot[k] = (tot[k] || 0) + agg[k]; });
      console.log(s.padEnd(16) + K.map((k) => String(Math.round(agg[k] * 100) / 100).padStart(9)).join(''));
    }
    console.log('TOTAL'.padEnd(16) + K.map((k) => String(Math.round(tot[k] * 100) / 100).padStart(9)).join(''));
  }
})();
