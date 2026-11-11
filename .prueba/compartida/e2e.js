// Prueba de punta a punta de los proyectos compartidos por la carpeta de OneDrive.
// Cada "equipo" es un contexto de Chrome con su propio navegador (localStorage, IndexedDB) y su
// propia carpeta Intercambio (almacenamiento privado OPFS: la misma API que una carpeta real
// elegida con showDirectoryPicker). onedrive() hace de OneDrive entre las carpetas de cada equipo.
// Uso: servir el repo en http://127.0.0.1:8797 y correr
//   node .prueba/compartida/e2e.js   (PW = carpeta con node_modules/playwright-core)
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const { execFileSync } = require('child_process');
const BASE = 'http://127.0.0.1:8797/index.html';
const SISTEMA_INTERCAMBIO = 'C:/Users/quemp/OneDrive - QUEMPIN SPA/Escritorio/Proyectos Claude/Finanzas QUEMPIN/Sistema Intercambio';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- OneDrive simulado ------------------------------------------------------------------------
const nube = new Map([
  ['intercambio.json', JSON.stringify({ esquema: 'quempin.intercambio/1', descripcion: 'prueba' })],
  ['LEEME.md', 'carpeta de prueba'],
  ['publicado/analisis-financiero.json', JSON.stringify({ esquema: 'quempin.intercambio/1', herramienta: 'analisis-financiero', generado: '2026-09-30T10:00:00-03:00', datos: { proyectos: [] } })]
]);
const vistoPor = new Map();
// Como en la biblioteca real: la carpeta de intercambio va oculta en «.HERRAMIENTAS FORMULACIÓN»
const BIBLIOTECA = 'Formulación de proyectos - Documentos';
let RUTA_INTER = [BIBLIOTECA, '.HERRAMIENTAS FORMULACIÓN', 'Intercambio'];
async function leerOPFS(page, ruta) {
  return page.evaluate(async (ruta) => {
    const out = [];
    async function rec(d, pre) {
      for await (const [n, h] of d.entries()) {
        if (h.kind === 'directory') await rec(h, pre + n + '/');
        else out.push({ ruta: pre + n, texto: await (await h.getFile()).text() });
      }
    }
    let d = await navigator.storage.getDirectory();
    for (const n of ruta) d = await d.getDirectoryHandle(n, { create: true });
    await rec(d, '');
    return out;
  }, ruta || RUTA_INTER);
}
async function escribirOPFS(page, archivos, ruta) {
  await page.evaluate(async ([archivos, ruta]) => {
    let base = await navigator.storage.getDirectory();
    for (const n of ruta) base = await base.getDirectoryHandle(n, { create: true });
    for (const [ruta, texto] of archivos) {
      const partes = ruta.split('/');
      let d = base;
      for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(partes[partes.length - 1], { create: true })).createWritable();
      await w.write(texto); await w.close();
    }
  }, [archivos, ruta || RUTA_INTER]);
}
/* Sube lo que cambió en cada equipo y baja a todos lo que hay en la nube. Si dos equipos
   cambiaron el mismo archivo, gana el último y el otro queda como «archivo-EQUIPO.json». */
async function onedrive(equipos) {
  const cambios = new Map();
  for (const eq of equipos) {
    const visto = vistoPor.get(eq.nombre) || new Map();
    for (const f of await leerOPFS(eq.page)) {
      if (visto.get(f.ruta) !== f.texto) { if (!cambios.has(f.ruta)) cambios.set(f.ruta, []); cambios.get(f.ruta).push({ eq: eq.nombre, texto: f.texto }); }
    }
  }
  cambios.forEach((cs, ruta) => {
    nube.set(ruta, cs[cs.length - 1].texto);
    cs.slice(0, -1).forEach((c) => nube.set(ruta.replace(/\.json$/, `-${c.eq}.json`), c.texto));
  });
  for (const eq of equipos) {
    const local = new Map((await leerOPFS(eq.page)).map((f) => [f.ruta, f.texto]));
    await escribirOPFS(eq.page, Array.from(nube).filter(([r, t]) => local.get(r) !== t));
    vistoPor.set(eq.nombre, new Map(nube));
  }
}

