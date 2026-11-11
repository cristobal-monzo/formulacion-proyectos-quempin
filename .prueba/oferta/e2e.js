// Prueba de punta a punta del Excel en la carpeta de la oferta (js/oferta.js + app.js).
// La biblioteca «Formulación de proyectos - Documentos» se simula en el almacenamiento privado del
// navegador (OPFS: la misma API que la carpeta real elegida con showDirectoryPicker), con carpetas de
// oferta y planilla FICTICIAS. El Excel se genera y se lee con ExcelJS de verdad.
// Uso: servir el repo en http://127.0.0.1:8797 y correr  node .prueba/oferta/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = 'http://127.0.0.1:8797/index.html';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const BIB = 'Formulación de proyectos - Documentos';
const HERR = '.HERRAMIENTAS FORMULACIÓN';
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PUB = (herramienta, datos) => JSON.stringify({ esquema: 'quempin.intercambio/1', herramienta, generado: '2026-10-02T10:00:00-03:00', datos });
const INICIAL = [
  [`${HERR}/Intercambio/intercambio.json`, JSON.stringify({ esquema: 'quempin.intercambio/1', descripcion: 'prueba' })],
  [`${HERR}/Intercambio/publicado/requerimientos.json`, PUB('planilla-requerimientos', { requerimientos: [
    { numero: 298, estado: 'Evaluación', titulo: 'Quemadores SAG de prueba', ubicacion: 'Osorno', referencia: '1234-56-LE26', cierre: '2026-10-20', presupuesto: 11900000 },
    { numero: 303, estado: 'Ofertado', titulo: 'Quemador Osorno de prueba', ubicacion: 'Osorno', referencia: '', cierre: null, presupuesto: null },
    { numero: 296, estado: 'Adjudicado', titulo: 'Sala de calderas Llay Llay', ubicacion: 'Llay Llay', referencia: '', cierre: null, presupuesto: null }
  ] })],
  [`${HERR}/Intercambio/publicado/folios.json`, PUB('sistema-quempin', { tipos: { 81: { nombre: 'Evaluación de costos', paises: {
    Chile: { ultimo: '812601', fecha: '2026-01-12', autor: 'JB', siguiente: '812602' }, Peru: { ultimo: null, siguiente: '812601' } } } } })],
  [`${HERR}/Planilla de Ingreso de Requerimientos.xlsx`, 'copia del usuario'],
  ['298. SAG Quemadores/Oferta.pdf', 'pdf de prueba'],
  ['298. SAG Quemadores/ANTECEDENTES/bases.pdf', 'bases'],
  ['0 OFERTAS PRESENTADAS/303. Quemador Osorno/Experiencia/certificado.pdf', 'cert'],
  ['0 OFERTAS PRESENTADAS/296. CAPREDENA/Oferta.pdf', 'otra oferta'],
  ['0 OFERTAS PRESENTADAS/0 Ofertas Cerradas 2025/Hospital de ejemplo/Oferta.pdf', 'cerrada'],
  ['0 OFERTAS ADJUDICADAS/250. Catedral/Contrato.pdf', 'contrato'],
  ['1 CARPETA MODELO/ANTECEDENTES/leeme.txt', 'modelo'],
  ['Planilla de Ingreso de Requerimientos.xlsx', 'planilla real']
];

