// Pruebas funcionales de los flujos clave después del rediseño
const { chromium } = require(require('path').join(process.env.PW || require('path').join(process.env.LOCALAPPDATA || '', 'quempin-pruebas'), 'node_modules', 'playwright-core'));
const URL = 'http://127.0.0.1:8792/index.html';
const SH = __dirname + '/shots/';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('quempin_viz_unlocked', '1'); } catch (e) { /* */ } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8792' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const log = (...a) => console.log(...a);
  const ok = (cond, msg) => log((cond ? 'OK   ' : 'FALLA') + ' ' + msg);
  await page.goto(URL);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('quempin_fp_theme', 'light'); });
  await page.goto(URL + '#/');
  await page.waitForTimeout(300);
  // La carpeta del equipo es obligatoria desde el 2026-09-30: como un usuario ya configurado,
  // se conecta una vez una carpeta simulada (almacenamiento privado del navegador).
  await page.evaluate(async () => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Intercambio', { create: true });
    await window.QIntercambio.conectar();
    await window.QCompartida.sincronizar();
  });

  // T1: crear proyecto → partida → material → precio
  let clics = 0;
  await page.click('[data-act="nuevo"]'); clics++;
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.f === 'titulo'), 'el título queda enfocado al crear');
  await page.keyboard.type('Prueba de flujo');
  await page.click('.paso-pie [data-tab="partidas"]'); clics++;
  await page.click('[data-act="add-row"][data-list="partidas"]'); clics++;
  await page.keyboard.type('Medidor de prueba');
  await page.fill('[data-list="partidas"][data-k="cantidad"]', '3');
  await page.click('.paso-pie [data-tab="materiales"]'); clics++;
  await page.click('.tbl-toolbar [data-act="add-row"][data-list="materiales"]'); clics++;
  await page.keyboard.type('Flange');
  await page.fill('[data-list="materiales"][data-k="cantidad"]', '2');
  await page.fill('[data-list="materiales"][data-k="costoUnitario"]', '1000');
  await page.waitForTimeout(200);
  const precio = await page.textContent('#lectura .lectura-item .v');
  ok(precio.trim() === '$6.000', `T1 en ${clics} clics: precio neto ${precio.trim()} (esperado $6.000)`);
  ok((await page.getAttribute('[data-formula]', 'data-tip')).includes('2 Un. × $1.000 × 3'), 'ayuda emergente del subtotal muestra el cálculo');
  const pasos = await page.$$eval('#tabs .paso-tab:not(.paso-seg)', (els) => els.map((e) => e.className.match(/est-\w+/)[0]));
  log('     estado de los pasos:', pasos.join(' '));

  // Menú de fila: duplicar y eliminar
  await page.click('[data-menu="fila"][data-list="materiales"]');
  await page.click('.pop-item:has-text("Duplicar fila")');
  await page.waitForTimeout(150);
  ok((await page.$$('tr[data-row]')).length === 2, 'duplicar fila desde el menú ⋯');
  await page.click('tr[data-row]:nth-child(2) [data-menu="fila"]');
  await page.click('.pop-item:has-text("Eliminar")');
  await page.waitForTimeout(150);
  ok((await page.$$('tr[data-row]')).length === 1, 'eliminar fila desde el menú ⋯');

  // Partidas: subir/bajar y ver costos
  await page.click('#tabs [data-tab="partidas"]');
  await page.click('[data-act="add-row"][data-list="partidas"]');
  await page.keyboard.type('Segunda');
  await page.click('tr[data-row]:nth-child(2) [data-menu="fila"]');
  await page.click('.pop-item:has-text("Subir")');
  await page.waitForTimeout(150);
  const primera = await page.inputValue('tr[data-row]:nth-child(1) [data-k="descripcion"]');
  ok(primera === 'Segunda', 'subir partida desde el menú ⋯');
  await page.click('tr[data-row]:nth-child(2) [data-menu="fila"]');
  await page.click('.pop-item:has-text("Ver o agregar sus costos")');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => location.hash.endsWith('/materiales') && document.querySelector('#filtro-materiales').value !== ''), '«Ver o agregar sus costos» abre costos filtrados');

  // Ejemplo: paridad con el Excel
  await page.goto(URL + '#/');
  await page.waitForTimeout(200);
  await page.click('[data-menu="list-more"]');
  await page.click('.pop-item:has-text("Cargar proyecto de ejemplo")');
  await page.waitForTimeout(400);
  const cd = await page.textContent('#res-top .eq-card:first-child .v');
  const pn = await page.textContent('#res-top .eq-card.hero .v');
  ok(cd.trim() === '$2.046.404' && pn.trim() === '$4.092.808', `paridad con el Excel: ${cd.trim()} / ${pn.trim()}`);

  // T2: llevar al margen objetivo y copiar total neto
  await page.click('[data-act="util-objetivo"]');
  await page.waitForTimeout(150);
  const margen = await page.textContent('#utilidad tfoot [data-c="K:margen"]');
  await page.click('.cotiz-tot .fila.principal .copiar');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(margen.trim() === '30,0 %' && /^\d+$/.test(clip), `T2: margen ${margen.trim()}, copiado ${clip}`);
  ok((await page.textContent('#meta-margen')).includes('objetivo 30'), 'meta del margen bajo el total: ' + (await page.textContent('#meta-margen')));
  await page.click('#util-undo');
  await page.waitForTimeout(150);
  ok((await page.textContent('#utilidad tfoot [data-c="K:margen"]')).trim() === '50,0 %', 'deshacer vuelve al 50,0 %');

  // T3: corregir costo sin partida desde el aviso
  await page.click('#lectura [data-menu="alertas"]');
  await page.waitForTimeout(100);
  await page.screenshot({ path: SH + 'flujo-alertas.png', clip: { x: 700, y: 180, width: 666, height: 360 } });
  await page.click('.pop-item:has-text("sin partida"), .pop-item:has-text("no tiene partida")');
  await page.waitForTimeout(400);
  const abierto = await page.evaluate(() => !document.querySelector('#pop').hidden && document.querySelector('#pop .pop-list').getAttribute('role'));
  ok(page.url().endsWith('/otros') && abierto === 'listbox', 'T3: la alerta lleva a Otros y abre el selector de partida');
  await page.click('.pop-item[role="option"]:has-text("P1")');
  await page.waitForTimeout(200);
  const alertas = await page.textContent('#lectura [data-menu="alertas"]');
  // La fila del ejemplo tiene costo cero: con su partida pasa de error («no se suma») a aviso («costo cero»),
  // también en la versión del 2026-10-05 (verificado el 2026-10-06 contra HEAD)
  ok(!alertas.includes('✖') && alertas.includes('▲ 1'), 'T3: el error desaparece al asignar la partida (queda el aviso de costo cero)' + (!alertas.includes('✖') ? '' : ` (alertas: ${alertas.trim()})`));

  // Evaluación
  await page.click('#tabs [data-tab="evaluacion"]');
  await page.waitForTimeout(200);
  const titular = await page.textContent('.ver-titular');
  log('     veredicto:', titular.trim());
  await page.screenshot({ path: SH + 'flujo-evaluacion.png', fullPage: true });
  await page.fill('#sens-mo', '80');
  await page.waitForTimeout(150);
  log('     con MO +80 %:', (await page.textContent('.ver-titular')).trim(), '|', (await page.textContent('.sens-lectura')).trim().replace(/\s+/g, ' '));
  await page.click('[data-act="sens-reset"]');

  // Imprimir: vista combinada y regreso
  await page.evaluate(() => { window.print = () => { window.__impreso = document.querySelectorAll('#res-top, #res-kpis').length; setTimeout(() => window.dispatchEvent(new Event('afterprint')), 50); }; });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.click('[data-menu="editor-more"]');
  await page.click('.pop-item:has-text("Imprimir resumen")');
  await page.waitForTimeout(500);
  ok((await page.evaluate(() => window.__impreso)) === 2 && (await page.$$('.paso-pie')).length === 1, 'imprimir: utilidad + evaluación en una página y luego vuelve');

  // T4: configuración editable
  await page.goto(URL + '#/');
  await page.waitForTimeout(200);
  await page.click('[data-act="config"]');
  await page.fill('#cfg-n1', '50000');
  await page.click('.modal-foot .btn-primario');
  await page.waitForTimeout(200);
  await page.click('[data-act="nuevo"]');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.QStore.getConfig().parametros.tarifaN1 === 50000), 'T4: tarifa predeterminada guardada desde Configuración');
  ok((await page.textContent('#res-f-precio')).includes('$50.000'), 'el proyecto nuevo parte con la tarifa nueva');

  // Listado: filtro por estado
  await page.goto(URL + '#/');
  await page.waitForTimeout(300);
  await page.screenshot({ path: SH + 'flujo-listado.png', fullPage: true });
  await page.click('.chip-estado:has-text("Borrador")');
  await page.waitForTimeout(150);
  ok((await page.textContent('#list-foot')).includes('Estado'), 'filtro por estado desde los chips');

  // Teclado: Enter en la última fila agrega otra
  log(errs.length ? 'ERRORES:\n' + errs.join('\n') : 'Sin errores de JavaScript');
  await browser.close();
})();
