// Prueba de punta a punta del pedido del 2026-10-19 en el Formulador (modo local):
//  - el código del proyecto es «N°. Nombre», igual al nombre de la carpeta de la oferta;
//  - «Nuevo proyecto» pregunta si se crea la carpeta con ese nombre en «Formulación de proyectos»;
//  - la carpeta se abre en el Explorador (quempin://carpeta, QUEMPIN.exe);
//  - al quedar Adjudicada se pregunta si la carpeta pasa a «Gestión de Proyectos» (quempin://trasladar): una
//    copia allá y el original en «0 OFERTAS ADJUDICADAS» (lo eligió el usuario el 2026-10-19).
// La biblioteca se simula en el almacenamiento privado del navegador (OPFS), con carpetas y planilla
// FICTICIAS. Las direcciones quempin:// se anotan en vez de abrir el programa; lo que haría QUEMPIN.exe se
// simula: la copia en otra carpeta del navegador y el original a «0 OFERTAS ADJUDICADAS».
// Uso: servir el repo en http://127.0.0.1:8797 y correr  node .prueba/carpeta/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = 'http://127.0.0.1:8797/index.html';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const BIB = 'Formulación de proyectos - Documentos';
const GES = 'Gestión de Proyectos - Documentos';
const HERR = '.HERRAMIENTAS FORMULACIÓN';
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PUB = (herramienta, datos) => JSON.stringify({ esquema: 'quempin.intercambio/1', herramienta, generado: '2026-10-19T10:00:00-03:00', datos });
const REQS = [
  { numero: 312, estado: 'Evaluación', titulo: 'Gimnasio municipal de prueba', ubicacion: 'Quilpué', referencia: '9999-1-LE26', cierre: '2026-11-20', presupuesto: 5950000, evaluador: 'LC' },
  { numero: 298, estado: 'Evaluación', titulo: 'Quemadores SAG de prueba', ubicacion: 'Osorno', referencia: '', cierre: null, presupuesto: null },
  { numero: 296, estado: 'Evaluación', titulo: 'Sala de calderas Llay Llay', ubicacion: 'Llay Llay', referencia: '', cierre: null, presupuesto: null },
  { numero: 303, estado: 'Ofertado', titulo: 'Quemador Osorno de prueba', ubicacion: 'Osorno', referencia: '', cierre: null, presupuesto: null }
];
const INICIAL = [
  [`${HERR}/Intercambio/intercambio.json`, JSON.stringify({ esquema: 'quempin.intercambio/1', descripcion: 'prueba' })],
  [`${HERR}/Intercambio/publicado/requerimientos.json`, PUB('planilla-requerimientos', { requerimientos: REQS })],
  [`${HERR}/Intercambio/publicado/folios.json`, PUB('sistema-quempin', { tipos: { 81: { nombre: 'Evaluación de costos', paises: {
    Chile: { ultimo: '812601', fecha: '2026-01-12', autor: 'JB', siguiente: '812602' }, Peru: { ultimo: null, siguiente: '812601' } } } } })],
  ['298. SAG Quemadores/Oferta.pdf', 'pdf de prueba'],
  ['0 OFERTAS PRESENTADAS/303. Quemador Osorno/Experiencia/certificado.pdf', 'cert'],
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
/* Todos los archivos y carpetas de una carpeta del OPFS: { ruta: texto | 'dir' | 'xlsx:<tamaño>' } */
async function arbol(page, raiz) {
  return page.evaluate(async (raiz) => {
    const out = {};
    // Un archivo que aparece y desaparece mientras se recorre (el temporal de una escritura) se salta
    async function rec(d, pre) {
      try {
        for await (const [n, h] of d.entries()) {
          if (/\.crswap$/.test(n)) continue;
          // Las marcas de «está editando» (2026-11-10) van y vienen mientras se recorre: no son carpetas de ofertas
          if (h.kind === 'directory' && n === 'editando' && /publicado\/formulador\/$/.test(pre)) continue;
          if (h.kind === 'directory') { out[pre + n + '/'] = 'dir'; await rec(h, pre + n + '/'); } else {
            try {
              const f = await h.getFile();
              const t = await f.text();
              out[pre + n] = /\.xlsx$/.test(n) && t.startsWith('PK') ? 'xlsx:' + f.size : t;
            } catch (e) { if (!e || e.name !== 'NotFoundError') throw e; }
          }
        }
      } catch (e) { if (!e || e.name !== 'NotFoundError') throw e; }
    }
    await rec(await (await navigator.storage.getDirectory()).getDirectoryHandle(raiz, { create: true }), '');
    return out;
  }, raiz);
}
/* Lo que haría QUEMPIN.exe: una copia en Gestión y el original a «0 OFERTAS ADJUDICADAS» */
async function trasladarComoElPrograma(page, ruta) {
  await page.evaluate(async ([bib, ges, ruta]) => {
    const raiz = await navigator.storage.getDirectory();
    const lib = await raiz.getDirectoryHandle(bib);
    let o = lib; for (const p of ruta) o = await o.getDirectoryHandle(p);
    const dst = await (await raiz.getDirectoryHandle(ges, { create: true })).getDirectoryHandle(ruta[ruta.length - 1], { create: true });
    async function copiar(a, b) {
      for await (const [n, h] of a.entries()) {
        if (h.kind === 'directory') await copiar(h, await b.getDirectoryHandle(n, { create: true }));
        else { const w = await (await b.getFileHandle(n, { create: true })).createWritable(); await w.write(await (await h.getFile()).arrayBuffer()); await w.close(); }
      }
    }
    await copiar(o, dst);
    const adj = await (await lib.getDirectoryHandle('0 OFERTAS ADJUDICADAS', { create: true })).getDirectoryHandle(ruta[ruta.length - 1], { create: true });
    await copiar(o, adj);
    let padre = lib; for (const p of ruta.slice(0, -1)) padre = await padre.getDirectoryHandle(p);
    await padre.removeEntry(ruta[ruta.length - 1], { recursive: true });
  }, [BIB, GES, ruta]);
}

function vigilar(page, quien) {
  page.on('pageerror', (e) => errores.push(`${quien}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`${quien} consola: ${m.text()}`); });
}
async function equipo(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, locale: 'es-CL' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('quempin_viz_unlocked', '1'); } catch (e) { /* */ }
    window.showDirectoryPicker = async () => {
      let d = await navigator.storage.getDirectory();
      for (const n of (window.__elegir || ['Formulación de proyectos - Documentos'])) d = await d.getDirectoryHandle(n, { create: true });
      return d;
    };
    FileSystemHandle.prototype.queryPermission = async function () { return window.__permiso || 'granted'; };
    FileSystemHandle.prototype.requestPermission = async function () { window.__permiso = 'granted'; return 'granted'; };
    // Las direcciones quempin:// (QUEMPIN.exe) se anotan en vez de pedirle a Windows que abra el programa
    window.__lanzados = [];
    // Lo que se abre en otra pestaña (el Portal, con «Ingresar en Requerimientos») se anota
    window.__abiertas = [];
    window.open = (u) => { window.__abiertas.push(String(u)); return null; };
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href^="quempin:"]') : null;
      if (a) { window.__lanzados.push(a.getAttribute('href')); e.preventDefault(); }
    }, true);
  });
  const page = await ctx.newPage();
  vigilar(page, 'A');
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
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
const uidAbierto = (page) => page.evaluate(() => location.hash.split('/')[2]);
const proyecto = (page, uid) => page.evaluate((uid) => JSON.parse(JSON.stringify(window.QStore.get(uid))), uid);
const lanzados = (page) => page.evaluate(() => window.__lanzados.slice());
async function nuevo(page) {
  await page.click('[data-act="nuevo"]:not([data-numero])');
  await page.waitForSelector('#modal[open] #np-num', { timeout: 5000 });
  await wait(300);
}
async function escribirEn(page, sel, valor) {
  await page.fill(sel, valor);
  await page.dispatchEvent(sel, 'input');
  await wait(150);
}
/* El N° escrito trae el nombre de la planilla cuando termina de leerla */
async function conNombre(page) {
  await page.waitForFunction(() => (document.querySelector('#np-tit') || {}).value, null, { timeout: 8000 }).catch(() => {});
  await wait(150);
}
async function crear(page) {
  if (await page.$('#modal[open] #cp-ini')) await page.selectOption('#cp-ini', 'CM');
  await page.click('#modal .modal-foot .btn-primario');
  await wait(1200);
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { page } = await equipo(browser);
  try {
    await abrir(page);
    await page.click('#compartida [data-act="compartir"]'); await wait(800);
    check('la biblioteca completa queda conectada', (await page.evaluate(async () => (await window.QIntercambio.estadoBiblioteca()).recordada)) === true);

    // 1. Nuevo proyecto: el N° trae el nombre de la planilla, el código es «N°. Nombre» y se pregunta por la carpeta
    await nuevo(page);
    let dlg = await texto(page, '#modal');
    check('nuevo: pide el N° y el nombre, y pregunta si se crea la carpeta', dlg.includes('N° de requerimiento') && dlg.includes('Nombre del proyecto') && dlg.includes('¿Crear la carpeta de la oferta?'), dlg.slice(0, 300));
    await escribirEn(page, '#np-num', '312');
    await conNombre(page);
    check('nuevo: el nombre llega de la planilla', (await page.inputValue('#np-tit')) === 'Gimnasio municipal de prueba', await page.inputValue('#np-tit'));
    check('nuevo: el código propuesto es «N°. Nombre»', (await texto(page, '#np-codigo')).includes('312. Gimnasio municipal de prueba'), await texto(page, '#np-codigo'));
    dlg = await texto(page, '#np-carpeta');
    check('nuevo: propone crear la carpeta con ese mismo nombre en Formulación de proyectos', dlg.includes('Sí, crear «312. Gimnasio municipal de prueba» en la biblioteca Formulación de proyectos')
      && (await page.$eval('#np-opciones input[value="crear"]', (e) => e.checked)), dlg);
    check('nuevo: dice qué N° es en la planilla', dlg.includes('Requerimientos, N° 312: Gimnasio municipal de prueba'), dlg);
    await page.screenshot({ path: path.join(SHOTS, '1-nuevo-proyecto.png') });
    await crear(page);
    const uid1 = await uidAbierto(page);
    let p1 = await proyecto(page, uid1);
    let lib = await arbol(page, BIB);
    check('crear: la carpeta «312. …» queda en la raíz de la biblioteca', lib['312. Gimnasio municipal de prueba/'] === 'dir', Object.keys(lib).filter((k) => k.endsWith('/')));
    check('crear: el código es el nombre de la carpeta', p1.codigo === '312. Gimnasio municipal de prueba' && p1.version === 1, [p1.codigo, p1.version]);
    check('crear: título, N°, ubicación, ID y presupuesto desde la planilla', p1.titulo === 'Gimnasio municipal de prueba' && p1.vinculos.requerimiento.numero == 312
      && p1.ubicacion === 'Quilpué' && p1.idLicitacion === '9999-1-LE26' && p1.parametros.presupuestoMaximo === 5950000, p1);
    check('crear: el responsable es el Evaluador de la planilla', p1.responsable === 'LC', p1.responsable);
    check('crear: vinculado a su carpeta', p1.vinculos.carpetaOferta && p1.vinculos.carpetaOferta.nombre === '312. Gimnasio municipal de prueba' && p1.vinculos.carpetaOferta.ruta.join('/') === '312. Gimnasio municipal de prueba', p1.vinculos.carpetaOferta);
    await wait(1500);
    lib = await arbol(page, BIB);
    check('crear: el Excel «Formulación 312 v1.xlsx» queda en la carpeta', /^xlsx:/.test(lib['312. Gimnasio municipal de prueba/Formulación 312 v1.xlsx'] || ''), Object.keys(lib).filter((k) => k.startsWith('312')));
    check('encabezado: el código completo', (await texto(page, '#ed-meta .code-badge')) === '312. Gimnasio municipal de prueba' && (await page.$eval('#ed-meta .code-badge', (e) => e.title)) === '312. Gimnasio municipal de prueba');
    check('ficha: el código se explica', (await texto(page, '#codigo-hint')).includes('El nombre de la carpeta de la oferta'), await texto(page, '#codigo-hint'));
    const regs = Object.keys(lib).filter((k) => k.startsWith(`${HERR}/Intercambio/buzon/`) && !k.endsWith("/")).map((k) => JSON.parse(lib[k])).filter((m) => m.tipo === 'registro-documento');
    check('crear: la evaluación de costos toma su N° del Control de Documentos', regs.length === 1 && regs[0].documento.folio === '812602' && regs[0].fuente.uid === uid1, regs.map((m) => m.documento));
    await page.screenshot({ path: path.join(SHOTS, '2-editor.png') });

    // 2. Un N° que ya tiene carpeta: se propone usarla, y no se crea otra
    await abrir(page);
    await nuevo(page);
    await escribirEn(page, '#np-num', '298');
    await conNombre(page);
    dlg = await texto(page, '#np-carpeta');
    check('N° con carpeta: propone usar la que ya existe', dlg.includes('Usar la carpeta que ya existe: «298. SAG Quemadores» (En curso)') && (await page.$eval('#np-opciones input[value="usar"]', (e) => e.checked)), dlg);
    check('N° con carpeta: el código es el nombre de esa carpeta', (await texto(page, '#np-codigo')).includes('298. SAG Quemadores'), await texto(page, '#np-codigo'));
    await crear(page);
    const uid2 = await uidAbierto(page);
    const p2 = await proyecto(page, uid2);
    lib = await arbol(page, BIB);
    check('N° con carpeta: queda en ella, con su nombre como código', p2.codigo === '298. SAG Quemadores' && p2.vinculos.carpetaOferta.nombre === '298. SAG Quemadores'
      && Object.keys(lib).filter((k) => /^298\..*\/$/.test(k)).length === 1, [p2.codigo, Object.keys(lib).filter((k) => k.startsWith('298'))]);

    // 3. Sin N° (2026-11-12, fase 1 del plan contra choques de N°): el Formulador ya no pide N° a la Planilla. Ofrece
    //    «Ingresar en Requerimientos», que abre el Portal con los datos; el N° lo da el Portal.
    const pedidos = async () => Object.entries(await arbol(page, BIB)).filter(([k]) => k.startsWith(`${HERR}/Intercambio/buzon/`) && /_nuevo-requerimiento_/.test(k)).map(([, v]) => JSON.parse(v));
    await abrir(page);
    await nuevo(page);
    await escribirEn(page, '#np-tit', 'Caldera sin número');
    await page.waitForSelector('#np-carpeta .np-portal', { timeout: 5000 }).catch(() => {});
    dlg = await texto(page, '#np-carpeta');
    check('sin N°: ofrece ingresarlo en Requerimientos y no registrarlo', dlg.includes('Sin N° de requerimiento') && dlg.includes('Ingresar en Requerimientos') && !(await page.$('#np-reg')), dlg);
    check('sin N°: el código es solo el nombre', (await texto(page, '#np-codigo')).includes('Caldera sin número') && !/\d\. Caldera/.test(await texto(page, '#np-codigo')), await texto(page, '#np-codigo'));
    await page.screenshot({ path: path.join(SHOTS, '3-sin-numero.png') });
    await page.click('#np-carpeta .np-portal'); await wait(400);
    const abiertas = await page.evaluate(() => window.__abiertas.slice());
    const alPortal = abiertas.length === 1 && /\/portal\/#\/planilla\?nuevo=/.test(abiertas[0]) ? JSON.parse(decodeURIComponent(abiertas[0].split('nuevo=')[1])) : null;
    check('sin N°: «Ingresar en Requerimientos» abre el Portal con el nombre y cierra el diálogo', !!alPortal && alPortal.titulo === 'Caldera sin número' && !(await page.$('#modal[open]')), abiertas);
    check('sin N°: no deja nada para la Planilla en el buzón', (await pedidos()).length === 0, await pedidos());
    // El Portal lo ingresó y ya llegó al Excel con el 313: se formula con «Formular →», con su carpeta al tiro
    await escribir(page, [[`${HERR}/Intercambio/publicado/requerimientos.json`, PUB('planilla-requerimientos', { requerimientos: REQS.concat([
      { numero: 313, estado: 'Evaluación', titulo: 'Caldera sin número', ubicacion: 'Talca', referencia: '', cierre: null, presupuesto: null }]) })]]);
    await page.reload();          // la Planilla publicada se vuelve a leer
    await abrir(page, '#/req/313/crear');
    await page.waitForSelector('#modal[open] #np-num', { timeout: 8000 }).catch(() => {});
    await conNombre(page);
    check('Formular el 313: código «313. Caldera sin número»', (await texto(page, '#np-codigo')).includes('313. Caldera sin número'), await texto(page, '#np-codigo'));
    await crear(page);
    const p3a = await proyecto(page, await uidAbierto(page));
    lib = await arbol(page, BIB);
    check('Formular el 313: carpeta «313. Caldera sin número», código igual y unido al N° 313', lib['313. Caldera sin número/'] === 'dir' && p3a.codigo === '313. Caldera sin número'
      && p3a.vinculos.requerimiento.numero == 313 && !p3a.vinculos.requerimiento.pedido, [p3a.codigo, p3a.vinculos && p3a.vinculos.requerimiento]);
    await page.click('[data-act="limpiar-filtros"]').catch(() => {});

    // 3b. Un N° escrito que no está en Requerimientos: lo dice, ofrece ingresarlo y no deja crear con él
    await abrir(page);
    await nuevo(page);
    await escribirEn(page, '#np-num', '320');
    await escribirEn(page, '#np-tit', 'Otro proyecto');
    await wait(400);
    dlg = await texto(page, '#np-carpeta');
    check('N° fuera de Requerimientos: lo dice y no deja crear', dlg.includes('El N° 320 no está en Requerimientos') && dlg.includes('Ingresar en Requerimientos')
      && await page.$eval('#modal .modal-foot .btn-primario', (b) => b.disabled), dlg);
    await page.click('#modal .modal-foot button:not(.btn-primario)'); await wait(300);

    // 3c. Sin N°: el proyecto se crea igual, con el nombre como código y sin pedir nada a la Planilla
    await abrir(page);
    await nuevo(page);
    await escribirEn(page, '#np-tit', 'Quemador de prueba');
    await wait(300);
    check('sin N°: el código es el nombre', (await texto(page, '#np-codigo')).includes('Quemador de prueba') && !(await texto(page, '#np-codigo')).includes('314'), await texto(page, '#np-codigo'));
    await crear(page);
    const p3 = await proyecto(page, await uidAbierto(page));
    lib = await arbol(page, BIB);
    check('sin N°: carpeta «Quemador de prueba» y el mismo código', lib['Quemador de prueba/'] === 'dir' && p3.codigo === 'Quemador de prueba', [p3.codigo]);
    check('sin N°: no se pide nada a la Planilla', (await pedidos()).length === 0 && !(p3.vinculos && p3.vinculos.planilla), await pedidos());

    // 3d. «Formular →» del Portal (2026-11-11): un N° recién ingresado en Requerimientos, que todavía espera en el buzón,
    //     abre directo el diálogo con sus datos, sin tomarlo por un choque, y el proyecto guarda el id del pedido
    const portal = (id, enviado, numero, titulo) => [`${HERR}/Intercambio/buzon/${enviado.slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}_portal_nuevo-requerimiento_${id}.json`,
      JSON.stringify({ esquema: 'quempin.intercambio/1', id, tipo: 'nuevo-requerimiento', destino: 'planilla-requerimientos',
        origen: { herramienta: 'portal', enviado, usuario: 'LC' }, requerimiento: { numero, titulo, estado: 'Evaluación', ubicacion: 'Temuco', evaluador: 'LC' },
        fuente: { herramienta: 'portal' }, numeroLibre: true })];
    // Dos personas tomaron el 340 casi a la vez: vale el primero enviado
    await escribir(page, [portal('pedidoPortal1', '2026-11-11T10:00:00-03:00', 340, 'Bomba del Portal'), portal('pedidoPortal2', '2026-11-11T10:00:30-03:00', 340, 'Otra del Portal')]);
    await abrir(page, '#/req/340/crear');
    await page.waitForSelector('#modal[open] #np-num', { timeout: 8000 }).catch(() => {});
    await conNombre(page);
    dlg = await texto(page, '#np-carpeta');
    check('Formular desde el Portal: abre el diálogo con el N° 340 y el título del pedido más antiguo', (await page.$eval('#np-num', (e) => e.value).catch(() => '')) === '340'
      && (await page.$eval('#np-tit', (e) => e.value).catch(() => '')) === 'Bomba del Portal', await page.$eval('#np-tit', (e) => e.value).catch(() => 'sin diálogo'));
    check('Formular desde el Portal: no lo toma por un N° ya pedido ni lo vuelve a registrar', !dlg.includes('ya se pidió') && !(await page.$('#np-reg')), dlg);
    check('Formular desde el Portal: el enlace queda en #/req/340', await page.evaluate(() => location.hash) === '#/req/340');
    const pedidosAntes = (await pedidos()).length;
    await crear(page);
    const p3d = await proyecto(page, await uidAbierto(page));
    check('Formular desde el Portal: unido al N° 340 con el id del pedido', p3d.vinculos.requerimiento.numero == 340 && p3d.vinculos.requerimiento.pedido === 'pedidoPortal1'
      && p3d.responsable === 'LC', [p3d.vinculos.requerimiento, p3d.responsable]);
    check('Formular desde el Portal: no pide otra fila a la Planilla', (await pedidos()).length === pedidosAntes && !(p3d.vinculos.planilla && p3d.vinculos.planilla.registro), (await pedidos()).length);
    // Fase 2: con N° provisorio la carpeta espera la confirmación del Excel
    lib = await arbol(page, BIB);
    check('N° provisorio: la carpeta no se crea todavía y queda pendiente', !Object.keys(lib).some((k) => /^34[01]\./.test(k)) && p3d.vinculos.requerimiento.carpetaPendiente
      && p3d.vinculos.requerimiento.carpetaPendiente.por === 'CM' && !p3d.vinculos.carpetaOferta, [Object.keys(lib).filter((k) => /^34/.test(k)), p3d.vinculos]);
    // El Excel atiende el pedido, pero otro requerimiento llegó antes con el 340: le da el 341 (lo que hace planilla_escritura.py)
    const mes = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
    const [rutaBuzon, cuerpo] = portal('pedidoPortal1', '2026-11-11T10:00:00-03:00', 340, 'Bomba del Portal');
    const archivado = Object.assign(JSON.parse(cuerpo), { resultado: { estado: 'aplicado', fecha: '2026-11-11', detalle: ['El N° 340 ya lo tenía «Otra»: quedó con el N° 341.'], requerimiento: 341 } });
    await page.evaluate(async ([bib, ruta]) => {
      let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib);
      const partes = ruta.split('/');
      for (const p of partes.slice(0, -1)) d = await d.getDirectoryHandle(p);
      await d.removeEntry(partes[partes.length - 1]);
    }, [BIB, rutaBuzon]);
    await escribir(page, [[rutaBuzon.replace('/buzon/', `/procesado/${mes}/`), JSON.stringify(archivado)]]);
    await abrir(page, `#/p/${p3d.uid}/ficha`);
    await page.reload();
    await page.waitForSelector("#app .editor-head, #app .tabs", { timeout: 15000 }).catch(() => {});
    await page.waitForFunction((uid) => { const p = window.QStore.get(uid); return p && p.vinculos.requerimiento && !p.vinculos.requerimiento.pedido && p.vinculos.carpetaOferta; }, p3d.uid, { timeout: 15000 }).catch(() => {});
    const p3e = await proyecto(page, p3d.uid);
    lib = await arbol(page, BIB);
    check('N° confirmado distinto: el proyecto pasa al 341 y su código se corrige', p3e.vinculos.requerimiento.numero === '341' && !p3e.vinculos.requerimiento.pedido && p3e.codigo === '341. Bomba del Portal', [p3e.vinculos.requerimiento, p3e.codigo]);
    check('N° confirmado: la carpeta nace con el N° definitivo', lib['341. Bomba del Portal/'] === 'dir' && !lib['340. Bomba del Portal/'] && !p3e.vinculos.requerimiento.carpetaPendiente
      && p3e.vinculos.carpetaOferta && p3e.vinculos.carpetaOferta.nombre === '341. Bomba del Portal', [Object.keys(lib).filter((k) => /^34/.test(k)), p3e.vinculos.carpetaOferta]);
    check('N° confirmado: el aviso lo dice', /quedó como N° 341/.test(await texto(page, '#toast')) || /341/.test(await texto(page, '#toast')), await texto(page, '#toast'));
    // El siguiente libre tiene en cuenta lo del Portal
    await abrir(page);
    await nuevo(page);
    await escribirEn(page, '#np-tit', 'Después del Portal');
    await page.waitForSelector('#np-carpeta .np-portal', { timeout: 5000 }).catch(() => {});
    check('sin N° después del Portal: no propone ningún N° (lo da el Portal)', (await texto(page, '#np-carpeta')).includes('Ingresar en Requerimientos')
      && !/como N° \d/.test(await texto(page, '#np-carpeta')), await texto(page, '#np-carpeta'));
    await page.click('#modal .modal-foot button:not(.btn-primario)'); await wait(300);
    // El enlace #/req/340 dejó la lista filtrada por ese N°, como todo enlace de otra herramienta
    const limpiar = await page.$('[data-act="limpiar-filtros"]');
    if (limpiar) { await limpiar.click(); await wait(300); }

    // 4. «No, sin carpeta por ahora»: el código igual es «N°. Nombre» y no se crea nada
    await abrir(page);
    await nuevo(page);
    await escribirEn(page, '#np-num', '296');
    await conNombre(page);
    await page.check('#np-opciones input[value="ninguna"]');
    const antes = Object.keys(await arbol(page, BIB)).length;
    await crear(page);
    const p4 = await proyecto(page, await uidAbierto(page));
    check('sin carpeta: código «296. Sala de calderas Llay Llay», sin carpeta y unido al N°', p4.codigo === '296. Sala de calderas Llay Llay' && !(p4.vinculos || {}).carpetaOferta && p4.vinculos.requerimiento.numero == 296, [p4.codigo, p4.vinculos]);
    check('sin carpeta: no se creó ninguna carpeta', Object.keys(await arbol(page, BIB)).length === antes);
    // Al elegir después su carpeta, el código pasa a ser el nombre de esa carpeta
    await page.evaluate(async () => {
      const c = (await window.QOferta.carpetas(true)).find((x) => x.nombre === 'Quemador de prueba');
      window.__c = c;
    });
    check('sin carpeta: el editor ofrece elegirla', (await texto(page, '#ed-oferta')).length > 0, await texto(page, '#ed-oferta'));

    // 5. «Elegir otra carpeta…» lleva al selector de siempre
    await abrir(page);
    await nuevo(page);
    await page.click('#modal .np-elegir');
    await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 5000 });
    await page.fill('#cp-buscar', '303'); await page.dispatchEvent('#cp-buscar', 'input'); await wait(150);
    await page.click('#modal .cp-fila:not([hidden]):has-text("Quemador Osorno")');
    await page.click('#modal .modal-foot .btn-primario'); await wait(1200);
    const uid5 = await uidAbierto(page);
    const p5 = await proyecto(page, uid5);
    check('elegir otra: el código es el nombre de la carpeta elegida', p5.codigo === '303. Quemador Osorno' && p5.vinculos.carpetaOferta.ruta.join('/') === '0 OFERTAS PRESENTADAS/303. Quemador Osorno', [p5.codigo, p5.vinculos.carpetaOferta]);

    // 6. Abrir la carpeta en el Explorador (QUEMPIN.exe)
    await abrir(page, `#/p/${uid5}/ficha`);
    await page.click('[data-menu="editor-more"]'); await wait(150);
    await page.click('.pop-item:has-text("Abrir la carpeta en el Explorador")'); await wait(300);
    check('abrir: pide a QUEMPIN.exe la carpeta, con su ruta', (await lanzados(page)).slice(-1)[0] === 'quempin://carpeta/formulacion/0%20OFERTAS%20PRESENTADAS/303.%20Quemador%20Osorno', await lanzados(page));
    check('abrir: el aviso dice qué hacer si no se abre', (await texto(page, '#toast')).includes('QUEMPIN.exe 1.3.10'), await texto(page, '#toast'));
    await page.click('#ed-meta .meta-carpeta'); await wait(300);
    await page.click('#modal button:has-text("Abrir en el Explorador")'); await wait(300);
    check('abrir: también desde la carpeta del encabezado', (await lanzados(page)).length === 2 && (await lanzados(page))[1] === (await lanzados(page))[0]);

    // 7. Adjudicada: se pregunta por el traslado; «Ahora no» la deja, y queda en Seguimiento
    await abrir(page, `#/p/${uid1}/ficha`);
    await page.click('#ed-meta [data-picker="estado"]'); await wait(150);
    await page.click('.pop-item:has-text("Adjudicada")'); await wait(1400);
    dlg = await texto(page, '#modal[open]');
    check('adjudicada: pregunta si la carpeta pasa a Gestión de Proyectos', dlg.includes('Copiar la carpeta a Gestión de Proyectos') && dlg.includes('«312. Gimnasio municipal de prueba»')
      && dlg.includes('0 OFERTAS ADJUDICADAS') && dlg.includes('QUEMPIN.exe'), dlg.slice(0, 300));
    await page.screenshot({ path: path.join(SHOTS, '3-trasladar.png') });
    await page.click('#modal .modal-foot button:has-text("Ahora no")'); await wait(400);
    check('ahora no: no se pide nada a QUEMPIN.exe', (await lanzados(page)).length === 2);
    await abrir(page, `#/p/${uid1}/seguimiento`);
    await page.waitForSelector('[data-act="oferta-trasladar"]', { timeout: 8000 }).catch(() => {});
    check('seguimiento: ofrece copiarla a Gestión', !!(await page.$('[data-act="oferta-trasladar"]')), await texto(page, '#app'));
    await page.screenshot({ path: path.join(SHOTS, '4-seguimiento.png'), fullPage: true });
    // Sistema QUEMPIN se abre desde la etapa de la cotización (2026-10-20)
    // (adjudicada, la etapa de la cotización va plegada: se despliega)
    await page.click('#etapa-cotizacion details > summary'); await wait(200);
    await page.click('#etapa-cotizacion [data-act="abrir-sistema"]'); await wait(300);
    check('seguimiento: abre Sistema QUEMPIN en Nueva Cotización', (await lanzados(page)).slice(-1)[0] === 'quempin://cotizacion', await lanzados(page));

    // 8. Copiar: el Excel espera; cuando QUEMPIN.exe termina, el original está en Adjudicadas y su Excel sigue ahí
    await page.click('[data-act="oferta-trasladar"]'); await wait(400);
    await page.click('#modal .modal-foot button:has-text("Copiar la carpeta")'); await wait(600);
    check('trasladar: pide a QUEMPIN.exe el traslado de esa carpeta', (await lanzados(page)).slice(-1)[0] === 'quempin://trasladar/formulacion/312.%20Gimnasio%20municipal%20de%20prueba', await lanzados(page));
    p1 = await proyecto(page, uid1);
    check('trasladar: queda pedido, con de dónde parte', !!(p1.vinculos.carpetaOferta.traslado && p1.vinculos.carpetaOferta.traslado.pedido) && p1.vinculos.carpetaOferta.traslado.desde.join('/') === '312. Gimnasio municipal de prueba', p1.vinculos.carpetaOferta);
    const xls = '312. Gimnasio municipal de prueba/Formulación 312 v1.xlsx';
    const antesX = (await arbol(page, BIB))[xls];
    await abrir(page, `#/p/${uid1}/ficha`);
    check('copiando: el editor lo avisa', (await texto(page, '#ed-oferta')).includes('Copiando «312. Gimnasio municipal de prueba» a Gestión de Proyectos'), await texto(page, '#ed-oferta'));
    await page.fill('[data-f="cliente"]', 'Municipalidad de prueba'); await page.dispatchEvent('[data-f="cliente"]', 'input'); await wait(2500);
    check('copiando: el Excel espera', (await arbol(page, BIB))[xls] === antesX);
    await trasladarComoElPrograma(page, ['312. Gimnasio municipal de prueba']);
    await page.waitForFunction((uid) => !!((window.QStore.get(uid).vinculos || {}).carpetaOferta || {}).gestion, uid1, { timeout: 12000 }).catch(() => {});
    p1 = await proyecto(page, uid1);
    check('copiada: el vínculo sigue en el original, ahora en Adjudicadas, con la copia anotada', p1.vinculos.carpetaOferta.ruta.join('/') === '0 OFERTAS ADJUDICADAS/312. Gimnasio municipal de prueba'
      && !!p1.vinculos.carpetaOferta.gestion.copiada && !p1.vinculos.carpetaOferta.traslado, p1.vinculos.carpetaOferta);
    check('copiada: lo avisa', (await texto(page, '#toast')).includes('«312. Gimnasio municipal de prueba» quedó en Gestión de Proyectos, con «Formulación», y el original en 0 OFERTAS ADJUDICADAS'), await texto(page, '#toast'));
    check('copiada: sin aviso en el editor ni punto de error', (await texto(page, '#ed-oferta')) === '' && !(await page.$('#ed-meta .meta-carpeta .dot.bad')));
    await wait(2500);
    const xAdj = (await arbol(page, BIB))['0 OFERTAS ADJUDICADAS/312. Gimnasio municipal de prueba/Formulación 312 v1.xlsx'];
    check('copiada: el Excel vuelve a escribirse, en el original de Adjudicadas', /^xlsx:/.test(xAdj || '') && xAdj !== antesX, xAdj);
    check('copiada: en «Gestión» quedó la copia', !!(await arbol(page, GES))['312. Gimnasio municipal de prueba/Formulación 312 v1.xlsx']);
    await page.click('#ed-meta .meta-carpeta'); await wait(300);
    dlg = await texto(page, '#modal[open]');
    check('copiada: el detalle dice dónde está cada una', dlg.includes('Formulación de proyectos › 0 OFERTAS ADJUDICADAS › 312. Gimnasio municipal de prueba') && dlg.includes('Gestión de Proyectos › 312. Gimnasio municipal de prueba'), dlg.slice(0, 400));
    await page.click('#modal button:has-text("Abrir la de Gestión de Proyectos")'); await wait(300);
    check('copiada: abre la copia de Gestión', (await lanzados(page)).slice(-1)[0] === 'quempin://carpeta/gestion/312.%20Gimnasio%20municipal%20de%20prueba', await lanzados(page));
    await abrir(page);
    const enLista = await page.$$eval('#list-body .proj-carpeta', (xs) => xs.map((e) => e.textContent));
    check('lista: «Adjudicada · … · copia en Gestión»', enLista.some((t) => t.includes('Adjudicada · 312. Gimnasio municipal de prueba · copia en Gestión')), enLista);
    await page.screenshot({ path: path.join(SHOTS, '5-lista.png') });

    // 9. «Dejarlo así»: si la copia no se hizo, el Excel vuelve a escribirse
    await abrir(page, `#/p/${uid2}/ficha`);
    await page.click('#ed-meta [data-picker="estado"]'); await wait(150);
    await page.click('.pop-item:has-text("Adjudicada")'); await wait(1400);
    await page.click('#modal .modal-foot button:has-text("Copiar la carpeta")'); await wait(600);
    check('otra copia pedida', !!(await proyecto(page, uid2)).vinculos.carpetaOferta.traslado);
    await page.click('#ed-oferta [data-act="oferta-traslado-cancelar"]').catch(() => {}); await wait(400);
    check('dejarlo así: se cancela el pedido', !(await proyecto(page, uid2)).vinculos.carpetaOferta.traslado);

    // 10. Un código escrito a mano no cambia al elegir la carpeta
    await abrir(page);
    await nuevo(page);
    await escribirEn(page, '#np-tit', 'Proyecto a mano');
    await page.check('#np-opciones input[value="ninguna"]');
    await crear(page);
    const uid6 = await uidAbierto(page);
    await page.fill('[data-f="codigo"]', 'KPH9'); await page.dispatchEvent('[data-f="codigo"]', 'input'); await wait(900);
    await page.evaluate(() => { location.hash = '#/'; }); await wait(600);
    await abrir(page, `#/p/${uid6}/ficha`);
    await page.click('#ed-oferta [data-act="oferta-elegir"]'); await wait(500);
    await page.fill('#cp-buscar', 'Quemador de prueba'); await page.dispatchEvent('#cp-buscar', 'input'); await wait(150);
    await page.click('#modal .cp-fila:not([hidden]):has-text("Quemador de prueba")');
    await page.click('#modal .modal-foot .btn-primario'); await wait(1200);
    const p6 = await proyecto(page, uid6);
    check('a mano: el código KPH9 se queda al elegir la carpeta', p6.codigo === 'KPH9' && p6.vinculos.carpetaOferta.nombre === 'Quemador de prueba', [p6.codigo, p6.vinculos.carpetaOferta]);

    // 10. Le corrigen el N° a la carpeta en la biblioteca (2026-10-26): el proyecto la sigue al abrirlo
    await page.evaluate(async ([bib]) => {
      const lib = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib);
      const o = await lib.getDirectoryHandle('313. Caldera sin número');
      const d = await lib.getDirectoryHandle('318. Caldera sin número', { create: true });
      for await (const [n, h] of o.entries()) {
        if (h.kind !== 'file') continue;
        const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(await (await h.getFile()).arrayBuffer()); await w.close();
      }
      await lib.removeEntry('313. Caldera sin número', { recursive: true });
    }, [BIB]);
    await abrir(page, `#/p/${p3a.uid}/ficha`);
    await page.waitForFunction((uid) => { const p = window.QStore.get(uid); return p && p.vinculos.carpetaOferta.nombre.startsWith('318.'); }, p3a.uid, { timeout: 8000 }).catch(() => {});
    const p10 = await proyecto(page, p3a.uid);
    check('renombrada: el vínculo sigue a la carpeta', p10.vinculos.carpetaOferta.nombre === '318. Caldera sin número' && p10.vinculos.carpetaOferta.ruta.join('/') === '318. Caldera sin número', p10.vinculos.carpetaOferta);
    check('renombrada: el código y el N° de requerimiento también', p10.codigo === '318. Caldera sin número' && p10.vinculos.requerimiento.numero == 318, [p10.codigo, p10.vinculos.requerimiento]);
    check('renombrada: lo avisa', /ahora se llama «318\. Caldera sin número»/.test(await texto(page, '#toast')), await texto(page, '#toast'));

    // 11. En el teléfono el formulario cabe sin desplazarse a lo ancho
    const tel = await equipo(browser, { width: 390, height: 844 });
    await abrir(tel.page);
    await tel.page.click('#compartida [data-act="compartir"]'); await wait(800);
    await nuevo(tel.page);
    await escribirEn(tel.page, '#np-num', '312');
    await conNombre(tel.page);
    const ancho = await tel.page.evaluate(() => ({ doc: document.documentElement.scrollWidth, dlg: document.querySelector('#modal').scrollWidth, vista: window.innerWidth }));
    check('teléfono: sin desborde lateral', ancho.doc <= ancho.vista && ancho.dlg <= ancho.vista, ancho);
    await tel.page.screenshot({ path: path.join(SHOTS, '6-telefono.png') });
    await tel.ctx.close();

    check('sin errores de JavaScript', errores.length === 0, errores);
  } catch (e) {
    check('la prueba terminó sin excepción', false, String(e && e.stack || e));
    await page.screenshot({ path: path.join(SHOTS, 'error.png') }).catch(() => {});
  }
  console.log(results.join('\n'));
  const fail = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fail}/${results.length} OK`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
