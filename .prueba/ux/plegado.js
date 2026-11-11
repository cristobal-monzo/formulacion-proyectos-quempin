// Barra del recorrido plegada y seguimiento con la etapa actual abierta (pedido del usuario,
// 2026-10-09). Verifica y saca capturas. Datos FICTICIOS (recorrido.js).
// Uso: servir el repo en http://127.0.0.1:8798 y correr  node .prueba/ux/plegado.js
'use strict';
const R = require('./recorrido.js');
const { BASE, wait, prepararBiblioteca, foto, texto, contexto, chromium, errores } = R;

let fallas = 0, total = 0;
function check(nombre, ok, detalle) {
  total += 1;
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK ' : 'FALLA'} ${nombre}${ok || detalle === undefined ? '' : ` → ${detalle}`}`);
}

async function proyectoListo(page) {
  await page.click('[data-act="nuevo"]');
  await wait(500);
  if (/biblioteca/i.test(await texto(page, '#modal .modal-head h2'))) { await page.click('#modal .modal-foot .btn-primario'); await wait(1200); }
  // «Nuevo proyecto» (2026-10-19): el N° 301 ya tiene carpeta y se propone usarla
  await page.waitForSelector('#modal[open] #np-num');
  await page.fill('#np-num', '301');
  await page.dispatchEvent('#np-num', 'input');
  await page.waitForSelector('#np-opciones input[value="usar"]:checked');
  if (await page.$('#cp-ini')) await page.selectOption('#cp-ini', 'LC');
  await page.click('#modal .modal-foot .btn-primario');
  await page.waitForSelector('#tab-body');
  await wait(1200);
  const uid = await page.evaluate(() => location.hash.split('/')[2]);
  await page.evaluate((uid) => {
    const p = window.QStore.get(uid);
    p.cliente = 'Colegio Ficticio';
    p.partidas = [{ uid: 'pt1', descripcion: 'Medidores G4 con conexión', cantidad: 3, unidad: 'Un.', utilidadTipo: 'pct', utilidadValor: 45 }];
    p.materiales = [{ uid: 'm1', descripcion: 'Medidor G4 (ficticio)', partida: 'pt1', cantidad: 1, unidad: 'Un.', costoUnitario: 180000 }];
    p.manoObra = [{ uid: 'h1', descripcion: 'Instalación', partida: 'pt1', n1p: 2, n1d: 1, n2p: 0, n2d: 0, n3p: 0, n3d: 0 }];
    window.QStore.upsert(p);
  }, uid);
  return uid;
}
const abrir = async (page, uid, tab) => {
  await page.goto(`${BASE}#/p/${uid}/${tab}`);
  await page.reload();
  await page.waitForSelector('#tab-body');
  await wait(1300);
};
// checkVisibility: dentro de un <details> cerrado Chrome deja cajas con medida (content-visibility)
const visible = (page, sel) => page.$eval(sel, (e) => e.checkVisibility({ contentVisibilityAuto: true })).catch(() => false);

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const { page } = await contexto(browser, { width: 1280, height: 900 });
    await page.goto(BASE + '#/guia');
    await prepararBiblioteca(page);
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="nuevo"]');
    const uid = await proyectoListo(page);

    // 1. En los pasos de la formulación, la barra va plegada en una línea
    await abrir(page, uid, 'partidas');
    check('la barra va plegada', !(await page.$eval('#ed-recorrido details.rc-barra', (d) => d.open)));
    check('plegada dice la etapa actual', /Etapa \d de 6/.test(await texto(page, '#ed-recorrido .rcb-resumen')), await texto(page, '#ed-recorrido .rcb-resumen'));
    check('plegada no muestra las seis etapas', !(await visible(page, '#ed-recorrido .rcb-etapas')));
    await foto(page, 'pasos-barra-plegada');
    await page.click('#ed-recorrido .rcb-resumen');
    await wait(300);
    check('al desplegarla se ven las seis etapas', (await visible(page, '#ed-recorrido .rcb-etapas')) && (await page.$$('#ed-recorrido .rcb-etapa')).length === 6);
    await foto(page, 'pasos-barra-abierta');
    // Sigue abierta al cambiar de paso (se recuerda en la sesión)
    await page.click('.paso-tab[data-tab="resumen"]');
    await wait(400);
    check('abierta, se queda abierta al cambiar de paso', await page.$eval('#ed-recorrido details.rc-barra', (d) => d.open));
    await page.click('#ed-recorrido .rcb-resumen');
    await wait(200);

    // 2. En el seguimiento no hay barra: la línea de tiempo con la etapa actual abierta
    await abrir(page, uid, 'seguimiento');
    await page.waitForSelector('#recorrido .rc-linea');
    check('en el seguimiento no se repite la barra', !(await page.$('#ed-recorrido .rc-barra')));
    const actual = await page.$eval('#recorrido .rcl[aria-current]', (e) => e.id);
    check('una sola etapa abierta: la actual', (await page.$$('#recorrido .rcl-actual')).length === 1 && (await page.$$('#recorrido .rcl-plegada')).length === 5, actual);
    check('la actual lleva lo que sigue', !!(await page.$('#recorrido .rcl-actual .rc-sigue')));
    check('las demás van plegadas', await page.$$eval('#recorrido .rcl-plegada details', (ds) => ds.every((d) => !d.open)));
    await foto(page, 'seguimiento-formulacion', true);
    await page.click('#etapa-requerimiento summary');
    await wait(300);
    check('una etapa anterior se despliega', await page.$eval('#etapa-requerimiento details', (d) => d.open));
    await foto(page, 'seguimiento-requerimiento-abierto', true);

    // 3. Oferta adjudicada con cotización emitida: la etapa actual es la ejecución
    await page.evaluate((uid) => {
      const p = window.QStore.get(uid);
      p.estado = 'Adjudicada';
      p.vinculos = Object.assign({}, p.vinculos, {
        sistemaQuempin: { ultimoBorrador: { id: 'b1', version: 1, fecha: '2026-10-09T11:04:00', estado: 'aplicado', folio: '602695' } },
        planilla: { ultimaSugerencia: { id: 's1', fecha: '2026-10-07T17:02:00', cambios: { estado: 'Adjudicado' } } }
      });
      window.QStore.upsert(p);
    }, uid);
    await abrir(page, uid, 'seguimiento');
    await page.waitForSelector('#recorrido .rcl-actual');
    await wait(800);
    const idAct = await page.$eval('#recorrido .rcl-actual', (e) => e.id);
    check('adjudicada: la etapa actual es la ejecución', idAct === 'etapa-ejecucion', idAct);
    check('la cotización hecha va plegada y dice su N°', (await page.$eval('#etapa-cotizacion details', (d) => !d.open)) && (await texto(page, '#etapa-cotizacion summary')).includes('602695'), await texto(page, '#etapa-cotizacion summary'));
    const dup = await page.$$eval('#recorrido .rcl-actual button, #recorrido .rcl-actual a.btn', (bs) => bs.filter((b) => b.offsetParent).map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
    check('la tarjeta no repite el botón de lo que sigue', dup.filter((t) => /Pasar a ejecución/.test(t)).length <= 1, dup.join(' | '));
    await foto(page, 'seguimiento-ejecucion', true);
    await page.click('#etapa-cotizacion summary');
    await wait(300);
    await foto(page, 'seguimiento-cotizacion-abierta', true);

    // 4. Desde la barra, una etapa lleva al seguimiento con esa etapa abierta
    await abrir(page, uid, 'ficha');
    await page.click('#ed-recorrido .rcb-resumen');
    await page.click('#ed-recorrido .rcb-btn[data-etapa="oferta"]');
    await page.waitForSelector('#recorrido .rc-linea');
    await wait(500);
    check('la etapa elegida en la barra se abre en el seguimiento', await page.$eval('#etapa-oferta details', (d) => d.open));

    // 5. Oscuro y teléfono
    await page.evaluate(() => localStorage.setItem('quempin_fp_theme', 'dark'));
    await abrir(page, uid, 'seguimiento');
    await foto(page, 'oscuro-seguimiento', true);
    await abrir(page, uid, 'materiales');
    await foto(page, 'oscuro-costos-barra');
    await page.evaluate(() => localStorage.setItem('quempin_fp_theme', 'light'));
    await page.setViewportSize({ width: 390, height: 844 });
    await abrir(page, uid, 'ficha');
    await foto(page, 'movil-datos');
    check('teléfono: sin desplazamiento horizontal', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await abrir(page, uid, 'seguimiento');
    await foto(page, 'movil-seguimiento', true);
    check('teléfono: seguimiento sin desplazamiento horizontal', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
  } catch (e) {
    fallas += 1;
    console.error('ERROR', e);
  } finally {
    await browser.close();
  }
  console.log(`\n${total - fallas}/${total} verificaciones`);
  process.exit(fallas ? 1 : 0);
})();
