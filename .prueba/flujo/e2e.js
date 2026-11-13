// Prueba de punta a punta de «Qué sigue» (recorrido de la oferta, js/flujo.js, 2026-10-05): el aviso
// del editor, el recorrido del paso 5, el pie del paso 5 y la lista, por un camino que la prueba de
// integración no recorre: carpeta → cotización → emitida → «Marcar como Enviada» (con aviso a la
// planilla) → «Perdida» → cerrada. La biblioteca se simula en OPFS con datos FICTICIOS
// (los de .prueba/integracion/datos.json).
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/flujo/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = 'http://127.0.0.1:8798/index.html';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'integracion', 'datos.json'), 'utf8'));
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
    for await (const [, h] of d.entries()) if (h.kind === 'file') out.push(JSON.parse(await (await h.getFile()).text()));
    return out.sort((a, b) => String(a.origen.enviado).localeCompare(String(b.origen.enviado)));
  }, RUTA);
}
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
const clickModal = (page, label) => page.click(`#modal button:has-text("${label}")`);
/* La barra del recorrido va plegada (2026-10-09): se despliega para usar sus botones */
async function abrirBarra(page) {
  await page.waitForSelector('#ed-recorrido .rcb-resumen', { timeout: 8000 });
  if (!(await page.$eval('#ed-recorrido details', (d) => d.open))) await page.click('#ed-recorrido .rcb-resumen');
}
const editar = async (page, sel, valor) => { await page.fill(sel, valor); await page.dispatchEvent(sel, 'input'); };

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, locale: 'es-CL' });
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

    // 1. Proyecto nuevo con su N° de requerimiento: en el paso 1 no hace falta el aviso (el campo está ahí)
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="nuevo"]');
    await page.click('[data-act="nuevo"]');
    await wait(400);
    if (await page.$('#modal[open]')) { await clickModal(page, 'Conectar la biblioteca'); await wait(800); }
    // «Nuevo proyecto» (2026-10-19): pregunta si se crea la carpeta de la oferta; aquí se sigue sin carpeta
    await page.waitForSelector('#modal[open] #np-num', { timeout: 8000 });
    check('nuevo: el formulario pregunta si se crea la carpeta de la oferta', (await texto(page, '#np-carpeta')).includes('¿Crear la carpeta de la oferta?'), await texto(page, '#np-carpeta'));
    // Sin N° el diálogo ya no crea proyectos (2026-11-12): un proyecto sin N° es uno de antes, que ya existía
    await page.click('#modal .modal-foot button:not(.btn-primario)'); await wait(300);
    await page.evaluate(() => { const p = window.QStore.newProject(); window.QStore.upsert(p); location.hash = `#/p/${p.uid}/ficha`; });
    await page.waitForSelector('#f-req', { timeout: 10000 });
    const uid = (await page.evaluate(() => location.hash)).split('/')[2];
    check('paso 1 sin N°: la barra lo dice, sin botón (el campo está a la vista)', (await texto(page, '#ed-recorrido')).includes('Falta el N° de requerimiento') && !(await page.$('#ed-recorrido [data-act="sigue"]')), await texto(page, '#ed-recorrido'));
    await page.goto(`${BASE}#/p/${uid}/partidas`);
    await page.waitForSelector('#ed-recorrido .rcb-resumen', { timeout: 8000 });
    check('la barra del recorrido va plegada: dice la etapa actual', !(await page.$eval('#ed-recorrido details', (d) => d.open)) && (await texto(page, '#ed-recorrido .rcb-resumen')).includes('Etapa 1 de 6: Requerimiento'), await texto(page, '#ed-recorrido .rcb-resumen'));
    await abrirBarra(page);
    await page.waitForSelector('#ed-recorrido [data-accion="ir-req"]', { timeout: 8000 });
    check('en otro paso, la barra pide el N° de requerimiento', (await texto(page, '#ed-recorrido')).includes('Escribir el N° de requerimiento'), await texto(page, '#ed-recorrido'));
    await page.click('#ed-recorrido [data-accion="ir-req"]');
    await wait(300);
    check('«Escribir el N°» lleva al campo del paso 1', await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-req'));
    await page.fill('#f-req', '280');
    await page.dispatchEvent('#f-req', 'change');
    await wait(400);
    if (!(await page.evaluate(() => document.getElementById('pop').hidden))) { await page.keyboard.press('Escape'); await wait(100); }
    await page.click('[data-act="req-completar"]');
    await wait(500);
    await editar(page, '[data-f="cliente"]', 'Cliente Demo SpA');

    // 2. Formulación: una partida, un material y la utilidad. Mientras se formula, los pasos guían (sin aviso)
    await page.goto(`${BASE}#/p/${uid}/partidas`);
    await wait(300);
    check('mientras se formula, la barra guía la formulación (sin botones del recorrido)', /Formulación/.test(await texto(page, '#ed-recorrido .rcb-sigue')) && !(await page.$('#ed-recorrido .btn-primario')), await texto(page, '#ed-recorrido .rcb-sigue'));
    await page.click('[data-act="add-row"][data-list="partidas"]');
    await editar(page, '[data-list="partidas"][data-k="descripcion"]', 'Instalación de prueba');
    await editar(page, '[data-list="partidas"][data-k="cantidad"]', '1');
    await page.goto(`${BASE}#/p/${uid}/materiales`);
    await page.click('[data-act="add-row"][data-list="materiales"]');
    await editar(page, '[data-list="materiales"][data-k="descripcion"]', 'Cañería de prueba');
    await editar(page, '[data-list="materiales"][data-k="costoUnitario"]', '100000');
    await page.goto(`${BASE}#/p/${uid}/resumen`);
    await page.fill('#util-all', '50');
    await page.click('[data-act="apply-util"]');
    await wait(400);

    // 3. Formulación lista sin carpeta: el aviso pide la carpeta de la oferta
    await abrirBarra(page);
    await page.waitForSelector('#ed-recorrido [data-accion="oferta-elegir"]', { timeout: 8000 });
    check('formulada sin carpeta: la barra pide elegirla (etapa 2)', (await page.getAttribute('#ed-recorrido nav', 'aria-label')).includes('etapa 2 de 6'), await page.getAttribute('#ed-recorrido nav', 'aria-label'));
    await page.evaluate(async (bib) => {
      const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle(bib)).getDirectoryHandle('280. Conexión H2', { create: true });
      const w = await (await d.getFileHandle('Oferta.pdf', { create: true })).createWritable(); await w.write('pdf'); await w.close();
    }, BIBLIOTECA);
    await page.click('#ed-recorrido [data-accion="oferta-elegir"]');
    await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 5000 });
    await page.click('#modal .cp-fila:not([hidden]):has-text("Conexión H2")');
    check('el formulario pide las iniciales una sola vez, ahí mismo', !!(await page.$('#modal #cp-ini')));
    await page.selectOption('#cp-ini', 'CM');   // de la lista del equipo (2026-10-16)
    await clickModal(page, 'Usar esta carpeta');
    await wait(1200);

    // 4. Lo que sigue es la cotización: se prepara desde el mismo aviso
    await abrirBarra(page);
    await page.waitForSelector('#ed-recorrido [data-accion="herr-cotizacion"]', { timeout: 8000 });
    check('con la carpeta: la barra dice «Preparar la cotización» (etapa 3)', (await page.getAttribute('#ed-recorrido nav', 'aria-label')).includes('etapa 3 de 6, Cotización') && (await texto(page, '#ed-recorrido')).includes('Preparar la cotización'), await page.getAttribute('#ed-recorrido nav', 'aria-label'));
    await page.click('#ed-recorrido [data-accion="herr-cotizacion"]');
    await page.waitForSelector('#cq-cli');
    await clickModal(page, 'Enviar a Sistema QUEMPIN');
    await wait(700);
    check('después de preparar la cotización, se ve el seguimiento', (await page.evaluate(() => location.hash)).endsWith('/seguimiento'));
    let msgs = await buzon(page);
    const borr = msgs.find((m) => m.tipo === 'borrador-cotizacion');
    check('el borrador queda en el buzón', !!borr && borr.proyecto.req === '280', msgs.map((m) => m.tipo));
    await page.waitForSelector('#recorrido .rc-sigue.espera', { timeout: 8000 });
    check('el seguimiento pasa a «En espera» en Sistema QUEMPIN, en la etapa actual', (await texto(page, '#recorrido .rcl-actual')).includes('Cotización') && (await texto(page, '#recorrido .rc-sigue')).includes('En espera') && !!(await page.$('#recorrido [data-accion="marcar-enviada"]')), await texto(page, '#recorrido .rcl-actual'));
    check('en el seguimiento no se repite la barra del recorrido', !(await page.$('#ed-recorrido .rc-barra')));
    await page.screenshot({ path: path.join(SHOTS, '1-aviso-espera.png') });
    await page.goto(`${BASE}#/p/${uid}/resumen`);
    await page.waitForSelector('#ed-recorrido .rc-barra.espera', { timeout: 8000 });
    check('en los pasos, la barra plegada dice «En Sistema QUEMPIN»', (await texto(page, '#ed-recorrido .rcb-resumen')).includes('En Sistema QUEMPIN'), await texto(page, '#ed-recorrido .rcb-resumen'));

    // 5. Sistema QUEMPIN la emite: el recorrido del paso 5 lo ve y lo que sigue es marcarla Enviada
    const docs = { esquema: 'quempin.intercambio/1', herramienta: 'sistema-quempin', generado: new Date().toISOString(), datos: {
      documentos: [{ tipo: '60', folio: '602695', pais: 'Chile', fecha: '2026-10-05', referencia: 'Conexión', moneda: 'CLP', neto: 150000, impuesto: 28500, total: 178500,
        contraparte: { razon_social: 'Cliente Demo SpA' }, proyecto: { req: '280' }, cuotas: [], origen: { herramienta: 'formulador', mensaje: borr.id, uid } }],
      mensajes: { [borr.id]: { estado: 'aplicado', folio: '602695' } } } };
    await escribir(page, [['publicado/documentos-comerciales.json', JSON.stringify(docs)]]);
    await page.goto(`${BASE}#/p/${uid}/seguimiento`);
    await page.waitForSelector('#recorrido .herr-pulso [data-act="herr-actualizar"]', { timeout: 8000 });
    await page.click('#recorrido .herr-pulso [data-act="herr-actualizar"]');
    await page.waitForFunction(() => /602695/.test((document.querySelector('#recorrido .rc-sigue') || {}).textContent || ''), null, { timeout: 8000 });
    check('recorrido: la cotización hecha con su N°', (await texto(page, '#etapa-cotizacion')).includes('N° 602695'), await texto(page, '#etapa-cotizacion'));
    check('recorrido: lo que sigue es enviarla (etapa 4)', (await texto(page, '#recorrido .rcl-actual .rcl-ahora')).includes('4 de 6') && (await texto(page, '#recorrido .rc-sigue')).includes('602695'), await texto(page, '#recorrido .rcl-actual'));
    check('solo la etapa actual va abierta; las demás, plegadas', (await page.$$('#recorrido .rcl-actual')).length === 1 && (await page.$$eval('#recorrido .rcl-plegada details', (ds) => ds.length === 5 && ds.every((d) => !d.open))));
    check('el pie del seguimiento ofrece lo que sigue', (await texto(page, '#pie-sigue')).includes('Marcar como Enviada'), await texto(page, '#pie-sigue'));
    check('las etapas van en el orden del recorrido, cada una con lo de su herramienta', (await page.$$eval('#recorrido .rcl', (o) => o.map((x) => x.id))).join() === 'etapa-requerimiento,etapa-formulacion,etapa-cotizacion,etapa-oferta,etapa-ejecucion,etapa-cierre');
    await page.screenshot({ path: path.join(SHOTS, '2-recorrido.png'), fullPage: true });

    // 6. «Marcar como Enviada»: cambia el estado y avisa a la planilla en el mismo clic
    await page.click('#recorrido [data-accion="marcar-enviada"]');
    await wait(900);
    check('el proyecto queda Enviada', (await texto(page, '#ed-meta [data-picker="estado"]')).includes('Enviada'));
    check('el aviso dice que se avisó a la planilla y qué sigue', (await texto(page, '#toast')).includes('con aviso a la Planilla de Ingreso') && (await texto(page, '#toast')).includes('Ahora: esperando respuesta'), await texto(page, '#toast'));
    msgs = await buzon(page);
    const ofertado = msgs.find((m) => m.tipo === 'actualizar-requerimiento' && m.cambios.estado === 'Ofertado');
    check('la planilla recibe «Ofertado» con el total con IVA de la cotización', !!ofertado && ofertado.cambios.valorOfertado === 178500, ofertado);
    await page.waitForSelector('#recorrido .rc-sigue.espera', { timeout: 8000 });
    check('recorrido: esperando la respuesta, con Adjudicada y Perdida', !!(await page.$('#recorrido [data-accion="marcar-adjudicada"]')) && !!(await page.$('#recorrido [data-accion="marcar-perdida"]')));

    // 6b. El monitor de Mercado Público publica el resultado: se ve en «Oferta y adjudicación», con
    //     enlace solo a mercadopublico.cl, todo escapado (la carpeta la edita cualquiera del equipo)
    const lics = { esquema: 'quempin.intercambio/1', herramienta: 'mercado-publico', generado: new Date().toISOString(), datos: {
      proveedor: { rut: '76.772.215-K', codigo: '1717812' }, consultado: '2026-10-13T12:00:00-03:00', ordenes: [], revisar: [],
      resumen: { ganadas: 0, perdidas: 1 },
      licitaciones: [{ req: 280, codigo: '1234-56-LE26', resultado: 'perdida', url: 'https://www.mercadopublico.cl/Procurement/x?idlicitacion=1234-56-LE26',
        urlActa: 'javascript:alert(1)', adjudicados: [{ nombre: 'Otra <img src=x onerror=alert(1)> SpA', montoNeto: 120000 }] }] } };
    await escribir(page, [['publicado/licitaciones.json', JSON.stringify(lics)]]);
    await page.click('#recorrido .herr-pulso [data-act="herr-actualizar"]');
    await page.waitForFunction(() => /Mercado Público/.test((document.querySelector('#etapa-oferta') || {}).textContent || ''), null, { timeout: 8000 });
    const oferta = await texto(page, '#etapa-oferta');
    check('Mercado Público: adjudicada a otro, quién ganó y por cuánto', oferta.includes('Adjudicada a otro') && oferta.includes('Ganó Otra') && oferta.includes('120.000'), oferta);
    const enlaces = await page.$$eval('#etapa-oferta a', (as) => as.map((a) => [a.getAttribute('href'), a.rel]));
    check('Mercado Público: solo enlaza a mercadopublico.cl, en otra pestaña y sin referer', enlaces.length === 1 && enlaces[0][0].startsWith('https://www.mercadopublico.cl/') && enlaces[0][1].includes('noreferrer'), enlaces);
    check('Mercado Público: el texto que llega de la carpeta no inyecta HTML', !(await page.$('#etapa-oferta img')));
    check('Mercado Público: ofrece marcar la oferta como Perdida', !!(await page.$('#etapa-oferta [data-accion="marcar-perdida"]')));

    // 7. «Perdida»: aviso «No adjudicado» y la oferta queda cerrada
    await page.click('#recorrido [data-accion="marcar-perdida"]');
    await wait(900);
    msgs = await buzon(page);
    const perdida = msgs.find((m) => m.tipo === 'actualizar-requerimiento' && m.cambios.estado === 'No adjudicado');
    check('la planilla recibe «No adjudicado» (sin valor)', !!perdida && Object.keys(perdida.cambios).join() === 'estado', perdida);
    check('el aviso dice que no queda nada pendiente', (await texto(page, '#toast')).includes('No queda nada pendiente'), await texto(page, '#toast'));
    await page.waitForSelector('#recorrido .rc-sigue.fin', { timeout: 8000 });
    check('recorrido: oferta perdida, nada pendiente', (await texto(page, '#recorrido .rc-sigue')).includes('no queda nada pendiente'), await texto(page, '#recorrido .rc-sigue'));
    check('ejecución y cierre no aplican', (await page.$$('#recorrido .rc-no-aplica')).length === 2);
    check('sin nada que hacer, el pie ofrece volver a la lista', !(await page.$('#pie-sigue [data-act="sigue"]')) && (await texto(page, '#pie-sigue')).includes('Volver a Proyectos'), await texto(page, '#pie-sigue'));
    const tiposEnviados = msgs.map((m) => m.tipo).sort().join();
    check('en el buzón: borrador, registro 81 y dos avisos a la planilla, nada más', tiposEnviados === 'actualizar-requerimiento,actualizar-requerimiento,borrador-cotizacion,registro-documento', tiposEnviados);

    // 8. La lista dice qué sigue con cada oferta
    await page.goto(BASE + '#/');
    await page.waitForSelector(`tr[data-open="${uid}"] .sigue-corto`, { timeout: 8000 });
    check('la lista muestra «Sin pendientes» bajo el estado (no se confunde con Cerrada)', (await texto(page, `tr[data-open="${uid}"] .sigue-corto`)) === 'Sin pendientes', await texto(page, `tr[data-open="${uid}"] .sigue-corto`));

    // 8b. «Cerrada» (2026-10-26): desde el selector de estado; no avisa a la planilla, el cierre queda hecho
    await page.goto(`${BASE}#/p/${uid}/seguimiento`);
    await page.waitForSelector('#recorrido .rc-linea', { timeout: 8000 });
    await page.click('#ed-meta [data-picker="estado"]'); await wait(150);
    check('el selector ofrece «Cerrada» después de Adjudicada', (await page.$$eval('.pop-item', (xs) => xs.map((x) => x.textContent))).findIndex((t) => t.includes('Cerrada'))
      === (await page.$$eval('.pop-item', (xs) => xs.map((x) => x.textContent))).findIndex((t) => t.includes('Adjudicada')) + 1);
    await page.click('.pop-item:has-text("Cerrada")'); await wait(1200);
    if (await page.$('#modal[open]')) { await page.keyboard.press('Escape'); await wait(300); }
    check('cerrada: el aviso dice que sale de la Planificación', (await texto(page, '#toast')).includes('sale de la Planificación semanal'), await texto(page, '#toast'));
    check('cerrada: no se manda otro aviso a la planilla', (await buzon(page)).length === msgs.length, (await buzon(page)).map((m) => m.tipo));
    await page.waitForSelector('#etapa-cierre.rc-hecha, #etapa-cierre.rcl-actual', { timeout: 8000 }).catch(() => {});
    check('cerrada: el recorrido termina en el cierre', (await texto(page, '#recorrido .rc-sigue')).includes('Proyecto cerrado'), await texto(page, '#recorrido .rc-sigue'));
    check('cerrada: se puede volver a «Adjudicada»', !!(await page.$('#etapa-cierre [data-accion="reabrir"]')), await texto(page, '#etapa-cierre'));
    await page.goto(BASE + '#/');
    await page.waitForSelector(`tr[data-open="${uid}"] .estado`, { timeout: 8000 });
    check('la lista muestra «Cerrada» y «Cerrado» bajo el estado', (await texto(page, `tr[data-open="${uid}"] .estado`)) === 'Cerrada' && (await texto(page, `tr[data-open="${uid}"] .sigue-corto`)) === 'Cerrado',
      await texto(page, `tr[data-open="${uid}"] td[data-label="Estado"]`));
    check('el filtro por estado tiene «Cerrada»', !!(await page.$('#list-cartera [data-e="Cerrada"]:not([disabled])')));
    // Un segundo proyecto, recién creado, para ver la columna con dos situaciones distintas
    await page.click('[data-act="nuevo"]');
    await wait(600);
    if (await page.$('#modal[open]')) { await page.keyboard.press('Escape'); await wait(300); }
    await page.goto(BASE + '#/');
    await page.waitForSelector('#list-body tr .sigue-corto', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, '4-lista.png') });

    // Modo oscuro: el recorrido se lee igual
    await page.evaluate(() => localStorage.setItem('quempin_fp_theme', 'dark'));
    await page.goto(`${BASE}#/p/${uid}/seguimiento`);
    await page.reload();
    await page.waitForSelector('#recorrido .rc-linea', { timeout: 8000 });
    await wait(400);
    await page.$eval('#que-sigue', (e) => e.scrollIntoView());
    await page.screenshot({ path: path.join(SHOTS, '5-oscuro.png') });
    await page.evaluate(() => localStorage.setItem('quempin_fp_theme', 'light'));

    // 9. En el teléfono, el paso 5 no se desborda
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}#/p/${uid}/seguimiento`);
    await page.waitForSelector('#recorrido .rc-linea', { timeout: 8000 });
    await wait(500);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('teléfono: sin desplazamiento horizontal', desborde <= 0, desborde);
    await page.$eval('#que-sigue', (e) => e.scrollIntoView());
    await page.screenshot({ path: path.join(SHOTS, '3-telefono.png') });
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
