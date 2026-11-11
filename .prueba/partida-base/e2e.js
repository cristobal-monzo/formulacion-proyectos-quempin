// Prueba de la partida base (2026-10-09): sus costos se dividen en partes iguales entre las demás partidas.
// Datos FICTICIOS (el proyecto de ejemplo del repo: 3 partidas con 100 % de recargo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/partida-base/e2e.js
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
const UID = EJ.uid;
const P1 = EJ.partidas[0].uid;
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
const pesos = (s) => Number(String(s).replace(/[^\d-]/g, '')) || 0;

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, locale: 'es-CL' });
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
  const codigos = () => page.$$eval('#tab-body tbody tr[data-row] td.code', (tds) => tds.map((t) => t.textContent.trim()));
  const menu = async (uid) => {
    await page.click(`[data-menu="fila"][data-uid="${uid}"]`);
    await page.waitForSelector('#pop .pop-item');
    return page.$$eval('#pop .pop-item', (bs) => bs.map((b) => ({ t: b.querySelector('.pi-title').textContent.trim(), off: b.disabled })));
  };
  const elegir = async (titulo) => {
    for (const b of await page.$$('#pop .pop-item')) { if ((await b.textContent()).includes(titulo)) { await b.click(); return true; } }
    return false;
  };
  try {
    // 1. Partidas: agregar la partida base
    await page.goto(`${BASE}#/p/${UID}/partidas`);
    await page.waitForSelector('[data-act="add-base"]');
    const precio0 = pesos(await texto(page, 'tfoot [data-c="T:precioNeto"]'));
    await page.click('[data-act="add-base"]');
    await wait(300);
    check('la partida base queda primera como PB y las demás siguen P1 a P3', JSON.stringify(await codigos()) === '["PB","P1","P2","P3"]', await codigos());
    check('la fila de la base se distingue', !!(await page.$('tr.fila-base .pcode.base')));
    check('«Agregar partida base» desaparece: hay una sola', !(await page.$('[data-act="add-base"]')));
    check('sin partidas que repartir aún no cambia el precio', pesos(await texto(page, 'tfoot [data-c="T:precioNeto"]')) === precio0);
    await wait(1200);
    let g = await guardado();
    const PB = g.partidas[0].uid;
    check('se guarda como la primera partida, con base: true', g.partidas.length === 4 && g.partidas[0].base === true && g.partidas.slice(1).every((x) => !x.base), g.partidas.map((x) => x.base));

    // 2. Otros: un costo de $90.000 en la partida base
    await page.goto(`${BASE}#/p/${UID}/otros`);
    await page.waitForSelector('#filtro-otros');
    const opciones = await page.$$eval('#filtro-otros option', (os) => os.map((o) => o.textContent));
    check('el filtro de costos ofrece PB', opciones.some((o) => /^PB · .*\(partida base\)/.test(o)), opciones);
    await page.selectOption('#filtro-otros', PB);
    await wait(200);
    await page.click('[data-act="add-row"][data-list="otros"]');
    await wait(300);
    const OT = await page.$eval('#tab-body tbody tr[data-row]', (tr) => tr.dataset.row);
    const campo = (k) => `[data-list="otros"][data-uid="${OT}"][data-k="${k}"]`;
    await page.fill(campo('descripcion'), 'Traslado de equipos');
    await page.fill(campo('cantidad'), '1');
    await page.fill(campo('costoUnitario'), '90000');
    await page.keyboard.press('Tab');
    await wait(200);
    check('el costo nuevo queda en PB', (await texto(page, `[data-picker="partida"][data-uid="${OT}"] .pcode`)) === 'PB');
    await page.click(`[data-picker="partida"][data-uid="${OT}"]`);
    await page.waitForSelector('#pop .pop-item');
    const lista = await page.$$eval('#pop .pop-item', (bs) => bs.map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
    check('el selector de partida muestra PB primero, explicada', /PB Partida base\s*Partida base: se divide/.test(lista[0] || ''), lista[0]);
    await page.keyboard.press('Escape');

    // 3. Partidas: el reparto en partes iguales
    await page.goto(`${BASE}#/p/${UID}/partidas`);
    await page.waitForSelector('tr.fila-base');
    await wait(200);
    const reparto = await texto(page, 'tr.fila-base .reparto-base');
    check('la base dice cuánto recibe cada partida: $90.000 ÷ 3', /entre las 3 partidas: \$30\.000 a cada una/.test(reparto), reparto);
    check('el costo directo de PB es $90.000', (await texto(page, `tr.fila-base [data-c="P:${PB}:cd"]`)) === '$90.000');
    const cdP1 = await texto(page, `tr[data-row="${P1}"] td[data-label="Costo directo"]`);
    check('cada partida muestra la parte de la base en su costo', /incluye \$30\.000 de PB/.test(cdP1), cdP1);
    const precio1 = pesos(await texto(page, 'tfoot [data-c="T:precioNeto"]'));
    check('con 100 % de recargo el precio sube 2 × $90.000', precio1 - precio0 === 180000, [precio0, precio1]);
    await page.screenshot({ path: path.join(SHOTS, '1-partidas.png'), fullPage: true });

    // 4. Utilidad y precio: la base no se cotiza sola ni lleva utilidad
    await page.goto(`${BASE}#/p/${UID}/resumen`);
    await page.waitForSelector('#res-precio .cotiz-list');
    await wait(300);
    check('la tabla de utilidad no incluye PB', (await page.$$('.util-tbl tbody tr[data-row]')).length === 3 && !(await page.$(`.util-tbl tr[data-row="${PB}"]`)));
    check('una nota explica la partida base', /PB La partida base «Partida base» \(\$90\.000\) no va sola en la cotización/.test(await texto(page, '#utilidad .hint-linea')), await texto(page, '#utilidad .hint-linea'));
    const cot = await page.$$eval('.cotiz-list li .pcode', (ps) => ps.map((p) => p.textContent.trim()));
    check('la cotización tiene P1 a P3, sin PB', JSON.stringify(cot) === '["P1","P2","P3"]', cot);
    const neto = pesos(await texto(page, '.cotiz-tot .fila.principal .v'));
    check('el total neto de la cotización incluye la base', neto === precio1, [neto, precio1]);
    await page.fill('#util-all', '50');
    await page.click('[data-act="apply-util"]');
    await wait(1200);
    g = await guardado();
    check('«Aplicar» cambia las 3 partidas y no toca la base', g.partidas.slice(1).every((x) => x.utilidadValor === 50) && g.partidas[0].utilidadValor === 0, g.partidas.map((x) => x.utilidadValor));
    await page.click('#util-undo');
    await wait(300);

    // 5. Evaluación: el análisis de precio unitario muestra la parte de la base
    await page.goto(`${BASE}#/p/${UID}/evaluacion`);
    await page.waitForSelector('#detalle summary');
    await page.click('#detalle summary');
    await page.click(`[data-act="apu"][data-uid="${P1}"]`);
    await wait(300);
    const apu = await texto(page, '#res-partidas .apu-panel');
    check('el análisis de P1 suma la parte de la partida base', /Parte de la partida base\s*\$30\.000/.test(apu) && /\$90\.000 ÷ 3 partidas/.test(apu), apu.slice(-200));
    check('el detalle explica el reparto', /\$90\.000 ÷ 3 = \$30\.000 por partida/.test(await texto(page, '#res-partidas .hint-linea')));

    // 6. Menú de fila: la base no se mueve; vuelve a ser normal y Ctrl+Z la recupera
    await page.goto(`${BASE}#/p/${UID}/partidas`);
    await page.waitForSelector('tr.fila-base');
    let items = await menu(P1);
    check('P1 no puede subir sobre la base', items.some((i) => i.t === 'Subir' && i.off), items);
    check('con base, ninguna otra se ofrece como base', !items.some((i) => i.t === 'Convertir en partida base'), items);
    await page.keyboard.press('Escape');
    items = await menu(PB);
    check('el menú de PB ofrece volver a partida normal y no mover', items.some((i) => i.t === 'Volver a partida normal') && !items.some((i) => i.t === 'Subir'), items);
    await elegir('Volver a partida normal');
    await wait(300);
    check('vuelta a normal: se numera P1 a P4', JSON.stringify(await codigos()) === '["P1","P2","P3","P4"]', await codigos());
    check('y reaparece «Agregar partida base»', !!(await page.$('[data-act="add-base"]')));
    await page.keyboard.press('Control+z');
    await wait(300);
    check('Ctrl+Z la deja otra vez como partida base', JSON.stringify(await codigos()) === '["PB","P1","P2","P3"]', await codigos());
    // Convertir una partida existente: pasa a ser la primera
    await menu(PB);
    await elegir('Volver a partida normal');
    await wait(300);
    const P3 = EJ.partidas[2].uid;
    items = await menu(P3);
    check('sin base, el menú ofrece convertir la partida', items.some((i) => i.t === 'Convertir en partida base'), items);
    await elegir('Convertir en partida base');
    await wait(300);
    const conv = await codigos();
    const primera = await page.$eval('#tab-body tbody tr[data-row]', (tr) => tr.dataset.row);
    check('la partida convertida pasa a ser PB, primera', primera === P3 && JSON.stringify(conv) === '["PB","P1","P2","P3"]', conv);
    await page.keyboard.press('Control+z');
    await wait(200);
    await page.keyboard.press('Control+z');
    await wait(300);
    const vuelta = await page.$eval('#tab-body tbody tr[data-row]', (tr) => tr.dataset.row);
    check('dos Ctrl+Z vuelven a la base original', vuelta === PB && JSON.stringify(await codigos()) === '["PB","P1","P2","P3"]', await codigos());
    check('y al precio con la base repartida', pesos(await texto(page, 'tfoot [data-c="T:precioNeto"]')) === precio1);
    await wait(1500);

    // 7. Excel: bloque de la partida base bajo el total y fórmulas vivas
    const x = await page.evaluate(async ([k, u]) => {
      const p = JSON.parse(localStorage.getItem(k)).proyectos.find((q) => q.uid === u);
      const buf = await window.QExcel.exportProject(p, { soloDatos: true });
      const wb = new window.ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.getWorksheet('Partidas');
      let b = 0;
      ws.eachRow((row, n) => { if (row.getCell(1).value === 'PB') b = n; });
      const v = (c) => { const x = ws.getCell(c).value; return x && x.formula ? { f: x.formula, r: x.result } : x; };
      const otros = wb.getWorksheet('Otros');
      let qty = null;
      otros.eachRow((row) => { if (row.getCell(3).value === 'PB') qty = row.getCell(7).value; });
      return { b, tot: v('O8'), e5: v('E5'), h5: v('H5'), i5: v('I5'), bI: v(`I${b}`), bK: v(`K${b}`), bL: v(`L${b}`), nota: v(`B${b + 1}`), qty };
    }, [KEY, UID]);
    // 3 partidas en las filas 5 a 7, total en la 8, encabezado de la base en la 10 y la base en la 11
    check('Excel: la base va en su bloque bajo el total', x.b === 11 && /^SUM\(O5:O7\)$/.test(x.tot.f), x);
    check('Excel: la base suma su costo y se divide entre 3', x.bI.r === 90000 && /^COUNTA\(\$A\$5:\$A\$7\)$/.test(x.bK.f) && x.bK.r === 3 && x.bL.r === 30000, x);
    check('Excel: cada partida suma su parte en cada categoría', /\+IFERROR\(\$H\$11\/\$K\$11,0\)$/.test(x.h5.f) && /\+IFERROR\(\$E\$11\/\$K\$11,0\)$/.test(x.e5.f), x.h5);
    check('Excel: el costo de PB toma la cantidad del bloque de la base', x.qty && /IF\(C\d+='Partidas'!\$A\$11,'Partidas'!\$D\$11,0\)\)$/.test(x.qty.formula), x.qty);
    check('Excel: el valor guardado del total incluye la base', x.tot.r === precio1, [x.tot.r, precio1]);
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