async function escribir(page, archivos) {
  await page.evaluate(async ([archivos, bib]) => {
    let base = await navigator.storage.getDirectory();
    base = await base.getDirectoryHandle(bib, { create: true });
    for (const [ruta, texto] of archivos) {
      const partes = ruta.split('/');
      let d = base;
      for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(partes[partes.length - 1], { create: true })).createWritable();
      await w.write(texto); await w.close();
    }
  }, [archivos, BIB]);
}
/* Todos los archivos de la biblioteca: { ruta: texto } (los Excel de verdad, como «xlsx:<tamaño>») */
async function biblioteca(page) {
  return page.evaluate(async (bib) => {
    const out = {};
    async function rec(d, pre) {
      for await (const [n, h] of d.entries()) {
        if (h.kind === 'directory') await rec(h, pre + n + '/');
        else {   // un Excel de verdad (zip, empieza con «PK») se resume; lo demás se compara por su texto
          const f = await h.getFile();
          const t = await f.text();
          out[pre + n] = /\.xlsx$/.test(n) && t.startsWith('PK') ? 'xlsx:' + f.size : t;
        }
      }
    }
    await rec(await (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true }), '');
    return out;
  }, BIB);
}
/* Lee un Excel de la biblioteca con ExcelJS: hojas, celdas clave de la Ficha y el uid de _datos */
async function leerExcel(page, ruta) {
  return page.evaluate(async ([bib, ruta]) => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib);
    const partes = ruta.split('/');
    try { for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p); } catch (e) { return null; }
    let f;
    try { f = await (await d.getFileHandle(partes[partes.length - 1])).getFile(); } catch (e) { return null; }
    const ExcelJS = await window.QExcel.ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await f.arrayBuffer());
    const F = wb.getWorksheet('Ficha');
    const val = (c) => { const v = F.getCell(c).value; return v && typeof v === 'object' && 'result' in v ? v.result : v; };
    let id = '';
    F.eachRow((row) => { if (row.getCell(1).value === 'ID interno') id = row.getCell(3).value; });
    return { hojas: wb.worksheets.map((w) => w.name), titulo: val('C4'), nota: val('C6'), id, uid: await window.QExcel.uidDeExcel(await f.arrayBuffer()) };
  }, [BIB, ruta]);
}
async function mover(page, de, a) {
  await page.evaluate(async ([bib, de, a]) => {
    const raiz = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib);
    const abrir = async (ruta, crear) => { let d = raiz; for (const p of ruta) d = await d.getDirectoryHandle(p, { create: !!crear }); return d; };
    async function copiar(o, dst) {
      for await (const [n, h] of o.entries()) {
        if (h.kind === 'directory') await copiar(h, await dst.getDirectoryHandle(n, { create: true }));
        else { const w = await (await dst.getFileHandle(n, { create: true })).createWritable(); await w.write(await (await h.getFile()).arrayBuffer()); await w.close(); }
      }
    }
    await copiar(await abrir(de.split('/')), await abrir(a.split('/'), true));
    const padre = await abrir(de.split('/').slice(0, -1));
    await padre.removeEntry(de.split('/').pop(), { recursive: true });
  }, [BIB, de, a]);
}

/* Los «registro-documento» del buzón (Control de Documentos), por N° */
async function registros(page) {
  const b = await biblioteca(page);
  return Object.keys(b).filter((k) => k.startsWith(`${HERR}/Intercambio/buzon/`)).map((k) => JSON.parse(b[k]))
    .filter((m) => m.tipo === 'registro-documento').sort((a, c) => a.documento.folio.localeCompare(c.documento.folio));
}
const folios = (regs) => regs.map((m) => m.documento.folio);
const registroDelProyecto = (page, uid) => page.evaluate((uid) => (window.QStore.get(uid).vinculos || {}).controlDocumentos || null, uid);

