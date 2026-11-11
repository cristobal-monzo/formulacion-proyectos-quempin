// Recorrido de un usuario nuevo por el Formulador, con capturas de cada pantalla (mejora UX del
// flujo de trabajo, 2026-10-06). La biblioteca «Formulación de proyectos - Documentos» se simula en
// OPFS con carpetas y datos FICTICIOS. No escribe nada fuera del navegador de prueba.
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/ux/recorrido.js <vuelta>
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = 'http://127.0.0.1:8798/index.html';
const VUELTA = process.env.VUELTA || process.argv[2] || 'v0';
// Una carpeta de capturas por script y por vuelta: shots/<script>/<vuelta>
const SHOTS = path.join(__dirname, 'shots', path.basename((require.main && require.main.filename) || 'recorrido', '.js'), VUELTA);
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'integracion', 'datos.json'), 'utf8'));
const BIBLIOTECA = 'Formulación de proyectos - Documentos';
const INTERCAMBIO = ['.HERRAMIENTAS FORMULACIÓN', 'Intercambio'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const notas = [];
const errores = [];
const nota = (t) => { notas.push(t); console.log('·', t); };

/* Requerimientos ficticios: tres recientes sin carpeta, para crear una al formular. */
function requerimientos() {
  const pub = JSON.parse(DATOS['publicado/requerimientos.json']);
  pub.datos.requerimientos = [
    { numero: 312, estado: 'En evaluación', titulo: 'Calefacción gimnasio municipal (ficticio)', ubicacion: 'Rancagua', presupuesto: 18500000, cierre: '2026-10-28' },
    { numero: 311, estado: 'En evaluación', titulo: 'Medidores de gas edificio (ficticio)', ubicacion: 'Santiago', presupuesto: 4200000, cierre: '2026-10-20' },
    { numero: 301, estado: 'En evaluación', titulo: 'Medidores gas natural colegio (ficticio)', ubicacion: 'Valparaíso', presupuesto: 9800000 },
    { numero: 290, estado: 'Ofertado', titulo: 'Mantención calderas (ficticio)', ubicacion: 'Talca', presupuesto: 6000000 },
    { numero: 280, estado: 'Ofertado', titulo: 'Conexión H2 laboratorio (ficticio)', ubicacion: 'Punta Arenas', presupuesto: 3570000, cierre: '2026-10-15' },
    { numero: 12, estado: 'Descartado', titulo: 'Viejo (ficticio)' }
  ];
  return JSON.stringify(pub);
}
const CARPETAS = [
  '301. Medidores gas natural colegio (ficticio)',
  'Quemador piloto (ficticio)',
  '0 OFERTAS PRESENTADAS/290. Mantención calderas (ficticio)',
  '0 OFERTAS ADJUDICADAS/275. Red de gas laboratorio (ficticio)',
  '1 CARPETA MODELO',
  '2 ARCHIVOS Y INFORMACION FRECUENTE'
];

async function prepararBiblioteca(page) {
  const archivos = Object.entries(DATOS).map(([r, t]) => [r, r === 'publicado/requerimientos.json' ? requerimientos() : t]);
  archivos.push(['intercambio.json', JSON.stringify({ esquema: 'quempin.intercambio/1', descripcion: 'prueba' })]);
  await page.evaluate(async ([bib, inter, archivos, carpetas]) => {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true });
    for (const c of carpetas) { let d = raiz; for (const n of c.split('/')) d = await d.getDirectoryHandle(n, { create: true }); }
    let base = raiz;
    for (const n of inter) base = await base.getDirectoryHandle(n, { create: true });
    for (const [r, texto] of archivos) {
      const partes = r.split('/');
      let d = base;
      for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(partes[partes.length - 1], { create: true })).createWritable();
      await w.write(texto); await w.close();
    }
  }, [BIBLIOTECA, INTERCAMBIO, archivos, CARPETAS]);
}
async function escribirPublicado(page, nombre, texto) {
  await page.evaluate(async ([bib, inter, nombre, texto]) => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true });
    for (const n of inter.concat('publicado')) d = await d.getDirectoryHandle(n, { create: true });
    const w = await (await d.getFileHandle(nombre, { create: true })).createWritable();
    await w.write(texto); await w.close();
  }, [BIBLIOTECA, INTERCAMBIO, nombre, texto]);
}
async function buzon(page) {
  return page.evaluate(async ([bib, inter]) => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true });
    for (const n of inter.concat('buzon')) d = await d.getDirectoryHandle(n, { create: true });
    const out = [];
    for await (const [, h] of d.entries()) if (h.kind === 'file') out.push(JSON.parse(await (await h.getFile()).text()));
    return out.sort((a, b) => String(a.origen.enviado).localeCompare(String(b.origen.enviado)));
  }, [BIBLIOTECA, INTERCAMBIO]);
}
async function carpetasRaiz(page) {
  return page.evaluate(async (bib) => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true });
    const out = [];
    for await (const [n, h] of d.entries()) if (h.kind === 'directory') out.push(n);
    return out.sort();
  }, BIBLIOTECA);
}

let n = 0;
async function foto(page, nombre, completa) {
  n += 1;
  const f = path.join(SHOTS, `${String(n).padStart(2, '0')}-${nombre}.png`);
  await page.screenshot({ path: f, fullPage: !!completa });
  return f;
}
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
const hay = async (page, sel) => !!(await page.$(sel));

async function contexto(browser, viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'es-CL', acceptDownloads: true, deviceScaleFactor: 1 });
  await ctx.addInitScript((bib) => {
    try { localStorage.setItem('quempin_viz_unlocked', '1'); } catch (e) { /* */ }
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true });
    FileSystemHandle.prototype.queryPermission = async function () { return 'granted'; };
    FileSystemHandle.prototype.requestPermission = async function () { return 'granted'; };
    window.open = (u) => { window.__abiertos = (window.__abiertos || []).concat(String(u)); return null; };
  }, BIBLIOTECA);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  return { ctx, page };
}

module.exports = { BASE, BIBLIOTECA, INTERCAMBIO, wait, nota, prepararBiblioteca, escribirPublicado, buzon, carpetasRaiz, foto, texto, hay, contexto, chromium, errores, notas, SHOTS };

if (require.main === module) require('./viaje.js');
