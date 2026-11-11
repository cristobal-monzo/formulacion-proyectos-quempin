// Prueba del enlace de la fuente del costo (2026-11-09): en materiales, equipos y otros se puede guardar,
// de forma opcional, el enlace de donde se sacó el costo unitario. La tabla no muestra el enlace: solo un
// ícono que lo abre. Se agrega con el ícono y se cambia o quita desde el menú ⋯ de la fila.
// Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/enlace/e2e.js
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
const M1 = EJ.materiales[0].uid;
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const guardado = () => page.evaluate(([k, u]) => JSON.parse(localStorage.getItem(k)).proyectos.find((p) => p.uid === u), [KEY, UID]);
  const boton = `[data-act="enlace-ref"][data-uid="${M1}"]`;
  try {
    await page.goto(`${BASE}#/p/${UID}/materiales`);
    await page.waitForSelector(boton);
    check('materiales: cada fila tiene el ícono del enlace', (await page.$$('#tab-body tr[data-row] [data-act="enlace-ref"]')).length === EJ.materiales.length);
    check('sin enlace, el ícono no está destacado', !(await page.$eval(boton, (b) => b.classList.contains('usado'))));

    // Agregar: el ícono abre la ventana; un enlace inválido no se guarda
    await page.click(boton);
    await page.waitForSelector('#enl-url');
    await page.fill('#enl-url', 'esto no es un enlace');
    await page.click('#modal .btn-primario');
    await wait(200);
    check('un enlace inválido deja la ventana abierta y avisa', await page.$eval('#modal', (d) => d.open) && !(await page.$eval('#enl-err', (e) => e.hidden)));
    await page.fill('#enl-url', 'www.proveedor-ejemplo.cl/flange-2?ref=1');
    await page.press('#enl-url', 'Enter');
    await wait(1000);
    let g = await guardado();
    const m = g.materiales.find((x) => x.uid === M1);
    check('Enter guarda el enlace, completado con https://', m.enlace === 'https://www.proveedor-ejemplo.cl/flange-2?ref=1', m.enlace);
    check('con enlace, el ícono queda destacado', await page.$eval(boton, (b) => b.classList.contains('usado')));
    const html = await page.$eval('#tab-body table', (t) => t.innerText + t.innerHTML);
    check('la tabla no muestra el enlace', !html.includes('flange-2') && !html.includes('https://www.proveedor'), html.match(/.{40}flange-2.{20}/));
    check('la ayuda del ícono dice solo el dominio', /proveedor-ejemplo\.cl/.test(await page.$eval(boton, (b) => b.dataset.tip)));

    // Abrir: con enlace, el ícono abre la fuente en otra pestaña (el dominio ficticio responde desde la prueba)
    await ctx.route('https://www.proveedor-ejemplo.cl/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Fuente</p>' }));
    const [nueva] = await Promise.all([ctx.waitForEvent('page'), page.click(boton)]);
    check('el ícono abre la fuente en otra pestaña', /proveedor-ejemplo\.cl\/flange-2/.test(nueva.url()), nueva.url());
    await nueva.close();
    await page.screenshot({ path: path.join(SHOTS, 'materiales.png') });

    // Duplicar copia el enlace
    await page.click(`[data-menu="fila"][data-uid="${M1}"]`);
    check('el menú ⋯ ofrece cambiar o quitar el enlace', /Cambiar o quitar enlace/.test(await page.textContent('body')));
    await page.click('text=Duplicar fila');
    await wait(1000);
    g = await guardado();
    check('la fila duplicada conserva el enlace', g.materiales.filter((x) => x.enlace).length === 2, g.materiales.map((x) => x.enlace));

    // Quitar desde el menú
    await page.click(`[data-menu="fila"][data-uid="${M1}"]`);
    await page.click('text=Cambiar o quitar enlace');
    await page.waitForSelector('#enl-url');
    await page.click('#modal button:has-text("Quitar enlace")');
    await wait(1000);
    g = await guardado();
    check('«Quitar enlace» lo borra del costo', !('enlace' in g.materiales.find((x) => x.uid === M1)));
    check('sin enlace, el ícono vuelve a verse tenue', !(await page.$eval(boton, (b) => b.classList.contains('usado'))));

    // Un enlace «javascript:» nunca se acepta
    const malo = await page.evaluate(() => { const i = document.querySelector('[data-act="enlace-ref"]'); return !!i; });
    await page.click(boton);
    await page.waitForSelector('#enl-url');
    await page.fill('#enl-url', 'javascript:alert(1)');
    await page.click('#modal .btn-primario');
    await wait(200);
    check('un enlace javascript: no se acepta', malo && await page.$eval('#modal', (d) => d.open));
    await page.click('#modal button:has-text("Cancelar")');

    // Equipos y otros también; mano de obra no
    for (const tab of ['equipos', 'otros']) {
      await page.goto(`${BASE}#/p/${UID}/${tab}`);
      await page.waitForSelector('#tab-body');
      await wait(300);
      if (!(await page.$('#tab-body tr[data-row]'))) { await page.click(`.tbl-toolbar [data-act="add-row"][data-list="${tab}"]`); await wait(400); }
      const filas = await page.$$('#tab-body tr[data-row]');
      const iconos = await page.$$('#tab-body tr[data-row] [data-act="enlace-ref"]');
      check(`${tab}: cada fila tiene el ícono del enlace`, filas.length > 0 && iconos.length === filas.length, [filas.length, iconos.length]);
    }
    await page.goto(`${BASE}#/p/${UID}/manoObra`);
    await page.waitForSelector('#tab-body');
    await wait(300);
    check('mano de obra no tiene enlace', (await page.$$('[data-act="enlace-ref"]')).length === 0);
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
