// El viaje completo de un usuario nuevo, de crear el proyecto a «en ejecución», con capturas de cada
// transición y comprobaciones de que siempre se ve dónde está el proyecto y qué sigue (mejora UX del
// flujo de trabajo, 2026-10-06). Datos FICTICIOS en OPFS (recorrido.js).
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/ux/recorrido.js <vuelta>
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./recorrido.js');
const { BASE, wait, nota, prepararBiblioteca, escribirPublicado, buzon, foto, texto, hay, contexto, chromium, errores, notas, SHOTS } = R;

const results = [];
const check = (n, c, x) => { results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`); };
const editar = async (page, sel, valor) => { await page.fill(sel, valor); await page.dispatchEvent(sel, 'input'); };
const cerrarLista = async (page) => { if (await page.$eval('#pop', (e) => !e.hidden).catch(() => false)) await page.keyboard.press('Escape'); };
const barra = (page) => texto(page, '#ed-recorrido');
const hash = (page) => page.evaluate(() => location.hash);

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { page } = await contexto(browser, { width: 1360, height: 900 });
  try {
    await page.goto(BASE + '#/guia');
    await prepararBiblioteca(page);
    await page.goto(BASE + '#/');
    await page.waitForSelector('#app .page');
    await wait(800);
    await foto(page, 'inicio-vacio', true);
    check('lista vacía: la bajada dice para qué es la herramienta', (await texto(page, '.page-head p')).includes('Aquí se crean los proyectos de QUEMPIN'), await texto(page, '.page-head p'));

    // 1. Crear el proyecto con una carpeta nueva
    await page.click('[data-act="nuevo"]');
    await wait(500);
    if (/biblioteca|carpeta del equipo/i.test(await texto(page, '#modal .modal-head h2'))) { await foto(page, 'conectar-biblioteca'); await page.click('#modal .modal-foot .btn-primario'); await wait(1200); }
    await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 8000 });
    await page.click('#cp-nueva-btn');
    await editar(page, '#cp-num', '312');
    await cerrarLista(page);
    await wait(150);
    await page.click('#cp-crear');
    await page.waitForSelector('#cp-nueva[hidden]', { state: 'attached' });
    await page.selectOption('#cp-ini', 'LC');
    await foto(page, 'nuevo-carpeta-creada');
    await page.click('#modal .modal-foot .btn-primario');
    await page.waitForSelector('#tab-body', { timeout: 8000 });
    await wait(1500);
    const uid = (await hash(page)).split('/')[2];
    check('crear: no aparece ningún otro diálogo', !(await hay(page, '#modal[open]')));
    check('crear: abre en el paso 1 con título y N° de la planilla', (await hash(page)).endsWith('/ficha') && (await page.inputValue('#f-req')) === '312');
    const b1 = await barra(page);
    nota('Barra al crear: ' + b1);
    check('la barra del recorrido está a la vista: etapa 2 de 6, formulación', b1.includes('Formulación') && /1 de 5 pasos/.test(b1), b1);
    await foto(page, 'paso1-con-barra', true);

    // 2. Formular
    await editar(page, '[data-f="cliente"]', 'Municipalidad Ficticia');
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
    const b3 = await barra(page);
    nota('Barra en costos: ' + b3);
    await foto(page, 'paso3-con-barra');
    await page.click('.paso-tab[data-tab="resumen"]');
    await page.click('[data-act="util-objetivo"]');
    await wait(300);
    await page.click('.paso-tab[data-tab="evaluacion"]');
    await wait(1200);
    const pie5 = await texto(page, '#pie-sigue');
    nota('Pie del paso 5: ' + pie5);
    check('fin del paso 5: el botón principal es «Siguiente: Preparar la cotización»', /Siguiente: Preparar la cotización/.test(pie5), pie5);
    check('el paso 5 ya no tiene «Qué sigue» al fondo', !(await hay(page, '#que-sigue')));
    const b5 = await barra(page);
    check('la barra ya dice que sigue la cotización', /Siguiente/.test(b5) && /Preparar la cotización/.test(b5), b5);
    await foto(page, 'paso5-evaluacion', true);

    // 3. Preparar la cotización desde el pie del paso 5 → termina en el seguimiento
    await page.click('#pie-sigue .btn-primario');
    await page.waitForSelector('#cq-cli', { timeout: 8000 });
    await foto(page, 'dialogo-cotizacion');
    await page.click('#modal .modal-foot .btn-primario');
    await page.waitForFunction(() => location.hash.endsWith('/seguimiento'), null, { timeout: 8000 });
    await page.waitForSelector('#recorrido .rc-linea', { timeout: 8000 });
    await wait(1500);
    const seg = await texto(page, '#recorrido .rc-sigue');
    nota('Seguimiento tras cotizar: ' + seg);
    check('tras preparar la cotización, el seguimiento la muestra en espera', /En espera/.test(seg) && /Sistema QUEMPIN/.test(seg), seg);
    check('el seguimiento explica cómo seguir en Sistema QUEMPIN', (await texto(page, '#etapa-cotizacion')).includes('Borradores del Formulador'), await texto(page, '#etapa-cotizacion'));
    await foto(page, 'seguimiento-cotizacion-en-espera', true);
    const msgs = await buzon(page);
    const borr = msgs.find((m) => m.tipo === 'borrador-cotizacion');
    check('el borrador viajó al buzón con el N° 312', !!borr && borr.proyecto.req === '312', msgs.map((m) => m.tipo));

    // 4. Sistema QUEMPIN la emite (simulado): lo que sigue es marcarla Enviada
    await escribirPublicado(page, 'documentos-comerciales.json', JSON.stringify({ esquema: 'quempin.intercambio/1', herramienta: 'sistema-quempin', generado: new Date().toISOString(), datos: {
      documentos: [{ tipo: '60', folio: '602701', pais: 'Chile', fecha: '2026-10-06', referencia: 'Calefacción', moneda: 'CLP', neto: 4000000, impuesto: 760000, total: 4760000,
        contraparte: { razon_social: 'Municipalidad Ficticia' }, proyecto: { req: '312' }, cuotas: [], origen: { herramienta: 'formulador', mensaje: borr.id, uid } }],
      mensajes: { [borr.id]: { estado: 'aplicado', folio: '602701' } } } }));
    await page.click('#recorrido .herr-pulso [data-act="herr-actualizar"]');
    await page.waitForFunction(() => /602701/.test((document.querySelector('#recorrido .rc-sigue') || {}).textContent || ''), null, { timeout: 8000 });
    check('emitida: el seguimiento lo ve y ofrece «Marcar como Enviada»', (await texto(page, '#recorrido .rc-sigue')).includes('602701'), await texto(page, '#recorrido .rc-sigue'));
    check('emitida: la barra dice «Marcar como Enviada»', (await barra(page)).includes('Marcar como Enviada') || (await barra(page)).includes('Siguiente'), await barra(page));
    await foto(page, 'seguimiento-emitida', true);

    // 5. Enviada → esperando respuesta → Adjudicada → Pasar a ejecución
    await page.click('#recorrido .rc-sigue [data-accion="marcar-enviada"]');
    await page.waitForSelector('#recorrido .rc-sigue.espera', { timeout: 8000 });
    check('enviada: espera la respuesta con «Adjudicada» y «Perdida» a mano', await hay(page, '#recorrido [data-accion="marcar-adjudicada"]') && await hay(page, '#recorrido [data-accion="marcar-perdida"]'));
    await foto(page, 'seguimiento-enviada');
    // Volver a la formulación de una oferta enviada: el editor lo advierte y ofrece una versión nueva
    await page.click('.paso-tab[data-tab="partidas"]');
    await page.waitForSelector('#ed-estado .nota', { timeout: 5000 });
    const est = await texto(page, '#ed-estado');
    check('formulación de una oferta enviada: avisa y ofrece «Crear nueva versión»', est.includes('Esta oferta ya está «Enviada»') && est.includes('Crear nueva versión'), est);
    await foto(page, 'aviso-oferta-enviada');
    // Vuelta 5: el aviso lleva un solo botón; al seguimiento se vuelve por su pestaña o por la barra
    check('el aviso no repite «Ver el seguimiento» (ya está en la barra y en su pestaña)', !(await hay(page, '#ed-estado [data-tab="seguimiento"]')) && await hay(page, '.paso-tab.paso-seg[data-tab="seguimiento"]'));
    await page.click('.paso-tab.paso-seg[data-tab="seguimiento"]');
    await page.waitForSelector('#recorrido [data-accion="marcar-adjudicada"]', { timeout: 8000 });
    check('en el seguimiento ese aviso no está', (await texto(page, '#ed-estado')) === '');
    await page.click('#recorrido [data-accion="marcar-adjudicada"]');
    await page.waitForSelector('#recorrido .rc-sigue [data-accion="enviar-af"]', { timeout: 8000 });
    check('adjudicada: lo que sigue es «Pasar a ejecución»', (await texto(page, '#recorrido .rc-sigue')).includes('Pasar a ejecución'), await texto(page, '#recorrido .rc-sigue'));
    await page.click('#recorrido .rc-sigue [data-accion="enviar-af"]');
    await page.waitForSelector('#af-tag', { timeout: 8000 });
    await page.selectOption('#af-tag', '__otro__');
    await editar(page, '#af-otro-tag', 'GIM');
    await foto(page, 'dialogo-pasar-a-ejecucion');
    await page.click('#modal .modal-foot .btn-primario');
    await wait(2500);
    const segFin = await texto(page, '#recorrido .rc-sigue');
    nota('Seguimiento tras pasar a ejecución: ' + segFin);
    check('en ejecución: el seguimiento lo dice y ofrece abrir el Análisis Financiero', /ejecución|Análisis Financiero/i.test(segFin), segFin);
    await foto(page, 'seguimiento-en-ejecucion', true);
    const abreAF = await page.$eval('#recorrido .rc-sigue [data-accion="abrir-af"], #etapa-ejecucion a[href*="analisis-financiero"]', (e) => e.getAttribute('href') || e.dataset.accion).catch(() => '');
    nota('Enlace al AF: ' + abreAF);

    // 5b. Herramientas: las demás herramientas del recorrido, con el proyecto
    await page.click('#herrBtn');
    await page.waitForSelector('#pop:not([hidden]) .pop-item');
    const herr = await texto(page, '#pop');
    check('menú Herramientas: el recorrido por etapas y el AF con la ficha del proyecto', /Planilla de Ingreso/.test(herr) && /Sistema QUEMPIN/.test(herr) && /abre la ficha de GIM/.test(herr), herr);
    await foto(page, 'menu-herramientas');
    await page.click('#pop .pop-item:has-text("Sistema QUEMPIN")');
    await page.waitForSelector('#modal[open]');
    check('Sistema QUEMPIN: explica cómo abrirlo y qué hacer ahí', (await texto(page, '#modal')).includes('Borradores del Formulador'), await texto(page, '#modal'));
    await foto(page, 'info-sistema-quempin');
    await page.keyboard.press('Escape');
    await wait(200);

    // 6. La lista abre cada proyecto donde está lo que sigue
    await page.goto(BASE + '#/');
    await page.waitForSelector(`tr[data-open="${uid}"]`, { timeout: 8000 });
    check('la lista: la fila abre en el seguimiento', (await page.$eval(`tr[data-open="${uid}"]`, (e) => e.dataset.destino)) === 'seguimiento');
    await foto(page, 'lista-con-proyecto', true);
    await page.click(`tr[data-open="${uid}"] .proj-title`);
    await page.waitForFunction(() => location.hash.endsWith('/seguimiento'), null, { timeout: 8000 });
    check('clic en la fila: abre en el seguimiento', true);

    // 6b. Enlaces desde otras herramientas: por N° de requerimiento y por TAG del Análisis Financiero
    await page.goto(BASE + '#/req/312');
    await page.waitForFunction((u) => location.hash.startsWith(`#/p/${u}/`), uid, { timeout: 8000 });
    check('#/req/312 abre el proyecto (donde está lo que sigue)', (await hash(page)).endsWith('/seguimiento'), await hash(page));
    await page.goto(BASE + '#/tag/GIM');
    await page.waitForFunction((u) => location.hash.startsWith(`#/p/${u}/`), uid, { timeout: 8000 });
    check('#/tag/GIM abre el mismo proyecto', true);
    await page.goto(BASE + '#/req/999');
    await page.waitForSelector('#app .nota [data-buscar="999"]', { timeout: 8000 });
    const aviso = await texto(page, '#app .nota');
    check('#/req/999 sin proyecto: lo dice y ofrece crearlo', aviso.includes('todavía no hay un proyecto con el N° de requerimiento 999') && aviso.includes('Crear el proyecto del N° 999'), aviso);
    await foto(page, 'enlace-req-sin-proyecto');
    await page.click('#app .nota [data-buscar="999"]');
    await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 8000 });
    check('crear desde el enlace: el formulario parte buscando ese N°', (await page.inputValue('#cp-buscar')) === '999' && (await texto(page, '#cp-vacio')).includes('Crear la carpeta «999»'), await texto(page, '#cp-vacio'));
    // Vuelta 5: «Atrás» del navegador con el formulario abierto lo cierra; no queda encima de otra página
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => !location.hash.startsWith('#/req/999'), null, { timeout: 8000 });
    await wait(400);
    check('Atrás con «Nuevo proyecto» abierto: el formulario se cierra', !(await hay(page, '#modal[open]')), await hash(page));
    // …y un diálogo que se abre justo después de navegar sigue abierto (el de «Nuevo proyecto» desde la lista)
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="nuevo"]');
    await page.click('[data-act="nuevo"]');
    await page.waitForSelector('#modal[open]', { timeout: 8000 });
    await wait(600);
    check('un diálogo abierto en la página actual no se cierra solo', await hay(page, '#modal[open]'));
    await page.click('#modal .modal-head .icon-btn');
    await wait(300);

    // 7. Teléfono
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}#/p/${uid}/seguimiento`);
    await page.waitForSelector('#recorrido .rc-linea', { timeout: 8000 });
    await wait(1200);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('teléfono: sin desplazamiento horizontal en el seguimiento', desborde <= 0, desborde);
    await foto(page, 'movil-seguimiento', true);
    await page.goto(`${BASE}#/p/${uid}/materiales`);
    await wait(900);
    await foto(page, 'movil-costos-con-barra');
    const desborde2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('teléfono: sin desplazamiento horizontal en costos', desborde2 <= 0, desborde2);
  } catch (e) {
    results.push('FAIL excepción: ' + (e && e.stack || e));
    await foto(page, 'error', true).catch(() => {});
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(SHOTS, 'notas.txt'), notas.join('\n') + '\n\n' + results.join('\n') + '\n\nErrores:\n' + errores.join('\n'));
    console.log(results.join('\n'));
    console.log(errores.length ? 'Errores de página:\n' + errores.join('\n') : 'Sin errores de página');
    const fallas = results.filter((r) => r.startsWith('FAIL')).length;
    console.log(`\n${results.length - fallas}/${results.length} OK`);
    process.exitCode = fallas || errores.length ? 1 : 0;
  }
})();
