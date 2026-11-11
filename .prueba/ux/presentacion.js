// Capturas limpias para la presentación «Herramientas QUEMPIN: qué cambia» (2026-10-06): el mismo
// recorrido de viaje.js y los estados del formulario de carpeta de carpeta.js, a 1440×900 con
// resolución 1,5× y sin los avisos pasajeros (salvo donde el aviso es lo que se muestra).
// Datos FICTICIOS en OPFS (recorrido.js). No escribe nada fuera del navegador de prueba.
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/ux/presentacion.js
'use strict';
const R = require('./recorrido.js');
const { BASE, BIBLIOTECA, wait, prepararBiblioteca, escribirPublicado, buzon, foto, texto, hay, chromium, errores } = R;

const editar = async (page, sel, valor) => { await page.fill(sel, valor); await page.dispatchEvent(sel, 'input'); };
const cerrarLista = async (page) => { if (await page.$eval('#pop', (e) => !e.hidden).catch(() => false)) await page.keyboard.press('Escape'); };
const hash = (page) => page.evaluate(() => location.hash);
const avisos = (page, ver) => page.evaluate((ver) => {
  let s = document.getElementById('sin-avisos');
  if (!ver && !s) { s = document.createElement('style'); s.id = 'sin-avisos'; s.textContent = '#toast{visibility:hidden !important}'; document.head.appendChild(s); }
  if (ver && s) s.remove();
}, ver);

async function contexto(browser, viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'es-CL', deviceScaleFactor: 1.5 });
  await ctx.addInitScript((bib) => {
    try { localStorage.setItem('quempin_viz_unlocked', '1'); } catch (e) { /* */ }
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true });
    FileSystemHandle.prototype.queryPermission = async function () { return 'granted'; };
    FileSystemHandle.prototype.requestPermission = async function () { return 'granted'; };
    window.open = (u) => { window.__abiertos = (window.__abiertos || []).concat(String(u)); return null; };
  }, BIBLIOTECA);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  return { ctx, page };
}

