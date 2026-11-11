// Capturas de las pantallas principales en varios anchos y en modo oscuro, para revisar jerarquía
// visual y estados (vuelta 3 de la mejora UX, 2026-10-06). Datos FICTICIOS (recorrido.js).
'use strict';
const R = require('./recorrido.js');
const { BASE, wait, prepararBiblioteca, escribirPublicado, foto, texto, contexto, chromium } = R;

async function proyectoListo(page) {
  // Un proyecto formulado, con carpeta y cotización emitida: el estado más rico del seguimiento
  await page.click('[data-act="nuevo"]');
  await wait(500);
  if (/biblioteca/i.test(await texto(page, '#modal .modal-head h2'))) { await page.click('#modal .modal-foot .btn-primario'); await wait(1200); }
  await page.waitForSelector('#modal[open] #cp-buscar');
  await page.click('.cp-fila:has(.code-badge:text-is("301"))');
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

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const { page } = await contexto(browser, { width: 1280, height: 860 });
    await page.goto(BASE + '#/guia');
    await prepararBiblioteca(page);
    await page.goto(BASE + '#/');
    await page.waitForSelector('[data-act="nuevo"]');
    const uid = await proyectoListo(page);
    for (const [w, sufijo] of [[1280, '1280'], [1024, '1024']]) {
      await page.setViewportSize({ width: w, height: 860 });
      await page.goto(`${BASE}#/p/${uid}/ficha`);
      await page.reload();
      await page.waitForSelector('#tab-body');
      await wait(1000);
      await foto(page, `datos-${sufijo}`);
      await page.goto(`${BASE}#/p/${uid}/seguimiento`);
      await wait(1500);
      await foto(page, `seguimiento-${sufijo}`);
    }
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(BASE + '#/');
    await wait(800);
    await foto(page, 'lista-1280', true);
    // Modo oscuro
    await page.evaluate(() => localStorage.setItem('quempin_fp_theme', 'dark'));
    await page.goto(`${BASE}#/p/${uid}/seguimiento`);
    await page.reload();
    await page.waitForSelector('#recorrido .rc-linea');
    await wait(1200);
    await foto(page, 'oscuro-seguimiento');
    await page.goto(`${BASE}#/p/${uid}/materiales`);
    await wait(800);
    await foto(page, 'oscuro-costos');
    await page.goto(BASE + '#/');
    await wait(600);
    await page.click('[data-act="nuevo"]');
    await page.waitForSelector('#modal[open] #cp-buscar');
    await page.click('#cp-nueva-btn');
    await page.fill('#cp-num', '311');
    await page.dispatchEvent('#cp-num', 'input');
    if (!(await page.evaluate(() => document.getElementById('pop').hidden))) await page.keyboard.press('Escape');
    await wait(300);
    await foto(page, 'oscuro-nueva-carpeta');
    await page.keyboard.press('Escape');
    await page.evaluate(() => localStorage.setItem('quempin_fp_theme', 'light'));
    // Teléfono: datos y lista
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}#/p/${uid}/ficha`);
    await page.reload();
    await page.waitForSelector('#tab-body');
    await wait(1000);
    await foto(page, 'movil-datos');
    await page.goto(BASE + '#/');
    await wait(800);
    await foto(page, 'movil-lista', true);
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await browser.close();
  }
})();
