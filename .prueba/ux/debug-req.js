'use strict';
const path = require('path');
const fs = require('fs');
const R = require('./recorrido.js');
const { BASE, wait, contexto, chromium } = R;
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'integracion', 'datos.json'), 'utf8'));
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { page } = await contexto(browser, { width: 1360, height: 950 });
  await page.goto(BASE + '#/guia');
  await page.evaluate(async ([archivos]) => {
    let base = await navigator.storage.getDirectory();
    for (const n of ['Formulación de proyectos - Documentos', '.HERRAMIENTAS FORMULACIÓN', 'Intercambio']) base = await base.getDirectoryHandle(n, { create: true });
    for (const [r, texto] of archivos) {
      const partes = r.split('/'); let d = base;
      for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(partes[partes.length - 1], { create: true })).createWritable(); await w.write(texto); await w.close();
    }
  }, [[['intercambio.json', JSON.stringify({ esquema: 'quempin.intercambio/1' })], ...Object.entries(DATOS)]]);
  await page.goto(BASE + '#/');
  await page.waitForSelector('[data-act="nuevo"]');
  await page.click('[data-act="nuevo"]'); await wait(400);
  if (await page.$('#modal[open]')) { await page.click('#modal button:has-text("Conectar la biblioteca")'); await wait(800); }
  await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 8000 });
  await page.click('#modal button:has-text("Sin carpeta por ahora")');
  await page.waitForSelector('#f-req', { timeout: 10000 });
  await page.fill('[data-f="titulo"]', '');
  await page.fill('#f-req', '280');
  await page.dispatchEvent('#f-req', 'change');
  await wait(500);
  console.log('pop tras fill:', await page.evaluate(() => ({ hidden: document.getElementById('pop').hidden, items: document.querySelectorAll('#pop .pop-item').length })));
  if (!(await page.evaluate(() => document.getElementById('pop').hidden))) { await page.keyboard.press('Escape'); await wait(100); }
  await page.click('#f-req + .combo-btn');
  await wait(200);
  console.log('pop tras clic:', await page.evaluate(() => ({ hidden: document.getElementById('pop').hidden, items: Array.from(document.querySelectorAll('#pop .pop-item')).map((x) => x.textContent.trim().slice(0, 40)), activo: document.activeElement && (document.activeElement.id || document.activeElement.className) })));
  await wait(1500);
  console.log('pop 1.5 s después:', await page.evaluate(() => ({ hidden: document.getElementById('pop').hidden })));
  console.log('errores:', R.errores);
  console.log('hash:', await page.evaluate(() => location.hash), 'modal:', await page.evaluate(() => document.getElementById('modal').open));
  await page.screenshot({ path: '.prueba/ux/shots/debug-req.png' });
  await browser.close();
})();