async function abrirNuevo(page) {
  await page.click('[data-act="nuevo"]');
  await wait(500);
  if (/Conectar|carpeta del equipo|biblioteca/i.test(await texto(page, '#modal .modal-head h2'))) { await page.click('#modal .modal-foot .btn-primario'); await wait(1200); }
  await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 8000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const V = { width: 1440, height: 900 };
  try {
    // ---- 1. Los estados del formulario de carpeta (un navegador aparte) ----
    {
      const { page } = await contexto(browser, V);
      await page.goto(BASE + '#/guia');
      await prepararBiblioteca(page);
      await page.goto(BASE + '#/');
      await page.waitForSelector('[data-act="nuevo"]');
      await avisos(page, false);
      await abrirNuevo(page);
      await wait(300);
      await foto(page, 'carpeta-formulario');
      await editar(page, '#cp-buscar', 'Gimnasio municipal');
      await wait(200);
      await foto(page, 'carpeta-sin-resultado');
      await page.click('#cp-vacio [data-crear]');
      await wait(200);
      await editar(page, '#cp-num', '301');
      await page.keyboard.press('Escape');
      await wait(200);
      await foto(page, 'carpeta-repetida');
      await editar(page, '#cp-tit', '');
      await page.fill('#cp-num', '');
      await page.keyboard.press('Escape');
      await wait(100);
      await page.click('#cp-nueva .combo-btn');
      await wait(300);
      await foto(page, 'carpeta-lista-requerimientos');
      await page.click('#pop .pop-item:has-text("312")');
      await wait(250);
      await foto(page, 'carpeta-panel-listo');
      // Error al crear (la biblioteca lo rechaza) y estado «Creando…»
      await page.evaluate(() => { window.__crear = window.QOferta.crearCarpeta; window.QOferta.crearCarpeta = async () => { await new Promise((r) => setTimeout(r, 900)); throw new Error('El navegador no tiene permiso para crear carpetas en la biblioteca.'); }; });
      await page.click('#cp-crear');
      await wait(150);
      await foto(page, 'carpeta-creando');
      await wait(1100);
      await foto(page, 'carpeta-error');
      await page.evaluate(() => { window.QOferta.crearCarpeta = window.__crear; });
      await page.close();
    }

    // ---- 2. El recorrido completo de un proyecto ----
    const { page } = await contexto(browser, V);
    await page.goto(BASE + '#/guia');
    await prepararBiblioteca(page);
    await page.goto(BASE + '#/');
    await page.waitForSelector('#app .page');
    await avisos(page, false);
    await wait(800);
    await foto(page, 'inicio');

    await abrirNuevo(page);
    await page.click('#cp-nueva-btn');
    await editar(page, '#cp-num', '312');
    await cerrarLista(page);
    await wait(150);
    await page.click('#cp-crear');
    await page.waitForSelector('#cp-nueva[hidden]', { state: 'attached' });
    await page.selectOption('#cp-ini', 'LC');
    await wait(200);
    await foto(page, 'carpeta-creada-elegida');
    await avisos(page, true);
    await page.click('#modal .modal-foot .btn-primario');
    await page.waitForSelector('#tab-body', { timeout: 8000 });
    await wait(1400);
    await foto(page, 'proyecto-creado');
    await avisos(page, false);
    const uid = (await hash(page)).split('/')[2];

    await editar(page, '[data-f="cliente"]', 'Municipalidad Ficticia');
    await page.selectOption('[data-f="responsable"]', 'LC');
    await page.click('.paso-pie .btn-primario');
    await wait(300);
    await page.click('[data-act="add-row"][data-list="partidas"]');
    await editar(page, '[data-list="partidas"][data-k="descripcion"]', 'Caldera y conexiones');
    await editar(page, '[data-list="partidas"][data-k="cantidad"]', '1');
    await page.click('.paso-pie [data-act="tab"]:has-text("Siguiente")');
    await wait(300);
    await page.click('[data-act="add-row"][data-list="materiales"]');
    await editar(page, '[data-list="materiales"][data-k="descripcion"]', 'Caldera mural (ficticia)');
    await editar(page, '[data-list="materiales"][data-k="cantidad"]', '1');
    await editar(page, '[data-list="materiales"][data-k="costoUnitario"]', '2400000');
    await page.click('.subtab[data-tab="manoObra"]');
    await page.click('[data-act="add-row"][data-list="manoObra"]');
    await editar(page, '[data-list="manoObra"][data-k="descripcion"]', 'Montaje');
    await editar(page, '[data-list="manoObra"][data-k="n1p"]', '2');
    await editar(page, '[data-list="manoObra"][data-k="n1d"]', '3');
    await wait(300);
    await foto(page, 'paso3-costos');
    await page.click('.paso-tab[data-tab="resumen"]');
    await page.click('[data-act="util-objetivo"]');
    await wait(300);
    await page.click('.paso-tab[data-tab="evaluacion"]');
    await wait(1200);
    await foto(page, 'paso5-evaluacion');

    await page.click('#pie-sigue .btn-primario');
    await page.waitForSelector('#cq-cli', { timeout: 8000 });
    await wait(300);
    await foto(page, 'dialogo-cotizacion');
    await page.click('#modal .modal-foot .btn-primario');
    await page.waitForFunction(() => location.hash.endsWith('/seguimiento'), null, { timeout: 8000 });
    await page.waitForSelector('#recorrido .rc-linea', { timeout: 8000 });
    await wait(1500);
    await foto(page, 'seguimiento-en-espera');
    const borr = (await buzon(page)).find((m) => m.tipo === 'borrador-cotizacion');

    // Sistema QUEMPIN la emite (simulado)
    await escribirPublicado(page, 'documentos-comerciales.json', JSON.stringify({ esquema: 'quempin.intercambio/1', herramienta: 'sistema-quempin', generado: new Date().toISOString(), datos: {
      documentos: [{ tipo: '60', folio: '602701', pais: 'Chile', fecha: '2026-10-06', referencia: 'Calefacción', moneda: 'CLP', neto: 4000000, impuesto: 760000, total: 4760000,
        contraparte: { razon_social: 'Municipalidad Ficticia' }, proyecto: { req: '312' }, cuotas: [], origen: { herramienta: 'formulador', mensaje: borr.id, uid } }],
      mensajes: { [borr.id]: { estado: 'aplicado', folio: '602701' } } } }));
    await page.click('#recorrido .herr-pulso [data-act="herr-actualizar"]');
    await page.waitForFunction(() => /602701/.test((document.querySelector('#recorrido .rc-sigue') || {}).textContent || ''), null, { timeout: 8000 });
    await wait(500);
    await foto(page, 'seguimiento-emitida');

    await page.click('#recorrido .rc-sigue [data-accion="marcar-enviada"]');
    await page.waitForSelector('#recorrido .rc-sigue.espera', { timeout: 8000 });
    await page.click('.paso-tab[data-tab="partidas"]');
    await page.waitForSelector('#ed-estado .nota', { timeout: 5000 });
    await wait(1200);
    await foto(page, 'aviso-oferta-enviada');
    await page.click('.paso-tab.paso-seg[data-tab="seguimiento"]');
    await page.waitForSelector('#recorrido [data-accion="marcar-adjudicada"]', { timeout: 8000 });
    await page.click('#recorrido [data-accion="marcar-adjudicada"]');
    await page.waitForSelector('#recorrido .rc-sigue [data-accion="enviar-af"]', { timeout: 8000 });
    await page.click('#recorrido .rc-sigue [data-accion="enviar-af"]');
    await page.waitForSelector('#af-tag', { timeout: 8000 });
    await page.selectOption('#af-tag', '__otro__');
    await editar(page, '#af-otro-tag', 'GIM');
    await wait(300);
    await foto(page, 'dialogo-pasar-a-ejecucion');
    await page.click('#modal .modal-foot .btn-primario');
    await wait(3000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(300);
    await foto(page, 'seguimiento-en-ejecucion');
    await page.$eval('#etapa-ejecucion', (e) => e.scrollIntoView({ block: 'center' }));
    await wait(400);
    await foto(page, 'seguimiento-etapa-ejecucion');
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.click('#herrBtn');
    await page.waitForSelector('#pop:not([hidden]) .pop-item');
    await wait(300);
    await foto(page, 'menu-herramientas');
    await page.click('#pop .pop-item:has-text("Sistema QUEMPIN")');
    await page.waitForSelector('#modal[open]');
    await wait(300);
    await foto(page, 'info-sistema-quempin');
    await page.keyboard.press('Escape');
    await wait(300);

    await page.goto(BASE + '#/');
    await page.waitForSelector('tr[data-open]');
    await wait(600);
    await foto(page, 'lista-con-proyecto');
    await page.goto(BASE + '#/req/999');
    await page.waitForSelector('#app .nota [data-buscar="999"]', { timeout: 8000 });
    await wait(400);
    await foto(page, 'enlace-req-sin-proyecto');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}#/p/${uid}/seguimiento`);
    await page.waitForSelector('#recorrido .rc-linea', { timeout: 8000 });
    await wait(1200);
    await foto(page, 'movil-seguimiento');
    await page.goto(`${BASE}#/p/${uid}/materiales`);
    await wait(900);
    await foto(page, 'movil-costos');
  } catch (e) {
    console.error('ERROR', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    console.log(errores.length ? 'Errores de página:\n' + errores.join('\n') : 'Sin errores de página');
  }
})();
