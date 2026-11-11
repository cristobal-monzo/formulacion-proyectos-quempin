// «+ Crear nueva carpeta» al crear un proyecto (pedido del usuario, 2026-10-06): validación del nombre,
// carpeta repetida, creación, selección automática, iniciales en el mismo formulario y proyecto creado
// sin diálogos extra. Biblioteca simulada en OPFS con datos FICTICIOS (recorrido.js).
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/ux/carpeta.js
'use strict';
const path = require('path');
const R = require('./recorrido.js');
const { BASE, wait, prepararBiblioteca, buzon, carpetasRaiz, foto, texto, hay, contexto, chromium, errores } = R;

const results = [];
const cerrarLista = async (page) => { if (await page.$eval('#pop', (e) => !e.hidden).catch(() => false)) await page.keyboard.press('Escape'); };
const check = (n, c, x) => { results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const { page } = await contexto(browser, { width: 1360, height: 900 });
    await page.goto(BASE + '#/guia');
    await prepararBiblioteca(page);
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="nuevo"]');
    await wait(500);
    await page.click('[data-act="nuevo"]');
    await wait(500);
    if (/Conectar|carpeta del equipo|biblioteca/i.test(await texto(page, '#modal .modal-head h2'))) { await page.click('#modal .modal-foot .btn-primario'); await wait(1200); }
    await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 8000 });
    check('el formulario se llama «Nuevo proyecto»', (await texto(page, '#modal .modal-head h2')) === 'Nuevo proyecto', await texto(page, '#modal .modal-head h2'));
    check('«Crear proyecto» parte deshabilitado (no hay carpeta elegida)', await page.$eval('#modal .modal-foot .btn-primario', (b) => b.disabled && b.textContent.trim() === 'Crear proyecto'));
    check('ofrece «Crear nueva carpeta»', await hay(page, '#cp-nueva-btn'));
    check('pide las iniciales en el mismo formulario (primera vez en este navegador)', await hay(page, '#cp-ini'));
    await foto(page, 'carpeta-formulario');

    // Búsqueda sin resultado: no es un callejón sin salida
    await page.fill('#cp-buscar', 'Gimnasio municipal');
    await page.dispatchEvent('#cp-buscar', 'input');
    await wait(150);
    const vacio = await texto(page, '#cp-vacio');
    check('sin coincidencias: ofrece crear esa carpeta', vacio.includes('Crear la carpeta «Gimnasio municipal»'), vacio);
    await foto(page, 'carpeta-sin-resultado');
    await page.click('#cp-vacio [data-crear]');
    await wait(200);
    check('abre el panel con el nombre buscado', !(await page.$eval('#cp-nueva', (e) => e.hidden)) && (await page.inputValue('#cp-tit')) === 'Gimnasio municipal', await page.inputValue('#cp-tit'));
    check('mientras se crea, «Crear proyecto» sigue deshabilitado', await page.$eval('#modal .modal-foot .btn-primario', (b) => b.disabled));

    // Validaciones
    await page.fill('#cp-tit', '');
    await page.dispatchEvent('#cp-tit', 'input');
    await page.click('#cp-crear');
    await wait(150);
    check('nombre vacío: error claro', (await texto(page, '#cp-previa')).includes('Escribe el nombre de la oferta'), await texto(page, '#cp-previa'));
    await page.fill('#cp-num', '301');
    await page.dispatchEvent('#cp-num', 'input');
    await page.keyboard.press('Escape');   // cierra la lista de requerimientos
    await wait(150);
    const rep = await texto(page, '#cp-previa');
    check('N° que ya tiene carpeta: lo dice y ofrece usarla', rep.includes('Ya existe la carpeta «301. Medidores gas natural colegio (ficticio)»') && rep.includes('Usar esa carpeta'), rep);
    await foto(page, 'carpeta-repetida');
    await page.fill('#cp-num', 'abc');
    await page.dispatchEvent('#cp-num', 'input');
    check('el N° solo acepta dígitos', (await page.inputValue('#cp-num')) === '', await page.inputValue('#cp-num'));
    await page.fill('#cp-tit', 'Calderas: sector A/B');
    await page.dispatchEvent('#cp-tit', 'input');
    await wait(100);
    check('caracteres no válidos: muestra el nombre que quedará', (await texto(page, '#cp-previa')).includes('«Calderas- sector A-B»'), await texto(page, '#cp-previa'));

    // N° de la planilla: completa el nombre
    await page.fill('#cp-tit', '');
    await page.dispatchEvent('#cp-tit', 'input');
    await page.fill('#cp-num', '');
    await page.keyboard.press('Escape');
    await wait(100);
    await page.click('#cp-nueva .combo-btn');
    await wait(250);
    const opciones = await page.$$eval('#pop .pop-item', (xs) => xs.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    check('la lista del N° muestra primero los requerimientos sin carpeta', opciones.length >= 2 && /312/.test(opciones[0]) && !opciones.some((o) => /^301/.test(o)), opciones);
    await foto(page, 'carpeta-lista-requerimientos');
    await page.click('#pop .pop-item:has-text("312")');
    await wait(200);
    check('elegir el N° completa el nombre desde la planilla', (await page.inputValue('#cp-tit')) === 'Calefacción gimnasio municipal (ficticio)', await page.inputValue('#cp-tit'));
    check('vista previa «312. Nombre»', (await texto(page, '#cp-previa')).includes('«312. Calefacción gimnasio municipal (ficticio)»'), await texto(page, '#cp-previa'));
    await foto(page, 'carpeta-panel-listo');

    // Crear
    await page.click('#cp-crear');
    await page.waitForSelector('#cp-nueva[hidden]', { state: 'attached', timeout: 5000 });
    await wait(200);
    const raiz = await carpetasRaiz(page);
    check('la carpeta existe en la biblioteca', raiz.includes('312. Calefacción gimnasio municipal (ficticio)'), raiz);
    const sel = await page.$$eval('#modal .cp-fila.sel', (xs) => xs.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    check('queda elegida automáticamente, marcada como nueva', sel.length === 1 && sel[0].includes('312') && sel[0].includes('Nueva'), sel);
    const res = await texto(page, '#cp-elegida');
    check('el resumen dice que se creó y qué toma de la planilla', res.includes('Carpeta creada y elegida: 312. Calefacción') && res.includes('Toma de la Planilla de Ingreso (N° 312)') && res.includes('Rancagua'), res);
    check('«Crear proyecto» queda habilitado', await page.$eval('#modal .modal-foot .btn-primario', (b) => !b.disabled));
    await foto(page, 'carpeta-creada-elegida');

    // Iniciales obligatorias con carpeta
    await page.selectOption('#cp-ini', '');
    await page.click('#modal .modal-foot .btn-primario');
    await wait(200);
    check('sin iniciales no se cierra y lo explica', (await hay(page, '#modal[open]')) && (await texto(page, '#cp-ini-hint')).includes('Elige tus iniciales'), await texto(page, '#cp-ini-hint'));
    await page.selectOption('#cp-ini', 'SV');
    await page.click('#modal .modal-foot .btn-primario');
    await page.waitForSelector('#tab-body', { timeout: 8000 });
    await wait(1500);
    check('el proyecto se abre sin otro diálogo', !(await hay(page, '#modal[open]')), await texto(page, '#modal'));
    check('título y N° de requerimiento desde la planilla', (await page.inputValue('[data-f="titulo"]')) === 'Calefacción gimnasio municipal (ficticio)' && (await page.inputValue('#f-req')) === '312');
    check('el encabezado muestra la carpeta nueva', (await texto(page, '#ed-meta')).includes('312. Calefacción gimnasio municipal (ficticio)'), await texto(page, '#ed-meta'));
    await wait(1500);
    const msgs = await buzon(page);
    const reg = msgs.find((m) => m.tipo === 'registro-documento');
    check('la evaluación de costos tomó su N° con las iniciales del formulario', !!reg && reg.documento.autor === 'SV', reg && reg.documento);
    await foto(page, 'carpeta-proyecto-abierto');

    // Doble clic elige y confirma; ya no pide iniciales (las recuerda)
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="nuevo"]');
    await page.click('[data-act="nuevo"]');
    await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 8000 });
    check('la segunda vez no vuelve a pedir las iniciales', !(await hay(page, '#cp-ini')));
    await page.dblclick('#modal .cp-fila:has(.code-badge:text-is("290"))');
    await page.waitForSelector('#tab-body', { timeout: 8000 });
    await wait(600);
    check('doble clic en una carpeta crea el proyecto ahí', (await texto(page, '#ed-meta')).includes('290. Mantención calderas (ficticio)'), await texto(page, '#ed-meta'));

    // «Usar esa carpeta» desde el aviso de repetida
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="nuevo"]');
    await page.click('[data-act="nuevo"]');
    await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 8000 });
    await page.click('#cp-nueva-btn');
    await page.fill('#cp-num', '275');
    await page.dispatchEvent('#cp-num', 'input');
    await cerrarLista(page);
    await wait(150);
    await page.click('#cp-previa [data-usar]');
    await wait(200);
    const sel2 = await page.$$eval('#modal .cp-fila.sel', (xs) => xs.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
    check('«Usar esa carpeta» cierra el panel y elige la existente', sel2.length === 1 && sel2[0].includes('275') && await page.$eval('#cp-nueva', (e) => e.hidden), sel2);
    // Cancelar no crea nada
    await page.click('#modal .modal-foot button:has-text("Cancelar")');
    await wait(300);
    check('Cancelar cierra sin crear proyecto', !(await hay(page, '#modal[open]')) && (await page.evaluate(() => location.hash)) === '#/');

    // Error al crear (la biblioteca rechaza): mensaje y se puede reintentar
    await page.click('[data-act="nuevo"]');
    await page.waitForSelector('#modal[open] #cp-buscar', { timeout: 8000 });
    await page.evaluate(() => { window.__crear = window.QOferta.crearCarpeta; window.QOferta.crearCarpeta = async () => { await new Promise((r) => setTimeout(r, 400)); throw new Error('El navegador no tiene permiso para crear carpetas en la biblioteca.'); }; });
    await page.click('#cp-nueva-btn');
    await page.fill('#cp-tit', 'Oferta con error');
    await page.dispatchEvent('#cp-tit', 'input');
    await page.click('#cp-crear');
    await wait(120);
    check('mientras crea: botón «Creando la carpeta…» deshabilitado', await page.$eval('#cp-crear', (b) => b.disabled && b.textContent.includes('Creando')));
    await foto(page, 'carpeta-creando');
    await wait(600);
    check('error al crear: mensaje visible y el panel sigue abierto', (await texto(page, '#cp-previa')).includes('No se pudo crear la carpeta: El navegador no tiene permiso') && !(await page.$eval('#cp-nueva', (e) => e.hidden)), await texto(page, '#cp-previa'));
    check('tras el error se puede reintentar', await page.$eval('#cp-crear', (b) => !b.disabled));
    await foto(page, 'carpeta-error');
    await page.evaluate(() => { window.QOferta.crearCarpeta = window.__crear; });

    // Teléfono
    const m = await contexto(browser, { width: 390, height: 844 });
    await m.page.goto(BASE + '#/guia');
    await prepararBiblioteca(m.page);
    await m.page.goto(BASE + '#/');
    await m.page.waitForSelector('[data-act="nuevo"]');
    await m.page.click('[data-act="nuevo"]');
    await wait(500);
    if (/Conectar|carpeta del equipo|biblioteca/i.test(await texto(m.page, '#modal .modal-head h2'))) { await m.page.click('#modal .modal-foot .btn-primario'); await wait(1200); }
    await m.page.waitForSelector('#modal[open] #cp-buscar', { timeout: 8000 });
    await m.page.click('#cp-nueva-btn');
    await m.page.fill('#cp-num', '311');
    await m.page.dispatchEvent('#cp-num', 'input');
    await cerrarLista(m.page);
    await wait(200);
    await foto(m.page, 'movil-carpeta-panel');
    const ancho = await m.page.evaluate(() => document.querySelector('#modal').scrollWidth <= document.querySelector('#modal').clientWidth + 1);
    check('teléfono: el formulario no se desborda a lo ancho', ancho);
  } catch (e) {
    results.push('FAIL excepción: ' + (e && e.stack || e));
  } finally {
    await browser.close();
    console.log(results.join('\n'));
    console.log(errores.length ? 'Errores de página:\n' + errores.join('\n') : 'Sin errores de página');
    const fallas = results.filter((r) => r.startsWith('FAIL')).length;
    console.log(`\n${results.length - fallas}/${results.length} OK`);
    process.exitCode = fallas || errores.length ? 1 : 0;
  }
})();