function vigilar(page, quien) {
  page.on('pageerror', (e) => errores.push(`${quien}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`${quien} consola: ${m.text()}`); });
}
async function equipo(browser, opciones) {
  const ctx = await browser.newContext({ viewport: (opciones && opciones.viewport) || { width: 1280, height: 900 }, locale: 'es-CL' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('quempin_viz_unlocked', '1'); } catch (e) { /* */ }
    // El selector devuelve la biblioteca completa, o la ruta que la prueba indique (__elegir)
    window.showDirectoryPicker = async () => {
      let d = await navigator.storage.getDirectory();
      for (const n of (window.__elegir || ['Formulación de proyectos - Documentos'])) d = await d.getDirectoryHandle(n, { create: true });
      return d;
    };
    FileSystemHandle.prototype.queryPermission = async function () { return window.__permiso || 'granted'; };
    FileSystemHandle.prototype.requestPermission = async function () { window.__permiso = 'granted'; return 'granted'; };
  });
  const page = await ctx.newPage();
  vigilar(page, (opciones && opciones.nombre) || 'A');
  await page.goto(BASE + '#/guia');
  await escribir(page, INICIAL);
  return { ctx, page };
}
async function abrir(page, hash) {
  await page.goto(BASE + (hash || '#/'));
  await page.waitForSelector('#app .page-head, #app .editor-head, #app .tabs', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => window.QOferta && window.QOferta._tiempos({ espera: 700, esperaMax: 4000, reintento: 500 }));
  await wait(300);
}
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent).catch(() => '');
const uidAbierto = (page) => page.evaluate(() => location.hash.split('/')[2]);
const codigoDe = (page, uid) => page.evaluate((uid) => window.QStore.get(uid).codigo, uid);
/* El selector de carpeta es un formulario (2026-10-06): se elige la fila y se confirma; la primera vez
   pide ahí mismo las iniciales del Control de Documentos. Devuelve true si las pidió. */
async function elegirEnDialogo(page, buscar, fila, confirmar) {
  await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 5000 });
  await page.fill('#cp-buscar', buscar);
  await page.dispatchEvent('#cp-buscar', 'input');
  await wait(150);
  await page.click(`#modal .cp-fila:not([hidden]):has-text("${fila}")`);
  const pidio = !!(await page.$('#modal #cp-ini'));
  if (pidio) await page.selectOption('#cp-ini', 'CM');   // de la lista del equipo (2026-10-16)
  if (confirmar !== false) await page.click('#modal .modal-foot .btn-primario');
  await wait(500);
  return pidio;
}
/* «Nuevo proyecto» (2026-10-19) abre primero el formulario del N° y el nombre; «Elegir otra carpeta…» lleva al
   selector de siempre, el que se prueba aquí. */
async function nuevoConSelector(page) {
  await page.click('[data-act="nuevo"]:not([data-numero])');
  await page.waitForSelector('#modal[open] #np-num', { timeout: 5000 });
  await page.click('#modal .np-elegir');
  await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 5000 });
  await wait(300);
}
async function nuevoSinCarpeta(page) {
  await page.click('[data-act="nuevo"]:not([data-numero])');
  await page.waitForSelector('#modal[open] #np-num', { timeout: 5000 });
  await page.check('#np-opciones input[value="ninguna"]');
  await page.click('#modal .modal-foot .btn-primario');
  await wait(600);
}
/* El nombre del Excel de un presupuesto (con código «N°. Nombre», solo su N°) */
const archivoDe = (page, uid) => page.evaluate((uid) => window.QOferta.nombreBase(window.QStore.get(uid)) + '.xlsx', uid);
async function escribirTitulo(page, t) {
  await page.fill('[data-f="titulo"]', t);
  await page.dispatchEvent('[data-f="titulo"]', 'input');
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { page } = await equipo(browser);
  try {
    // 1. Conectar la biblioteca (como siempre)
    await abrir(page);
    await page.click('#compartida [data-act="compartir"]'); await wait(800);
    check('conectada: línea de la carpeta del equipo', (await texto(page, '#compartida-linea')).includes('Guardados en la carpeta del equipo'), await texto(page, '#compartida-linea'));
    check('se recuerda la biblioteca completa', (await page.evaluate(async () => (await window.QIntercambio.estadoBiblioteca()).recordada)) === true);

    // 2. Nuevo presupuesto: se pregunta de qué oferta
    await nuevoConSelector(page);
    const dlg = await texto(page, '#modal');
    await page.screenshot({ path: path.join(SHOTS, '1-nuevo-de-que-oferta.png') });
    check('nuevo: pregunta de qué oferta, y ofrece crear la carpeta', dlg.includes('Nuevo proyecto') && dlg.includes('Elige la carpeta de la oferta') && dlg.includes('Crear nueva carpeta') && dlg.includes('Sin carpeta por ahora'), dlg.slice(0, 200));
    const filas = await page.$$eval('#modal .cp-fila', (xs) => xs.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    check('nuevo: lista las carpetas de oferta (sin herramientas ni modelo)', filas.length === 5 && !filas.some((f) => /HERRAMIENTAS|MODELO/.test(f)), filas);
    const grupos = await page.$$eval('#modal .cp-grupo', (xs) => xs.map((x) => x.textContent));
    check('nuevo: agrupadas como en la biblioteca', ['En curso', 'Presentada', 'Adjudicada', 'Cerrada 2025'].every((g) => grupos.includes(g)), grupos);
    const pidioIniciales = await elegirEnDialogo(page, '298', 'SAG Quemadores');
    await wait(800);
    const uid1 = await uidAbierto(page);
    const cod1 = await codigoDe(page, uid1);
    check('control de documentos: la primera vez pide las iniciales, en el mismo formulario', pidioIniciales && !(await page.$('#modal[open]')));
    let regs = await registros(page);
    check('control de documentos: al elegir la carpeta, la evaluación toma el 812602', regs.length === 1 && regs[0].documento.folio === '812602' && regs[0].documento.autor === 'CM' && regs[0].documento.tipo === '81' && regs[0].fuente.uid === uid1, regs.map((m) => m.documento));
    const cd1 = await registroDelProyecto(page, uid1);
    check('control de documentos: el presupuesto guarda el N° y su versión', !!cd1 && cd1.folio === '812602' && cd1.version === 1 && cd1.id === regs[0].id, cd1);
    check('control de documentos: el aviso trae el N°', (await texto(page, '#toast')).includes('812602'), await texto(page, '#toast'));
    check('nuevo: título, ubicación y N° desde la planilla', (await page.inputValue('[data-f="titulo"]')) === 'Quemadores SAG de prueba' && (await page.inputValue('[data-f="ubicacion"]')) === 'Osorno' && (await page.inputValue('#f-req')) === '298');
    check('nuevo: el código es el nombre de la carpeta (2026-10-19)', cod1 === '298. SAG Quemadores', cod1);
    check('nuevo: ID de licitación desde la planilla', (await page.inputValue('[data-f="idLicitacion"]')) === '1234-56-LE26', await page.inputValue('[data-f="idLicitacion"]'));
    await wait(1200);
    const X1 = `298. SAG Quemadores/Formulación 298 v1.xlsx`;
    let x = await leerExcel(page, X1);
    check('el Excel queda en la carpeta de la oferta al crearlo', !!x && x.uid === uid1, x);
    check('el Excel trae la ficha, el detalle y la nota de copia automática', !!x && x.hojas.includes('Ficha') && x.hojas.includes('Partidas') && x.hojas.includes('_datos') && /Copia automática del Formulador/.test(x.nota || ''), x && { hojas: x.hojas, nota: x.nota });
    const chip = await texto(page, '#ed-meta .meta-carpeta');
    check('encabezado: la carpeta de la oferta', chip.includes('298. SAG Quemadores'), chip);
    check('encabezado: punto verde con el Excel al día', !!(await page.$('#ed-meta .meta-carpeta .dot.ok')));
    await page.screenshot({ path: path.join(SHOTS, '2-editor-con-carpeta.png') });

    // 3. Editar: el Excel se actualiza solo
    await escribirTitulo(page, 'Quemadores SAG editado'); await wait(400);
    check('editando: punto ámbar (pendiente)', !!(await page.$('#ed-meta .meta-carpeta .dot.warn')));
    await wait(2200);
    x = await leerExcel(page, X1);
    check('editando: el Excel se actualiza solo tras la pausa', !!x && x.titulo === 'Quemadores SAG editado', x && x.titulo);
    check('editando: vuelve el punto verde', !!(await page.$('#ed-meta .meta-carpeta .dot.ok')));
    // Salir del presupuesto lo actualiza de inmediato
    await page.evaluate(() => window.QOferta._tiempos({ espera: 600000, esperaMax: 600000 }));
    await escribirTitulo(page, 'Quemadores SAG al salir'); await wait(700);
    await page.evaluate(() => { location.hash = '#/'; }); await wait(1500);
    x = await leerExcel(page, X1);
    check('al volver a la lista: el Excel ya está al día', !!x && x.titulo === 'Quemadores SAG al salir', x && x.titulo);
    const enLista = await page.$$eval('#list-body .proj-carpeta', (xs) => xs.map((e) => e.textContent));
    check('lista: la carpeta de la oferta bajo el título', enLista.some((t) => t.includes('En curso · 298. SAG Quemadores')), enLista);
    await page.evaluate(() => window.QOferta._tiempos({ espera: 700, esperaMax: 4000 }));

    // 4. Detalle del Excel y «Guardar ahora»
    await abrir(page, `#/p/${uid1}/ficha`);
    await page.click('#ed-meta .meta-carpeta'); await wait(300);
    const det = await texto(page, '#modal');
    await page.screenshot({ path: path.join(SHOTS, '3-detalle-excel.png') });
    check('detalle: carpeta, archivo y estado', det.includes('Formulación de proyectos › 298. SAG Quemadores') && det.includes(`Formulación 298 v1.xlsx`) && det.includes('Excel al día'), det.slice(0, 400));
    await page.click('#modal button:has-text("Guardar ahora")'); await wait(1200);
    check('«Guardar ahora» avisa el archivo', (await texto(page, '#toast')).includes(`Formulación 298 v1.xlsx`), await texto(page, '#toast'));

    // 4b. El panel muestra el número y ya no ofrece registrar
    await abrir(page, `#/p/${uid1}/seguimiento`);
    await page.waitForSelector('#etapa-formulacion .rcl-herr', { state: 'attached', timeout: 8000 });
    await page.waitForFunction(() => /812602/.test((document.querySelector('#etapa-formulacion') || {}).textContent || ''), null, { timeout: 8000 });
    const panelCD = await texto(page, '#etapa-formulacion');
    check('seguimiento: la evaluación con su N° y sin botón de registrar', panelCD.includes('812602') && panelCD.includes('se registra cuando Sistema QUEMPIN revise la carpeta') && !(await page.$('[data-act="herr-registro"]')), panelCD.slice(-500));
    await page.screenshot({ path: path.join(SHOTS, '3b-panel-control.png'), fullPage: true });
    await abrir(page, `#/p/${uid1}/ficha`);

    // 5. Nueva versión: su propio Excel en la misma carpeta
    await page.click('[data-menu="editor-more"]'); await wait(150);
    await page.click('.pop-item:has-text("Crear nueva versión")'); await wait(2200);
    const uid1b = await uidAbierto(page);
    x = await leerExcel(page, `298. SAG Quemadores/Formulación 298 v2.xlsx`);
    check('nueva versión: Excel v2 junto al v1', !!x && x.uid === uid1b && !!(await leerExcel(page, X1)), x);
    regs = await registros(page);
    check('nueva versión: hereda la carpeta y toma su propio N° (812603), sin volver a pedir iniciales', JSON.stringify(folios(regs)) === '["812602","812603"]' && regs[1].fuente.uid === uid1b && regs[1].fuente.version === 2 && !(await page.$('#modal[open]')), regs.map((m) => m.documento));

    // 6. Sin carpeta por ahora: aviso en el editor con la sugerencia por N° de requerimiento
    await abrir(page);
    await nuevoSinCarpeta(page);
    const uid2 = await uidAbierto(page);
    const nota0 = await texto(page, '#ed-oferta');
    check('sin carpeta: el editor invita a elegirla', nota0.includes('Guarda el Excel en la carpeta de la oferta') && nota0.includes('Elegir carpeta') && nota0.includes('Ahora no'), nota0);
    check('sin carpeta: no toma número del Control de Documentos', (await registros(page)).length === 2);
    await page.fill('#f-req', '303'); await page.dispatchEvent('#f-req', 'change'); await wait(1500);
    await page.evaluate(() => window.QStore.emit({ type: 'sync', pendientes: 0 })); await wait(500);
    const nota1 = await texto(page, '#ed-oferta');
    await page.screenshot({ path: path.join(SHOTS, '4-sugerencia.png') });
    check('con el N° 303: sugiere su carpeta', nota1.includes('«303. Quemador Osorno»') && nota1.includes('Usar esa carpeta'), nota1);
    await page.click('#ed-oferta [data-act="oferta-usar"]'); await wait(1500);
    check('«Usar esa carpeta»: el código pasa a ser el nombre de la carpeta', (await codigoDe(page, uid2)) === '303. Quemador Osorno', await codigoDe(page, uid2));
    x = await leerExcel(page, `0 OFERTAS PRESENTADAS/303. Quemador Osorno/${await archivoDe(page, uid2)}`);
    check('«Usar esa carpeta»: el Excel queda en Presentadas › 303', !!x && x.uid === uid2, x);
    check('después de elegirla, el aviso desaparece', (await texto(page, '#ed-oferta')).trim() === '');
    regs = await registros(page);
    check('«Usar esa carpeta»: toma el 812604', regs.length === 3 && regs[2].documento.folio === '812604' && regs[2].fuente.uid === uid2, folios(regs));

    // 7. «Ahora no» y elegir desde el menú
    await abrir(page);
    await nuevoSinCarpeta(page);
    await page.click('#ed-oferta [data-act="oferta-omitir"]'); await wait(200);
    check('«Ahora no» oculta el aviso', (await texto(page, '#ed-oferta')).trim() === '');
    const uid3 = await uidAbierto(page);
    // Un archivo ajeno con el mismo nombre en la carpeta elegida: no se toca (con la carpeta, el código pasa a
    // ser «250. Catedral» y su Excel, «Formulación 250 v1.xlsx»)
    const ajeno3 = 'Formulación 250 v1.xlsx';
    await escribir(page, [[`0 OFERTAS ADJUDICADAS/250. Catedral/${ajeno3}`, 'un archivo de otra persona']]);
    await page.click('[data-menu="editor-more"]'); await wait(150);
    await page.click('.pop-item:has-text("Elegir la carpeta de la oferta")'); await wait(400);
    await elegirEnDialogo(page, 'catedral', 'Catedral'); await wait(1200);
    const bib1 = await biblioteca(page);
    check('archivo ajeno con el mismo nombre: queda intacto', bib1[`0 OFERTAS ADJUDICADAS/250. Catedral/${ajeno3}`] === 'un archivo de otra persona');
    x = await leerExcel(page, '0 OFERTAS ADJUDICADAS/250. Catedral/Formulación 250 v1 (2).xlsx');
    check('…y el Excel queda como «(2)»', !!x && x.uid === uid3, Object.keys(bib1).filter((k) => k.includes('Catedral')));
    regs = await registros(page);
    check('elegir desde el menú: toma el 812605', regs.length === 4 && regs[3].documento.folio === '812605' && regs[3].fuente.uid === uid3, folios(regs));
    await page.click('#ed-meta .meta-carpeta'); await wait(300);
    await page.click('#modal button:has-text("Cambiar carpeta")'); await wait(300);
    await elegirEnDialogo(page, 'hospital', 'Hospital de ejemplo'); await wait(1200);
    check('cambiar la carpeta de uno ya registrado: no toma otro número', (await registros(page)).length === 4 && (await registroDelProyecto(page, uid3)).folio === '812605');

    // 8. Carpeta cuyo N° no coincide con la planilla: se pregunta
    await abrir(page);
    await nuevoConSelector(page);
    await elegirEnDialogo(page, '296', 'CAPREDENA', false); await wait(300);
    const pregunta = await texto(page, '#cp-elegida');
    check('N° distinto en la planilla: el formulario lo dice y pregunta si es la misma oferta', pregunta.includes('Sala de calderas Llay Llay') && !!(await page.$('#cp-misma:not(:checked)')), pregunta.slice(0, 300));
    await page.click('#modal .modal-foot .btn-primario'); await wait(1200);
    check('«No, solo la carpeta»: el título sale de la carpeta y sin N° de requerimiento', (await page.inputValue('[data-f="titulo"]')) === 'CAPREDENA' && (await page.inputValue('#f-req')) === '');
    regs = await registros(page);
    check('nuevo con la carpeta 296: toma el 812606 con el título de referencia', regs.length === 5 && regs[4].documento.folio === '812606' && regs[4].documento.referencia === 'CAPREDENA', regs.map((m) => m.documento));

    // 9. Duplicar: pregunta la oferta de la copia
    await abrir(page, `#/p/${uid1}/ficha`);
    await page.click('[data-menu="editor-more"]'); await wait(150);
    await page.click('.pop-item:has-text("Duplicar como proyecto nuevo")'); await wait(500);
    check('duplicar: pregunta la oferta de la copia', (await texto(page, '#modal')).includes('Duplicar: ¿de qué oferta es la copia?'));
    await elegirEnDialogo(page, 'hospital', 'Hospital de ejemplo'); await wait(1200);
    const uid4 = await uidAbierto(page);
    x = await leerExcel(page, `0 OFERTAS PRESENTADAS/0 Ofertas Cerradas 2025/Hospital de ejemplo/${await archivoDe(page, uid4)}`);
    check('duplicar: el Excel de la copia queda en la oferta elegida', !!x && x.uid === uid4, x);
    regs = await registros(page);
    check('duplicar con carpeta: la copia toma el 812607', regs.length === 6 && regs[5].documento.folio === '812607' && regs[5].fuente.uid === uid4, folios(regs));

    // 10. La oferta pasa a Adjudicadas: el Excel la sigue
    await mover(page, '298. SAG Quemadores', '0 OFERTAS ADJUDICADAS/298. SAG Quemadores');
    await abrir(page, `#/p/${uid1}/ficha`);
    await escribirTitulo(page, 'Quemadores SAG adjudicado'); await wait(2500);
    x = await leerExcel(page, `0 OFERTAS ADJUDICADAS/298. SAG Quemadores/Formulación 298 v1.xlsx`);
    check('carpeta movida a Adjudicadas: el Excel se actualiza allá', !!x && x.titulo === 'Quemadores SAG adjudicado', x && x.titulo);
    check('carpeta movida: no se recrea la carpeta vieja', !Object.keys(await biblioteca(page)).some((k) => k.startsWith('298. ')));
    check('carpeta movida: no toma otro número', (await registros(page)).length === 6);

    // 11. Configuración
    await page.click('#cfgBtn, [data-act="config"]'); await wait(500);
    check('Configuración: explica el Excel en la carpeta de cada oferta', (await texto(page, '#cfg-af')).includes('carpeta de su oferta'), await texto(page, '#cfg-af'));
    await page.keyboard.press('Escape'); await wait(200);

    // 12. Solo escribió sus Excel en carpetas de oferta (y su carpeta de intercambio)
    const fin = await biblioteca(page);
    const original = new Map(INICIAL.map(([r, t]) => [r.replace(/^298\. SAG Quemadores\//, '0 OFERTAS ADJUDICADAS/298. SAG Quemadores/'), t]));
    original.set(`0 OFERTAS ADJUDICADAS/250. Catedral/${ajeno3}`, 'un archivo de otra persona');
    const ajenos = Object.keys(fin).filter((k) => original.has(k) ? original.get(k) !== fin[k]
      : !(/^([^/]+\/)+Formulación [^/]+\.xlsx$/.test(k) && !k.startsWith('.')) && !k.startsWith(`${HERR}/Intercambio/`));
    check('solo «Formulación … .xlsx» en carpetas de oferta; lo demás intacto', ajenos.length === 0, ajenos);
    check('nada fuera de Intercambio en la carpeta de herramientas', !Object.keys(fin).some((k) => k.startsWith(HERR + '/') && !k.startsWith(`${HERR}/Intercambio/`) && !original.has(k)));
    check('ningún archivo temporal suelto (.crswap)', !Object.keys(fin).some((k) => /\.crswap$/.test(k)));

    // 13. Navegador conectado solo a la carpeta de herramientas (como antes): pide la biblioteca
    const B = await equipo(browser, { nombre: 'B' });
    await B.page.evaluate((r) => { window.__elegir = r; }, [BIB, HERR]);
    await abrir(B.page);
    await B.page.click('#compartida [data-act="compartir"]'); await wait(900);
    check('B conectado a la carpeta de herramientas: no recuerda la biblioteca', (await B.page.evaluate(async () => (await window.QIntercambio.estadoBiblioteca()).recordada)) === false);
    await B.page.click('[data-act="nuevo"]:not([data-numero])'); await wait(600);
    // Sin la biblioteca completa no llega a las carpetas: «Nuevo proyecto» propone seguir sin carpeta (2026-10-19)
    check('B: sin la biblioteca, «Nuevo proyecto» propone seguir sin carpeta', await B.page.$eval('#np-opciones input[value="ninguna"]', (e) => e.checked).catch(() => false));
    await B.page.click('#modal .modal-foot .btn-primario'); await wait(600);
    check('B: el proyecto se crea sin carpeta', !(await B.page.$('#modal[open]')) && (await B.page.evaluate(() => location.hash)).startsWith('#/p/'));
    const notaB = await texto(B.page, '#ed-oferta');
    await B.page.screenshot({ path: path.join(SHOTS, '5-conectar-biblioteca.png') });
    check('B: el editor pide conectar la biblioteca completa', notaB.includes('conecta la biblioteca') && notaB.includes('Conectar la biblioteca'), notaB);
    await wait(2200);   // el presupuesto de B ya pasó por la carpeta del equipo
    const basesB = () => B.page.evaluate(() => Object.keys((JSON.parse(localStorage.getItem('qpn.formulacion.compartida.v1') || '{}').proyectos) || {}).length);
    const nBases = await basesB();
    await B.page.evaluate((r) => { window.__elegir = r; }, [BIB]);
    await B.page.click('#ed-oferta [data-act="oferta-elegir"]'); await wait(500);
    await B.page.click('#modal button:has-text("Elegir la biblioteca")'); await wait(900);
    check('B: después de elegir la biblioteca, ofrece las carpetas', (await texto(B.page, '#modal')).includes('Carpeta de la oferta') && (await B.page.$$('#modal .cp-fila')).length >= 5);
    check('B: reconectar la misma carpeta no reinicia la sincronización', nBases > 0 && (await basesB()) === nBases, { nBases, ahora: await basesB() });
    await B.page.keyboard.press('Escape');

    // 14. Teléfono: el aviso y la carpeta caben
    const M = await equipo(browser, { nombre: 'M', viewport: { width: 390, height: 844 } });
    await abrir(M.page);
    await M.page.click('#compartida [data-act="compartir"]'); await wait(800);
    await nuevoSinCarpeta(M.page); await wait(200);
    const ancho = await M.page.evaluate(() => document.documentElement.scrollWidth);
    await M.page.screenshot({ path: path.join(SHOTS, '6-movil.png') });
    check('teléfono: sin desplazamiento horizontal', ancho <= 390, ancho);

    check('sin errores de JavaScript', errores.length === 0, errores);
  } catch (e) {
    console.error(e);
    check('la prueba terminó', false, e.message);
  } finally {
    await browser.close();
  }
  console.log(results.join('\n'));
  const fail = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fail}/${results.length} OK`);
  process.exit(fail ? 1 : 0);
})();
