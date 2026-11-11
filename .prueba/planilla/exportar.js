// «Exportar a la Planilla» (pedido del usuario, 2026-11-02): los datos del proyecto a su fila de la Planilla de
// Ingreso. Biblioteca simulada en el almacenamiento privado del navegador (OPFS), con una planilla FICTICIA armada
// aquí con ExcelJS y el catálogo de esquemas de Sistema Intercambio (esquemas.json, junto a este archivo). Si cambia
// un esquema, regenéralo desde «Finanzas QUEMPIN/Sistema Intercambio»:
//   py -3.14 -c "import esquemas, json, sys; sys.stdout.reconfigure(encoding='utf-8'); print(json.dumps(esquemas.paquete(), ensure_ascii=False))" > esquemas.json
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/planilla/exportar.js
'use strict';
const path = require('path');
const fs = require('fs');
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = process.env.BASE || 'http://127.0.0.1:8798/index.html';
const BIB = 'Formulación de proyectos - Documentos';
const RUTA = [BIB, '.HERRAMIENTAS FORMULACIÓN', 'Intercambio'];
const PLANILLA = 'Planilla de Ingreso de Requerimientos.xlsx';
const KEY = 'qpn.formulacion.proyectos.v1';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ESQUEMAS = fs.readFileSync(path.join(__dirname, 'esquemas.json'), 'utf8');
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ejemplos', 'QPN-EJEMPLO_medidores-gn.json'), 'utf8'));
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const copia = (o) => JSON.parse(JSON.stringify(o));

// 312: el proyecto enviado, con su fila. 298: el N° del proyecto ahora es otra oferta (la planilla se renumeró).
// Sin N°: se registra con el siguiente libre (313).
const proyecto = (uid, extra) => Object.assign(copia(EJ), { uid, cliente: 'Municipalidad de prueba', ubicacion: 'Santiago', responsable: 'LC', idLicitacion: '' }, extra);
const pa = proyecto('exportar001', { codigo: '312. Gimnasio municipal de prueba', titulo: 'Gimnasio municipal de prueba', estado: 'Enviada',
  vinculos: { requerimiento: { numero: '312', titulo: 'Gimnasio municipal de prueba' } } });
const pb = proyecto('exportar002', { codigo: '298. Caldera hospital', titulo: 'Caldera hospital', estado: 'Enviada', vinculos: { requerimiento: { numero: '298' } } });
const pc = proyecto('exportar003', { codigo: '', titulo: 'Caldera sin número', estado: 'Enviada', cliente: 'Cliente C', vinculos: {} });
// Ubicación vacía en el Excel (en la planilla real es un dato geográfico, que el navegador lee vacío) y publicada
const FILAS = [
  [312, 'Evaluación', 'Otro', 'NB', 'NB', 'Gimnasio municipal de prueba', null, null, '-', null],
  [298, 'Evaluación', 'Otro', 'NB', 'NB', 'Quemadores SAG de prueba', null, 'Osorno', '-', null]
];
const PUB = { esquema: 'quempin.intercambio/1', herramienta: 'planilla-requerimientos', generado: '2026-11-02T10:00:00-03:00', datos: { requerimientos: [
  { numero: 312, estado: 'Evaluación', titulo: 'Gimnasio municipal de prueba', ubicacion: 'Santiago', referencia: '-', evaluador: 'NB' },
  { numero: 298, estado: 'Evaluación', titulo: 'Quemadores SAG de prueba', ubicacion: 'Osorno', referencia: '-' }
] } };

