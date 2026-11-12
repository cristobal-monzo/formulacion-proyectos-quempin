// «Llevar al Formulador» desde el tablero «Oportunidades» (2026-10-16): #/oportunidad/<datos> abre
// «Nuevo proyecto» con la carpeta propuesta y el proyecto nace con nombre, organismo, ID, ubicación,
// monto, cierre y visita; si la licitación ya tiene proyecto, lo abre. Biblioteca y datos FICTICIOS en
// OPFS (ver ux/recorrido.js).
// Uso: servir el repo en http://127.0.0.1:8798 y  node .prueba/oportunidad/e2e.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = require(path.join(__dirname, '..', 'ux', 'recorrido.js'));
const { BASE, wait, prepararBiblioteca, foto, texto, hay, contexto, chromium, errores } = R;

const results = [];
const check = (n, c, x) => { results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`); };

// El mismo texto que arma el tablero (enlaceFormulador de template.html)
const ctxO = vm.createContext({ atob, btoa, TextEncoder, TextDecoder });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'oportunidad.js'), 'utf-8'), ctxO);
const enlace = (d) => BASE + '#/oportunidad/' + ctxO.QOportunidad.codificar(Object.assign({ v: 1 }, d));
const dos = (n) => String(n).padStart(2, '0');
const enDias = (d) => { const f = new Date(); f.setDate(f.getDate() + d); return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}T15:00`; };

const LICITACION = {
  codigo: '5555-12-LE26', compraAgil: false, nombre: 'Mantención de calderas liceo (ficticio)', organismo: 'Municipalidad Ficticia',
  unidad: 'Educación', comuna: 'Quilpué', region: 'Región de Valparaíso', tipo: 'LE', cierre: enDias(12), monto: 17421600, duracionMeses: 24,
  visita: { fecha: enDias(4).slice(0, 10) + 'T10:00', obligatoria: true, pasada: false }, descripcion: 'Mantención preventiva de 3 calderas (ficticio).', req: ''
};
// Ya está en la Planilla (N° 301, con carpeta): la planilla manda en título y presupuesto
const CON_REQ = Object.assign({}, LICITACION, { codigo: '6666-7-LE26', nombre: 'MEDIDORES GAS COLEGIO (FICTICIO)', monto: 12000000, req: '301', visita: null });

