// Lista de proyectos y tabla de utilidad sin desplazamiento lateral, y utilidad por «valor final»
// (pedido del usuario, 2026-10-09). Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/ux/sin-scroll.js
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
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
const pesos = (s) => Number(String(s).replace(/[^\d-]/g, '')) || 0;
const copia = (o) => JSON.parse(JSON.stringify(o));

// Tres proyectos como los de la captura del usuario, con nombres largos
const p1 = copia(EJ);
Object.assign(p1, { uid: 'scroll000001', codigo: 'KPH2', titulo: 'Instalación H2 de prueba', cliente: 'Cliente Uno', ubicacion: 'Valparaíso', responsable: 'QA', estado: 'Adjudicada' });
p1.partidas = p1.partidas.slice(0, 2);
p1.partidas[0].descripcion = 'Fabricación e interconexión de equipos de prueba';
p1.partidas[1].descripcion = 'Documentación de prueba';
p1.partidas.forEach((pt) => { pt.utilidadTipo = 'monto'; pt.utilidadValor = 500000; });
Object.assign(p1.parametros, { margenObjetivo: 40, margenMinimo: 25, gastosGenerales: 10 });
const p2 = copia(EJ);
Object.assign(p2, { uid: 'scroll000002', codigo: 'QPN-2026-999', titulo: 'Hospital ficticio DS N°10 de Calderas', cliente: '', ubicacion: 'Quilpué', responsable: '', estado: 'Borrador' });
const p3 = copia(EJ);
Object.assign(p3, { uid: 'scroll000003', codigo: 'CCMC', titulo: 'Mantenimiento caldera', cliente: 'Cliente Tres', ubicacion: 'RM', responsable: 'QA', estado: 'Enviada' });
const P1 = p1.partidas[0].uid;
const CARPETA = 'En curso · Mantenimiento de calderas de una comisaría ficticia con nombre largo';

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-CL' });
  await ctx.addInitScript(([ps, key]) => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('quempin_formulador_unlocked', '1');
    localStorage.setItem(key, JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: ps }));
  }, [[p1, p2, p3], KEY]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  const texto = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
  const valor = (sel) => page.$eval(sel, (e) => e.value).catch(() => null);
  const guardado = () => page.evaluate(([k, u]) => JSON.parse(localStorage.getItem(k)).proyectos.find((p) => p.uid === u), [KEY, p1.uid]);
  const desborde = (sel) => page.evaluate((s) => {
    const c = document.querySelector(s);
    return c ? { tabla: c.scrollWidth - c.clientWidth, pagina: document.documentElement.scrollWidth - innerWidth } : null;
  }, sel);
  const visible = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.offsetParent !== null), sel);

  try {
    // 1. Lista de proyectos: sin barra lateral en ningún ancho, aunque la carpeta tenga un nombre largo
    for (const w of [1536, 1280, 1100, 1000, 900, 760, 660, 600]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(BASE + '#/');
      await page.waitForSelector('#list-body tr');
      await page.evaluate((f) => {
        const td = document.querySelector('#list-body tr[data-open="scroll000003"] td.col-titulo');
        td.insertAdjacentHTML('beforeend', `<div class="proj-carpeta" title="${f}"><svg viewBox="0 0 24 24"></svg><span>${f}</span></div>`);
      }, CARPETA);
      const d = await desborde('#list-table');
      check(`lista a ${w} px: sin desplazamiento lateral`, d && d.tabla <= 0 && d.pagina <= 0, d);
      const ancho = await visible('#list-head th.col-resp');
      const enLinea = await visible('#list-body .proj-sub.en-linea');
      if (w > 1100) check(`lista a ${w} px: columnas Responsable y Utilidad por día-hombre`, ancho && !enLinea && await visible('#list-head th.col-dh'));
      else if (w > 640) check(`lista a ${w} px: el responsable pasa bajo el proyecto`, !ancho && enLinea && /Responsable: QA/.test(await texto('#list-body tr[data-open="scroll000001"] .col-titulo')));
      else check(`lista a ${w} px: tarjetas apiladas con todos los datos`, !enLinea && await visible('#list-body td.col-resp'));
      if (w <= 900 && w > 640) {
        check(`lista a ${w} px: la fecha va con el responsable y las alertas bajo el código`,
          !(await visible('#list-head th.col-fecha')) && await visible('#list-body td.code .en-linea .chip') && /· \d\d-\d\d-\d{4}/.test(await texto('#list-body tr[data-open="scroll000001"] .proj-sub.en-linea')));
      }
      if (w === 1280) {
        const corte = await page.evaluate(() => {
          const s = document.querySelector('#list-body tr[data-open="scroll000003"] .proj-carpeta span');
          return s ? s.scrollWidth > s.clientWidth : null;
        });
        check('la carpeta larga se corta con «…» en vez de ensanchar la tabla', corte === true, corte);
      }
      if (w === 1280 || w === 1000 || w === 760) await page.screenshot({ path: path.join(SHOTS, `sin-scroll-lista-${w}.png`) });
    }

    // 2. Tabla de utilidad: sin barra lateral en ningún ancho
    for (const w of [1536, 1280, 1100, 1000, 900, 700, 600]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`${BASE}#/p/${p1.uid}/resumen`);
      await page.waitForSelector('#utilidad table');
      await wait(150);
      const d = await desborde('#utilidad .tabla-contenedor');
      check(`utilidad a ${w} px: sin desplazamiento lateral`, d && d.tabla <= 0 && d.pagina <= 0, d);
      if (w === 1280 || w === 1000) {
        const el = await page.$('#utilidad');
        await el.screenshot({ path: path.join(SHOTS, `sin-scroll-utilidad-${w}.png`) });
      }
    }

    // 3. Valor final: se escribe el precio neto de la partida y la utilidad se calcula
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${BASE}#/p/${p1.uid}/resumen`);
    await page.waitForSelector('#utilidad table');
    const opciones = await page.$$eval(`#utilidad tr[data-row="${P1}"] .segmentado input`, (xs) => xs.map((x) => x.value));
    check('la utilidad ofrece %, $ y Final', JSON.stringify(opciones) === '["pct","monto","final"]', opciones);
    const precioAntes = pesos(await texto(`[data-c="P:${P1}:precio"]`)) || await page.evaluate((u) => Math.round(window.QCalc.computeProject(window.QStore.get('scroll000001')).partidas.find((x) => x.uid === u).precio), P1);
    await page.click(`#utilidad tr[data-row="${P1}"] .segmentado input[value="final"]`, { force: true });
    await wait(800);
    const inp = `#utilidad [data-uid="${P1}"][data-k="utilidadValor"]`;
    const r0 = await page.evaluate((u) => window.QCalc.computeProject(window.QStore.get('scroll000001')).partidas.find((x) => x.uid === u), P1);
    check('al pasar a Final el campo muestra el precio actual y la utilidad no cambia',
      Math.abs(Number(await valor(inp)) - Math.round(r0.precio)) <= 1 && Math.abs(r0.utilidad - 500000) <= 1, [await valor(inp), r0.precio, r0.utilidad, precioAntes]);
    check('el campo dice que es el valor final', /Valor final de P1/.test(await page.$eval(inp, (e) => e.getAttribute('aria-label'))));
    await page.fill(inp, '3000000');
    await page.press(inp, 'Tab');
    await wait(800);
    const r1 = await page.evaluate((u) => window.QCalc.computeProject(window.QStore.get('scroll000001')).partidas.find((x) => x.uid === u), P1);
    const esperada = 3000000 - r1.cd * 1.1; // gastos generales 10 %
    check('con Final el precio de la partida es el escrito', Math.abs(r1.precio - 3000000) < 0.01, r1.precio);
    check('y la utilidad es lo que queda sobre costo directo + gastos generales', Math.abs(r1.utilidad - esperada) < 0.01, [r1.utilidad, esperada]);
    check('la columna «Utilidad en $» muestra la utilidad calculada', Math.abs(pesos(await texto(`#utilidad [data-c="P:${P1}:utilidad"]`)) - Math.round(esperada)) <= 1, await texto(`#utilidad [data-c="P:${P1}:utilidad"]`));
    await wait(1200);
    const g = (await guardado()).partidas.find((x) => x.uid === P1);
    check('se guarda como tipo final con el valor escrito', g.utilidadTipo === 'final' && Number(g.utilidadValor) === 3000000, g);

    // 4. Excel: «Final» en el tipo y la utilidad como fórmula viva
    const x = await page.evaluate(async ([k, u]) => {
      const p = JSON.parse(localStorage.getItem(k)).proyectos.find((q) => q.uid === u);
      const buf = await window.QExcel.exportProject(p, { soloDatos: true });
      const wb = new window.ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.getWorksheet('Partidas');
      const v = (c) => { const y = ws.getCell(c).value; return y && y.formula ? { f: y.formula, r: y.result } : y; };
      return { k: v('K5'), l: v('L5'), m: v('M5'), o: v('O5'), k6: v('K6') };
    }, [KEY, p1.uid]);
    check('Excel: tipo «Final» y valor final en la columna de utilidad', x.k === 'Final' && x.l === 3000000 && x.k6 === '$', x);
    check('Excel: la utilidad es valor final − costo directo − GG e imprevistos', /IF\(K5="Final",L5-I5-N5,L5\)/.test(x.m.f) && Math.abs(x.m.r - esperada) < 0.01 && Math.abs(x.o.r - 3000000) < 0.01, x);

    // 5. Volver a $ y a % conserva la utilidad
    await page.click(`#utilidad tr[data-row="${P1}"] .segmentado input[value="monto"]`, { force: true });
    await wait(300);
    check('de Final a $ el campo pasa a la utilidad', Math.abs(Number(await valor(inp)) - Math.round(esperada)) <= 1, await valor(inp));
    await page.click(`#utilidad tr[data-row="${P1}"] .segmentado input[value="final"]`, { force: true });
    await wait(300);
    check('y de vuelta a Final, al mismo precio', Math.abs(Number(await valor(inp)) - 3000000) <= 1, await valor(inp));

    // 6. Una partida nueva después de una con valor final no hereda un precio $0
    await page.goto(`${BASE}#/p/${p1.uid}/partidas`);
    await page.waitForSelector('[data-act="add-row"][data-list="partidas"]');
    await page.click('[data-act="add-row"][data-list="partidas"]');
    await wait(1200);
    const ps = (await guardado()).partidas;
    const nueva = ps[ps.length - 1];
    check('la partida nueva toma $ en cero, no un valor final', ps.length === 3 && nueva.utilidadTipo === 'monto' && Number(nueva.utilidadValor) === 0, nueva);
    check('en Partidas la utilidad se rotula «según el valor final»', /según el valor final/.test(await texto(`#tab-body tr[data-row="${P1}"]`)));
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
