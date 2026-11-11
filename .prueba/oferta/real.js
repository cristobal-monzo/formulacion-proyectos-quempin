// La lista de ofertas con los NOMBRES REALES de la biblioteca (carpetas vacías en el almacenamiento
// privado del navegador; la biblioteca real no se toca). Datos: python lee solo los nombres en
// .prueba/oferta/real/estructura.json. Uso: servir el repo en 8797 y  node .prueba/oferta/real.js
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));
const BASE = 'http://127.0.0.1:8797/index.html';
const E = JSON.parse(fs.readFileSync(path.join(__dirname, 'real', 'estructura.json'), 'utf8'));
const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-CL' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('quempin_viz_unlocked', '1'); } catch (e) { /* */ }
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Formulación de proyectos - Documentos', { create: true });
    FileSystemHandle.prototype.queryPermission = async function () { return 'granted'; };
    FileSystemHandle.prototype.requestPermission = async function () { return 'granted'; };
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  try {
    await page.goto(BASE + '#/guia');
    await page.evaluate(async (carpetas) => {
      const bib = await (await navigator.storage.getDirectory()).getDirectoryHandle('Formulación de proyectos - Documentos', { create: true });
      for (const r of carpetas) { let d = bib; for (const n of r.split('/')) d = await d.getDirectoryHandle(n, { create: true }); }
      let d = bib;
      for (const n of ['.HERRAMIENTAS FORMULACIÓN', 'Intercambio']) d = await d.getDirectoryHandle(n, { create: true });
      const w = await (await d.getFileHandle('intercambio.json', { create: true })).createWritable();
      await w.write(JSON.stringify({ esquema: 'quempin.intercambio/1' })); await w.close();
    }, E.carpetas);
    await page.goto(BASE + '#/'); await wait(800);
    await page.click('#compartida [data-act="compartir"]'); await wait(800);
    const t0 = Date.now();
    const lista = await page.evaluate(async () => (await window.QOferta.carpetas(true)).map((c) => ({ ruta: c.ruta, grupo: c.grupo })));
    const ms = Date.now() - t0;
    const clave = (o) => o.ruta.join('/') + '|' + o.grupo;
    const esperadas = new Set(E.ofertas.map(clave));
    const obtenidas = new Set(lista.map(clave));
    check(`las ${E.ofertas.length} carpetas de oferta reales, con su grupo`, esperadas.size === obtenidas.size && [...esperadas].every((k) => obtenidas.has(k)),
      { faltan: [...esperadas].filter((k) => !obtenidas.has(k)).slice(0, 5), sobran: [...obtenidas].filter((k) => !esperadas.has(k)).slice(0, 5) });
    check('todas las rutas listadas son válidas para escribir', await page.evaluate((l) => l.every((c) => window.QOferta.rutaValida(c.ruta)), lista));
    check(`listar es rápido (${ms} ms)`, ms < 3000, ms);
    await page.click('[data-act="nuevo"]'); await wait(700);
    const filas = await page.$$eval('#modal .cp-fila', (xs) => xs.length);
    check('el diálogo muestra todas las ofertas', filas === E.ofertas.length, filas);
    await page.screenshot({ path: path.join(__dirname, 'shots', '7-nombres-reales.png') });
    await page.fill('#cp-buscar', 'calder'); await page.dispatchEvent('#cp-buscar', 'input'); await wait(200);
    const vis = await page.$$eval('#modal .cp-fila:not([hidden])', (xs) => xs.length);
    check('el buscador filtra (calder)', vis > 0 && vis < filas, vis);
    check('sin errores de JavaScript', errores.length === 0, errores);
  } finally { await browser.close(); }
  console.log(results.join('\n'));
  const fail = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fail}/${results.length} OK`);
  process.exit(fail ? 1 : 0);
})();
