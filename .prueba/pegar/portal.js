// La cotización del carrito del Cotizador Histórico que trae el Portal (2026-10-29): el mensaje
// 'quempin-pegar-costos' abre «Pegar desde Excel» del proyecto con las filas ya pegadas, solo si es el
// proyecto abierto, en una tabla de costos y sin otro diálogo encima. Proyecto de ejemplo, datos de mentira.
// Uso: servir el repo en http://127.0.0.1:8798 y  node .prueba/pegar/portal.js
'use strict';
const path = require('path');
const R = require(path.join(__dirname, '..', 'ux', 'recorrido.js'));
const { BASE, wait, foto, texto, hay, contexto, chromium, errores } = R;

const results = [];
const check = (n, c, x) => { results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`); };

// Lo que arma el Portal con las líneas del carrito: el encabezado de «Copiar para el Formulador» y costos netos
const TEXTO = [
  'Descripción\tUnidad\tCantidad\tCosto unitario neto',
  'Codo de cobre 1/2" (ficticio)\tUn.\t10\t1190',
  'Válvula de bola 3/4" (ficticio)\tUn.\t2\t8500'
].join('\n');
const ORIGEN = 'Costos del Cotizador Histórico: lo que QUEMPIN pagó, actualizado por UF (la del 26-10-2026).';

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { page } = await contexto(browser, { width: 1366, height: 900 });
  const mandar = (m) => page.evaluate((m) => window.postMessage(Object.assign({ tipo: 'quempin-pegar-costos' }, m), location.origin), m);
  const abierto = () => page.evaluate(() => document.getElementById('modal').open);
  try {
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="ejemplo"]');
    await page.click('[data-act="ejemplo"]');
    await page.waitForSelector('#tab-body');
    await wait(800);
    const uid = await page.evaluate(() => location.hash.split('/')[2]);
    const antes = await page.evaluate((uid) => { const p = window.QStore.get(uid); return { mat: p.materiales.length, eq: p.equipos.length, partidas: p.partidas.map((x) => x.uid) }; }, uid);
    await page.goto(`${BASE}#/p/${uid}/materiales`);
    await page.waitForSelector('[data-act="pegar-filas"][data-list="materiales"]');

    // De otro proyecto, a mano de obra o sin texto: no se abre nada
    await mandar({ proyecto: 'otro-uid', lista: 'materiales', texto: TEXTO, origen: ORIGEN });
    await mandar({ proyecto: uid, lista: 'manoObra', texto: TEXTO, origen: ORIGEN });
    await mandar({ proyecto: uid, lista: 'materiales', texto: null, origen: ORIGEN });
    await wait(300);
    check('otro proyecto, mano de obra o sin texto: no abre nada', !(await abierto()));

    await mandar({ proyecto: uid, lista: 'materiales', texto: TEXTO, origen: ORIGEN });
    await page.waitForSelector('#modal[open] #pg-texto');
    check('abre «Pegar desde Excel» con las filas ya pegadas', (await page.$eval('#pg-texto', (t) => t.value)) === TEXTO);
    check('dice de dónde vienen', (await texto(page, '#modal .pg-origen')).startsWith(ORIGEN), await texto(page, '#modal .pg-origen'));
    check('el título es el de materiales', /Pegar materiales desde Excel/.test(await texto(page, '#modal h2')));
    check('el foco queda en la partida', await page.evaluate(() => document.activeElement && document.activeElement.id === 'pg-partida'));
    check('costos netos: no marca IVA', !(await page.$eval('#pg-iva', (c) => c.checked)));
    check('vista previa: 2 filas', /2 filas/.test(await texto(page, '#pg-previa .pg-res')), await texto(page, '#pg-previa .pg-res'));
    check('el botón dice cuántas', /Agregar 2 filas/.test(await texto(page, '#modal .modal-foot .btn-primario')));
    // Con el diálogo abierto, otro mensaje no lo reemplaza
    await mandar({ proyecto: uid, lista: 'materiales', texto: 'Otra cosa\t1\t5', origen: ORIGEN });
    await wait(300);
    check('con un diálogo abierto, otro mensaje no lo reemplaza', (await page.$eval('#pg-texto', (t) => t.value)) === TEXTO);
    await page.selectOption('#pg-partida', antes.partidas[1]);
    await foto(page, 'pegar-desde-portal');
    await page.click('#modal .modal-foot .btn-primario');
    await wait(700);
    const nuevas = await page.evaluate((uid) => window.QStore.get(uid).materiales.slice(-2), uid);
    check('se agregaron las 2 filas, con su partida y su costo neto',
      nuevas.length === 2 && /Codo/.test(nuevas[0].descripcion) && nuevas[0].cantidad === 10 && nuevas[0].costoUnitario === 1190
        && nuevas[1].costoUnitario === 8500 && nuevas[1].unidad === 'Un.' && nuevas.every((x) => x.partida === antes.partidas[1]), nuevas);
    check('el proyecto tiene 2 materiales más', (await page.evaluate((uid) => window.QStore.get(uid).materiales.length, uid)) === antes.mat + 2);

    // A equipos, en su tabla; cancelar no agrega nada
    await page.goto(`${BASE}#/p/${uid}/equipos`);
    await page.waitForSelector('[data-act="pegar-filas"][data-list="equipos"]');
    await mandar({ proyecto: uid, lista: 'equipos', texto: TEXTO, origen: ORIGEN });
    await page.waitForSelector('#modal[open] #pg-texto');
    check('a equipos: su diálogo', /Pegar equipos desde Excel/.test(await texto(page, '#modal h2')));
    await page.click('#modal .modal-foot .btn:not(.btn-primario)');
    await wait(300);
    check('cancelar no agrega equipos', (await page.evaluate((uid) => window.QStore.get(uid).equipos.length, uid)) === antes.eq);
    check('el botón de pegar sigue', await hay(page, '[data-act="pegar-filas"][data-list="equipos"]'));
  } catch (e) {
    check('sin excepción', false, String(e && e.stack || e));
  } finally {
    check('sin errores de JavaScript', !errores.length, errores);
    await browser.close();
    results.forEach((r) => console.log(r));
    const fallas = results.filter((r) => r.startsWith('FAIL')).length;
    console.log(`\n${results.length - fallas}/${results.length} OK`);
    process.exit(fallas ? 1 : 0);
  }
})();
