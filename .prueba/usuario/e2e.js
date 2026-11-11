// Selector de usuario en el Formulador (2026-10-16): el botón de la cabecera, el responsable de los
// proyectos nuevos, «Mis proyectos» en la lista, el cambio hecho en el Portal QUEMPIN (otra página del
// mismo sitio), Configuración, Pendientes del equipo («Tuyo» según el Evaluador de la Planilla) y el
// registro en el Control de Documentos sin volver a pedir las iniciales. Biblioteca FICTICIA en OPFS.
// Uso: servir el repo en http://127.0.0.1:8798 y  node .prueba/usuario/e2e.js
'use strict';
const path = require('path');
const R = require(path.join(__dirname, '..', 'ux', 'recorrido.js'));
const { BASE, wait, prepararBiblioteca, escribirPublicado, buzon, foto, texto, hay, contexto, chromium, errores } = R;

const results = [];
const check = (n, c, x) => { results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`); };
const dos = (n) => String(n).padStart(2, '0');
const enDias = (d) => { const f = new Date(); f.setDate(f.getDate() + d); return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`; };
const iso = () => new Date().toISOString();

const REQS = {
  esquema: 'quempin.intercambio/1', herramienta: 'planilla-requerimientos', generado: iso(),
  datos: {
    fuente: 'Planilla de Ingreso de Requerimientos', actualizado: iso(), avisos: [], resumen: {},
    requerimientos: [
      { numero: 312, estado: 'Evaluación', titulo: 'Calefacción gimnasio municipal (ficticio)', ubicacion: 'Rancagua', cierre: enDias(10), evaluador: 'NB', captador: 'NB' },
      { numero: 301, estado: 'Evaluación', titulo: 'Medidores gas natural colegio (ficticio)', ubicacion: 'Valparaíso', cierre: enDias(4), evaluador: 'LC', captador: 'NB' },
      { numero: 290, estado: 'Ofertado', titulo: 'Mantención calderas (ficticio)' }
    ]
  }
};
const usuarioLS = (page) => page.evaluate(() => localStorage.getItem('quempin_usuario'));
const proyectoLS = (page, uid) => page.evaluate((u) => (JSON.parse(localStorage.getItem('qpn.formulacion.proyectos.v1') || '{}').proyectos || []).find((p) => p.uid === u) || null, uid);
const opciones = (page, sel) => page.$$eval(`${sel} option`, (os) => os.map((o) => [o.value, o.textContent.trim()]));
async function elegirEnPop(page, titulo) {
  await page.click('#usuarioBtn');
  await page.waitForSelector('#pop:not([hidden]) .pop-item');
  await page.click(`#pop .pop-item:has(.pi-title:text-is("${titulo}"))`);
  await wait(250);
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { ctx, page } = await contexto(browser, { width: 1366, height: 900 });
  try {
    // ---- Primera vez: nadie elegido ----
    await page.goto(BASE + '#/');
    await page.waitForSelector('#app .page');
    check('sin usuario: el botón dice «¿Quién eres?» con borde naranjo', (await texto(page, '#usuarioBtn')) === '¿Quién eres?' &&
      await page.$eval('#usuarioBtn', (b) => b.classList.contains('sin-usuario') && getComputedStyle(b).borderTopColor === 'rgb(255, 81, 0)'));
    await page.click('#usuarioBtn');
    await page.waitForSelector('#pop:not([hidden]) .pop-item');
    const items = await page.$$eval('#pop .pop-item .pi-title', (els) => els.map((e) => e.textContent.trim()));
    check('el selector ofrece las iniciales del equipo y «Sin usuario»', JSON.stringify(items) === JSON.stringify(['NB', 'ES', 'LC', 'CM', 'MP', 'SV', 'Sin usuario']), items);
    check('«Sin usuario» parte marcado', await page.$eval('#pop .pop-item:has(.pi-title:text-is("Sin usuario"))', (b) => b.getAttribute('aria-selected') === 'true'));
    check('el pie explica para qué sirve', /queda a tu nombre/.test(await texto(page, '#pop .pop-foot')) && /Portal QUEMPIN/.test(await texto(page, '#pop .pop-foot')));
    await foto(page, 'selector-abierto');
    await page.click('#pop .pop-item:has(.pi-title:text-is("LC"))');
    await wait(300);
    check('elegido: el botón muestra LC y queda guardado para el Portal', (await texto(page, '#usuarioBtn')) === 'LC' && (await usuarioLS(page)) === 'LC' &&
      !(await page.$eval('#usuarioBtn', (b) => b.classList.contains('sin-usuario'))));
    check('elegido: un aviso lo confirma', /Trabajas como LC/.test(await texto(page, '#toast')), await texto(page, '#toast'));

    // ---- El proyecto nuevo parte con su responsable ----
    await page.click('[data-act="ejemplo"]');
    await page.waitForSelector('#tab-body');
    const uid = (await page.evaluate(() => location.hash)).split('/')[2];
    await page.goto(BASE + `#/p/${uid}/ficha`);
    await page.waitForSelector('#f-responsable');
    check('responsable: el del usuario, marcado «(tú)»', (await page.inputValue('#f-responsable')) === 'LC' &&
      (await page.$eval('#f-responsable option:checked', (o) => o.textContent.trim())) === 'LC (tú)');
    const op = await opciones(page, '#f-responsable');
    check('responsable: es una lista con el equipo y «Sin responsable»', JSON.stringify(op.map((o) => o[0])) === JSON.stringify(['', 'NB', 'ES', 'LC', 'CM', 'MP', 'SV']) && op[0][1] === 'Sin responsable', op);
    await page.selectOption('#f-responsable', 'MP');
    await wait(900);
    check('cambiar el responsable se guarda', ((await proyectoLS(page, uid)) || {}).responsable === 'MP');

    // ---- Mis proyectos ----
    await page.goto(BASE + '#/');
    await page.waitForSelector('#list-resp');
    const opLista = await opciones(page, '#list-resp');
    check('lista: «Mis proyectos (LC)» va después de «Todos», con su cuenta', opLista[0][1] === 'Todos los responsables' && opLista[1][0] === '@yo' && opLista[1][1] === 'Mis proyectos (LC) · 0', opLista);
    check('lista: cada inicial del equipo con su cuenta (LC no se repite)', opLista.some((o) => o[0] === 'MP' && o[1] === 'MP · 1') && opLista.filter((o) => o[0] === 'LC').length === 0, opLista);
    await page.selectOption('#list-resp', '@yo');
    await wait(300);
    check('Mis proyectos: LC no tiene ninguno', await hay(page, '#list-body .empty-row'));
    check('Mis proyectos: el filtro se ve en los chips', /Responsable:\s*Mis proyectos \(LC\)/.test(await texto(page, '#list-foot')), await texto(page, '#list-foot'));
    check('Mis proyectos: se recuerda en este navegador', (await page.evaluate(() => localStorage.getItem('quempin_fp_mis_proyectos'))) === '1');

    // ---- Elegido en el Portal: otra página del mismo sitio ----
    const portal = await ctx.newPage();
    await portal.goto(BASE + '#/guia');
    await portal.evaluate(() => localStorage.setItem('quempin_usuario', 'MP'));
    await page.waitForFunction(() => document.querySelector('#usuarioBtn').textContent.trim() === 'MP', null, { timeout: 5000 }).catch(() => {});
    check('lo elegido en el Portal llega sin recargar', (await texto(page, '#usuarioBtn')) === 'MP');
    await wait(300);
    check('y «Mis proyectos» pasa a ser los de MP', (await page.$$('#list-body tr[data-open]')).length === 1 &&
      (await page.$eval('#list-resp option[value="@yo"]', (o) => o.textContent.trim())) === 'Mis proyectos (MP) · 1');
    await portal.close();
    await page.reload();
    await page.waitForSelector('#list-resp');
    await wait(300);
    check('al volver a abrir, sigue en Mis proyectos', (await page.inputValue('#list-resp')) === '@yo' && (await page.$$('#list-body tr[data-open]')).length === 1);

    // ---- Configuración ----
    await page.click('[data-act="config"]');
    await page.waitForSelector('#modal[open] #cfg-usuario');
    check('configuración: «Tu usuario» en vez del responsable por defecto escrito', (await page.inputValue('#cfg-usuario')) === 'MP' && !(await hay(page, '#cfg-resp')));
    await page.selectOption('#cfg-usuario', 'SV');
    await page.click('#modal .modal-foot .btn-primario');
    await wait(400);
    check('configuración: guardar cambia el usuario', (await texto(page, '#usuarioBtn')) === 'SV' && (await usuarioLS(page)) === 'SV');

    // ---- Sin usuario ----
    await elegirEnPop(page, 'Sin usuario');
    check('sin usuario: vuelve «¿Quién eres?» y se guarda vacío', (await texto(page, '#usuarioBtn')) === '¿Quién eres?' && (await usuarioLS(page)) === '');
    check('sin usuario: «Mis proyectos» desaparece y la lista vuelve a todos', !(await hay(page, '#list-resp option[value="@yo"]')) && (await page.inputValue('#list-resp')) === '');

    // ---- Teléfono: las iniciales a la vista; sin usuario, solo el ícono ----
    await page.setViewportSize({ width: 390, height: 800 });
    await wait(200);
    const sinTel = await page.$eval('#usuarioBtn', (b) => ({ w: Math.round(b.getBoundingClientRect().width), clip: getComputedStyle(b.querySelector('.usr-t')).position }));
    check('teléfono sin usuario: solo el ícono (40 px)', sinTel.w <= 44 && sinTel.clip === 'absolute', sinTel);
    await elegirEnPop(page, 'ES');
    const conTel = await page.$eval('#usuarioBtn', (b) => ({ txt: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), r: Math.round(b.getBoundingClientRect().right) }));
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('teléfono con usuario: ES se lee y la página no se desborda', conTel.txt === 'ES' && conTel.w <= 44 && conTel.r <= 390 && desborde <= 0, { conTel, desborde });
    await foto(page, 'telefono-con-usuario');
    await page.setViewportSize({ width: 1366, height: 900 });

    // ---- Pendientes del equipo, con la carpeta: «Tuyo» y el responsable del Evaluador ----
    await elegirEnPop(page, 'LC');
    await prepararBiblioteca(page);
    await escribirPublicado(page, 'requerimientos.json', JSON.stringify(REQS));
    await page.goto(BASE + '#/');
    await page.waitForSelector('#app .page');
    await page.click('[data-act="compartir"]');
    await page.waitForSelector('#pendientes .pend', { timeout: 15000 });
    await wait(600);
    const res = await texto(page, '#pend-sec > summary');
    check('pendientes plegado: «2 por ofertar (1 tuyo)»', /2 por ofertar \(1 tuyo\)/.test(res), res);
    await page.click('#pend-sec > summary');
    await wait(300);
    const filas = await page.$$eval('#pendientes .pend-b[data-b="ofertar"] .pend-fila', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    check('por ofertar: el 301 (Evaluador LC) dice «Tuyo», el 312 no', /Tuyo/.test(filas.find((t) => /N° 301/.test(t)) || '') && !/Tuyo/.test(filas.find((t) => /N° 312/.test(t)) || ''), filas);
    check('por ofertar: cada fila dice su evaluador', /evaluador LC/.test(filas.join(' ')) && /evaluador NB/.test(filas.join(' ')), filas);

    // Formular el 312 (Evaluador NB) siendo LC: el responsable es NB; las iniciales no se vuelven a pedir
    await page.click('#pendientes [data-b="ofertar"] .pend-fila:has-text("N° 312") [data-act="nuevo"]');
    await page.waitForSelector('#modal[open] #np-num', { timeout: 8000 });   // «Nuevo proyecto» (2026-10-19)
    await wait(900);
    check('con usuario, el formulario no pide iniciales', !(await hay(page, '#modal #cp-ini')));
    await page.click('#modal .modal-foot .btn-primario');
    await page.waitForSelector('#tab-body', { timeout: 8000 });
    await wait(1800);
    const uid312 = (await page.evaluate(() => location.hash)).split('/')[2];
    const p312 = await proyectoLS(page, uid312);
    check('el proyecto del 312 queda a cargo de su Evaluador en la Planilla (NB)', p312 && p312.responsable === 'NB', p312 && p312.responsable);
    const regs = (await buzon(page)).filter((m) => m.tipo === 'registro-documento');
    check('la evaluación de costos se registra con las iniciales del usuario (LC), sin preguntarlas', regs.length === 1 && regs[0].documento.autor === 'LC' && regs[0].origen.usuario === 'LC', regs.map((m) => [m.documento, m.origen]));
    check('ya no queda la clave antigua de las iniciales', (await page.evaluate(() => localStorage.getItem('qpn.formulacion.iniciales'))) === null);

    // ---- Lo de antes: un navegador que ya tenía las iniciales del Control ----
    const otro = await contexto(browser, { width: 1280, height: 800 });
    await otro.ctx.addInitScript(() => { if (localStorage.getItem('quempin_usuario') === null) localStorage.setItem('qpn.formulacion.iniciales', 'CM'); });
    await otro.page.goto(BASE + '#/');
    await otro.page.waitForSelector('#app .page');
    check('un navegador con las iniciales de antes (CM) parte como CM', (await texto(otro.page, '#usuarioBtn')) === 'CM' && (await usuarioLS(otro.page)) === 'CM');
    await otro.ctx.close();
  } catch (e) {
    check('sin excepciones', false, e && e.stack);
  } finally {
    check('sin errores de JavaScript', !errores.length, errores);
    await browser.close();
    const malos = results.filter((r) => r.startsWith('FAIL'));
    console.log(results.join('\n'));
    console.log(`\n${results.length - malos.length}/${results.length} OK`);
    process.exit(malos.length ? 1 : 0);
  }
})();
