// Precio bruto en la barra, categoría del proyecto y entregables para postular (pedido del usuario, 2026-10-27).
// Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/categoria/e2e.js
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

// Uno sin ID (sin categoría), uno con ID de licitación (se deduce) y uno con ID de compra ágil
const pa = copia(EJ);
Object.assign(pa, { uid: 'categoria001', codigo: 'QPN-CAT-1', titulo: 'Proyecto sin categoría', idLicitacion: '', estado: 'Borrador' });
pa.parametros = Object.assign({}, pa.parametros, { presupuestoMaximo: 9000000, presupuestoIncluyeIva: true });
const pb = copia(EJ);
Object.assign(pb, { uid: 'categoria002', codigo: 'QPN-CAT-2', titulo: 'Licitación deducida', idLicitacion: '5555-12-LE26', estado: 'Borrador' });
const pc = copia(EJ);
Object.assign(pc, { uid: 'categoria003', codigo: 'QPN-CAT-3', titulo: 'Compra ágil deducida', idLicitacion: '100-9-COT26', estado: 'En revisión' });

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-CL' });
  await ctx.addInitScript(([ps, key]) => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('quempin_formulador_unlocked', '1');
    localStorage.setItem(key, JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: ps }));
  }, [[pa, pb, pc], KEY]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  const texto = (sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
  const existe = (sel) => page.$(sel).then((e) => !!e);
  const guardado = (uid) => page.evaluate(([k, u]) => JSON.parse(localStorage.getItem(k)).proyectos.find((p) => p.uid === u), [KEY, uid]);
  const desborde = () => page.evaluate(() => {
    const b = document.querySelector('.pasos-bar');
    return { pagina: document.documentElement.scrollWidth - innerWidth, pasos: b ? b.scrollWidth - b.clientWidth : 0 };
  });

  try {
    // 1. La barra: precio neto, precio bruto (con IVA), margen y alertas
    await page.goto(BASE + '#/p/categoria001/ficha');
    await page.waitForSelector('#lectura .lectura-item');
    await wait(300);
    // Desde el 2026-11-10: neto, utilidad y alertas; el bruto y el resto, en el desglose al pasar el mouse
    const items = await page.$$eval('#lectura .lectura-item', (xs) => xs.map((x) => [x.querySelector('.l').textContent.trim(), x.querySelector('.v').textContent.trim()]));
    check('la barra tiene 3 datos: neto, utilidad, alertas', items.length === 3 && items[0][0] === 'Precio neto' && items[1][0] === 'Utilidad' && items[2][0] === 'Alertas', items);
    check('el desglose está oculto sin el mouse', !(await page.isVisible('#lectura .lectura-detalle')));
    await page.hover('#lectura .lectura-item:nth-child(2)');
    await wait(150);
    check('al pasar el mouse por la utilidad se ve el desglose', await page.isVisible('#lectura .lectura-detalle'));
    const desg = await page.$$eval('#lectura .ld-fila', (xs) => Object.fromEntries(xs.map((x) => [x.children[0].textContent.trim(), x.children[1].textContent.trim()])));
    const neto = pesos(items[0][1]), bruto = pesos(desg['Precio bruto'] || '');
    check('el desglose trae el neto igual a la barra', pesos(desg['Precio neto'] || '') === neto, desg);
    check('la utilidad de la barra cuadra con el desglose', pesos(desg['Utilidad'] || '') === pesos(items[1][1]), desg);
    check('el bruto es el neto + 19 % de IVA', neto > 0 && Math.abs(bruto - Math.round(neto * 1.19)) <= 1, { neto, bruto });
    check('el desglose explica el IVA y trae el margen', 'IVA 19 %' in desg && Object.keys(desg).some((k) => /^Margen/.test(k)), Object.keys(desg));
    await page.screenshot({ path: path.join(SHOTS, '1-desglose.png') });
    await page.mouse.move(5, 600);
    for (const [w, h] of [[1366, 900], [1100, 900], [960, 900], [800, 900], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await wait(250);
      const d = await desborde();
      const fila = await page.$$eval('#lectura .lectura-item', (xs) => xs.every((x) => x.getBoundingClientRect().top === xs[0].getBoundingClientRect().top && x.offsetParent !== null));
      check(`a ${w} px: los datos en una línea y sin desplazamiento lateral`, fila && d.pagina <= 0, { d, fila });
      if (w === 1366) check('a 1366 px los pasos no se cortan', d.pasos <= 0, d);
      if (w === 1366 || w === 390) await page.screenshot({ path: path.join(SHOTS, `1-barra-${w}.png`) });
    }
    await page.setViewportSize({ width: 1366, height: 900 });
    await wait(200);

    // 2. Categoría: sin ID, «Sin definir» y todo a la vista, como antes
    check('sin ID: categoría «Sin definir»', (await page.$eval('#f-categoria', (e) => e.value)) === '');
    check('sin categoría se ven el ID y el presupuesto', await existe('#f-idLicitacion') && await existe('#f-parametros\\.presupuestoMaximo'));
    const opciones = await page.$$eval('#f-categoria option', (os) => os.map((o) => o.textContent));
    check('las cinco categorías', opciones.join('|') === 'Sin definir|Licitación|Compra ágil|Trato directo|Cliente privado|Formulación general', opciones);

    // Trato directo: sin ID ni presupuesto, y la evaluación deja de comparar
    await page.selectOption('#f-categoria', 'Trato directo');
    await wait(500);
    check('trato directo: sin campo de ID', !(await existe('#f-idLicitacion')));
    check('trato directo: sin presupuesto, con la nota de por qué', !(await existe('#f-parametros\\.presupuestoMaximo')) && /no hay un presupuesto con que competir/.test(await texto('#sin-presupuesto')), await texto('#sin-presupuesto'));
    check('el presupuesto escrito queda guardado y se dice', /queda guardado/.test(await texto('#sin-presupuesto')) && (await guardado('categoria001')).parametros.presupuestoMaximo === 9000000);
    check('la categoría se guarda', (await guardado('categoria001')).categoria === 'Trato directo');
    check('el foco sigue en la categoría', await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-categoria'));
    check('el encabezado dice la categoría', /Trato directo/.test(await texto('#ed-meta')), await texto('#ed-meta'));
    await page.screenshot({ path: path.join(SHOTS, '2-trato-directo.png'), fullPage: true });
    await page.goto(BASE + '#/p/categoria001/evaluacion');
    await page.waitForSelector('.ver-lista li');
    const preguntas = await page.$$eval('.ver-lista .ver-q', (xs) => xs.map((x) => x.textContent));
    check('el veredicto queda en tres preguntas, sin la del presupuesto', preguntas.length === 3 && !preguntas.some((q) => /presupuesto/.test(q)), preguntas);
    check('competitividad: «no hay un presupuesto con que competir»', /Trato directo: no hay un presupuesto con que competir/.test(await texto('#res-kpis')));
    const k = await page.evaluate(() => window.QCalc.computeProject(window.QStore.get('categoria001')).kpis);
    check('el cálculo no usa el presupuesto guardado', k.competitividad === null && k.presupuesto === 0, k);

    // Volver a licitación: el presupuesto vuelve
    await page.goto(BASE + '#/p/categoria001/ficha');
    await page.waitForSelector('#f-categoria');
    await page.selectOption('#f-categoria', 'Licitación');
    await wait(500);
    check('licitación: vuelven el ID y el presupuesto', await existe('#f-idLicitacion') && (await page.$eval('#f-parametros\\.presupuestoMaximo', (e) => e.value)) === '9000000');
    check('el rótulo del ID es el de la licitación', /ID de licitación/.test(await texto('label[for="f-idLicitacion"]')));
    await page.selectOption('#f-categoria', 'Compra ágil');
    await wait(400);
    check('compra ágil: «ID de la compra ágil» con su ejemplo', /ID de la compra ágil/.test(await texto('label[for="f-idLicitacion"]')) && (await page.$eval('#f-idLicitacion', (e) => e.placeholder)).includes('COT'));
    await page.selectOption('#f-categoria', 'Cliente privado');
    await wait(400);
    check('cliente privado: sin ID, con presupuesto opcional', !(await existe('#f-idLicitacion')) && await existe('#f-parametros\\.presupuestoMaximo'));

    // Deducida del ID
    await page.goto(BASE + '#/p/categoria002/ficha');
    await page.waitForSelector('#f-categoria');
    check('con ID LE: «Licitación», según su ID', (await page.$eval('#f-categoria', (e) => e.value)) === 'Licitación' && /Según su ID/.test(await texto('#categoria-hint')));
    check('deducida no se escribe en el proyecto', (await guardado('categoria002')).categoria === undefined);
    await page.goto(BASE + '#/p/categoria003/ficha');
    await page.waitForSelector('#f-categoria');
    check('con ID COT: «Compra ágil»', (await page.$eval('#f-categoria', (e) => e.value)) === 'Compra ágil');

    // 3. Lista: la categoría bajo el título, y se busca por ella
    await page.goto(BASE + '#/');
    await page.waitForSelector('#list-body tr[data-open]');
    const sub = await texto('tr[data-open="categoria003"] .proj-sub');
    check('la lista dice la categoría', /^Compra ágil/.test(sub), sub);
    await page.fill('#list-search', 'compra agil');
    await wait(300);
    const filas = await page.$$eval('#list-body tr[data-open]', (xs) => xs.map((x) => x.dataset.open));
    check('buscar «compra agil» deja solo esa', filas.length === 1 && filas[0] === 'categoria003', filas);
    await page.fill('#list-search', '');

    // 4. Entregables: plegados en una línea, se agregan, se marcan y se resumen
    await page.goto(BASE + '#/p/categoria002/ficha');
    await page.waitForSelector('#f-entregables');
    check('sin entregables: plegado y lo dice', !(await page.$eval('#f-entregables', (d) => d.open)) && /Sin entregables/.test(await texto('#res-f-entregables')));
    await page.click('#f-entregables > summary');
    await page.click('[data-act="add-row"][data-list="entregables"]');
    await wait(300);
    const foco = await page.evaluate(() => document.activeElement && document.activeElement.dataset.k);
    check('agregar deja el foco en el nombre', foco === 'nombre', foco);
    await page.keyboard.type('anexo 1 identificación del oferente');
    await page.keyboard.press('Enter');
    await wait(300);
    await page.keyboard.type('Anexo 3 experiencia');
    await wait(500);
    let g = await guardado('categoria002');
    check('Enter agrega otro; el primero con mayúscula inicial', g.entregables.length === 2 && g.entregables[0].nombre === 'Anexo 1 identificación del oferente', g.entregables);
    const segundo = g.entregables[1].uid;
    await page.selectOption(`[data-list="entregables"][data-uid="${segundo}"][data-k="tipo"]`, 'Técnico');
    await page.selectOption(`[data-list="entregables"][data-uid="${segundo}"][data-k="responsable"]`, 'CM');
    await page.check(`[data-list="entregables"][data-uid="${g.entregables[0].uid}"][data-k="listo"]`);
    await wait(500);
    g = await guardado('categoria002');
    check('tipo, responsable y listo se guardan', g.entregables[1].tipo === 'Técnico' && g.entregables[1].responsable === 'CM' && g.entregables[0].listo === true, g.entregables);
    check('la fila lista se atenúa', await page.$eval(`tr[data-row="${g.entregables[0].uid}"]`, (tr) => tr.classList.contains('listo')));
    await page.click('#f-entregables > summary');   // plegar: el resumen dice el avance
    await wait(150);
    check('resumen: «1 de 2 listos · 1 administrativo · 1 técnico»', (await texto('#res-f-entregables')) === '1 de 2 listos · 1 administrativo · 1 técnico', await texto('#res-f-entregables'));
    await page.click('#f-entregables > summary');

    // Pegar una lista de las bases, con títulos de sección
    await page.click('[data-act="pegar-entregables"]');
    await page.waitForSelector('#pe-texto');
    await page.fill('#pe-texto', [
      'ANTECEDENTES ADMINISTRATIVOS:', '• Anexo N° 2: Declaración jurada simple', '1. Garantía de seriedad de la oferta',
      'Antecedentes técnicos', '- Anexo N° 4: Metodología de trabajo', 'Carta Gantt',
      'Anexo N° 5\tOferta económica', '3\tCertificado de vigencia\tAdministrativo', '', '   '
    ].join('\n'));
    await wait(200);
    const previa = await texto('#pe-previa');
    check('la vista previa cuenta 6 entregables por tipo', /6 entregables para agregar: 3 administrativos, 2 técnicos, 1 económico/.test(previa), previa);
    check('el botón dice cuántos agrega', (await texto('#modal .modal-foot .btn-primario')) === 'Agregar 6 entregables');
    await page.click('#modal .modal-foot .btn-primario');
    await wait(500);
    g = await guardado('categoria002');
    const pegados = g.entregables.slice(2).map((e) => `${e.nombre} [${e.tipo}]`);
    check('pegados sin viñetas ni numeración, con su tipo', JSON.stringify(pegados) === JSON.stringify([
      'Anexo N° 2: Declaración jurada simple [Administrativo]', 'Garantía de seriedad de la oferta [Administrativo]',
      'Anexo N° 4: Metodología de trabajo [Técnico]', 'Carta Gantt [Técnico]', 'Anexo N° 5 · Oferta económica [Económico]',
      'Certificado de vigencia [Administrativo]'
    ]), pegados);
    await page.screenshot({ path: path.join(SHOTS, '3-entregables.png'), fullPage: true });

    // Eliminar y deshacer
    const ultimo = g.entregables[g.entregables.length - 1].uid;
    await page.click(`[data-act="del-row"][data-list="entregables"][data-uid="${ultimo}"]`);
    await wait(500);
    check('eliminar quita la fila', (await guardado('categoria002')).entregables.length === 7);
    await page.keyboard.press('Control+z');
    await wait(600);
    check('Ctrl+Z la devuelve', (await guardado('categoria002')).entregables.length === 8 && await existe(`tr[data-row="${ultimo}"]`));

    // 5. Excel: categoría, ID y la hoja Entregables; en trato directo, sin presupuesto
    const xls = await page.evaluate(async () => {
      const leer = async (p) => {
        const buf = await window.QExcel.exportProject(p, { soloDatos: true });
        const wb = new window.ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const hojas = wb.worksheets.map((w) => w.name);
        const ficha = [];
        wb.getWorksheet('Ficha').eachRow((r) => { const a = r.getCell(1).value, c = r.getCell(3).value; if (typeof a === 'string') ficha.push([a, c && c.result !== undefined ? c.result : c]); });
        const ent = wb.getWorksheet('Entregables');
        const filas = [];
        if (ent) ent.eachRow((r, i) => { if (i >= 5) filas.push(r.values.slice(1)); });
        let pres = null;
        wb.getWorksheet('Parámetros').eachRow((r) => { if (r.getCell(1).value === 'Presupuesto máximo del mandante') pres = r.getCell(2).value; });
        return { hojas, ficha, filas, pres };
      };
      const p = window.QStore.get('categoria002');
      const td = Object.assign(window.QStore.clone(window.QStore.get('categoria001')), { categoria: 'Trato directo' });
      return { lic: await leer(p), td: await leer(td) };
    });
    const dato = (x, k) => (x.ficha.find((f) => f[0] === k) || [])[1];
    check('Excel: la hoja Entregables va después de la Ficha', xls.lic.hojas[1] === 'Entregables', xls.lic.hojas);
    check('Excel: categoría «Licitación» e ID de licitación', dato(xls.lic, 'Categoría') === 'Licitación' && dato(xls.lic, 'ID de licitación') === '5555-12-LE26', xls.lic.ficha.slice(-14));
    check('Excel: el avance de los entregables', dato(xls.lic, 'Entregables para postular') === '1 de 8 listos (hoja Entregables)', dato(xls.lic, 'Entregables para postular'));
    check('Excel: cada entregable con tipo, responsable y estado', xls.lic.filas.length === 8 && xls.lic.filas[0][4] === '✔ Listo' && xls.lic.filas[1][2] === 'Técnico' && xls.lic.filas[1][3] === 'CM', xls.lic.filas.slice(0, 2));
    check('Excel trato directo: sin fila de ID, sin hoja Entregables y presupuesto 0', !xls.td.ficha.some((f) => /^ID de/.test(f[0])) && !xls.td.hojas.includes('Entregables') && xls.td.pres === 0 && dato(xls.td, 'Categoría') === 'Trato directo', { hojas: xls.td.hojas, pres: xls.td.pres });

    // 6. Marcar como Enviada con entregables pendientes: avisa y deja revisarlos
    await page.goto(BASE + '#/p/categoria002/seguimiento');
    await page.waitForSelector('#recorrido .rcl');
    await wait(400);
    const lineaEnt = await page.$eval('#recorrido', (e) => (e.textContent.match(/\d+ de \d+ entregables para postular listos[^.]*\./) || [''])[0]);
    check('el seguimiento dice los entregables que faltan', /^1 de 8 entregables para postular listos: faltan Anexo 3 experiencia, Anexo N° 2: Declaración jurada simple y 5 más\.$/.test(lineaEnt.replace(/\s+/g, ' ')), lineaEnt);
    await page.evaluate(() => {
      const b = document.createElement('button');
      Object.assign(b.dataset, { act: 'sigue', accion: 'marcar-enviada' });
      b.id = 'prueba-enviada';
      document.querySelector('#tab-body').appendChild(b);
    });
    await page.click('#prueba-enviada');
    await page.waitForSelector('#modal[open] .lista-faltan');
    check('el aviso dice cuántos faltan', /Faltan 7 entregables por marcar/.test(await texto('#modal .modal-head h2')), await texto('#modal .modal-head h2'));
    await page.screenshot({ path: path.join(SHOTS, '4-aviso-enviada.png') });
    await page.click('#modal .modal-foot button:not(.btn-primario)');
    await wait(500);
    check('«Revisar la lista» lleva a los entregables, abiertos, y no cambia el estado', (await page.evaluate(() => location.hash)).endsWith('/ficha') &&
      await page.$eval('#f-entregables', (d) => d.open) && (await guardado('categoria002')).estado === 'Borrador');
    await page.goto(BASE + '#/p/categoria002/seguimiento');
    await page.waitForSelector('#recorrido .rcl');
    await page.evaluate(() => {
      const b = document.createElement('button');
      Object.assign(b.dataset, { act: 'sigue', accion: 'marcar-enviada' });
      b.id = 'prueba-enviada';
      document.querySelector('#tab-body').appendChild(b);
    });
    await page.click('#prueba-enviada');
    await page.waitForSelector('#modal[open] .lista-faltan');
    await page.click('#modal .modal-foot .btn-primario');
    await wait(600);
    check('«Marcar como Enviada» sigue y cambia el estado', (await guardado('categoria002')).estado === 'Enviada');

    // 7. Duplicar deja los entregables por preparar; la versión nueva los conserva
    const dup = await page.evaluate(() => {
      const src = window.QStore.get('categoria002');
      const v = window.QStore.cloneProject(src, { version: 2 });
      return { v2: v.entregables.filter((e) => e.listo).length, total: v.entregables.length };
    });
    check('la versión nueva conserva la lista con su avance', dup.total === 8 && dup.v2 === 1, dup);

    // 8. En el teléfono: la tabla de entregables en tarjetas, sin desplazamiento lateral
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '#/p/categoria002/ficha');
    await page.waitForSelector('#f-entregables');
    await page.evaluate(() => { const d = document.querySelector('#f-entregables'); d.open = true; d.scrollIntoView(); });
    await wait(300);
    const tel = await page.evaluate(() => ({
      pagina: document.documentElement.scrollWidth - innerWidth,
      // centro vertical de la casilla, el nombre y eliminar (la casilla va centrada en la línea)
      fila: (() => { const tr = document.querySelector('.tbl-entregables tr[data-row]'); const [a, b, , , e] = tr.children; return [a, b, e].map((td) => { const r = td.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }); })()
    }));
    check('teléfono: sin desplazamiento lateral', tel.pagina <= 0, tel);
    check('teléfono: casilla, nombre y eliminar en la misma línea', Math.max(...tel.fila) - Math.min(...tel.fila) <= 6, tel.fila);
    await page.screenshot({ path: path.join(SHOTS, '5-telefono.png'), fullPage: true });
  } catch (e) {
    check('sin excepción', false, e.message);
    await page.screenshot({ path: path.join(SHOTS, 'error.png'), fullPage: true }).catch(() => {});
  }
  check('sin errores en la consola', errores.length === 0, errores);
  await browser.close();
  console.log(results.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fallas}/${results.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
