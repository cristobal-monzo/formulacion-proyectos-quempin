'use strict';
const R = require('./recorrido.js');
const { BASE, wait, prepararBiblioteca, contexto, chromium } = R;
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { page } = await contexto(browser, { width: 390, height: 844 });
  await page.goto(BASE + '#/guia');
  await prepararBiblioteca(page);
  await page.goto(BASE + '#/');
  await page.waitForSelector('[data-act="ejemplo"]');
  await page.click('[data-act="ejemplo"]');
  await wait(1200);
  const uid = await page.evaluate(() => location.hash.split('/')[2]);
  await page.evaluate((uid) => {
    const p = window.QStore.get(uid);
    p.estado = 'Adjudicada';
    p.vinculos = Object.assign({}, p.vinculos, { requerimiento: { numero: '280' }, analisisFinanciero: { tag: 'DEMO', nombre: 'Demo', ultimoEnvio: { id: 'x', fecha: new Date().toISOString(), version: 1, costos: {}, estado: 'aplicado' } }, ventaAF: { ultimoEnvio: { id: 'y', fecha: new Date().toISOString(), monto: 1 } }, planilla: { ultimaSugerencia: { id: 'z', fecha: '', cambios: { estado: 'Adjudicado' } } } });
    window.QStore.upsert(p);
    location.hash = '#/';
  }, uid);
  await wait(500);
  await page.evaluate((uid) => { location.hash = `#/p/${uid}/seguimiento`; }, uid);
  await wait(1500);
  const r = await page.evaluate(() => {
    const ol = document.querySelector('.rcb-etapas');
    const act = document.querySelector('.rcb-etapa[aria-current]');
    return { sw: ol.scrollWidth, cw: ol.clientWidth, sl: ol.scrollLeft, actLeft: act && act.offsetLeft, olLeft: ol.offsetLeft, actual: act && act.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) };
  });
  console.log(JSON.stringify(r));
  await page.screenshot({ path: '.prueba/ux/shots/barra-movil.png' });
  await browser.close();
})();