// ---- Equipos --------------------------------------------------------------------------------
async function equipo(browser, nombre, opciones) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-CL', acceptDownloads: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('quempin_viz_unlocked', '1'); } catch (e) { /* */ }
    // El selector devuelve la biblioteca completa (o la carpeta que la prueba indique)
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory())
      .getDirectoryHandle(window.__carpetaElegida || 'Formulación de proyectos - Documentos', { create: true });
    // Permiso de la carpeta: 'granted' salvo que la prueba pida simular una sesión nueva
    const q = FileSystemHandle.prototype.queryPermission;
    FileSystemHandle.prototype.queryPermission = async function () { return window.__permiso || 'granted'; };
    FileSystemHandle.prototype.requestPermission = async function () { window.__permiso = 'granted'; return 'granted'; };
    void q;
  });
  // Navegador sin la API de carpetas (Firefox, Safari, celulares)
  if (opciones && opciones.sinApi) await ctx.addInitScript(() => { window.showDirectoryPicker = undefined; });
  const page = await ctx.newPage();
  vigilar(page, nombre);
  await page.goto(BASE + '#/guia');   // origen propio (la carpeta privada lo necesita), sin tocar la lista
  // La biblioteca tiene también carpetas de ofertas: el formulador no las toca
  await escribirOPFS(page, [['298. SAG Quemadores/Oferta.pdf', 'pdf de prueba']], [BIBLIOTECA]);
  return { nombre, ctx, page };
}
function vigilar(page, quien) {
  page.on('pageerror', (e) => errores.push(`${quien}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`${quien} consola: ${m.text()}`); });
}
async function abrir(eq, hash) {
  await eq.page.goto(BASE + (hash || '#/'));
  await eq.page.waitForSelector('#app .page-head, #app .hub-grid, #app .editor, #app .tabs', { timeout: 15000 }).catch(() => {});
  await wait(300);
}
const sincronizar = async (eq) => { await eq.page.evaluate(() => window.QCompartida.sincronizar()); await wait(250); };
/* Espera a que los equipos guarden y suban lo que tienen pendiente (OneDrive no se simula a media vuelta). */
async function quietos(eqs) {
  for (const eq of eqs) {
    await eq.page.waitForFunction(() => { const i = window.QCompartida.info(); return !i.pendientes && !i.sincronizando; }, null, { timeout: 15000 }).catch(() => {});
  }
}
const texto = (eq, sel) => eq.page.$eval(sel, (e) => e.textContent).catch(() => '');
const titulosLista = (eq) => eq.page.$$eval('#list-body .proj-title', (xs) => xs.map((x) => x.textContent)).catch(() => []);
// Los proyectos (sin las marcas de «está editando» de publicado/formulador/editando/)
const archivosFormulador = async (eq) => (await leerOPFS(eq.page)).filter((f) => f.ruta.startsWith('publicado/formulador/') && !f.ruta.includes('/editando/'));
async function tituloEnCarpeta(eq, uid) {
  const f = (await archivosFormulador(eq)).find((x) => x.ruta === `publicado/formulador/${uid}.json`);
  return f ? JSON.parse(f.texto).datos.titulo : null;
}
async function escribirTitulo(eq, t) {
  await eq.page.fill('[data-f="titulo"]', t);
  await eq.page.dispatchEvent('[data-f="titulo"]', 'input');
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const A = await equipo(browser, 'A'), B = await equipo(browser, 'B'), C = await equipo(browser, 'C');
  try {
    // 1. Equipo A: proyectos propios y el aviso para conectar la carpeta
    await abrir(A);
    await onedrive([A, B, C]);
    const aviso0 = await texto(A, '#compartida');
    check('A sin proyectos: aviso para conectar la carpeta', aviso0.includes('Conectar carpeta') && aviso0.includes('Formulación de proyectos - Documentos'), aviso0);
    await A.page.click('[data-act="ejemplo"]'); await wait(500);
    await abrir(A, '#/');
    check('obligatorio: el aviso no ofrece «Ahora no»', (await A.page.$$('#compartida [data-act="compartir-no"]')).length === 0);
    await A.page.click('[data-act="nuevo"]'); await wait(500);
    const exige = await texto(A, '#modal');
    check('crear sin carpeta: se exige conectar la biblioteca', exige.includes('Conecta la biblioteca del equipo') && exige.includes('Conectar la biblioteca'), exige.slice(0, 200));
    await A.page.click('#modal button:has-text("Trabajar sin la carpeta")'); await wait(600);
    // «Nuevo proyecto» (2026-10-19): sin la biblioteca, la propuesta es seguir sin carpeta
    check('sin la biblioteca: «Nuevo proyecto» propone seguir sin carpeta', await A.page.$eval('#np-opciones input[value="ninguna"]', (e) => e.checked).catch(() => false));
    await A.page.click('#modal .modal-foot .btn-primario'); await wait(600);
    await escribirTitulo(A, 'Oferta compartida'); await wait(600);
    const uidOferta = await A.page.evaluate(() => location.hash.split('/')[2]);
    check('sin carpeta, el indicador dice que está solo en este navegador', (await texto(A, '#save-state')).includes('solo en este navegador'), await texto(A, '#save-state'));
    const banEd = await texto(A, '#ed-compartida');
    await A.page.screenshot({ path: path.join(SHOTS, '0-A-editor-sin-carpeta.png') });
    check('sin carpeta, el editor avisa y ofrece conectar o descargar', banEd.includes('solo en este navegador') && banEd.includes('Conectar carpeta') && banEd.includes('Descargar para el equipo'), banEd);
    await abrir(A, '#/');
    check('A con 2 proyectos y el aviso visible', (await titulosLista(A)).length === 2 && (await texto(A, '#compartida')).includes('Conectar carpeta'));
    check('la lista marca los 2 como «Solo en este navegador»', (await A.page.$$('#list-body .solo-aqui')).length === 2);
    await A.page.click('#compartida [data-act="compartir"]'); await wait(900);
    check('A: al conectar, avisa que comparte', (await texto(A, '#toast')).includes('Proyectos compartidos con el equipo'), await texto(A, '#toast'));
    check('A: los 2 proyectos quedan en publicado/formulador', (await archivosFormulador(A)).length === 2, (await archivosFormulador(A)).map((f) => f.ruta));
    check('A: el aviso se reemplaza por la línea de estado', (await texto(A, '#compartida')).trim() === '' && (await texto(A, '#compartida-linea')).includes('Guardados en la carpeta del equipo'), await texto(A, '#compartida-linea'));
    check('A: ya no hay marcas «Solo en este navegador»', (await A.page.$$('#list-body .solo-aqui')).length === 0);
    check('A: pie de página con la carpeta del equipo', (await texto(A, '#footer-datos')).includes('en la carpeta del equipo'));
    const conResumen = (await archivosFormulador(A)).map((f) => JSON.parse(f.texto)).find((s) => s.datos.codigo === 'QPN-EJEMPLO');
    check('cada archivo trae el resumen (ejemplo: precio neto $4.092.808)', conResumen && conResumen.resumen && conResumen.resumen.precioNeto === 4092808, conResumen && conResumen.resumen);
    await A.page.screenshot({ path: path.join(SHOTS, '1-A-lista-compartida.png') });

    // 2. Equipo B (otro PC, carpeta vacía en su navegador): conecta y ve los proyectos de A
    await onedrive([A, B, C]);
    await abrir(B);
    check('B: lista vacía con el aviso para conectar', (await texto(B, '#compartida')).includes('Conectar carpeta'));
    await B.page.screenshot({ path: path.join(SHOTS, '2-B-aviso.png') });
    await B.page.click('#compartida [data-act="compartir"]'); await wait(900);
    check('B: avisa cuántos proyectos llegaron', (await texto(B, '#toast')).includes('llegaron 2 proyectos'), await texto(B, '#toast'));
    const tB = await titulosLista(B);
    check('B ve los 2 proyectos de A', tB.length === 2 && tB.includes('Oferta compartida'), tB);

    // 3. B edita; A lo recibe
    await abrir(B, `#/p/${uidOferta}/ficha`);
    await escribirTitulo(B, 'Oferta compartida (B)');
    await wait(500);
    check('B: indicador «copiando a la carpeta compartida»', (await texto(B, '#save-state')).includes('copiando a la carpeta compartida'), await texto(B, '#save-state'));
    await wait(2500);
    check('B: indicador «guardado en la carpeta», con la versión y la hora de revisión', /^Guardado en la carpeta del equipo · versión de las \d\d:\d\d · revisada \d\d:\d\d$/.test(await texto(B, '#save-state')), await texto(B, '#save-state'));
    check('B: la edición queda en su carpeta', (await tituloEnCarpeta(B, uidOferta)) === 'Oferta compartida (B)');
    await onedrive([A, B, C]);
    await abrir(A, '#/');
    await sincronizar(A);
    check('A ve la edición de B en la lista', (await titulosLista(A)).includes('Oferta compartida (B)'), await titulosLista(A));

    // 4. A tiene el proyecto abierto y B lo cambia: se recarga con aviso
    await abrir(A, `#/p/${uidOferta}/ficha`);
    await escribirTitulo(B, 'Oferta compartida (B2)'); await wait(2500);
    await onedrive([A, B, C]);
    await sincronizar(A);
    check('A (proyecto abierto) se actualiza con los cambios de B', (await A.page.inputValue('[data-f="titulo"]')) === 'Oferta compartida (B2)', await A.page.inputValue('[data-f="titulo"]'));
    check('A recibe el aviso «Actualizado con cambios de otro equipo»', (await texto(A, '#toast')).includes('Actualizado con cambios de otro equipo'), await texto(A, '#toast'));
    const modB2 = await A.page.evaluate((u) => window.QStore.get(u).modificado, uidOferta);
    const horaB2 = await A.page.evaluate((m) => new Date(m).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), modB2);
    check('A: el indicador nombra la versión de la carpeta (la de B)', (await texto(A, '#save-state')).includes('versión de las ' + horaB2), await texto(A, '#save-state'));

    // 4b. La revisión de la carpeta se traba (otra pestaña retiene el candado) y pasan 3 minutos: el
    //     indicador ya no dice «guardado» en verde (2026-10-27: el precio de CM nunca llegó al PC de LC)
    const traba = await A.ctx.newPage();
    await traba.goto(BASE + '#/guia');
    await traba.evaluate(() => { navigator.locks.request('qpn-formulador-compartida', () => new Promise(() => {})); });
    await wait(300);
    await A.page.evaluate(() => { window.QCompartida.sincronizar(); });
    await A.page.evaluate(() => { const real = Date.now; window.__realNow = real; Date.now = () => real() + 3 * 60 * 1000; window.QStore.emit({ type: 'sync' }); });
    const trabado = await texto(A, '#save-state');
    check('trabada: el indicador avisa en rojo y pide recargar', trabado.startsWith('Sin revisar la carpeta del equipo desde las') && trabado.includes('F5')
      && (await A.page.getAttribute('#save-state', 'class')).includes('err'), trabado);
    await traba.close(); await wait(600);   // cerrar la pestaña suelta el candado: la revisión pendiente corre
    await A.page.evaluate(() => { Date.now = window.__realNow; window.QStore.emit({ type: 'sync' }); });
    check('destrabada: vuelve a «Guardado en la carpeta del equipo»', (await texto(A, '#save-state')).startsWith('Guardado en la carpeta del equipo'), await texto(A, '#save-state'));

    // 5. Dos pestañas del mismo navegador: la segunda se entera sin recargar y no pisa nada
    const A2 = { nombre: 'A2', ctx: A.ctx, page: await A.ctx.newPage() };
    vigilar(A2.page, 'A2');
    await abrir(A2, '#/');
    await escribirTitulo(A, 'Oferta compartida (A pestaña 1)'); await wait(900);
    check('otra pestaña ve el cambio sin recargar', (await titulosLista(A2)).includes('Oferta compartida (A pestaña 1)'), await titulosLista(A2));
    await wait(2000);
    await sincronizar(A2); await sincronizar(A);
    check('la otra pestaña no revierte el cambio en la carpeta', (await tituloEnCarpeta(A, uidOferta)) === 'Oferta compartida (A pestaña 1)', await tituloEnCarpeta(A, uidOferta));
    await A2.page.close();

    // 6. Edición simultánea en A y B (proyecto cerrado en ambos): nada se pierde
    await abrir(A, '#/'); await abrir(B, '#/');
    await A.page.evaluate((id) => { const p = QStore.get(id); p.cliente = 'Cliente según A'; QStore.upsert(p); }, uidOferta);
    await B.page.evaluate((id) => { const p = QStore.get(id); p.cliente = 'Cliente según B'; QStore.upsert(p); }, uidOferta);
    await wait(2500);
    await onedrive([A, B, C]);   // OneDrive: gana B, lo de A queda como «…-A.json»
    await sincronizar(A); await sincronizar(A); await wait(2500);
    await onedrive([A, B, C]);
    await sincronizar(B);
    const tA = await titulosLista(A), tB2 = await titulosLista(B);
    check('simultáneo: A se queda con la versión que ganó en OneDrive', (await A.page.evaluate((id) => QStore.get(id).cliente, uidOferta)) === 'Cliente según B');
    check('simultáneo: los cambios de A quedan como copia en ambos equipos',
      tA.some((t) => t.includes('(cambios sin subir)')) && tB2.some((t) => t.includes('(cambios sin subir)')), [tA, tB2]);
    const copiaA = await A.page.evaluate(() => QStore.all().find((p) => /cambios sin subir/.test(p.titulo)));
    check('simultáneo: la copia conserva el cliente de A', copiaA && copiaA.cliente === 'Cliente según A', copiaA && copiaA.cliente);

    // 6b. Edición simultánea con el proyecto abierto en A y en B (2026-11-10)
    await A.page.evaluate(() => QStore.setConfig(Object.assign({}, QStore.getConfig(), { responsable: 'AA' })));
    await B.page.evaluate(() => QStore.setConfig(Object.assign({}, QStore.getConfig(), { responsable: 'BB' })));
    await abrir(A, `#/p/${uidOferta}/ficha`); await abrir(B, `#/p/${uidOferta}/ficha`);
    await sincronizar(A); await sincronizar(B); await onedrive([A, B, C]); await sincronizar(A); await sincronizar(B);
    const presente = await texto(A, '#ed-compartida');
    check('presencia: A ve que BB también tiene abierto el proyecto', presente.includes('BB') && presente.includes('también tiene abierto'), presente);
    await A.page.screenshot({ path: path.join(SHOTS, '3b-A-presencia.png') });
    const ver = (eq) => eq.page.evaluate((id) => { const p = QStore.get(id); return [p.titulo, p.ubicacion]; }, uidOferta);
    // Datos distintos: A cambia la ubicación y B el título; suben casi a la vez y OneDrive se queda con la de B
    await A.page.fill('[data-f="ubicacion"]', 'Ubicación según A'); await A.page.dispatchEvent('[data-f="ubicacion"]', 'input');
    await escribirTitulo(B, 'Oferta compartida (B)');
    await wait(800); await quietos([A, B]);
    await onedrive([A, B, C]);
    await sincronizar(A); await wait(300);
    const avisoJunta = await texto(A, '#toast');
    await quietos([A]);
    await onedrive([A, B, C]); await sincronizar(B); await wait(300);
    check('juntado: A tiene el título de B y su ubicación', JSON.stringify(await ver(A)) === JSON.stringify(['Oferta compartida (B)', 'Ubicación según A']), await ver(A));
    check('juntado: el editor abierto de A lo muestra', (await A.page.inputValue('[data-f="titulo"]')) === 'Oferta compartida (B)' && (await A.page.inputValue('[data-f="ubicacion"]')) === 'Ubicación según A');
    check('juntado: A recibe el aviso «Se juntaron tus cambios…»', avisoJunta.includes('Se juntaron tus cambios con los de BB'), avisoJunta);
    check('juntado: B recibe lo de A en su editor abierto', JSON.stringify(await ver(B)) === JSON.stringify(['Oferta compartida (B)', 'Ubicación según A']) && (await B.page.inputValue('[data-f="ubicacion"]')) === 'Ubicación según A', await ver(B));
    const nCopias = async (eq) => (await eq.page.evaluate(() => QStore.all().filter((p) => /cambios sin subir|mis cambios/.test(p.titulo)).length));
    const copias0 = await nCopias(A);
    // El mismo dato: A elige dato por dato
    await A.page.fill('[data-f="cliente"]', 'Cliente A2'); await A.page.dispatchEvent('[data-f="cliente"]', 'input');
    await B.page.fill('[data-f="cliente"]', 'Cliente B2'); await B.page.dispatchEvent('[data-f="cliente"]', 'input');
    await wait(800); await quietos([A, B]);
    await onedrive([A, B, C]);
    await sincronizar(A); await wait(500);
    const dlgChoque = await texto(A, '#modal');
    check('mismo dato: A ve la lista para elegir', dlgChoque.includes('Cambiaron lo mismo a la vez') && dlgChoque.includes('Cliente') && dlgChoque.includes('Cliente A2') && dlgChoque.includes('Cliente B2'), dlgChoque.slice(0, 300));
    await A.page.screenshot({ path: path.join(SHOTS, '3c-A-elegir.png') });
    await A.page.check('#modal input[name="choque-0"][value="suyo"]');
    await A.page.click('#modal .modal-foot .btn-primario'); await wait(800); await quietos([A]);
    check('mismo dato: queda lo elegido (el de B) y sin copia', (await A.page.evaluate((id) => QStore.get(id).cliente, uidOferta)) === 'Cliente B2' && (await nCopias(A)) === copias0, await A.page.evaluate((id) => QStore.get(id).cliente, uidOferta));
    await onedrive([A, B, C]); await sincronizar(B); await wait(300);
    check('mismo dato: lo de los dos sigue junto en B', JSON.stringify(await ver(B)) === JSON.stringify(['Oferta compartida (B)', 'Ubicación según A']) && (await B.page.evaluate((id) => QStore.get(id).cliente, uidOferta)) === 'Cliente B2');
    await abrir(A, '#/'); await abrir(B, '#/');

    // 7. Papelera compartida, sin borrado definitivo
    const uidEj = await B.page.evaluate(() => QStore.all().find((p) => p.codigo === 'QPN-EJEMPLO').uid);
    await B.page.evaluate((id) => QStore.remove(id), uidEj); await wait(2500);
    await onedrive([A, B, C]); await sincronizar(A);
    await abrir(A, '#/papelera');
    check('eliminar en B lo deja en la papelera de A', (await A.page.$$('#app [data-act="restaurar"]')).length === 1);
    check('papelera compartida: sin «Eliminar definitivamente»', (await A.page.$$('#app [data-act="purgar"], #app [data-act="vaciar"]')).length === 0);
    check('papelera: explica que el archivo sigue en la carpeta', (await texto(A, '.page-head')).includes('carpeta compartida'));

    // 8. Configuración
    await abrir(A, '#/');
    await A.page.click('[data-act="config"]'); await wait(500);
    const cfg = await texto(A, '#modal');
    check('Configuración: carpeta del equipo obligatoria (sin «Dejar de compartir» ni «Olvidar»)',
      cfg.includes('Carpeta compartida (OneDrive)') && cfg.includes('Todos los proyectos se guardan ahí') && !cfg.includes('Dejar de compartir') && !cfg.includes('Olvidar'), cfg.slice(0, 400));
    await A.page.screenshot({ path: path.join(SHOTS, '3-A-configuracion.png') });
    await A.page.click('#modal button:has-text("Cancelar")'); await wait(300);

    // 9. Sesión nueva sin permiso: el aviso lo pide y con un clic sincroniza
    await A.page.evaluate(() => { window.__permiso = 'prompt'; });
    await sincronizar(A);
    await A.page.evaluate(() => window.dispatchEvent(new Event('hashchange'))); await wait(400);
    const pide = await texto(A, '#compartida');
    check('sin permiso: aviso «Dar permiso y sincronizar»', pide.includes('Dar permiso y sincronizar'), pide);
    await A.page.click('#compartida [data-act="compartir"]'); await wait(700);
    check('con permiso vuelve la línea de estado', (await texto(A, '#compartida')).trim() === '' && (await texto(A, '#compartida-linea')).includes('Guardados en la carpeta del equipo'));

    // 10. B recarga: la carpeta se recuerda y sincroniza sola
    await B.page.reload(); await wait(1500);
    check('B recarga: sigue compartiendo sin volver a conectar', (await texto(B, '#compartida-linea')).includes('Guardados en la carpeta del equipo'), await texto(B, '#compartida-linea'));

    // 11. Equipo C crea un presupuesto: se le exige la carpeta, la conecta y recibe los del equipo
    await abrir(C);
    const enB = await B.page.evaluate(() => ({ activos: QStore.all().length, papelera: QStore.trash().length }));
    await C.page.click('[data-act="nuevo"]'); await wait(400);
    await C.page.click('#modal button:has-text("Conectar la biblioteca")'); await wait(900);
    // Con la biblioteca conectada se pregunta si se crea la carpeta de la oferta (2026-10-19)
    check('C: con la biblioteca conectada pregunta por la carpeta de la oferta', (await texto(C, '#modal')).includes('¿Crear la carpeta de la oferta?'), await texto(C, '#modal'));
    await C.page.check('#np-opciones input[value="ninguna"]');
    await C.page.click('#modal .modal-foot .btn-primario'); await wait(600);
    await escribirTitulo(C, 'Presupuesto de C'); await wait(2500);
    const uidC = await C.page.evaluate(() => location.hash.split('/')[2]);
    check('C: el presupuesto nuevo queda en la carpeta del equipo', (await tituloEnCarpeta(C, uidC)) === 'Presupuesto de C', await tituloEnCarpeta(C, uidC));
    const enC = await C.page.evaluate(() => ({ activos: QStore.all().length, papelera: QStore.trash().length }));
    check('C: al conectar recibe lo del equipo (activos y papelera)', enC.activos === enB.activos + 1 && enC.papelera === enB.papelera, [enC, enB]);

    // 11b. Equipo D sin acceso a carpetas (Firefox, Safari, celular): entrega por archivo,
    //      Claude lo incorpora en Python y los demás lo ven
    const D = await equipo(browser, 'D', { sinApi: true });
    await abrir(D);
    await D.page.click('[data-act="nuevo"]'); await wait(500);
    check('sin acceso a carpetas: «Nuevo proyecto» lo dice y sigue sin carpeta', (await texto(D, '#np-carpeta')).includes('no puede crear carpetas'), await texto(D, '#np-carpeta'));
    await D.page.click('#modal .modal-foot .btn-primario'); await wait(600);
    await escribirTitulo(D, 'Presupuesto desde Firefox'); await wait(700);
    const banD = await texto(D, '#ed-compartida');
    check('sin acceso a carpetas: se crea igual y el editor ofrece descargarlo', banD.includes('no puede abrir la carpeta del equipo') && banD.includes('Descargar para el equipo'), banD);
    await D.page.screenshot({ path: path.join(SHOTS, '5-D-sin-api.png') });
    const [descarga] = await Promise.all([D.page.waitForEvent('download'), D.page.click('#ed-compartida [data-act="entregar"]')]);
    const nombreD = descarga.suggestedFilename();
    const rutaD = path.join(SHOTS, '..', 'buzon-prueba', nombreD);
    fs.mkdirSync(path.dirname(rutaD), { recursive: true });
    await descarga.saveAs(rutaD);
    const entrega = JSON.parse(fs.readFileSync(rutaD, 'utf-8'));
    check('la descarga es un mensaje «formulacion» para el buzón', /_formulador_formulacion_[0-9a-f]{24}\.json$/.test(nombreD)
      && entrega.tipo === 'formulacion' && entrega.datos.titulo === 'Presupuesto desde Firefox' && entrega.resumen && Number.isFinite(entrega.resumen.precioNeto), [nombreD, entrega.tipo]);
    await wait(300);
    check('después de descargar, el editor dice que ya se entregó', (await texto(D, '#ed-compartida')).includes('Descargado para el equipo'));
    // Claude lo incorpora (Sistema Intercambio/formulaciones.py) en una carpeta de prueba
    const incorporado = execFileSync('py', ['-3.14', '-c', `
import json, shutil, sys, tempfile
from pathlib import Path
sys.path.insert(0, r"${SISTEMA_INTERCAMBIO}")
import intercambio as ic, formulaciones as fz
raiz = ic.asegurar_carpeta(Path(tempfile.mkdtemp()) / "Intercambio")
shutil.copy(r"${rutaD}", raiz / "buzon")
(r,) = fz.incorporar_buzon(raiz)
(item,) = fz.leer_repositorio(raiz)
print(json.dumps({"estado": r["estado"], "ruta": "publicado/formulador/" + item["archivo"].name, "texto": item["archivo"].read_text(encoding="utf-8")}))
`], { encoding: 'utf-8' });
    const inc = JSON.parse(incorporado);
    check('Python incorpora la entrega al repositorio', inc.estado === 'aplicado', inc.estado);
    nube.set(inc.ruta, inc.texto);              // OneDrive la lleva a todos
    await onedrive([A, B, C]);
    await abrir(A, '#/'); await sincronizar(A);
    check('A ve el presupuesto entregado por archivo', (await titulosLista(A)).includes('Presupuesto desde Firefox'), await titulosLista(A));
    await D.ctx.close();

    // 12. Elegir una carpeta equivocada no cambia nada
    await abrir(C, '#/');
    await C.page.evaluate(() => { window.__carpetaElegida = 'Otra carpeta'; });
    await C.page.click('[data-act="config"]'); await wait(500);
    await C.page.click('#modal [data-act="af-carpeta"]'); await wait(600);
    check('carpeta equivocada: avisa que elija la biblioteca', (await texto(C, '#toast')).includes('Elige la biblioteca «Formulación de proyectos - Documentos»'), await texto(C, '#toast'));
    check('carpeta equivocada: sigue conectada a la de antes', (await texto(C, '#modal')).includes('Intercambio'), (await texto(C, '#modal')).slice(0, 200));
    await C.page.click('#modal button:has-text("Cancelar")'); await wait(300);
    await C.page.evaluate(() => { window.__carpetaElegida = ''; });

    // 13. La carpeta cambia de lugar: se avisa y se vuelve a conectar eligiendo la biblioteca nueva
    await A.page.evaluate(async (ruta) => {
      let d = await navigator.storage.getDirectory();
      for (const n of ruta) d = await d.getDirectoryHandle(n);
      await d.removeEntry('intercambio.json');
    }, RUTA_INTER);
    await abrir(A, '#/');
    await sincronizar(A);
    const movida = await texto(A, '#compartida');
    check('carpeta movida: aviso «cambió de lugar»', movida.includes('cambió de lugar') && movida.includes('Conectar carpeta'), movida);
    check('carpeta movida: el editor dice que queda solo en el navegador', await A.page.evaluate(() => window.QCompartida.info().sinCarpeta));
    const nueva = ['Biblioteca nueva', '.herramientas formulación', 'Intercambio'];   // otra forma de escribir el nombre
    await escribirOPFS(A.page, [['intercambio.json', nube.get('intercambio.json')]], nueva);
    await A.page.evaluate(() => { window.__carpetaElegida = 'Biblioteca nueva'; });
    await A.page.click('#compartida [data-act="compartir"]'); await wait(1000);
    const enNueva = (await leerOPFS(A.page, nueva)).filter((f) => f.ruta.startsWith('publicado/formulador/') && !f.ruta.includes('/editando/'));
    const nA = await A.page.evaluate(() => QStore.all().length + QStore.trash().length);
    check('reconectada: vuelve la línea de estado', (await texto(A, '#compartida-linea')).includes('Guardados en la carpeta del equipo'), await texto(A, '#compartida-linea'));
    check('reconectada: sus proyectos quedan en la carpeta nueva', enNueva.length === nA, [enNueva.length, nA]);

    // 14. Solo escribe en publicado/formulador, y nada fuera de la carpeta de intercambio
    const biblioteca = (await leerOPFS(B.page, [BIBLIOTECA])).map((f) => f.ruta);
    check('en la biblioteca solo toca su carpeta (la oferta de relleno sigue igual)',
      biblioteca.every((r) => r.startsWith('.HERRAMIENTAS FORMULACIÓN/Intercambio/') || r === '298. SAG Quemadores/Oferta.pdf'), biblioteca);
    const rutas = Array.from(nube.keys());
    check('la carpeta solo tiene archivos del formulador en publicado/formulador',
      rutas.every((r) => ['intercambio.json', 'LEEME.md', 'publicado/analisis-financiero.json'].includes(r) || /^publicado\/formulador\/[A-Za-z0-9_-]+(-[A-C])?\.json$/.test(r)
        || /^publicado\/formulador\/editando\/[A-Za-z0-9_-]+~[A-Za-z0-9_-]+\.json$/.test(r)), rutas);
    await B.page.screenshot({ path: path.join(SHOTS, '4-B-lista.png') });
  } catch (e) {
    results.push('SCRIPT ' + (e && e.stack || e));
  }
  check('sin errores de JavaScript', errores.length === 0, errores);
  console.log(results.join('\n'));
  const fallas = results.filter((r) => !r.startsWith('OK')).length;
  console.log(`\n${results.length - fallas}/${results.length} OK`);
  await browser.close();
  process.exit(fallas ? 1 : 0);
})();
