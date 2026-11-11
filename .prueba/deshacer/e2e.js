// Prueba de Deshacer / Rehacer (Ctrl+Z / Ctrl+Y) en el editor (2026-10-09).
// Datos FICTICIOS (el proyecto de ejemplo del repo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/deshacer/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = 'http://127.0.0.1:8799/index.html';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ejemplos', 'QPN-EJEMPLO_medidores-gn.json'), 'utf8'));
const KEY = 'qpn.formulacion.proyectos.v1';
const UID = EJ.uid;
const MAT = EJ.materiales[0].uid;            // Flanges de 2'': cantidad 2, costo 14580
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const celda = (k, uid) => `[data-list="materiales"][data-uid="${uid || MAT}"][data-k="${k}"]`;

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, locale: 'es-CL' });
  // Proyecto grande para medir el costo por tecla
  const grande = JSON.parse(JSON.stringify(EJ));
  Object.assign(grande, { uid: 'grande000001', codigo: 'QPN-GRANDE' });
  grande.materiales = Array.from({ length: 1500 }, (_, i) => ({ uid: 'm' + String(i).padStart(11, '0'), descripcion: `Material de prueba ${i}`, partida: EJ.partidas[i % 3].uid, unidad: 'Un.', cantidad: 1 + (i % 7), costoUnitario: 1000 + i }));
  await ctx.addInitScript(([ej, grande, key]) => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('quempin_formulador_unlocked', '1');
    localStorage.setItem(key, JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: [ej, grande] }));
  }, [EJ, grande, KEY]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  const guardado = (uid) => page.evaluate(([k, u]) => JSON.parse(localStorage.getItem(k)).proyectos.find((p) => p.uid === u), [KEY, uid || UID]);
  const valor = (sel) => page.$eval(sel, (e) => e.value).catch(() => null);
  const estadoBotones = () => page.evaluate(() => ['#ed-deshacer', '#ed-rehacer'].map((s) => { const b = document.querySelector(s); return b ? b.getAttribute('aria-disabled') : 'falta'; }));

  try {
    // 1. Al abrir: los dos botones están y no hay nada que deshacer
    await page.goto(`${BASE}#/p/${UID}/materiales`);
    await page.waitForSelector(celda('cantidad'));
    check('botones Deshacer y Rehacer en el encabezado, inactivos al abrir', JSON.stringify(await estadoBotones()) === '["true","true"]', await estadoBotones());
    await page.keyboard.press('Control+z');
    await wait(150);
    check('Ctrl+Z sin cambios avisa que no hay nada', (await page.textContent('#toast')).includes('No hay cambios que deshacer'), await page.textContent('#toast'));

    // 2. Escribir en una celda es un solo paso, aunque sean varias teclas con pausas
    await page.click(celda('cantidad'));
    await page.fill(celda('cantidad'), '');
    await page.keyboard.type('1', { delay: 30 });
    await wait(500);
    await page.keyboard.type('5', { delay: 30 });
    check('la celda queda en 15', (await valor(celda('cantidad'))) === '15');
    check('Deshacer se activa', (await estadoBotones())[0] === 'false', await estadoBotones());
    // Otra celda: otro paso
    await page.click(celda('costoUnitario'));
    await page.fill(celda('costoUnitario'), '999');
    await wait(500);
    const g1 = await guardado();
    check('los cambios se guardan', g1.materiales[0].cantidad === 15 && g1.materiales[0].costoUnitario === 999, g1.materiales[0]);

    // 3. Ctrl+Z dentro de la celda: deshace el proyecto, no solo el texto
    await page.keyboard.press('Control+z');
    await wait(150);
    check('Ctrl+Z vuelve el costo a 14580', (await valor(celda('costoUnitario'))) === '14580', await valor(celda('costoUnitario')));
    check('la cantidad sigue en 15', (await valor(celda('cantidad'))) === '15');
    check('el foco queda en la celda deshecha', await page.evaluate((s) => document.activeElement === document.querySelector(s), celda('costoUnitario')));
    check('aviso «Cambio deshecho»', (await page.textContent('#toast')).includes('Cambio deshecho'), await page.textContent('#toast'));
    await page.keyboard.press('Control+z');
    await wait(150);
    check('el segundo Ctrl+Z deshace «15» entero (un paso)', (await valor(celda('cantidad'))) === '2', await valor(celda('cantidad')));
    check('nada más que deshacer y Rehacer activo', JSON.stringify(await estadoBotones()) === '["true","false"]', await estadoBotones());
    await wait(600);
    const g2 = await guardado();
    check('lo deshecho se guarda', g2.materiales[0].cantidad === 2 && g2.materiales[0].costoUnitario === 14580, g2.materiales[0]);
    check('el total vuelve al del Excel', await page.evaluate(() => document.body.textContent.includes('4.092.808')));

    // 4. Ctrl+Y y Ctrl+Shift+Z rehacen
    await page.keyboard.press('Control+y');
    await wait(150);
    check('Ctrl+Y rehace la cantidad', (await valor(celda('cantidad'))) === '15', await valor(celda('cantidad')));
    await page.keyboard.press('Control+Shift+z');
    await wait(150);
    check('Ctrl+Shift+Z rehace el costo', (await valor(celda('costoUnitario'))) === '999', await valor(celda('costoUnitario')));
    check('nada más que rehacer', JSON.stringify(await estadoBotones()) === '["false","true"]', await estadoBotones());

    // 5. Un cambio nuevo después de deshacer descarta lo que había para rehacer
    await page.keyboard.press('Control+z');
    await wait(150);
    await page.click(celda('descripcion'));
    await page.keyboard.type(' (editado)');
    await wait(150);
    check('editar después de deshacer deja Rehacer inactivo', (await estadoBotones())[1] === 'true', await estadoBotones());
    await page.keyboard.press('Control+z');
    await wait(150);
    check('y Ctrl+Z quita esa edición', (await valor(celda('descripcion'))) === "Flanges de 2''", await valor(celda('descripcion')));

    // 6. Agregar una fila y deshacerlo con el botón
    const n0 = await page.$$eval('tr[data-row]', (t) => t.length);
    await page.click('.btn[data-act="add-row"][data-list="materiales"]');
    await wait(150);
    check('la fila se agrega', (await page.$$eval('tr[data-row]', (t) => t.length)) === n0 + 1);
    await page.click('#ed-deshacer');
    await wait(150);
    check('el botón Deshacer quita la fila agregada', (await page.$$eval('tr[data-row]', (t) => t.length)) === n0);
    await page.click('#ed-rehacer');
    await wait(150);
    check('el botón Rehacer la devuelve', (await page.$$eval('tr[data-row]', (t) => t.length)) === n0 + 1);
    await page.click('#ed-deshacer');
    await wait(150);

    // 7. Eliminar una fila (menú ⋯) y recuperarla con Ctrl+Z, resaltada
    await page.click(`[data-menu="fila"][data-uid="${MAT}"]`);
    await page.waitForSelector('#pop .pop-item');
    const borrar = await page.$$('#pop .pop-item');
    let hecho = false;
    for (const b of borrar) { if (/Eliminar/i.test(await b.textContent())) { await b.click(); hecho = true; break; } }
    await wait(300);
    if (await page.$('#modal[open]')) { await page.click('#modal[open] .btn-danger, #modal[open] .btn-primario'); await wait(200); }
    check('la fila se elimina', hecho && !(await page.$(`tr[data-row="${MAT}"]`)));
    await page.keyboard.press('Control+z');
    await wait(150);
    check('Ctrl+Z recupera la fila eliminada', !!(await page.$(`tr[data-row="${MAT}"]`)));
    check('y la resalta', await page.$eval(`tr[data-row="${MAT}"]`, (t) => t.classList.contains('flash')).catch(() => false));

    // 8. Deshacer vuelve a la pestaña donde se hizo el cambio
    await page.goto(`${BASE}#/p/${UID}/ficha`);
    await page.waitForSelector('#f-titulo');
    await page.fill('#f-titulo', 'Título de prueba');
    await page.press('#f-titulo', 'Tab');
    await wait(150);
    check('el encabezado toma el título nuevo', (await page.textContent('#ed-title')) === 'Título de prueba');
    await page.click('[data-act="tab"][data-tab="resumen"]').catch(() => page.goto(`${BASE}#/p/${UID}/resumen`));
    await page.waitForSelector('#res-precio');
    await page.keyboard.press('Control+z');
    await wait(200);
    check('Ctrl+Z desde Utilidad y precio vuelve a Datos del proyecto', !!(await page.$('#f-titulo')), await page.evaluate(() => location.hash));
    check('con el título anterior', (await valor('#f-titulo')) === EJ.titulo && (await page.textContent('#ed-title')) === EJ.titulo, await valor('#f-titulo'));

    // 9. La moneda: deshacer vuelve a pesos en todo el editor
    await page.selectOption('#f-parametros\\.moneda', 'USD');
    await wait(200);
    await page.keyboard.press('Control+z');
    await wait(200);
    check('Ctrl+Z vuelve la moneda a pesos', (await valor('#f-parametros\\.moneda')) === 'CLP');
    const afijos = await page.$$eval('#f-precio .affix, #f-metas .affix', (as) => as.map((a) => a.textContent));
    check('y los montos vuelven a $', afijos.filter((a) => a === '$').length === 4 && !afijos.includes('US$'), afijos);
    await page.screenshot({ path: path.join(SHOTS, '1-ficha.png') });

    // 10. El historial sigue al volver al proyecto desde el listado
    await page.goto(`${BASE}#/`);
    await page.waitForSelector('#list-body');
    await page.keyboard.press('Control+z'); // en el listado no hace nada
    await page.goto(`${BASE}#/p/${UID}/ficha`);
    await page.waitForSelector('#f-titulo');
    check('al volver, Rehacer sigue disponible', (await estadoBotones())[1] === 'false', await estadoBotones());
    await page.keyboard.press('Control+y');
    await wait(200);
    check('y rehace la moneda', (await valor('#f-parametros\\.moneda')) === 'USD');
    await page.keyboard.press('Control+z');
    await wait(700);

    // 11. Sin aviso de conflicto: deshacer guarda sobre el mismo proyecto
    check('sin diálogo de «otra persona modificó»', !(await page.$('#modal[open]')));
    const g3 = await guardado();
    check('el proyecto guardado quedó como al empezar', g3.titulo === EJ.titulo && g3.parametros.moneda !== 'USD' && g3.materiales.length === EJ.materiales.length, { t: g3.titulo, m: g3.parametros.moneda, n: g3.materiales.length });

    // 12. Los buscadores conservan el deshacer del navegador
    await page.goto(`${BASE}#/p/${UID}/materiales`);
    await page.waitForSelector(celda('cantidad'));
    const buscador = await page.$('#filtro-materiales, .tabla-buscar input, input[type="search"]');
    if (buscador) {
      const antes = [await estadoBotones(), await valor(celda('cantidad')), await valor(celda('costoUnitario'))];
      await buscador.focus();
      await page.keyboard.press('Control+z');
      await wait(150);
      const despues = [await estadoBotones(), await valor(celda('cantidad')), await valor(celda('costoUnitario'))];
      check('Ctrl+Z en un buscador no toca el proyecto', JSON.stringify(despues) === JSON.stringify(antes), { antes, despues });
    }

    // 13. Proyecto grande: el historial no frena la escritura
    await page.goto(`${BASE}#/p/grande000001/materiales`);
    await page.waitForSelector(celda('cantidad', 'm00000000750'));
    const ms = await page.evaluate((s) => {
      const el = document.querySelector(s);
      el.focus();
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) { el.value = String(10 + i); el.dispatchEvent(new Event('input', { bubbles: true })); }
      return (performance.now() - t0) / 20;
    }, celda('cantidad', 'm00000000750'));
    const foto = await page.evaluate((k) => {
      const p = JSON.parse(localStorage.getItem(k)).proyectos.find((x) => x.uid === 'grande000001');
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) JSON.stringify(p);
      return (performance.now() - t0) / 20;
    }, KEY);
    check(`1.500 materiales: ${ms.toFixed(1)} ms por tecla, de ellos ~${foto.toFixed(1)} ms la foto del historial (menos de 60 en total)`, ms < 60, ms);
    await page.keyboard.press('Control+z');
    await wait(200);
    check('1.500 materiales: las 20 teclas son un solo paso', (await valor(celda('cantidad', 'm00000000750'))) === String(1 + (750 % 7)), await valor(celda('cantidad', 'm00000000750')));
    await page.screenshot({ path: path.join(SHOTS, '2-grande.png') });
  } catch (e) {
    check('sin excepciones en la prueba', false, String(e && e.stack || e));
  }
  check('sin errores de la página', errores.length === 0, errores);
  await browser.close();
  console.log(results.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fallas}/${results.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
