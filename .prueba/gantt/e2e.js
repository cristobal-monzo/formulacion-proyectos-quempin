// Carta Gantt, herramienta aparte del Formulador (2026-10-20; antes una pestaña de él, 2026-10-13):
// traspaso de las cartas que vivían en p.gantt, lista de cartas, carta de un proyecto desde las partidas,
// dependencias, hitos, ruta crítica, deshacer, PDF y Excel descargados, carta suelta, eliminar y restaurar.
// Y que el Formulador ya no la tenga. Datos FICTICIOS (el proyecto de ejemplo del repo: 3 partidas; su
// mano de obra sugiere 6, 2 y 4 días).
// Uso: servir el repo en http://127.0.0.1:8799 y correr  node .prueba/gantt/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA || '', 'quempin-pruebas');
const { chromium } = require(path.join(PW, 'node_modules', 'playwright-core'));

const RAIZ = (process.env.BASE || 'http://127.0.0.1:8799/index.html').replace(/index\.html$/, '');
const GANTT = RAIZ + 'gantt/index.html';
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const EJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ejemplos', 'QPN-EJEMPLO_medidores-gn.json'), 'utf8'));
const KEY = 'qpn.formulacion.proyectos.v1';
const CARTAS = 'qpn.gantt.cartas.v1';
const UID = EJ.uid;
// Un segundo proyecto, con la carta antigua dentro (p.gantt): se traspasa sola
const LEGADO = Object.assign(JSON.parse(JSON.stringify(EJ)), {
  uid: 'legado01', codigo: 'QPN-LEGADO', titulo: 'Proyecto ficticio con carta antigua', modificado: '2026-10-14T15:00:00.000Z',
  gantt: { inicio: '2026-10-19', calendario: 'habiles', escala: 'auto', noLaborables: [], tareas: [
    { uid: 'lg1', nombre: 'Tarea antigua 1', partida: '', responsable: '', duracion: 3, hito: false, avance: 50, noAntesDe: '', predecesoras: [] },
    { uid: 'lg2', nombre: 'Tarea antigua 2', partida: '', responsable: '', duracion: 2, hito: false, avance: 0, noAntesDe: '', predecesoras: [{ uid: 'lg1', tipo: 'FC', desfase: 0 }] }] }
});
const results = [];
const errores = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, locale: 'es-CL', acceptDownloads: true });
  await ctx.addInitScript(([ej, legado, key]) => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('quempin_formulador_unlocked', '1');
    localStorage.setItem(key, JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: [ej, legado] }));
  }, [EJ, LEGADO, KEY]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('consola: ' + m.text()); });
  const cartas = () => page.evaluate((k) => (JSON.parse(localStorage.getItem(k) || '{"cartas":[]}').cartas || []), CARTAS);
  const cartaDe = async (puid) => (await cartas()).find((c) => c.proyecto && c.proyecto.uid === puid && !c.eliminado);
  const filas = () => page.$$eval('.tbl-gantt tbody tr[data-row]', (trs) => trs.map((tr) => ({
    uid: tr.dataset.row, n: tr.querySelector('.g-num').textContent.trim(),
    nombre: tr.querySelector('[data-g="nombre"]').value,
    dias: (tr.querySelector('[data-g="duracion"]') || {}).value || 'hito',
    pred: tr.querySelector('[data-g="predecesoras"]').value,
    ini: tr.querySelector('[data-gc^="ini:"]').textContent.trim(), fin: tr.querySelector('[data-gc^="fin:"]').textContent.trim(),
    critica: tr.classList.contains('g-critica')
  })));
  const elegir = async (titulo) => {
    for (const b of await page.$$('#pop .pop-item')) { if ((await b.textContent()).includes(titulo)) { await b.click(); return true; } }
    return false;
  };
  const sinDesborde = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  try {
    // 1. Traspaso: la carta que vivía en el proyecto LEGADO aparece sola en la lista
    await page.goto(`${GANTT}#/`);
    await page.waitForSelector('.tbl-cartas tbody tr[data-abrir]');
    let cs = await cartas();
    check('se traspasa la carta antigua (y solo esa)', cs.length === 1 && cs[0].uid === 'flegado01' && cs[0].gantt.tareas.length === 2 && cs[0].proyecto.codigo === 'QPN-LEGADO', cs.map((c) => c.uid));
    check('con la fecha del proyecto: igual en cualquier navegador', cs[0].modificado === LEGADO.modificado, cs[0].modificado);
    check('la lista la muestra con su proyecto, plazo y avance', /QPN-LEGADO v1/.test(await texto(page, '.tbl-cartas tbody')) && /5 d háb\./.test(await texto(page, '.tbl-cartas tbody')) && /30 %/.test(await texto(page, '.tbl-cartas tbody')), await texto(page, '.tbl-cartas tbody'));
    check('el proyecto del Formulador conserva su p.gantt', await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).proyectos[1].gantt.tareas.length === 2, KEY));
    await page.screenshot({ path: path.join(SHOTS, '0-lista.png') });

    // 2. «Nueva Carta Gantt»: elegir el proyecto de ejemplo; abrirla no guarda nada
    await page.click('[data-act="nueva"]');
    await page.waitForSelector('#modal[open] .g-pfila');
    check('el diálogo lista los proyectos del Formulador', (await page.$$('#modal .g-pfila')).length === 2);
    await page.fill('#g-pbuscar', 'medidores');
    check('la búsqueda filtra los proyectos', (await page.$$eval('#modal .g-pfila', (xs) => xs.filter((x) => !x.hidden).length)) === 1);
    await page.keyboard.press('Enter');
    check('Enter en la búsqueda no elige nada', await page.$eval('#modal', (d) => d.open));
    await page.click(`#modal .g-pfila[value="p:${UID}"]`);
    await page.waitForSelector('.g-vacio');
    check('se abre vacía, con crear desde las partidas o a mano', !!(await page.$('.g-vacio [data-act="g-partidas"]')) && !!(await page.$('.g-vacio [data-act="g-tarea"]')));
    check('abrirla no crea nada', (await cartas()).length === 1);
    check('el encabezado dice el proyecto', (await texto(page, '.paso-head .paso-num')).startsWith('QPN-EJEMPLO v1'), await texto(page, '.paso-head .paso-num'));
    await page.screenshot({ path: path.join(SHOTS, '1-vacia.png') });

    // 3. Desde las partidas: hito de inicio, una tarea por partida en cadena, hito de entrega
    await page.click('#g-cfg summary');
    await page.evaluate(() => { const el = document.getElementById('g-inicio'); el.value = '2026-10-19'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(500);
    check('el primer cambio guarda la carta y la dirección pasa a #/c/…', (await cartas()).length === 2 && /#\/c\//.test(page.url()), page.url());
    await page.click('.g-vacio [data-act="g-partidas"]');
    await page.waitForSelector('.tbl-gantt tbody tr');
    await wait(300);
    let f = await filas();
    check('5 filas: inicio, 3 partidas y entrega', f.length === 5 && f[0].dias === 'hito' && f[4].dias === 'hito', f.map((x) => x.nombre));
    check('las duraciones vienen de la mano de obra (6, 2 y 4 días)', f.slice(1, 4).map((x) => x.dias).join(',') === '6,2,4', f.map((x) => x.dias));
    check('cada tarea depende de la anterior', f.slice(1).map((x) => x.pred).join(',') === '1,2,3,4', f.map((x) => x.pred));
    check('parte el lunes 19-10-2026', f[1].ini === '19-10-2026', f[1].ini);
    check('12 días hábiles: la entrega cae el martes 03-11-2026', f[3].fin === '03-11-2026' && f[4].ini === '03-11-2026', f.map((x) => x.fin));
    check('todas en la ruta crítica (es una cadena)', f.every((x) => x.critica));
    check('las tareas llevan el código de su partida', (await page.$$eval('.tbl-gantt .pcode', (xs) => xs.map((x) => x.textContent))).join(',') === 'P1,P2,P3');
    check('el resumen dice el plazo', (await texto(page, '#g-resumen')).includes('12 días hábiles'), await texto(page, '#g-resumen'));
    check('la lámina se dibuja y cabe en la página', !!(await page.$('#g-lienzo svg')) && await sinDesborde());
    check('el resumen va en 5 tarjetas', (await page.$$('#g-resumen .kpi-card')).length === 5);
    await page.screenshot({ path: path.join(SHOTS, '2-desde-partidas.png'), fullPage: true });

    // 4. Escala, ayudas y lámina unida a la tabla
    await page.click('label:has(input[name="g-escala"][value="semanas"])');
    await wait(600);
    check('la escala se cambia sobre la lámina y se guarda', (await cartaDe(UID)).gantt.escala === 'semanas');
    await page.click('label:has(input[name="g-escala"][value="auto"])');
    await wait(200);
    const barras = await page.$$eval('#g-lienzo .g-barra', (xs) => xs.map((x) => x.dataset.tip || ''));
    check('cada barra y hito trae su ayuda', barras.length === 5 && barras.every((x) => x.includes('Ruta crítica')), barras);
    await page.hover(`.tbl-gantt tr[data-row="${f[2].uid}"] td.code`);
    await wait(100);
    check('pasar por una fila marca su franja en la lámina', !!(await page.$(`#g-lienzo .g-banda.on[data-uid="${f[2].uid}"]`)));
    await page.click(`#g-lienzo .g-barra[data-uid="${f[3].uid}"]`);
    await wait(500);
    check('clic en una barra lleva a su fila', await page.evaluate((u) => document.activeElement.matches(`[data-g="nombre"][data-gt="${u}"]`), f[3].uid));
    check('la ayuda de las predecesoras nombra la tarea', (await page.$eval(`[data-g="predecesoras"][data-gt="${f[3].uid}"]`, (e) => e.dataset.tip)).includes('Instalación Medidores GN de 1'));

    // 5. Editar sin perder el foco
    const t2 = f[2].uid;
    await page.click(`[data-g="duracion"][data-gt="${t2}"]`);
    await page.fill(`[data-g="duracion"][data-gt="${t2}"]`, '5');
    await wait(250);
    f = await filas();
    check('al escribir la duración se recalcula el término', f[3].fin === '06-11-2026', f.map((x) => x.fin));
    check('…sin perder el foco del campo', await page.evaluate((u) => document.activeElement.matches(`[data-g="duracion"][data-gt="${u}"]`), t2));
    await page.keyboard.press('Tab');

    // 6. Predecesoras: en paralelo (CC), con error
    const t3 = f[3].uid;
    await page.fill(`[data-g="predecesoras"][data-gt="${t3}"]`, '2cc+1, 99');
    await page.keyboard.press('Tab');
    await wait(300);
    f = await filas();
    check('«2cc+1, 99»: queda 2CC+1 y se avisa lo que no existe', f[3].pred === '2CC+1' && (await texto(page, '#toast')).includes('No hay tarea N° 99'), [f[3].pred, await texto(page, '#toast')]);
    check('la tarea 3 empieza un día después de que empieza la 2', f[3].ini === '20-10-2026', f[3].ini);
    check('la tarea 3 ya no es crítica (tiene holgura)', !f[3].critica && f[2].critica, f.map((x) => x.critica));
    await wait(700);
    let g = (await cartaDe(UID)).gantt;
    check('se guarda en la carta', g.tareas.length === 5 && g.tareas[3].predecesoras[0].tipo === 'CC' && g.tareas[3].predecesoras[0].desfase === 1, g.tareas[3]);
    check('el proyecto del Formulador no gana un p.gantt', await page.evaluate(([k, u]) => !JSON.parse(localStorage.getItem(k)).proyectos.find((p) => p.uid === u).gantt, [KEY, UID]));

    // 7. Deshacer y rehacer
    await page.click('#g-resumen');
    await page.keyboard.press('Control+z');
    await wait(400);
    f = await filas();
    check('Ctrl+Z deshace el cambio de predecesoras', f[3].pred === '3', f[3].pred);
    await page.keyboard.press('Control+y');
    await wait(400);
    f = await filas();
    check('Ctrl+Y lo rehace', f[3].pred === '2CC+1', f[3].pred);

    // 8. Calendario corrido y días no laborables
    if (!(await page.$('#g-cfg[open]'))) await page.click('#g-cfg summary');
    await page.click('label:has(input[name="g-cal"][value="corridos"])');
    await wait(300);
    check('en días corridos el plazo cambia', (await texto(page, '#g-resumen')).includes('días corridos'), await texto(page, '#g-resumen'));
    await page.click('label:has(input[name="g-cal"][value="habiles"])');
    await page.fill('#g-nolab', '20-10-2026, mañana');
    await page.keyboard.press('Tab');
    await wait(300);
    check('un día no laborable se lee y lo que no es fecha se avisa', (await page.inputValue('#g-nolab')) === '20-10-2026' && (await texto(page, '#toast')).includes('«mañana»'), [await page.inputValue('#g-nolab'), await texto(page, '#toast')]);
    f = await filas();
    check('el feriado corre la tarea 1 un día', f[1].fin === '27-10-2026', f[1].fin);

    // 9. Menú de la fila: eliminar, agregar, subir, hito
    const t1 = f[1].uid;
    await page.click(`[data-menu="tarea"][data-uid="${t1}"]`);
    await page.waitForSelector('#pop .pop-item');
    await elegir('Eliminar');
    await wait(300);
    f = await filas();
    check('eliminar quita la fila y las que dependían de ella pierden esa predecesora', f.length === 4 && f[1].pred === '' && f[2].pred === '', f.map((x) => x.pred));
    await page.click('[data-act="g-tarea"]');
    await wait(300);
    check('«+ Tarea» agrega al final, con foco en el nombre y después de la anterior', await page.evaluate(() => document.activeElement.dataset.g === 'nombre') && (await filas())[4].pred === '4');
    await page.keyboard.type('Pruebas y puesta en marcha');
    await page.keyboard.press('Tab');
    const t5 = (await filas())[4].uid;
    await page.click(`[data-menu="tarea"][data-uid="${t5}"]`);
    await page.waitForSelector('#pop .pop-item');
    await elegir('Subir');
    await wait(300);
    f = await filas();
    check('subir la cambia de lugar y las predecesoras se renumeran', f[3].nombre === 'Pruebas y puesta en marcha' && f[3].pred === '5' && f[4].dias === 'hito', f.map((x) => [x.nombre, x.pred]));
    await page.click(`[data-menu="tarea"][data-uid="${t5}"]`);
    await page.waitForSelector('#pop .pop-item');
    await elegir('Convertir en hito');
    await wait(300);
    check('convertir en hito', (await filas())[3].dias === 'hito');

    // 10. PDF y Excel descargados de verdad
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="g-pdf"]')]);
    const ruta = path.join(SHOTS, 'carta-gantt.pdf');
    await descarga.saveAs(ruta);
    const pdf = fs.readFileSync(ruta).toString('latin1');
    check('el PDF se descarga con el código del proyecto', /^Carta Gantt QPN-EJEMPLO_v1_/.test(descarga.suggestedFilename()) && descarga.suggestedFilename().endsWith('.pdf'), descarga.suggestedFilename());
    check('es un PDF con la Carta Gantt, el logo y el proyecto', pdf.startsWith('%PDF-1.4') && pdf.includes('(Carta Gantt)') && pdf.includes('/Filter /DCTDecode') && pdf.includes('QPN-EJEMPLO'));
    const [dx] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="g-excel"]')]);
    const rx = path.join(SHOTS, 'carta-gantt.xlsx');
    await dx.saveAs(rx);
    check('el Excel se descarga con el mismo nombre', /^Carta Gantt QPN-EJEMPLO_v1_.*\.xlsx$/.test(dx.suggestedFilename()), dx.suggestedFilename());
    const hoja = await page.evaluate(async (b64) => {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const wb = new window.ExcelJS.Workbook();
      await wb.xlsx.load(u.buffer);
      const ws = wb.getWorksheet('Carta Gantt');
      return { nombres: wb.worksheets.map((w) => w.name), titulo: ws && ws.getCell('A1').value, tarea: ws && ws.getCell('B6').value, partida: ws && ws.getCell('C6').value, fill: ws && ws.getRow(6).getCell(10).fill };
    }, fs.readFileSync(rx).toString('base64'));
    check('…con la hoja «Carta Gantt», las tareas, la partida (P1 se eliminó: la fila 6 es P2) y la grilla pintada', hoja.titulo === 'CARTA GANTT' && /Instalaci/.test(hoja.tarea) && hoja.partida === 'P2' && hoja.fill && hoja.fill.fgColor, hoja);

    // 11. Carta suelta: sin proyecto, con nombre propio
    await page.click('.g-volver');
    await page.waitForSelector('.tbl-cartas');
    check('la lista muestra las dos cartas', (await page.$$('.tbl-cartas tbody tr[data-abrir]')).length === 2);
    await page.click('[data-act="nueva"]');
    await page.waitForSelector('#modal[open]');
    await page.click('#modal button[value="suelta"]');
    await page.waitForSelector('#g-nombre');
    check('la carta suelta pide su nombre', await page.evaluate(() => document.activeElement.id === 'g-nombre'));
    await page.keyboard.type('Mantención ficticia de prueba');
    await wait(600);
    const suelta = (await cartas()).find((c) => c.nombre === 'Mantención ficticia de prueba');
    check('se guarda sin proyecto', !!suelta && suelta.proyecto === null, suelta);
    await page.click('[data-act="g-tarea"]');
    await page.keyboard.type('Revisión');
    await page.keyboard.press('Tab');
    const [ds] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="g-pdf"]')]);
    await ds.saveAs(path.join(SHOTS, 'suelta.pdf'));
    const pdfS = fs.readFileSync(path.join(SHOTS, 'suelta.pdf')).toString('latin1');
    check('su PDF lleva su nombre, sin «v1»', /^Carta Gantt Mantencion_ficticia_de_prueba/.test(ds.suggestedFilename()) && pdfS.includes('Mantenci') && !/\) v1 /.test(pdfS), ds.suggestedFilename());

    // 12. Duplicar, eliminar y restaurar desde la lista
    await page.click('.g-volver');
    await page.waitForSelector('.tbl-cartas');
    const fila = await page.$(`.tbl-cartas tr[data-abrir="${suelta.uid}"] [data-menu="carta"]`);
    await fila.click();
    await page.waitForSelector('#pop .pop-item');
    await elegir('Eliminar');
    await page.waitForSelector('#modal[open]');
    await page.click('#modal button:has-text("Eliminar")');
    await wait(400);
    check('eliminar la manda a «Eliminadas»', (await page.$$('.tbl-cartas tbody tr[data-abrir]')).length === 2 && /Mantención ficticia/.test(await texto(page, '.g-eliminadas')));
    await page.click('.g-eliminadas summary');
    await page.click(`.g-eliminadas [data-act="restaurar"][data-uid="${suelta.uid}"]`);
    await wait(300);
    check('restaurar la devuelve a la lista', (await page.$$('.tbl-cartas tbody tr[data-abrir]')).length === 3);
    await (await page.$(`.tbl-cartas tr[data-abrir="flegado01"] [data-menu="carta"]`)).click();
    await page.waitForSelector('#pop .pop-item');
    await elegir('Duplicar');
    await page.waitForSelector('#g-nombre');
    const dup = (await cartas()).find((c) => /\(copia\)/.test(c.nombre));
    check('duplicar deja una copia suelta, con las mismas tareas', !!dup && dup.proyecto === null && dup.gantt.tareas.length === 2 && dup.gantt.tareas[1].predecesoras[0].uid === dup.gantt.tareas[0].uid, dup);

    // 13. Vincular la copia a otro proyecto: el que ya tiene carta no se puede
    await page.click('[data-act="vincular"]');
    await page.waitForSelector('#modal[open] .g-pfila');
    await page.click(`#modal .g-pfila[value="p:${UID}"]`);
    await wait(300);
    check('un proyecto con carta no recibe otra', (await texto(page, '#toast')).includes('ya tiene su propia Carta Gantt'), await texto(page, '#toast'));

    // 14. El Portal la abre con el proyecto elegido: #/proyecto/<uid>
    await page.goto(`${GANTT}#/proyecto/${UID}`);
    await page.waitForSelector('.tbl-gantt');
    check('#/proyecto/<uid> abre la carta de ese proyecto', /#\/c\//.test(page.url()) && (await filas()).length === 5, page.url());

    // 15. Teléfono y modo oscuro
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(400);
    check('teléfono: la página no se desplaza de lado', await sinDesborde());
    await page.screenshot({ path: path.join(SHOTS, '3-telefono.png'), fullPage: true });
    await page.setViewportSize({ width: 1360, height: 950 });
    await page.evaluate(() => { localStorage.setItem('quempin_gantt_theme', 'dark'); });
    await page.reload();
    await page.waitForSelector('#g-lienzo svg');
    await page.screenshot({ path: path.join(SHOTS, '4-oscuro.png'), fullPage: true });
    check('modo oscuro: la lámina no queda en blanco', await page.$eval('#g-lienzo', (e) => getComputedStyle(e).backgroundColor !== 'rgb(255, 255, 255)'));
    await page.evaluate(() => { localStorage.setItem('quempin_gantt_theme', 'light'); });

    // 16. Enter en el nombre de la última tarea agrega otra; borrar todas las tareas (con confirmación)
    await page.reload();
    await page.waitForSelector('[data-act="g-borrar"]');
    const ultima = (await filas())[4].uid;
    await page.focus(`[data-g="nombre"][data-gt="${ultima}"]`);
    await page.keyboard.press('Enter');
    await wait(300);
    check('Enter en la última tarea agrega otra con foco en su nombre', (await filas()).length === 6 && await page.evaluate(() => document.activeElement.dataset.g === 'nombre'));
    await page.click('[data-act="g-borrar"]');
    await page.waitForSelector('#modal[open]');
    await page.click('#modal button:has-text("Borrar")');
    await wait(900);
    check('borrar deja la carta sin tareas', !!(await page.$('.g-vacio')) && (await cartaDe(UID)).gantt.tareas.length === 0);

    // 17. El Formulador ya no tiene la Carta Gantt
    await page.goto(`${RAIZ}index.html#/p/${UID}/resumen`);
    await page.waitForSelector('#tabs .paso-tab');
    check('Formulador: sin pestaña «Carta Gantt»', !(await page.$('#tabs [data-tab="gantt"]')) && !(await texto(page, '#tabs')).includes('Gantt'), await texto(page, '#tabs'));
    await page.click('[data-menu="editor-more"]');
    await page.waitForSelector('#pop .pop-item');
    check('Formulador: el menú del proyecto no la ofrece', !(await texto(page, '#pop')).includes('Carta Gantt'), await texto(page, '#pop'));
    await page.keyboard.press('Escape');
    const exp = await page.evaluate(async (uid) => {
      const p = window.QStore.get(uid);
      const buf = await window.QExcel.exportProject(window.QStore.get('legado01'), { soloDatos: true });
      const wb = new window.ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const c = window.QStore.cloneProject(window.QStore.get('legado01'));
      return { hojas: wb.worksheets.map((w) => w.name), copiaSinGantt: !c.gantt, legadoConserva: !!window.QStore.get('legado01').gantt, p: !!p, gantt: typeof window.QGantt };
    }, UID);
    check('Formulador: su Excel ya no trae la hoja «Carta Gantt»', !exp.hojas.includes('Carta Gantt'), exp.hojas);
    check('Formulador: conserva p.gantt antiguo (para el traspaso) y una copia no lo arrastra', exp.legadoConserva && exp.copiaSinGantt, exp);
    check('Formulador: ya no carga el cálculo de la Gantt', exp.gantt === 'undefined', exp.gantt);
    await page.goto(`${RAIZ}index.html#/p/legado01/gantt`);
    await page.waitForURL(/gantt\/#\/(c|proyecto)\//, { timeout: 8000 }).catch(() => {});
    await page.waitForSelector('.tbl-gantt', { timeout: 8000 }).catch(() => {});
    check('Formulador: un enlace antiguo #/p/<uid>/gantt lleva a la carta en la herramienta nueva', /\/gantt\/#\/c\/flegado01/.test(page.url()), page.url());
    check('sin errores de JavaScript', errores.length === 0, errores);
  } catch (e) {
    results.push('FAIL excepción: ' + (e && e.stack || e));
    await page.screenshot({ path: path.join(SHOTS, 'error.png'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
  const ok = results.filter((r) => r.startsWith('OK')).length;
  results.forEach((r) => console.log(r));
  console.log(`\n${ok}/${results.length} OK`);
  process.exit(ok === results.length ? 0 : 1);
})();
