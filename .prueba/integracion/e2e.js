// Prueba de punta a punta de «Otras herramientas QUEMPIN» (plan de integración, 2026-10-01).
// La biblioteca «Formulación de proyectos - Documentos» se simula en el almacenamiento privado
// del navegador (OPFS: la misma API que la carpeta real), con datos FICTICIOS (generar_datos.py).
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/integracion/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = 'http://127.0.0.1:8798/index.html';
const SHOTS = path.join(__dirname, 'shots');
const SALIDA = path.join(__dirname, 'salida');
fs.mkdirSync(SHOTS, { recursive: true });
fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(SALIDA, { recursive: true });
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos.json'), 'utf8'));
// El pulso cuenta las horas hábiles desde la última vuelta del procesador (js/pulso.js, 2026-10-08):
// la vuelta sembrada es de ahora; la de hace 6 días es la del procesador detenido.
const conVuelta = (fecha) => { const e = JSON.parse(DATOS['publicado/estado.json']); e.datos.procesador.ultimaCorrida = fecha.toISOString(); return JSON.stringify(e); };
DATOS['publicado/estado.json'] = conVuelta(new Date());
const ESTADO_DETENIDO = conVuelta(new Date(Date.now() - 6 * 24 * 3600e3));
const BIBLIOTECA = 'Formulación de proyectos - Documentos';
const RUTA = [BIBLIOTECA, '.HERRAMIENTAS FORMULACIÓN', 'Intercambio'];
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function escribir(page, archivos) {
  await page.evaluate(async ([archivos, ruta]) => {
    let base = await navigator.storage.getDirectory();
    for (const n of ruta) base = await base.getDirectoryHandle(n, { create: true });
    for (const [r, texto] of archivos) {
      const partes = r.split('/');
      let d = base;
      for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(partes[partes.length - 1], { create: true })).createWritable();
      await w.write(texto); await w.close();
    }
  }, [archivos, RUTA]);
}
async function buzon(page) {
  return page.evaluate(async (ruta) => {
    let d = await navigator.storage.getDirectory();
    for (const n of ruta) d = await d.getDirectoryHandle(n, { create: true });
    d = await d.getDirectoryHandle('buzon', { create: true });
    const out = [];
    for await (const [n, h] of d.entries()) if (h.kind === 'file') out.push(JSON.parse(await (await h.getFile()).text()));
    return out;
  }, RUTA);
}
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent).catch(() => '');
const clickModal = (page, label) => page.click(`#modal button:has-text("${label}")`);

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, locale: 'es-CL', acceptDownloads: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('quempin_viz_unlocked', '1'); } catch (e) { /* */ }
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Formulación de proyectos - Documentos', { create: true });
    FileSystemHandle.prototype.queryPermission = async function () { return 'granted'; };
    FileSystemHandle.prototype.requestPermission = async function () { return 'granted'; };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  try {
    await page.goto(BASE + '#/guia');
    await escribir(page, [['intercambio.json', JSON.stringify({ esquema: 'quempin.intercambio/1', descripcion: 'prueba' })], ...Object.entries(DATOS)]);

    // 1. Proyecto nuevo (conecta la carpeta) y N° de requerimiento
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="nuevo"]:not([data-numero])');
    await page.click('[data-act="nuevo"]:not([data-numero])');
    await wait(400);
    if (await page.$('#modal[open]')) { await clickModal(page, 'Conectar la biblioteca'); await wait(800); }
    await page.waitForSelector('#modal[open] #np-num', { timeout: 8000 });   // «Nuevo proyecto» (2026-10-19)
    await page.check('#np-opciones input[value="ninguna"]');
    await clickModal(page, 'Crear proyecto');
    await page.waitForSelector('#f-req', { timeout: 10000 });
    const uid = (await page.evaluate(() => location.hash)).split('/')[2];
    await page.fill('[data-f="titulo"]', '');
    await page.fill('#f-req', '280');
    await page.dispatchEvent('#f-req', 'change');
    await wait(500);
    if (!(await page.evaluate(() => document.getElementById('pop').hidden))) { await page.keyboard.press('Escape'); await wait(100); }
    await page.click('#f-req + .combo-btn');
    await wait(200);
    const reqs = await page.$$eval('#pop .pop-item .pcode', (o) => o.map((x) => x.textContent.trim()));
    check('la lista de requerimientos llega al campo (lista propia)', reqs.join(',') === '280,12', reqs);
    await page.keyboard.press('Escape');
    await wait(100);
    check('la pista muestra el requerimiento', (await texto(page, '#req-hint')).includes('Conexión H2 laboratorio'), await texto(page, '#req-hint'));
    await page.click('[data-act="req-completar"]');
    await wait(500);
    check('completar trae el título', (await page.inputValue('[data-f="titulo"]')) === 'Conexión H2 laboratorio (ficticio)');
    check('completar trae el presupuesto con IVA', (await page.inputValue('[data-f="parametros.presupuestoMaximo"]')) === '3.570.000');
    await page.fill('[data-f="cliente"]', 'Cliente Demo SpA');
    await page.dispatchEvent('[data-f="cliente"]', 'input');

    // 2. Partida y material con precio de referencia
    await page.goto(`${BASE}#/p/${uid}/partidas`);
    await page.click('[data-act="add-row"][data-list="partidas"]');
    await page.fill('[data-list="partidas"][data-k="descripcion"]', 'Instalación de prueba');
    await page.dispatchEvent('[data-list="partidas"][data-k="descripcion"]', 'input');
    await page.fill('[data-list="partidas"][data-k="cantidad"]', '2');
    await page.dispatchEvent('[data-list="partidas"][data-k="cantidad"]', 'input');
    await page.goto(`${BASE}#/p/${uid}/materiales`);
    await page.click('[data-act="add-row"][data-list="materiales"]');
    await page.fill('[data-list="materiales"][data-k="descripcion"]', 'guante cuero');
    await page.dispatchEvent('[data-list="materiales"][data-k="descripcion"]', 'input');
    await page.click('[data-act="precio-ref"][data-list="materiales"]');
    await page.waitForSelector('#pr-res table', { timeout: 8000 });
    const filasPrecio = await page.$$eval('#pr-res tbody tr', (t) => t.map((x) => x.textContent));
    check('el buscador de precios encuentra el guante', filasPrecio.length >= 1 && /Guante/i.test(filasPrecio[0]), filasPrecio);
    await page.screenshot({ path: path.join(SHOTS, '1-precios.png') });
    await page.click('#pr-res button[value="p:0"]');
    await wait(400);
    check('usar el promedio fija el costo unitario', (await page.inputValue('[data-list="materiales"][data-k="costoUnitario"]')) === '5.400');
    check('el botón queda marcado como precio de referencia', !!(await page.$('[data-act="precio-ref"].usado')));

    // 3. Utilidad
    await page.goto(`${BASE}#/p/${uid}/resumen`);
    await page.fill('#util-all', '50');
    await page.click('[data-act="apply-util"]');
    await wait(300);

    // 4. Evaluación: sesgo real
    await page.goto(`${BASE}#/p/${uid}/evaluacion`);
    await page.waitForSelector('#sens-sesgo [data-act="sens-sesgo"]', { timeout: 8000 });
    check('el simulador muestra el sesgo real', (await texto(page, '#sens-sesgo')).includes('materiales +16,6 %'), await texto(page, '#sens-sesgo'));
    await page.click('#sens-sesgo [data-act="sens-sesgo"]');
    await page.waitForSelector('#sens-sesgo .chip.ok', { timeout: 8000 });
    check('simular con el sesgo fija los controles', (await page.inputValue('#sens-mat')) === '16,6' && (await page.inputValue('#sens-otros')) === '-21,5');

    // 5. Cotización en Sistema QUEMPIN (desde su etapa en el seguimiento, aunque falte la carpeta)
    await page.goto(`${BASE}#/p/${uid}/seguimiento`);
    // Sin carpeta, la etapa actual es la formulación: la de la cotización va plegada y se despliega
    await page.waitForSelector('#etapa-cotizacion summary', { timeout: 8000 });
    await page.click('#etapa-cotizacion summary');
    await page.waitForSelector('#etapa-cotizacion [data-act="herr-cotizacion"]', { timeout: 8000 });
    await page.click('#etapa-cotizacion [data-act="herr-cotizacion"]');
    await page.waitForSelector('#cq-cli');
    await page.dispatchEvent('#cq-cli', 'change');
    check('el RUT del cliente conocido se completa solo', (await page.inputValue('#cq-rut')) === '76.123.456-7');
    await page.click('#cq-cli + .combo-btn');
    await wait(200);
    check('la lista de clientes se abre dentro del diálogo', await page.evaluate(() => !!document.querySelector('#modal #pop:not([hidden]) .pop-item')));
    await page.keyboard.press('Escape');
    await wait(150);
    check('Esc cierra la lista de clientes y deja el diálogo abierto', await page.evaluate(() => document.getElementById('pop').hidden && document.getElementById('modal').open));
    await page.fill('#cq-plazo', '30 días');
    await clickModal(page, 'Enviar a Sistema QUEMPIN');
    await wait(600);
    let msgs = await buzon(page);
    const borr = msgs.find((m) => m.tipo === 'borrador-cotizacion');
    check('el borrador queda en el buzón', !!borr && borr.cotizacion.items.length === 1 && borr.proyecto.req === '280', borr);

    // 6. Adjudicada → «Pasar a ejecución»: costos, venta y aviso a la planilla en un solo envío
    await page.waitForSelector('#recorrido .rc-espera', { timeout: 8000 });
    check('el recorrido muestra la cotización en espera en Sistema QUEMPIN', (await texto(page, '#recorrido .rc-espera')).includes('En Sistema QUEMPIN'), await texto(page, '#recorrido .rc-linea'));
    check('sin carpeta de la oferta, el recorrido pide elegirla', (await texto(page, '#recorrido .rc-sigue')).includes('Elige la carpeta de su oferta'), await texto(page, '#recorrido .rc-sigue'));
    await page.evaluate(() => window.scrollTo(0, 0));   // el menú se cierra con cualquier desplazamiento
    await wait(300);
    await page.click('#ed-meta [data-picker="estado"]');
    await wait(200);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');   // Borrador → En revisión → Enviada → Adjudicada
    await page.keyboard.press('Enter');
    await wait(600);
    check('el proyecto queda Adjudicada', (await texto(page, '#ed-meta [data-picker="estado"]')).includes('Adjudicada'), await texto(page, '#ed-meta [data-picker="estado"]'));
    check('al cambiar el estado se dice qué sigue', (await texto(page, '#toast')).includes('Siguiente: pasar a ejecución'), await texto(page, '#toast'));
    await page.waitForSelector('#recorrido [data-act="sigue"][data-accion="enviar-af"]', { timeout: 8000 });
    check('el recorrido marca la ejecución como lo que sigue', (await texto(page, '#recorrido .rc-actual')).includes('Ejecución'), await texto(page, '#recorrido'));
    await page.click('#recorrido [data-act="sigue"][data-accion="enviar-af"]');
    await page.waitForSelector('#af-tag');
    check('el diálogo es «Pasar el proyecto a ejecución»', (await texto(page, '#modal h2')).includes('Pasar el proyecto a ejecución'), await texto(page, '#modal h2'));
    check('la venta y el aviso a la planilla vienen marcados', (await page.isChecked('#af-con-venta')) && (await page.isChecked('#af-con-planilla')));
    await page.selectOption('#af-tag', 'DEMO');
    await clickModal(page, 'Enviar al Análisis Financiero');
    await wait(900);
    msgs = await buzon(page);
    check('un solo envío deja costos, venta y aviso', ['presupuesto-proyecto', 'venta-proyecto', 'actualizar-requerimiento'].every((t) => msgs.filter((m) => m.tipo === t).length === 1), msgs.map((m) => m.tipo));
    await page.goto(`${BASE}#/p/${uid}/ficha`);
    await page.goto(`${BASE}#/p/${uid}/seguimiento`);
    await page.waitForSelector('[data-act="herr-venta"]', { timeout: 8000 });
    check('la venta queda enviada (se puede volver a enviar)', (await texto(page, '#recorrido')).includes('Volver a enviar la venta'), await texto(page, '#recorrido'));
    check('sin botón para repetir el mismo aviso a la planilla', !(await page.$('[data-act="herr-planilla"]')));
    check('lo que sigue: en ejecución, con el tablero del AF', (await texto(page, '#recorrido .rc-sigue')).includes('En ejecución') && !!(await page.$('#recorrido [data-accion="abrir-af"]')), await texto(page, '#recorrido .rc-sigue'));

    // 7. Control de Documentos
    // El N° del Control de Documentos se toma solo al elegir la carpeta de la oferta (sin botón de registrar)
    const bloqueCD = await texto(page, '#recorrido');
    check('sin carpeta: el panel explica que el número se toma al elegirla', bloqueCD.includes('al elegir la carpeta de la oferta (el siguiente es el 812602)') && !(await page.$('[data-act="herr-registro"]')), bloqueCD);
    await page.evaluate(async (bib) => {   // la carpeta de la oferta, junto a la de herramientas
      const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle(bib)).getDirectoryHandle('280. Conexión H2', { create: true });
      const w = await (await d.getFileHandle('Oferta.pdf', { create: true })).createWritable(); await w.write('pdf'); await w.close();
    }, BIBLIOTECA);
    // En ejecución, la formulación va plegada: se despliega para elegir la carpeta
    await page.click('#etapa-formulacion summary');
    await page.click('#etapa-formulacion [data-act="oferta-elegir"]');
    await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 5000 });
    await page.click('#modal .cp-fila:not([hidden]):has-text("Conexión H2")');
    check('la primera vez pide las iniciales, en el mismo formulario', !!(await page.$('#modal #cp-ini')));
    await page.selectOption('#cp-ini', 'CM');   // de la lista del equipo (2026-10-16)
    await clickModal(page, 'Usar esta carpeta');
    await wait(1200);
    check('el aviso trae el N° de la evaluación', (await texto(page, '#toast')).includes('Evaluación de costos N° 812602'), await texto(page, '#toast'));
    msgs = await buzon(page);
    const tipos = msgs.map((m) => m.tipo).sort();
    check('los cinco envíos quedan en el buzón', JSON.stringify(tipos) === JSON.stringify(['actualizar-requerimiento', 'borrador-cotizacion', 'presupuesto-proyecto', 'registro-documento', 'venta-proyecto']), tipos);
    const venta = msgs.find((m) => m.tipo === 'venta-proyecto');
    check('la venta sale del precio del Formulador mientras no hay cotización emitida', venta && venta.fuente.herramienta === 'formulador' && venta.proyecto.tag === 'DEMO' && venta.reemplaza.montoSinIva === null, venta);
    const sug = msgs.find((m) => m.tipo === 'actualizar-requerimiento');
    check('la sugerencia a la planilla es Adjudicado con valor con IVA', sug && sug.cambios.estado === 'Adjudicado' && sug.cambios.valorAdjudicado > 0, sug);
    const reg = msgs.find((m) => m.tipo === 'registro-documento');
    check('el registro va con las iniciales elegidas', reg && reg.documento.autor === 'CM' && reg.documento.folio === '812602', reg);
    msgs.forEach((m, i) => fs.writeFileSync(path.join(SALIDA, `${i}-${m.tipo}.json`), JSON.stringify(m, null, 2)));

    // 7b. El nombre que se ve (2026-11-09): el lápiz del panel del AF pide solo el apodo
    await page.click('#af-panel [data-act="af-nombre"]');
    await page.waitForSelector('#modal[open] #af-apodo', { timeout: 5000 });
    check('el lápiz propone el nombre del Análisis Financiero', (await page.inputValue('#af-apodo')) === 'Proyecto demo', await page.inputValue('#af-apodo'));
    await page.fill('#af-apodo', '  H2   Green ');
    await clickModal(page, 'Guardar');
    await wait(700);
    const apodo = (await buzon(page)).find((m) => m.tipo === 'datos-proyecto');
    check('el cambio de nombre va al AF como apodo', apodo && apodo.proyecto.tag === 'DEMO' && apodo.valores.Apodo === 'H2 Green' && apodo.reemplaza.Apodo === null, apodo);
    check('el panel muestra el nombre nuevo', (await texto(page, '#af-panel')).includes('H2 Green'), await texto(page, '#af-panel'));
    if (apodo) await page.evaluate(async ([ruta, id]) => {   // fuera del buzón, para no tocar las cuentas de abajo
      let d = await navigator.storage.getDirectory();
      for (const n of ruta.concat(['buzon'])) d = await d.getDirectoryHandle(n);
      for await (const n of d.keys()) if (n.includes(id)) await d.removeEntry(n);
    }, [RUTA, apodo.id]);

    // 8. Sistema QUEMPIN atiende: cotización emitida y registro reasignado
    const docs = { esquema: 'quempin.intercambio/1', herramienta: 'sistema-quempin', generado: new Date().toISOString(), datos: {
      documentos: [{ tipo: '60', folio: '602695', pais: 'Chile', fecha: '2026-10-01', referencia: 'Conexión', moneda: 'CLP', neto: 900000, impuesto: 171000, total: 1071000,
        contraparte: { razon_social: 'Cliente Demo SpA' }, proyecto: { req: '280', tag: 'DEMO' }, cuotas: [], origen: { herramienta: 'formulador', mensaje: borr.id, uid } }],
      mensajes: { [borr.id]: { estado: 'aplicado', folio: '602695' }, [reg.id]: { estado: 'aplicado', folio: '812603', reasignado: true } } } };
    await escribir(page, [['publicado/documentos-comerciales.json', JSON.stringify(docs)]]);
    await page.click('#recorrido .herr-pulso [data-act="herr-actualizar"]');
    await wait(800);
    const panel = await texto(page, '#recorrido');
    check('el panel muestra la cotización emitida', panel.includes('Emitida como cotización 602695'), panel);
    check('el panel muestra el número reasignado', panel.includes('quedó como 812603'), panel);
    check('la venta ahora sale de la cotización emitida', panel.includes('cotización 602695'), panel);
    check('el pulso del procesador se ve', panel.includes('revisaron la carpeta'), panel);
    // 8b. Procesador detenido: el seguimiento lo dice en rojo; después vuelve a estar al día
    await escribir(page, [['publicado/estado.json', ESTADO_DETENIDO]]);
    await page.click('#recorrido .herr-pulso [data-act="herr-actualizar"]');
    await wait(800);
    check('con el procesador detenido, el seguimiento lo dice', (await texto(page, '#recorrido .herr-pulso.detenido')).includes('no corre desde'), await texto(page, '#recorrido .herr-pulso'));
    await escribir(page, [['publicado/estado.json', DATOS['publicado/estado.json']]]);
    await page.click('#recorrido .herr-pulso [data-act="herr-actualizar"]');
    await wait(800);
    check('el recorrido muestra la cotización emitida', (await texto(page, '#etapa-cotizacion')).includes('N° 602695'), await texto(page, '#etapa-cotizacion'));
    await page.screenshot({ path: path.join(SHOTS, '2-evaluacion.png'), fullPage: true });

    // 9. El Excel exportado lleva el número del Control de Documentos
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.evaluate((u) => window.QExcel ? null : null, uid), page.click('[data-act="exp-xlsx"]').catch(() => null)]);
    check('el Excel exportado empieza con el N° 812603', descarga && descarga.suggestedFilename().startsWith('812603_'), descarga && descarga.suggestedFilename());

    // 10. La lista dice qué sigue con cada oferta, y avisa si el procesador está detenido
    await escribir(page, [['publicado/estado.json', ESTADO_DETENIDO]]);
    await page.evaluate(() => window.QHerramientas.olvidar());
    await page.goto(BASE + '#/');
    await page.waitForSelector(`tr[data-open="${uid}"] .sigue-corto`, { timeout: 8000 });
    check('la lista muestra «En ejecución» bajo el estado', (await texto(page, `tr[data-open="${uid}"] .sigue-corto`)) === 'En ejecución', await texto(page, `tr[data-open="${uid}"] .sigue-corto`));
    await page.waitForSelector('#compartida .pulso-detenido', { timeout: 8000 }).catch(() => null);
    check('la lista avisa que el procesador está detenido', (await texto(page, '#compartida')).includes('Lo que envías no se está aplicando'), await texto(page, '#compartida'));
  } catch (e) {
    errores.push('prueba: ' + (e && e.stack || e));
    await page.screenshot({ path: path.join(SHOTS, 'error.png'), fullPage: true }).catch(() => {});
  }
  await browser.close();
  console.log(results.join('\n'));
  if (errores.length) console.log('\nERRORES:\n' + errores.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length + errores.length;
  console.log(`\n${results.length - results.filter((r) => r.startsWith('FAIL')).length}/${results.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