const proyectos = (page) => page.evaluate(() => window.QStore.all().map((p) => ({
  uid: p.uid, codigo: p.codigo, titulo: p.titulo, cliente: p.cliente, idLicitacion: p.idLicitacion, ubicacion: p.ubicacion,
  descripcion: p.descripcion, presupuesto: p.parametros.presupuestoMaximo, conIva: p.parametros.presupuestoIncluyeIva,
  carpeta: (p.vinculos && p.vinculos.carpetaOferta && p.vinculos.carpetaOferta.nombre) || '', req: (p.vinculos && p.vinculos.requerimiento && p.vinculos.requerimiento.numero) || ''
})));
async function confirmarModal(page) {
  const ini = await page.$('#cp-ini');
  if (ini) {
    await page.evaluate(() => { const e = document.querySelector('#cp-ini'); e.value = 'CM'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  await page.click('#modal .modal-foot .btn-primario');
  await page.waitForSelector('#tab-body', { timeout: 10000 });
  await wait(900);
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    // ================= Con la biblioteca conectada: el formulario se abre solo =================
    const { ctx, page } = await contexto(browser, { width: 1366, height: 900 });
    await ctx.addInitScript(() => { try { localStorage.setItem('quempin_usuario', 'CM'); localStorage.setItem('qpn.formulacion.iniciales', 'CM'); } catch (e) { /* */ } window.__abiertas = []; window.open = (u) => { window.__abiertas.push(String(u)); return null; }; });
    await page.goto(BASE + '#/guia');
    await prepararBiblioteca(page);
    await page.goto(BASE + '#/');
    await page.waitForSelector('#app .page');
    await page.click('[data-act="compartir"]');   // conectar la biblioteca (el selector devuelve la de OPFS)
    await wait(1500);

    await page.goto(enlace(LICITACION));
    await page.waitForSelector('#modal[open] #np-num', { timeout: 10000 });   // «Nuevo proyecto» (2026-10-19)
    await wait(900);
    check('la dirección queda corta: #/oportunidad/<código>', page.url().endsWith('#/oportunidad/5555-12-LE26'), page.url());
    check('el formulario se abre solo: «Nuevo proyecto desde Mercado Público»', /Nuevo proyecto desde Mercado Público/.test(await texto(page, '#modal')));
    check('sin N° en la planilla: el nombre de la licitación, el N° vacío y la carpeta por crear con ese nombre',
      (await page.inputValue('#np-tit')) === LICITACION.nombre && (await page.inputValue('#np-num')) === '' && await page.$eval('#np-opciones input[value="crear"]', (e) => e.checked),
      [await page.inputValue('#np-tit'), await page.inputValue('#np-num')]);
    const aviso = await texto(page, '#app .nota-op');
    check('detrás, el aviso de la lista muestra lo que se lleva', /Municipalidad Ficticia/.test(aviso) && /5555-12-LE26/.test(aviso) && /\$17\.421\.600 con IVA/.test(aviso) && /Quilpué, Región de Valparaíso/.test(aviso), aviso);
    await foto(page, 'formulario-desde-oportunidad');
    const elegida = await texto(page, '#np-carpeta');
    // Sin N° (2026-11-12): el Formulador ya no lo registra; ofrece «Ingresar en Requerimientos», que lleva al Portal los
    // datos de la licitación, y el proyecto se puede crear igual, con el nombre como código
    check('sin N°: la carpeta se crea con el nombre y se ofrece ingresarla en Requerimientos', /Sí, crear «Mantención de calderas liceo \(ficticio\)»/.test(elegida)
      && /Ingresar en Requerimientos/.test(elegida) && !/registrar el proyecto en la Planilla/.test(elegida), elegida);
    await page.click('#np-carpeta .np-portal');
    await wait(500);
    const abiertas = await page.evaluate(() => window.__abiertas.slice());
    const rq = abiertas.length === 1 && /\/portal\/#\/planilla\?nuevo=/.test(abiertas[0]) ? JSON.parse(decodeURIComponent(abiertas[0].split('nuevo=')[1])) : {};
    check('al Portal va como Mercado Público, con su ID, cliente, ubicación, cierre y presupuesto', rq.titulo === LICITACION.nombre && rq.canal === 'Mercado Público'
      && rq.referencia === '5555-12-LE26' && rq.cliente === 'Municipalidad Ficticia' && rq.ubicacion === 'Quilpué, Región de Valparaíso' && rq.presupuesto === 17421600
      && /^\d{4}-\d{2}-\d{2}T15:00$/.test(rq.cierre || ''), abiertas);
    check('sin N°: nada en el buzón para la Planilla', (await page.evaluate(() => window.QIntercambio.leerBuzon({ tipos: ['nuevo-requerimiento'] }))).length === 0);
    // Otra vez el enlace: esta vez se crea el proyecto sin N°
    await page.goto(enlace(LICITACION));
    await page.waitForSelector('#modal[open] #np-num', { timeout: 10000 });
    await wait(900);
    await confirmarModal(page);
    let ps = await proyectos(page);
    let p = ps.find((x) => x.idLicitacion === '5555-12-LE26');
    check('el proyecto nace con título, cliente, ID y ubicación', p && p.titulo === LICITACION.nombre && p.cliente === 'Municipalidad Ficticia' && p.ubicacion === 'Quilpué, Región de Valparaíso', p);
    check('presupuesto: el monto publicado, con IVA', p && p.presupuesto === 17421600 && p.conIva === true, p);
    check('descripción: alcance, cierre, visita obligatoria y duración', p && /^Mantención preventiva de 3 calderas/.test(p.descripcion) &&
      /cierre \d{2}-\d{2}-\d{4} 15:00/.test(p.descripcion) && /visita a terreno .* \(obligatoria\)/.test(p.descripcion) && /contrato de 24 meses/.test(p.descripcion), p && p.descripcion);
    check('queda unido a la carpeta de la oferta', p && /Mantención de calderas liceo/.test(p.carpeta), p);
    check('el editor muestra el título y el ID de licitación', (await page.inputValue('[data-f="titulo"]')) === LICITACION.nombre && (await page.inputValue('[data-f="idLicitacion"]')) === '5555-12-LE26');
    const aviso2 = await texto(page, '#toast');
    // El título ya lo puso la carpeta (que se creó con el nombre de la licitación): el aviso no lo repite
    check('el aviso dice qué llegó de Mercado Público', /creado con su carpeta nueva «Mantención de calderas liceo \(ficticio\)»\. Desde Mercado Público: categoría Licitación, cliente, ID de licitación, ubicación, descripción, presupuesto/.test(aviso2), aviso2);
    check('nace con la categoría «Licitación» (2026-10-27)', (await page.inputValue('#f-categoria')) === 'Licitación');
    await foto(page, 'proyecto-desde-oportunidad');

    // ---- Otra vez el mismo enlace (como lo hace el Portal: solo cambia el #): abre el que ya está ----
    await page.evaluate((h) => { location.hash = h; }, enlace(LICITACION).split('#')[1]);
    await wait(1200);
    check('la licitación ya tiene proyecto: lo abre en vez de crear otro', page.url().includes(`#/p/${p.uid}/`) && !(await hay(page, '#modal[open]')), page.url());
    check('y lo dice', /ya está en el Formulador/.test(await texto(page, '#toast')), await texto(page, '#toast'));
    check('sigue habiendo un solo proyecto de esa licitación', (await proyectos(page)).filter((x) => x.idLicitacion === '5555-12-LE26').length === 1);

    // ---- En la Planilla con carpeta (N° 301): la carpeta queda elegida y la planilla manda ----
    await page.goto(enlace(CON_REQ));
    await page.waitForSelector('#modal[open] #np-num', { timeout: 10000 });
    await wait(1200);
    const el301 = await page.$eval('#np-opciones label:has(input[value="usar"]:checked)', (e) => e.textContent).catch(() => '');
    check('con N° de la planilla: propone usar su carpeta', /301\. Medidores gas natural colegio/.test(el301), el301);
    await confirmarModal(page);
    ps = await proyectos(page);
    p = ps.find((x) => x.idLicitacion === '6666-7-LE26');
    check('con N° de la planilla: título y presupuesto de la planilla, código = nombre de la carpeta', p && p.titulo === 'Medidores gas natural colegio (ficticio)' && p.presupuesto === 9800000 &&
      p.codigo === '301. Medidores gas natural colegio (ficticio)' && p.req === '301', p);
    check('con N° de la planilla: el cliente y el ID vienen de Mercado Público', p && p.cliente === 'Municipalidad Ficticia' && p.idLicitacion === '6666-7-LE26', p);

    // ---- Enlaces que no sirven ----
    await page.goto(BASE + '#/oportunidad/zz');
    await wait(900);
    check('enlace ilegible: avisa y vuelve a la lista', page.url().endsWith('#/') && /No se pudo leer la oportunidad/.test(await texto(page, '#toast')), page.url());
    await ctx.close();

    // ================= Sin la biblioteca conectada: el aviso espera un clic =================
    const b = await contexto(browser, { width: 390, height: 844 });
    const raro = Object.assign({}, LICITACION, { codigo: '7777-1-LE26', nombre: '<img src=x onerror="window.__xss=1"> Calderas (ficticio)', monto: null });
    await b.page.goto(enlace(raro));
    await b.page.waitForSelector('#app .nota-op', { timeout: 10000 });
    await wait(800);
    check('sin permiso de la biblioteca no abre nada solo', !(await hay(b.page, '#modal[open]')));
    check('el aviso ofrece «Crear el proyecto»', await hay(b.page, '#app .nota-op [data-act="nuevo-op"]'));
    const txt = await texto(b.page, '#app .nota-op');
    check('sin monto publicado lo dice', /Presupuesto\s*no publicado/.test(txt), txt);
    check('el nombre se muestra como texto, sin interpretar HTML', /<img src=x/.test(txt) && !(await hay(b.page, '#app .nota-op img')) && !(await b.page.evaluate(() => window.__xss)), txt);
    const ancho = await b.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check('teléfono: el aviso no hace scroll lateral', ancho);
    await foto(b.page, 'aviso-telefono');
    await b.ctx.close();
  } catch (e) {
    check('sin excepciones', false, String(e && e.stack || e));
  } finally {
    await browser.close();
  }
  check('sin errores de JavaScript', !errores.length, errores);
  console.log(results.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fallas}/${results.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
