// Prueba de tres observaciones del equipo desde el Portal (2026-11-06):
//  1. «Utilidad y precio» y «Partidas» dicen cuánto suman los gastos generales e imprevistos bajo el costo de cada
//     partida, y la tabla por partida de la Evaluación los trae en su columna: costo + GG + utilidad = precio.
//  2. La unidad por defecto es siempre «Un.» (antes, un equipo nuevo partía en «día» y la partida base en «gl»).
//  3. La tabla por partida de la Evaluación trae la utilidad por día-hombre, con el semáforo de la meta.
// Datos FICTICIOS (el proyecto de ejemplo del repo: 3 partidas con 100 % de recargo).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/observaciones/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
// Playwright vive en una carpeta estable fuera de OneDrive (ver .prueba/LEEME.md); PW la cambia.
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const BASE = process.env.BASE || 'http://127.0.0.1:8799/index.html';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ejemplos', 'QPN-EJEMPLO_medidores-gn.json'), 'utf8'));
// 3 % de gastos generales y 2 % de imprevistos; mano de obra solo en P1; meta de $100.000 por día-hombre
Object.assign(EJ.parametros, { gastosGenerales: 3, imprevistos: 2, metaUtilidadDH: 100000 });
const P1 = EJ.partidas[0].uid, P2 = EJ.partidas[1].uid;
EJ.manoObra.forEach((m) => { if (m.partida !== P1) Object.assign(m, { n1p: 0, n1d: 0, n2p: 0, n2d: 0, n3p: 0, n3d: 0 }); });
const KEY = 'qpn.formulacion.proyectos.v1';
const UID = EJ.uid;
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
const pesos = (s) => Number(String(s).replace(/[^\d-]/g, '')) || 0;
const cerca = (a, b) => Math.abs(a - b) <= 1;

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-CL' });
  await ctx.addInitScript(([ej, key]) => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('quempin_formulador_unlocked', '1');
    localStorage.setItem(key, JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: [ej] }));
  }, [EJ, KEY]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  const guardado = () => page.evaluate(([k, u]) => JSON.parse(localStorage.getItem(k)).proyectos.find((p) => p.uid === u), [KEY, UID]);
  // Lo que calcula el motor para el proyecto guardado: la referencia de cada cifra de la pantalla
  const motor = () => page.evaluate(([k, u]) => {
    const p = JSON.parse(localStorage.getItem(k)).proyectos.find((x) => x.uid === u);
    const r = window.QCalc.computeProject(p);
    return { partidas: r.partidas.map((pt) => ({ uid: pt.uid, cd: pt.cd, ggimp: pt.ggimp, utilidad: pt.utilidad, precio: pt.precio, dh: pt.dh })), t: r.totals, rentDH: r.kpis.rentDH };
  }, [KEY, UID]);
  const lineaUtil = (uid) => texto(page, `.util-tbl tr[data-row="${uid}"] .pnom .s`);
  try {
    // 1. Utilidad y precio: bajo el costo de cada partida, sus gastos generales e imprevistos
    await page.goto(`${BASE}#/p/${UID}/resumen`);
    await page.waitForSelector('.util-tbl tr[data-row]');
    await wait(300);
    let m = await motor();
    const m1 = m.partidas.find((x) => x.uid === P1);
    let l1 = await lineaUtil(P1);
    check('la partida dice sus gastos generales e imprevistos bajo el costo', /\+ \$[\d.]+ de gastos generales e imprevistos$/.test(l1), l1);
    check('el monto es el 5 % de su costo directo', cerca(pesos(l1.split('+')[1]), m1.cd * 0.05), [l1, m1.cd]);
    const precioCot = pesos(await page.$$eval('#res-precio .cotiz-list li .cotiz-v', (els) => els[0].textContent));
    const sumaPantalla = pesos(await texto(page, `[data-c="P:${P1}:cd"]`)) + pesos(await texto(page, `[data-c="P:${P1}:ggimp"]`)) + pesos(await texto(page, `.util-tbl [data-c="P:${P1}:utilidad"]`));
    check('costo + gastos generales e imprevistos + utilidad = valor para la cotización', cerca(sumaPantalla, precioCot), [sumaPantalla, precioCot]);

    await page.click('input[data-f="parametros.aplicaImp"]');
    await wait(400);
    l1 = await lineaUtil(P1);
    check('sin imprevistos dice solo «de gastos generales», con el 3 %', /de gastos generales$/.test(l1) && cerca(pesos(l1.split('+')[1]), m1.cd * 0.03), l1);
    await page.click('input[data-f="parametros.aplicaGG"]');
    await wait(400);
    l1 = await lineaUtil(P1);
    check('sin ninguno de los dos la línea no aparece', !l1.includes('+') && !/gastos generales|imprevistos/.test(l1), l1);
    check('las casillas se guardan desmarcadas', ((g) => g.parametros.aplicaGG === false && g.parametros.aplicaImp === false)(await (async () => { await wait(800); return guardado(); })()));
    await page.click('input[data-f="parametros.aplicaGG"]');
    await wait(300);
    await page.click('input[data-f="parametros.aplicaImp"]');
    await wait(800);
    check('al volver a marcarlas, vuelve la línea completa', /de gastos generales e imprevistos$/.test(await lineaUtil(P1)), await lineaUtil(P1));

    // 2. Partidas: lo mismo bajo el costo directo
    await page.goto(`${BASE}#/p/${UID}/partidas`);
    await page.waitForSelector('#tab-body tbody tr[data-row]');
    await wait(300);
    const celdaCD = await texto(page, `#tab-body tr[data-row="${P1}"] td[data-label="Costo directo"]`);
    check('Partidas: el costo directo dice sus gastos generales e imprevistos', /de gastos generales e imprevistos/.test(celdaCD), celdaCD);

    // 3. Evaluación: columnas de gastos generales e imprevistos y de utilidad por día-hombre
    await page.goto(`${BASE}#/p/${UID}/evaluacion`);
    await page.waitForSelector('#res-partidas table', { state: 'attached' });
    await page.click('details[data-open-key="apu-sec"] > summary');
    await wait(300);
    m = await motor();
    // innerText: el subtítulo del encabezado va en su línea (y el CSS lo pasa a mayúsculas, por eso la «i»)
    const cab = await page.$$eval('#res-partidas thead th', (ths) => ths.map((t) => t.innerText.replace(/\s+/g, ' ').trim()));
    const col = (re) => cab.findIndex((c) => new RegExp(re.source, 'i').test(c));
    const iCD = col(/^Costo directo$/), iGG = col(/^Gastos generales e imprevistos$/), iU = col(/^Utilidad$/), iDH = col(/^Utilidad por día-hombre$/), iP = col(/^Precio neto$/);
    check('la tabla por partida trae las dos columnas nuevas', iGG > iCD && iU > iGG && iDH === iU + 1 && iP === iDH + 1, cab);
    const filas = await page.$$eval('#res-partidas tbody > tr:not(.apu-row)', (trs) => trs.map((tr) => [...tr.children].map((td) => ({ t: td.textContent.replace(/\s+/g, ' ').trim(), dot: (td.querySelector('.dot') || {}).className || '' }))));
    check('una fila por partida', filas.length === m.partidas.length, filas.length);
    const cuadra = filas.every((f, i) => cerca(pesos(f[iCD].t) + pesos(f[iGG].t) + pesos(f[iU].t), pesos(f[iP].t)) && cerca(pesos(f[iGG].t), m.partidas[i].ggimp));
    check('en cada partida, costo + gastos generales e imprevistos + utilidad = precio neto', cuadra, filas.map((f) => [f[iCD].t, f[iGG].t, f[iU].t, f[iP].t]));
    const u1 = m.partidas[0].utilidad / m.partidas[0].dh;
    check('P1: su utilidad por día-hombre', m.partidas[0].dh > 0 && cerca(pesos(filas[0][iDH].t), u1), [filas[0][iDH].t, u1]);
    check('P1: el semáforo compara con la meta de $100.000', filas[0][iDH].dot === 'dot ' + (u1 >= 100000 ? 'ok' : u1 >= 80000 ? 'warn' : 'bad'), [filas[0][iDH].dot, u1]);
    check('P2, sin mano de obra: «—»', filas[1][iDH].t === '—', filas[1][iDH]);
    const pie = await page.$$eval('#res-partidas tfoot td', (tds) => tds.map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
    // el pie junta «Total» en dos columnas: una celda menos antes de las cifras
    check('el total trae la utilidad por día-hombre del proyecto', cerca(pesos(pie[iDH - 1]), m.rentDH), [pie, m.rentDH]);
    check('el total trae los gastos generales e imprevistos', cerca(pesos(pie[iGG - 1]), m.t.gg + m.t.imp), [pie[iGG - 1], m.t.gg + m.t.imp]);
    const ancho = await page.evaluate(() => { const c = document.querySelector('#res-partidas .tabla-contenedor'); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tabla: c.scrollWidth, marco: c.clientWidth }; });
    check('la página no gana scroll lateral', ancho.sw <= ancho.cw, ancho);
    check('a 1440 px las 15 columnas caben en su marco, sin desplazarse', ancho.tabla <= ancho.marco, ancho);
    await page.screenshot({ path: path.join(SHOTS, 'evaluacion-partidas.png'), fullPage: false });

    // 3b. Sin gastos generales ni imprevistos, la columna no aparece y la utilidad por día-hombre sigue
    await page.goto(`${BASE}#/p/${UID}/resumen`);
    await page.waitForSelector('input[data-f="parametros.aplicaGG"]');
    await page.click('input[data-f="parametros.aplicaGG"]');
    await wait(300);
    await page.click('input[data-f="parametros.aplicaImp"]');
    await wait(800);
    await page.goto(`${BASE}#/p/${UID}/evaluacion`);
    await page.waitForSelector('#res-partidas table', { state: 'attached' });
    const cab2 = await page.$$eval('#res-partidas thead th', (ths) => ths.map((t) => t.innerText.replace(/\s+/g, ' ').trim()));
    check('sin gastos generales ni imprevistos no hay columna para ellos', !cab2.some((c) => /gastos generales|imprevistos/i.test(c)) && cab2.some((c) => /^utilidad por día-hombre$/i.test(c)), cab2);

    // 4. La unidad por defecto es «Un.»: un equipo nuevo y la partida base
    await page.goto(`${BASE}#/p/${UID}/equipos`);
    await page.waitForSelector('[data-act="add-row"][data-list="equipos"]');
    await page.click('[data-act="add-row"][data-list="equipos"]');
    await wait(300);
    const uEq = await page.$eval('#tab-body tbody tr[data-row] input[data-list="equipos"][data-k="unidad"]', (i) => i.value).catch((e) => String(e));
    check('un equipo nuevo parte con la unidad «Un.»', uEq === 'Un.', uEq);
    await page.goto(`${BASE}#/p/${UID}/partidas`);
    await page.waitForSelector('[data-act="add-base"]');
    await page.click('[data-act="add-base"]');
    await wait(1200);
    const g = await guardado();
    check('la partida base parte con la unidad «Un.»', g.partidas[0].base === true && g.partidas[0].unidad === 'Un.', g.partidas[0]);
    check('el equipo nuevo se guarda con «Un.»', g.equipos.length === 1 && g.equipos[0].unidad === 'Un.', g.equipos);
    const unidades = await page.evaluate(() => {
      const S = window.QStore;
      return [S.newMaterial(), S.newEquipo(), S.newOtro(), S.newPartida(), S.newPartidaBase()].map((x) => x.unidad);
    });
    check('todo costo y partida nuevos parten con «Un.»', unidades.every((u) => u === 'Un.'), unidades);
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
