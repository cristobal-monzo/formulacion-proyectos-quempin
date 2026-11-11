// «Pendientes del equipo» en la lista de proyectos (2026-10-14): por ofertar, pasar a la Planilla y
// borradores en Sistema QUEMPIN; avisos «Cierra en N días» en la lista y en el encabezado; «Formular»
// que elige o crea la carpeta del N°. Biblioteca FICTICIA en OPFS (ver ux/recorrido.js).
// Uso: servir el repo en http://127.0.0.1:8798 y  node .prueba/pendientes/e2e.js
'use strict';
const path = require('path');
const R = require(path.join(__dirname, '..', 'ux', 'recorrido.js'));
const { BASE, BIBLIOTECA, INTERCAMBIO, wait, prepararBiblioteca, escribirPublicado, foto, texto, hay, contexto, chromium, errores } = R;

const results = [];
const check = (n, c, x) => { results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`); };
const dos = (n) => String(n).padStart(2, '0');
const enDias = (d, hora) => { const f = new Date(); f.setDate(f.getDate() + d); return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}${hora ? 'T' + hora : ''}`; };
const iso = (d) => { const f = new Date(); f.setDate(f.getDate() + d); return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}T10:00:00-03:00`; };

const REQS = {
  esquema: 'quempin.intercambio/1', herramienta: 'planilla-requerimientos', generado: iso(0),
  datos: {
    fuente: 'Planilla de Ingreso de Requerimientos', actualizado: iso(0), avisos: [], resumen: {},
    requerimientos: [
      { numero: 312, estado: 'Evaluación', titulo: 'Calefacción gimnasio municipal (ficticio)', ubicacion: 'Rancagua', cierre: enDias(10, '15:00') },
      { numero: 311, estado: 'Evaluación', titulo: 'Medidores de gas edificio (ficticio)', ubicacion: 'Santiago', cierre: enDias(1, '12:00') },
      { numero: 301, estado: 'Evaluación', titulo: 'Medidores gas natural colegio (ficticio)', ubicacion: 'Valparaíso', cierre: enDias(4, '17:00') },
      { numero: 290, estado: 'Ofertado', titulo: 'Mantención calderas (ficticio)', valorOfertado: 6000000 },
      { numero: 289, estado: 'Adjudicado', titulo: 'Mantención caldera hospital (ficticio)', valorOfertado: 1190000 },
      { numero: 285, estado: 'Adjudicado', titulo: 'Red de gas (ficticio)' },
      { numero: 284, estado: 'Adjudicado', titulo: 'Sala de calderas (ficticio)' },
      { numero: 283, estado: 'No adjudicado', titulo: 'Al día (ficticio)' },
      { numero: 12, estado: 'Descartado', titulo: 'Viejo (ficticio)' }
    ]
  }
};
const sobre = (tipo, destino, enviado, cuerpo, herramienta) => Object.assign({
  esquema: 'quempin.intercambio/1', id: Math.random().toString(16).slice(2, 14), tipo, destino,
  origen: { herramienta: herramienta || 'formulador', enviado, usuario: 'Persona Ficticia' }
}, cuerpo);
const MP = (n, valor, motivo) => sobre('actualizar-requerimiento', 'planilla-requerimientos', iso(-1),
  { requerimiento: { numero: n }, cambios: { valorAdjudicado: valor }, fuente: { herramienta: 'mercado-publico', motivo } }, 'mercado-publico');
const BUZON = [
  sobre('actualizar-requerimiento', 'planilla-requerimientos', iso(-8), { requerimiento: { numero: 289 }, cambios: { estado: 'Ofertado', valorOfertado: 1190000 }, fuente: { herramienta: 'formulador', codigo: 'QMPN-2026-289' } }),
  sobre('actualizar-requerimiento', 'planilla-requerimientos', iso(-7), { requerimiento: { numero: 289 }, cambios: { estado: 'Adjudicado', valorAdjudicado: 1250000 }, fuente: { herramienta: 'formulador', codigo: 'QMPN-2026-289' } }),
  sobre('actualizar-requerimiento', 'planilla-requerimientos', iso(-2), { requerimiento: { numero: 290 }, cambios: { estado: 'No adjudicado' }, fuente: { herramienta: 'mercado-publico', motivo: 'Mercado Público: 1111-1-LE26 declarada desierta (ficticio).' } }, 'mercado-publico'),
  MP(285, 4500000, 'Mercado Público: 2222-2-LE26 adjudicada a QUEMPIN (ficticio).'),
  MP(284, 3300000, 'Mercado Público: 3333-3-LE26 adjudicada a QUEMPIN (ficticio).'),
  sobre('actualizar-requerimiento', 'planilla-requerimientos', iso(-3), { requerimiento: { numero: 283 }, cambios: { estado: 'No adjudicado' }, fuente: { herramienta: 'formulador' } }),
  sobre('borrador-cotizacion', 'sistema-quempin', iso(-5), { proyecto: { req: '280' }, fuente: { uid: 'no-esta', codigo: 'QMPN-2026-280', version: 1, titulo: 'Conexión H2 (ficticio)' },
    cotizacion: { pais: 'Chile', moneda: 'CLP', referencia: 'Conexión H2 (ficticio)', cliente: { razon_social: 'Universidad Ficticia' }, items: [] } })
];

async function escribirBuzon(page, mensajes) {
  await page.evaluate(async ([bib, inter, mensajes]) => {
    let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(bib, { create: true });
    for (const n of inter.concat('buzon')) d = await d.getDirectoryHandle(n, { create: true });
    for (const m of mensajes) {
      const t = m.origen.enviado.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
      const w = await (await d.getFileHandle(`${t}_${m.origen.herramienta}_${m.tipo}_${m.id}.json`, { create: true })).createWritable();
      await w.write(JSON.stringify(m)); await w.close();
    }
  }, [BIBLIOTECA, INTERCAMBIO, mensajes]);
}
const filas = (page, b) => page.$$eval(`#pendientes .pend-b[data-b="${b}"] .pend-fila`, (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const { page } = await contexto(browser, { width: 1366, height: 900 });
  try {
    await page.goto(BASE + '#/guia');
    await prepararBiblioteca(page);
    await escribirPublicado(page, 'requerimientos.json', JSON.stringify(REQS));
    await escribirBuzon(page, BUZON);
    await page.goto(BASE + '#/');
    await page.waitForSelector('#app .page');
    await wait(800);
    check('sin la carpeta conectada todavía no hay pendientes', !(await hay(page, '#pendientes .pend')));
    await page.click('[data-act="compartir"]');   // conectar la biblioteca (el selector devuelve la de OPFS)
    await page.waitForSelector('#pendientes .pend', { timeout: 15000 });
    await wait(600);

    // ---- Desplegable (2026-10-15): parte plegada, en una línea con las cantidades y el cierre más próximo ----
    check('la sección parte plegada', !(await page.$eval('#pend-sec', (e) => e.open)));
    const res = await texto(page, '#pend-sec > summary');
    check('plegada: dice 3 por ofertar, 4 para la Planilla y 1 en Sistema QUEMPIN', /3 por ofertar/.test(res) && /4 para la Planilla/.test(res) && /1 en Sistema QUEMPIN/.test(res), res);
    check('plegada: avisa en rojo el cierre más próximo (N° 311, mañana)', /Cierra mañana · N° 311/.test(res) && await hay(page, '#pend-sec > summary .chip.bad.chip-plazo'), res);
    const alto = await page.$eval('#pend-sec', (e) => Math.round(e.getBoundingClientRect().height));
    check('plegada: ocupa una sola línea (≤ 50 px)', alto <= 50, alto);
    await foto(page, 'lista-pendientes-plegada');
    await page.click('#pend-sec > summary');
    await wait(300);
    check('un clic la despliega y dice «Ocultar»', await page.$eval('#pend-sec', (e) => e.open) &&
      (await page.$eval('#pend-sec .pl-accion', (e) => getComputedStyle(e, '::before').content)) === '"Ocultar"');
    await foto(page, 'lista-pendientes', true);

    // ---- La sección y sus tres bloques ----
    const bloques = await page.$$eval('#pendientes .pend-b', (els) => els.map((e) => e.dataset.b + ':' + e.querySelector('.pend-n').textContent.trim()));
    check('tres bloques: por ofertar 3, pasar a la planilla 4, en Sistema QUEMPIN 1', bloques.join(',') === 'ofertar:3,planilla:4,sistema:1', bloques);

    // ---- Por ofertar ----
    const po = await filas(page, 'ofertar');
    check('por ofertar: lo que cierra mañana primero (311), después 301 y 312', /N° 311/.test(po[0]) && /N° 301/.test(po[1]) && /N° 312/.test(po[2]), po);
    check('por ofertar: aviso «Cierra mañana» en rojo', await hay(page, '#pendientes .pend-b[data-b="ofertar"] .pend-fila:first-child .chip.bad.chip-plazo'), po[0]);
    check('por ofertar: «Cierra en 4 días» en ámbar y «Cierra en 10 días» neutro', /Cierra en 4 días/.test(po[1]) && /Cierra en 10 días/.test(po[2]) &&
      await hay(page, '#pendientes .pend-b[data-b="ofertar"] .pend-fila:nth-child(2) .chip.warn'), po);
    check('por ofertar: dice que no está formulado y ofrece «Formular»', /sin formular/.test(po[0]) && (await page.$$('#pendientes [data-b="ofertar"] [data-act="nuevo"]')).length === 3, po[0]);

    // «Formular» de un N° sin carpeta: «Nuevo proyecto» abre con el N° y propone crear su carpeta (2026-10-19)
    await page.click('#pendientes [data-b="ofertar"] .pend-fila:first-child [data-act="nuevo"]');
    await page.waitForSelector('#modal[open] #np-num', { timeout: 8000 });
    await wait(900);
    check('formular sin carpeta: abre con el N° 311 y propone crear su carpeta', (await page.inputValue('#np-num')) === '311' && await page.$eval('#np-opciones input[value="crear"]', (e) => e.checked));
    check('formular sin carpeta: el nombre sale de la planilla', /Medidores de gas edificio/.test(await page.inputValue('#np-tit')), await page.inputValue('#np-tit'));
    await foto(page, 'formular-sin-carpeta');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await wait(400);
    if (await hay(page, '#modal[open]')) await page.click('#modal .modal-head .icon-btn');
    await wait(300);

    // «Formular» de un N° con carpeta: la carpeta queda elegida y se crea el proyecto
    await page.click('#pendientes [data-b="ofertar"] .pend-fila:nth-child(2) [data-act="nuevo"]');
    await page.waitForSelector('#modal[open] #np-num', { timeout: 8000 });
    await wait(700);
    const elegida = await page.$eval('#np-opciones label:has(input[value="usar"]:checked)', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
    check('formular con carpeta: propone usar la del N° 301', /301\. Medidores gas natural colegio/.test(elegida), elegida);
    if (await page.$('#cp-ini')) await page.selectOption('#cp-ini', 'LC');
    await page.click('#modal .modal-foot .btn-primario');
    await page.waitForSelector('#tab-body', { timeout: 8000 });
    await wait(1200);
    const meta = await texto(page, '#ed-meta');
    check('editor: el encabezado avisa «Cierra en 4 días»', /Cierra en 4 días/.test(meta), meta);
    await foto(page, 'editor-aviso-cierre');
    await page.goto(BASE + '#/');
    await page.waitForSelector('#list-body tr');
    await wait(900);
    const po2 = await filas(page, 'ofertar');
    check('después de crearlo: el 301 dice que está en el Formulador y ofrece «Abrir»', /en el Formulador: 301\. Medidores gas natural colegio \(ficticio\)/.test(po2[1]) && await hay(page, '#pendientes [data-b="ofertar"] .pend-fila:nth-child(2) a.btn'), po2[1]);
    const estadoLista = await texto(page, '#list-body tr:first-child td[data-label="Estado"]');
    check('lista: la fila del proyecto avisa «Cierra en 4 días»', /Cierra en 4 días/.test(estadoLista), estadoLista);

    // ---- Pasar a la Planilla ----
    const pl = await filas(page, 'planilla');
    check('planilla: se ven 3 de 4 y «Ver la otra»', pl.length === 3 && /Ver la otra/.test(await texto(page, '#pendientes [data-b="planilla"] .pend-mas')), pl);
    check('planilla: el 283 (la planilla ya lo muestra) no aparece', !pl.some((t) => /N° 283/.test(t)));
    await page.click('#pendientes [data-b="planilla"] .pend-mas');
    await wait(200);
    const pl2 = await filas(page, 'planilla');
    check('planilla: «Ver la otra» muestra las 4', pl2.length === 4 && /Ver menos/.test(await texto(page, '#pendientes [data-b="planilla"] .pend-mas')), pl2.length);
    const f289 = pl2.find((t) => /N° 289/.test(t)) || '';
    check('289: solo el valor adjudicado más nuevo; el estado ya está', /Valor adjudicado \(IVA inc\): \$1\.250\.000/.test(f289) && !/Estado:/.test(f289) && /hoy vacío/.test(f289), f289);
    const v289 = await page.$eval('#pendientes [data-b="planilla"] [data-lbl="N° 289 · Valor adjudicado (IVA inc)"]', (e) => e.dataset.v).catch(() => '');
    check('289: se copia como número sin separadores', v289 === '1250000', v289);
    const f290 = pl2.find((t) => /N° 290/.test(t)) || '';
    check('290: estado «No adjudicado» (hoy «Ofertado») con el motivo de Mercado Público', /Estado: No adjudicado/.test(f290) && /hoy «Ofertado»/.test(f290) && /declarada desierta/.test(f290), f290);
    check('planilla: botón «Abrir la planilla» en el bloque', await hay(page, '#pendientes [data-b="planilla"] .pend-acc-h a[target="_blank"]'));
    await page.click('#pendientes [data-b="planilla"] [data-lbl="N° 289 · Valor adjudicado (IVA inc)"]');
    await wait(300);
    check('copiar: el aviso confirma lo copiado', /Copiado: 1250000/.test(await texto(page, '#toast')), await texto(page, '#toast'));

    // ---- En Sistema QUEMPIN ----
    const si = await filas(page, 'sistema');
    check('sistema: el borrador con su código, cliente y antigüedad', si.length === 1 && /QMPN-2026-280 v1/.test(si[0]) && /hace 5 días/.test(si[0]) && /Universidad Ficticia/.test(si[0]), si);
    check('sistema: dice dónde se emite', /Borradores del Formulador/.test(await texto(page, '#pendientes [data-b="sistema"] .pend-nota')));

    // ---- Un solo botón principal en la lista ----
    const prim = await page.$$eval('.btn-primario', (els) => els.filter((e) => e.offsetParent).length);
    check('lista: sigue habiendo un solo botón principal (Nuevo proyecto)', prim === 1, prim);

    // ---- Este navegador recuerda cómo la dejó la persona ----
    // (al recargar, la sección aparece con la siguiente sincronización de la carpeta: puede tardar)
    await page.reload();
    await page.waitForSelector('#pend-sec', { state: 'attached', timeout: 30000 });
    await wait(600);
    check('al recargar sigue desplegada', await page.$eval('#pend-sec', (e) => e.open));
    await page.click('#pend-sec > summary');
    await wait(200);
    await page.reload();
    await page.waitForSelector('#pend-sec', { state: 'attached', timeout: 30000 });
    await wait(600);
    check('plegada y recargada: sigue plegada', !(await page.$eval('#pend-sec', (e) => e.open)));

    // ---- Teléfono: sin desplazamiento lateral, plegada y desplegada ----
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(500);
    const anchoPleg = await page.evaluate(() => document.documentElement.scrollWidth);
    const altoPleg = await page.$eval('#pend-sec', (e) => Math.round(e.getBoundingClientRect().height));
    check('teléfono plegada: cabe sin desplazamiento lateral y en poco alto (≤ 110 px)', anchoPleg <= 390 && altoPleg <= 110, { anchoPleg, altoPleg });
    await foto(page, 'movil-pendientes-plegada');
    await page.click('#pend-sec > summary');
    await wait(300);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    check('teléfono: la sección cabe sin desplazamiento lateral', ancho <= 390, ancho);
    await foto(page, 'movil-pendientes', true);

    // ---- Sin carpeta conectada no se muestra ----
    await page.evaluate(() => indexedDB.deleteDatabase('qpn-intercambio'));
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.reload();
    await page.waitForSelector('#app .page');
    await wait(1500);
    check('sin la carpeta del equipo no hay sección de pendientes', !(await hay(page, '#pendientes .pend')));
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
