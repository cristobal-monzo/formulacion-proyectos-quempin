// Barrera de contraseña con el candado de los tableros (2026-10-13): una sola contraseña para el
// Formulador y los tableros, sin contraseña escrita en la página. La prueba reemplaza el sobre real
// por uno cifrado acá con una contraseña FICTICIA, con el mismo formato de candado.py.
// Uso: servir el repo en http://127.0.0.1:8797 y correr  node .prueba/candado/e2e.js
'use strict';
const path = require('path');
const crypto = require('crypto');
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = process.env.BASE || 'http://127.0.0.1:8797/index.html';
const CONTRASENA = 'Prueba Única';           // se normaliza como «prueba unica»
const SAL = Buffer.from('quempin-tableros-2026');
const IT = 600000;
const normalizar = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const CLAVE = crypto.pbkdf2Sync(Buffer.from(normalizar(CONTRASENA), 'utf8'), SAL, IT, 32, 'sha256');

function sobre(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', CLAVE, iv);
  const datos = Buffer.concat([c.update(Buffer.from(texto, 'utf8')), c.final(), c.getAuthTag()]);
  return JSON.stringify({ v: 2, kdf: 'PBKDF2-SHA256', it: IT, sal: SAL.toString('base64'), iv: iv.toString('base64'), comp: null, datos: datos.toString('base64') });
}
const SOBRE = sobre('{"herramienta":"formulador"}');

let fallas = 0, total = 0;
function check(nombre, ok, detalle) {
  total += 1;
  if (!ok) fallas += 1;
  console.log(`${ok ? 'OK ' : 'FALLA'} ${nombre}${ok || detalle === undefined ? '' : ` → ${detalle}`}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function contexto(browser, iniciar) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  // El index.html servido lleva el sobre de prueba en vez del real.
  await ctx.route(/\/index\.html(\?.*)?$/, async (route) => {
    const resp = await route.fetch();
    const html = (await resp.text()).replace(/(<script id="llaveFormulador" type="text\/plain">)[^<]*(<\/script>)/, `$1${SOBRE}$2`);
    await route.fulfill({ response: resp, body: html, headers: Object.assign({}, resp.headers(), { 'content-type': 'text/html; charset=utf-8' }) });
  });
  if (iniciar) await ctx.addInitScript(iniciar);
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  return { ctx, page, errores };
}
const abierta = (page) => page.evaluate(() => document.getElementById('root').style.display !== 'none');
const barrera = (page) => page.evaluate(() => { const g = document.getElementById('pwGate'); return g.style.display !== 'none' && g.style.visibility !== 'hidden'; });

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    // 1. Sin nada recordado: pide la contraseña
    const { ctx, page, errores } = await contexto(browser);
    await page.goto(BASE);
    await wait(400);
    check('sin clave recordada se pide la contraseña', (await barrera(page)) && !(await abierta(page)));
    check('la página no lleva una contraseña en claro', !(await page.content()).includes('GATE_PASSWORD'));

    // 2. Una contraseña equivocada no abre
    await page.fill('#pwInput', 'combustion');
    await page.click('#pwForm button');
    await page.waitForFunction(() => /incorrecta/.test(document.getElementById('pwError').textContent), null, { timeout: 15000 });
    check('la contraseña anterior ya no abre', !(await abierta(page)));
    check('el campo queda vacío y con el foco', await page.evaluate(() => document.activeElement.id === 'pwInput' && !document.getElementById('pwInput').value));

    // 3. La contraseña de los tableros abre, escrita con mayúsculas o sin tilde
    await page.fill('#pwInput', '  PRUEBA unica ');
    await page.click('#pwForm button');
    await page.waitForFunction(() => document.getElementById('root').style.display !== 'none', null, { timeout: 15000 });
    check('la contraseña de los tableros abre el Formulador', await abierta(page));
    await page.waitForFunction(() => !!window.QStore, null, { timeout: 15000 });
    check('después de abrir se cargan los scripts de la herramienta', await page.evaluate(() => !!window.QStore));
    const recordada = await page.evaluate(() => localStorage.getItem('quempin_viz_clave'));
    check('recuerda la misma clave que los tableros (así se abren sin pedirla)', recordada === CLAVE.toString('base64'));
    check('no deja la marca antigua', await page.evaluate(() => localStorage.getItem('quempin_formulador_unlocked') === null));

    // 4. Al volver, entra directo con la clave recordada
    await page.reload();
    await page.waitForFunction(() => document.getElementById('root').style.display !== 'none', null, { timeout: 15000 });
    check('al volver entra sin pedir la contraseña', await abierta(page));
    check('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
    await ctx.close();

    // 5. Quien ya abrió un tablero entra directo (la clave la dejó el tablero)
    const b64 = CLAVE.toString('base64');
    const t = await contexto(browser, new Function(`localStorage.setItem('quempin_viz_clave', '${b64}');`));
    await t.page.goto(BASE);
    await t.page.waitForFunction(() => document.getElementById('root').style.display !== 'none', null, { timeout: 15000 });
    check('con la clave de un tablero entra directo', await abierta(t.page));
    await t.ctx.close();

    // 6. Una clave recordada que ya no sirve (la contraseña cambió) vuelve a pedirla
    const otra = crypto.randomBytes(32).toString('base64');
    const v = await contexto(browser, new Function(`localStorage.setItem('quempin_viz_clave', '${otra}');`));
    await v.page.goto(BASE);
    await v.page.waitForFunction(() => document.getElementById('pwGate').style.visibility !== 'hidden', null, { timeout: 15000 });
    check('con una clave vieja se vuelve a pedir la contraseña', (await barrera(v.page)) && !(await abierta(v.page)));
    await v.ctx.close();
  } catch (e) {
    fallas += 1;
    console.error('ERROR', e);
  } finally {
    await browser.close();
  }
  console.log(`\n${total - fallas}/${total} verificaciones`);
  process.exit(fallas ? 1 : 0);
})();
