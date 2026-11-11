// Captura del paso 4 de un proyecto en la moneda indicada: node .prueba/moneda/foto.js USD
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ejemplos', 'QPN-EJEMPLO_medidores-gn.json'), 'utf8'));
const mon = process.argv[2] || 'CLP', tab = process.argv[3] || 'resumen', ancho = +(process.argv[4] || 1360);
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: ancho, height: 950 }, locale: 'es-CL' });
  EJ.parametros = Object.assign({}, EJ.parametros, { moneda: mon });
  await ctx.addInitScript((p) => {
    localStorage.setItem('quempin_formulador_unlocked', '1');
    localStorage.setItem('qpn.formulacion.proyectos.v1', JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: [p] }));
  }, EJ);
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:8799/index.html#/p/${EJ.uid}/${tab}`);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(__dirname, 'shots', `foto-${mon}-${tab}-${ancho}.png`), fullPage: true });
  await browser.close();
})();