async function escribir(page, ruta, archivos) {
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
  }, [archivos, ruta]);
}
async function escribirPlanilla(page) {
  await page.evaluate(async ([bib, nombre, filas]) => {
    const ExcelJS = await window.QExcel.ensureExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Listado Requerimientos');
    ws.addRow(['N°', 'Estado', 'Canal', 'Capt.', 'Eval.', 'Título', 'Cliente', 'Ubicación', 'ID o Referencia', 'Valor ofertado (IVA inc)']);
    filas.forEach((f) => ws.addRow(f));
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true });
    const w = await (await d.getFileHandle(nombre, { create: true })).createWritable();
    await w.write(await wb.xlsx.writeBuffer()); await w.close();
  }, [BIB, PLANILLA, FILAS]);
}
/* Los mensajes del buzón: [{ nombre, m }] */
const buzon = (page) => page.evaluate(async (ruta) => {
  let d = await navigator.storage.getDirectory();
  for (const n of ruta.concat('buzon')) d = await d.getDirectoryHandle(n, { create: true });
  const out = [];
  for await (const [n, h] of d.entries()) if (h.kind === 'file') out.push({ nombre: n, m: JSON.parse(await (await h.getFile()).text()) });
  return out;
}, RUTA);
/* Lo que haría planilla_escritura.py: el mensaje pasa a procesado/AAAA-MM/ con su resultado */
const atender = (page, nombre, resultado) => page.evaluate(async ([ruta, nombre, resultado]) => {
  let d = await navigator.storage.getDirectory();
  for (const n of ruta) d = await d.getDirectoryHandle(n, { create: true });
  const b = await d.getDirectoryHandle('buzon');
  const m = JSON.parse(await (await (await b.getFileHandle(nombre)).getFile()).text());
  const f = new Date();
  const mes = await (await d.getDirectoryHandle('procesado', { create: true })).getDirectoryHandle(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`, { create: true });
  const w = await (await mes.getFileHandle(nombre, { create: true })).createWritable();
  await w.write(JSON.stringify(Object.assign(m, { resultado }))); await w.close();
  await b.removeEntry(nombre);
}, [RUTA, nombre, resultado]);
const guardado = (page, uid) => page.evaluate(([k, u]) => JSON.parse(localStorage.getItem(k)).proyectos.find((p) => p.uid === u), [KEY, uid]);
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');

async function abrirSeguimiento(page, uid) {
  // Por la lista: ir al mismo hash no vuelve a pintar el Seguimiento
  await page.goto(BASE + '#/');
  await page.waitForSelector('#list-body, #app .page-head', { timeout: 15000 }).catch(() => {});
  await page.goto(BASE + `#/p/${uid}/seguimiento`);
  await page.waitForSelector('#recorrido [data-act="exp-planilla"]', { state: 'attached', timeout: 15000 });
  await wait(400);
}
async function exportar(page) {
  await page.evaluate(() => document.querySelector('#recorrido [data-act="exp-planilla"]').click());
  await page.waitForSelector('#modal[open] .modal-foot .btn-primario', { timeout: 10000 });
  await wait(200);
}
const filasDialogo = (page) => page.$$eval('#modal[open] .xp-tabla tbody tr', (trs) => trs.map((tr) => {
  const c = tr.querySelectorAll('td');
  const x = tr.querySelector('input[type="checkbox"]');
  return { casilla: tr.querySelector('label') ? tr.querySelector('label').textContent.trim() : '', planilla: c[2] ? c[2].textContent.trim() : '', proyecto: c[3] ? c[3].textContent.trim() : '', marcada: !!(x && x.checked) };
}));

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, locale: 'es-CL' });
  await ctx.addInitScript(([ps, key]) => {
    try { localStorage.setItem('quempin_viz_unlocked', '1'); localStorage.setItem('quempin_formulador_unlocked', '1'); localStorage.setItem('quempin_usuario', 'CM'); } catch (e) { /* */ }
    if (!sessionStorage.getItem('sembrado')) {
      sessionStorage.setItem('sembrado', '1');
      localStorage.setItem(key, JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: ps }));
    }
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Formulación de proyectos - Documentos', { create: true });
    FileSystemHandle.prototype.queryPermission = async function () { return 'granted'; };
    FileSystemHandle.prototype.requestPermission = async function () { return 'granted'; };
  }, [[pa, pb, pc], KEY]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  try {
    await page.goto(BASE + '#/guia');
    await escribir(page, RUTA, [['intercambio.json', JSON.stringify({ esquema: 'quempin.intercambio/1', descripcion: 'prueba' })],
      ['esquemas.json', ESQUEMAS], ['publicado/requerimientos.json', JSON.stringify(PUB)]]);
    await escribirPlanilla(page);
    await page.evaluate(() => window.QIntercambio.conectar());

    // 1. El proyecto enviado: muestra solo lo que cambia, con lo que dice hoy la planilla
    await abrirSeguimiento(page, 'exportar001');
    await exportar(page);
    let filas = await filasDialogo(page);
    const casillas = filas.map((f) => f.casilla);
    check('muestra solo lo que la planilla no dice igual: estado, cliente, eval. y valor ofertado', casillas.join('|') === 'Estado|Cliente|Eval.|Valor ofertado (IVA inc.)', filas);
    check('la ubicación no se ofrece: la planilla publicada ya dice «Santiago» (dato geográfico que el navegador lee vacío)', !casillas.includes('Ubicación'), casillas);
    check('estado: de «Evaluación» a «Ofertado», marcado', filas[0] && filas[0].planilla === 'Evaluación' && filas[0].proyecto === 'Ofertado' && filas[0].marcada, filas[0]);
    check('cliente vacío en la planilla: marcado', filas[1] && /vacía/.test(filas[1].planilla) && filas[1].marcada, filas[1]);
    check('eval. distinto («NB» → «LC»): sin marcar, pudo escribirlo alguien', filas[2] && filas[2].planilla === 'NB' && filas[2].proyecto === 'LC' && !filas[2].marcada, filas[2]);
    check('valor ofertado con IVA, marcado y con su origen', filas[3] && /^\$[\d.]+/.test(filas[3].proyecto) && /con IVA/.test(filas[3].proyecto) && filas[3].marcada, filas[3]);
    check('sin aviso de N° ajeno: la fila es este proyecto', !(await page.$('#xp-misma')));
    await page.screenshot({ path: path.join(SHOTS, 'exportar-1-dialogo.png') });
    await page.click('#modal[open] .modal-foot .btn-primario');
    await wait(800);
    let bz = await buzon(page);
    const exp = bz.find((x) => /_editar-requerimiento_/.test(x.nombre));
    const m = exp && exp.m;
    check('deja un editar-requerimiento para la Planilla, con solo lo marcado', !!m && m.destino === 'planilla-requerimientos' && Object.keys(m.cambios).join(',') === 'estado,cliente,valorOfertado', m);
    check('con la fila que se vio (N° y título) y lo que decía cada casilla', !!m && m.requerimiento.numero === 312 && m.requerimiento.titulo === 'Gimnasio municipal de prueba'
      && m.reemplaza.estado === 'Evaluación' && m.reemplaza.cliente === null && m.reemplaza.valorOfertado === null, m);
    check('valor entero en pesos y de qué proyecto viene', !!m && Number.isInteger(m.cambios.valorOfertado) && m.cambios.valorOfertado > 0 && m.fuente.uid === 'exportar001' && m.origen.usuario === 'CM', m);
    const g1 = await guardado(page, 'exportar001');
    check('el proyecto recuerda la exportación', !!(g1.vinculos.planilla && g1.vinculos.planilla.ultimaExportacion && g1.vinculos.planilla.ultimaExportacion.id === (m || {}).id), g1.vinculos);
    await abrirSeguimiento(page, 'exportar001');
    let seg = await texto(page, '#recorrido');
    check('el Seguimiento dice que espera el Excel', /En espera Exportado a la planilla .* \(N° 312: Estado, Cliente, Valor ofertado \(IVA inc\.\)\): se escribe en el Excel en unos 10 minutos/.test(seg), seg.slice(0, 900));
    check('ya no ofrece «Avisar a la Planilla»: la exportación llevó el estado y el valor', !(await page.$('#recorrido [data-act="herr-planilla"]')));
    await page.screenshot({ path: path.join(SHOTS, 'exportar-2-seguimiento.png') });
    await atender(page, exp.nombre, { estado: 'aplicado', fecha: '2026-11-02T18:10:00-03:00', detalle: ['Cambiado en la planilla: N° 312, fila 2.'] });
    await abrirSeguimiento(page, 'exportar001');
    // Lo pintado antes queda mientras se vuelve a leer la carpeta: se espera la lectura nueva
    await page.waitForFunction(() => /ya está en el Excel/.test(document.querySelector('#recorrido').textContent), null, { timeout: 8000 }).catch(() => {});
    seg = await texto(page, '#recorrido');
    const i = seg.indexOf('Exportado');
    check('cuando el Excel lo escribió, lo dice', /Listo Exportado a la planilla .*: ya está en el Excel\./.test(seg), i < 0 ? 'sin la línea' : seg.slice(Math.max(0, i - 60), i + 200));

    // 2. El N° del proyecto es otra oferta en la planilla: avisa y no exporta sin confirmarlo
    await abrirSeguimiento(page, 'exportar002');
    await exportar(page);
    const aviso = await texto(page, '#modal[open] .modal-body');
    check('N° ajeno: lo avisa con los dos títulos', aviso.includes('En la planilla, el N° 298 es «Quemadores SAG de prueba»') && aviso.includes('«Caldera hospital»') && !!(await page.$('#xp-misma')), aviso.slice(0, 400));
    await page.screenshot({ path: path.join(SHOTS, 'exportar-3-ajeno.png') });
    const antes = (await buzon(page)).length;
    await page.click('#modal[open] .modal-foot .btn-primario');
    await wait(500);
    check('N° ajeno sin confirmar: no deja nada en el buzón', (await buzon(page)).length === antes && /no parece ser este proyecto/.test(await texto(page, '#toast')), await texto(page, '#toast'));

    // 3. Sin N°: lo registra con el siguiente libre, con el estado de la oferta, y el cliente y el valor junto con la fila
    await abrirSeguimiento(page, 'exportar003');
    await exportar(page);
    // innerText: cada casilla de la tabla separada de la siguiente
    const reg = await page.$eval('#modal[open] .modal-body', (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
    check('sin N°: propone registrarlo como el 313, con estado «Ofertado»', /siguiente N° libre, el 313/.test(reg) && /Estado Ofertado/i.test(reg) && /Canal Otro/i.test(reg) && /Cliente Cliente C/i.test(reg), reg.slice(0, 500));
    await page.screenshot({ path: path.join(SHOTS, 'exportar-4-sin-numero.png') });
    await page.click('#modal[open] .modal-foot .btn-primario');
    await wait(900);
    bz = await buzon(page);
    const nuevo = (bz.find((x) => /_nuevo-requerimiento_/.test(x.nombre)) || {}).m;
    const junto = bz.map((x) => x.m).find((x) => x.tipo === 'editar-requerimiento' && x.requerimiento.numero === 313);
    check('sin N°: pide la fila 313 con estado «Ofertado»', !!nuevo && nuevo.requerimiento.numero === 313 && nuevo.requerimiento.estado === 'Ofertado' && nuevo.requerimiento.titulo === 'Caldera sin número', nuevo);
    check('sin N°: el cliente y el valor van en un cambio a esa misma fila', !!junto && junto.requerimiento.titulo === 'Caldera sin número' && Object.keys(junto.cambios).sort().join(',') === 'cliente,valorOfertado' && junto.cambios.cliente === 'Cliente C', junto);
    const g3 = await guardado(page, 'exportar003');
    check('sin N°: el proyecto queda unido al 313 y su código lo lleva', g3.vinculos.requerimiento && String(g3.vinculos.requerimiento.numero) === '313' && g3.codigo === '313. Caldera sin número', [g3.codigo, g3.vinculos.requerimiento]);
    check('sin N°: recuerda el registro y la exportación', !!(g3.vinculos.planilla && g3.vinculos.planilla.registro && g3.vinculos.planilla.ultimaExportacion), g3.vinculos.planilla);
    // Exportar de nuevo mientras la fila no aparece: no la pide dos veces
    await abrirSeguimiento(page, 'exportar003');
    await page.evaluate(() => document.querySelector('#recorrido [data-act="exp-planilla"]').click());
    await wait(900);
    check('mientras espera la fila, no la pide otra vez', !(await page.$('#modal[open]')) && /ya se pidió/.test(await texto(page, '#toast')) && (await buzon(page)).filter((x) => /_nuevo-requerimiento_/.test(x.nombre)).length === 1, await texto(page, '#toast'));

    // 4. El menú del proyecto la ofrece
    const menu = await page.evaluate(() => { const b = document.querySelector('[data-menu="editor-more"]'); if (b) b.click(); return !!b; });
    await wait(300);
    check('el menú del proyecto tiene «Exportar a la Planilla de Ingreso»', /Exportar a la Planilla de Ingreso/.test(await texto(page, '#pop')) && menu, await texto(page, '#pop'));
    check('sin errores de JavaScript', errores.length === 0, errores);
  } catch (e) {
    check('la prueba terminó sin excepciones', false, String(e && e.stack || e));
  }
  await browser.close();
  console.log(results.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fallas}/${results.length} verificaciones`);
  process.exit(fallas ? 1 : 0);
})();
