// Las tablas de costos (materiales, equipos, mano de obra, otros) caben sin desplazamiento lateral en
// cualquier ancho de pantalla (pedido del usuario, 2026-11-12). Entre 641 y 959 px, y en el teléfono,
// se leen como tarjetas. Se prueba con nombres largos y con una tabla de más de 300 filas (diseño fijo).
// Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/costos-ancho/e2e.js
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
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const copia = (o) => JSON.parse(JSON.stringify(o));

// Nombres largos en partidas y costos
const largo = copia(EJ);
largo.uid = 'ancho0000001';
largo.partidas.forEach((pt, i) => { pt.descripcion = `Suministro, fabricación e instalación de la partida ${i + 1} con un nombre muy largo para la prueba`; });
['materiales', 'manoObra', 'otros'].forEach((k) => largo[k].forEach((it) => { it.descripcion = `${it.descripcion} con una descripción bastante más larga de lo normal`; }));
largo.equipos = [Object.assign({}, largo.materiales[0], { uid: 'eq-ancho-1', descripcion: 'Arriendo de grúa horquilla con operador' })];
// Más de 300 materiales: la tabla usa diseño fijo
const muchos = copia(EJ);
muchos.uid = 'ancho0000002';
muchos.materiales = Array.from({ length: 320 }, (_, i) => Object.assign({}, EJ.materiales[i % EJ.materiales.length], { uid: `mat-ancho-${i}` }));

const ANCHOS = [1920, 1366, 1280, 1100, 1024, 960, 959, 800, 641, 390];
const TABS = ['materiales', 'equipos', 'manoObra', 'otros'];

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  for (const w of ANCHOS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'es-CL' });
    await ctx.addInitScript(([ps, key]) => {
      if (sessionStorage.getItem('sembrado')) return;
      sessionStorage.setItem('sembrado', '1');
      localStorage.setItem('quempin_formulador_unlocked', '1');
      localStorage.setItem(key, JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: ps }));
    }, [[largo, muchos], KEY]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errores.push(e.message));
    const sobra = () => page.evaluate(() => {
      const c = document.querySelector('#tab-body .tabla-contenedor');
      return { tabla: c ? c.scrollWidth - c.clientWidth : -1, pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const malos = [];
    for (const t of TABS) {
      await page.goto(`${BASE}#/p/${largo.uid}/${t}`);
      await page.waitForSelector('#tab-body table');
      await wait(250);
      const s = await sobra();
      if (s.tabla !== 0 || s.pagina > 0) malos.push([t, s]);
      if (t === 'materiales' && (w === 1024 || w === 800)) await page.screenshot({ path: path.join(SHOTS, `materiales-${w}.png`) });
    }
    check(`${w} px: las 4 tablas de costos caben sin desplazamiento lateral`, !malos.length, malos);
    if (w >= 1024) {
      await page.goto(`${BASE}#/p/${muchos.uid}/materiales`);
      await page.waitForSelector('#tab-body table.tbl-larga');
      await wait(250);
      const s = await sobra();
      check(`${w} px: 320 materiales (diseño fijo) caben sin desplazamiento lateral`, s.tabla === 0 && s.pagina <= 0, s);
    }
    if (w === 1366) {
      // La partida se corta con «…» y su nombre completo queda en la ayuda
      const p = await page.goto(`${BASE}#/p/${largo.uid}/materiales`).then(() => page.waitForSelector('#tab-body .picker'));
      check('1366 px: la partida larga se corta y conserva su nombre en la ayuda', await p.evaluate((b) => /nombre muy largo/.test(b.title) && b.querySelector('.txt').scrollWidth >= b.querySelector('.txt').clientWidth));
    }
    await ctx.close();
  }
  check('sin errores de la página', errores.length === 0, errores);
  await browser.close();
  console.log(results.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fallas}/${results.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
