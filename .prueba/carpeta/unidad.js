// Prueba de js/oferta.js sin navegador (2026-10-19): el nombre «N°. Nombre» de la carpeta, que es también el
// código del proyecto; el nombre del Excel; las direcciones quempin:// que abren la carpeta o la trasladan
// a Gestión de Proyectos (QUEMPIN.exe: copia allá y el original en «0 OFERTAS ADJUDICADAS»), y el vínculo
// durante y después. Si Sistema QUEMPIN
// está en este equipo, sus direcciones se leen además con su propio app/carpetas.py.
// Uso: node .prueba/carpeta/unidad.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');
const O = require(path.join(RAIZ, 'js', 'oferta.js'));

const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);

// ---- 1. «N°. Nombre» ---------------------------------------------------------------------------
check('N° y nombre', O.nombreOferta('305', 'Hospital Quintero') === '305. Hospital Quintero', O.nombreOferta('305', 'Hospital Quintero'));
check('el N° puede venir como número', O.nombreOferta(305, '  Calderas   Polideportivo ') === '305. Calderas Polideportivo');
check('sin N°, solo el nombre', O.nombreOferta('', 'Quemador H2 30kW') === 'Quemador H2 30kW');
check('un N° que no es número no se usa', O.nombreOferta('abc', 'Quemador') === 'Quemador');
check('sin nombre no hay código', O.nombreOferta('305', '   ') === '' && O.nombreOferta('305', null) === '');
check('los caracteres que Windows no acepta en carpetas pasan a «-»', O.nombreOferta('12', 'A/B: C?') === '12. A-B- C-', O.nombreOferta('12', 'A/B: C?'));
const largo = O.nombreOferta('305', 'x'.repeat(150));
check('hasta 100 caracteres, como la carpeta', largo.length === 100 && largo.startsWith('305. x'), largo.length);
const casos = [['305', 'Hospital Quintero'], ['', 'Reñaca - Crematorio'], ['7', 'Quilpué & Quintero (2)'], ['280', 'UMAG - Conexión y PH Lab 1']];
check('es el mismo nombre con que se crea la carpeta', casos.every(([n, t]) => O.nombreCarpetaNueva(n, t, []).nombre === O.nombreOferta(n, t)),
  casos.map(([n, t]) => [O.nombreCarpetaNueva(n, t, []).nombre, O.nombreOferta(n, t)]));
check('tildes compuestas quedan en la forma de siempre (NFC)', O.nombreOferta('3', 'Quilpué') === '3. Quilpué');

// ---- 2. El Excel de la carpeta -----------------------------------------------------------------
check('Excel con código «N°. Nombre»: solo el N° (el nombre ya está en la carpeta)', O.nombreBase({ codigo: '305. Hospital Quintero', version: 2 }) === 'Formulación 305 v2', O.nombreBase({ codigo: '305. Hospital Quintero', version: 2 }));
check('Excel con un código de antes: igual que siempre', O.nombreBase({ codigo: 'QMPN-2026-280', version: 1 }) === 'Formulación QMPN-2026-280 v1' && O.nombreBase({ codigo: 'KPH2', version: 1 }) === 'Formulación KPH2 v1');
const sinN = O.nombreBase({ codigo: 'Quemador de plumas industriales de alta eficiencia para planta', version: 1 });
check('Excel con un código largo sin N°: hasta 40 caracteres del código', sinN === 'Formulación Quemador de plumas industriales de alta v1', sinN);
check('los nombres posibles siguen siendo «Formulación … .xlsx»', O.candidatos({ codigo: '305. Hospital Quintero', version: 1 }).every((n) => /^Formulación 305 v1( \(\d\))?\.xlsx$/.test(n)));

// ---- 3. Direcciones para QUEMPIN.exe ---------------------------------------------------------------
const vF = { nombre: '302. Hospital Quilpué', ruta: ['0 OFERTAS PRESENTADAS', '302. Hospital Quilpué'], numero: '302' };
const vG = { nombre: '250. Catedral', ruta: ['0 OFERTAS ADJUDICADAS', '250. Catedral'], numero: '250', gestion: { copiada: '2026-10-19T12:00:00.000Z' } };
const vA = { nombre: 'Quilpué & Quintero (2)', ruta: ['Quilpué & Quintero (2)'] };
check('abrir en Formulación', O.enlaceCarpeta(vF) === 'quempin://carpeta/formulacion/0%20OFERTAS%20PRESENTADAS/302.%20Hospital%20Quilpu%C3%A9', O.enlaceCarpeta(vF));
check('abrir la copia de Gestión: en su raíz, con el mismo nombre', O.enlaceCarpeta(vG, true) === 'quempin://carpeta/gestion/250.%20Catedral', O.enlaceCarpeta(vG, true));
check('abrir el original: en Adjudicadas', O.enlaceCarpeta(vG) === 'quempin://carpeta/formulacion/0%20OFERTAS%20ADJUDICADAS/250.%20Catedral', O.enlaceCarpeta(vG));
check('& y paréntesis viajan codificados', O.enlaceCarpeta(vA) === 'quempin://carpeta/formulacion/Quilpu%C3%A9%20%26%20Quintero%20(2)', O.enlaceCarpeta(vA));
check('trasladar: siempre desde Formulación', O.enlaceTraslado(vF) === 'quempin://trasladar/formulacion/0%20OFERTAS%20PRESENTADAS/302.%20Hospital%20Quilpu%C3%A9', O.enlaceTraslado(vF));

// ---- 4. El vínculo durante y después del traslado ---------------------------------------------------
const ahora = new Date('2026-10-19T12:00:00Z');
check('antes: se escribe el Excel, sin copia en Gestión', O.escribible(vF) && !O.copiaEnGestion(vF) && !O.trasladoPedido(vF));
const pedido = O.pedirTraslado(vF, 'CM', vF.ruta, ahora);
check('pedido: el Excel espera, la ruta no cambia, se anota de dónde parte y el original queda igual', !O.escribible(pedido) && O.trasladoPedido(pedido) && pedido.traslado.por === 'CM'
  && pedido.traslado.pedido === '2026-10-19T12:00:00.000Z' && pedido.traslado.desde.join('/') === vF.ruta.join('/') && pedido.ruta.join('/') === vF.ruta.join('/') && !vF.traslado, pedido);
const vuelve = O.sinTraslado(pedido);
check('dejarlo así: se vuelve a escribir', O.escribible(vuelve) && !('traslado' in vuelve));
const hecho = O.conCopiaEnGestion(pedido, ['0 OFERTAS ADJUDICADAS', '302. Hospital Quilpué'], true, ahora);
check('hecho: el original en Adjudicadas, la copia anotada y el Excel vuelve a escribirse', O.escribible(hecho) && !O.trasladoPedido(hecho) && hecho.ruta.join('/') === '0 OFERTAS ADJUDICADAS/302. Hospital Quilpué'
  && O.copiaEnGestion(hecho).copiada === '2026-10-19T12:00:00.000Z' && hecho.numero === '302', hecho);
const sinVer = O.conCopiaEnGestion(pedido, null, false, ahora);
check('sin poder verlo (ya estaba en Adjudicadas): queda como pedida y la ruta no cambia', O.copiaEnGestion(sinVer).pedida === '2026-10-19T12:00:00.000Z' && !O.copiaEnGestion(sinVer).copiada && sinVer.ruta.join('/') === vF.ruta.join('/'), sinVer);
check('el vínculo con copia sigue siendo válido', !!O.vinculo({ vinculos: { carpetaOferta: hecho } }));
check('Adjudicadas se reconoce', O.enAdjudicadas(['0 OFERTAS ADJUDICADAS', 'x']) && O.enAdjudicadas(['0 Ofertas Adjudicadas', 'x']) && !O.enAdjudicadas(['0 OFERTAS PRESENTADAS', 'x']) && !O.enAdjudicadas(['x']));
check('el estado de la interfaz: trasladando', O.info({ uid: 'u1', codigo: '302. Hospital Quilpué', version: 1, vinculos: { carpetaOferta: pedido } }).estado === 'trasladando');

// ---- 5. Las mismas direcciones, leídas por QUEMPIN.exe (Sistema QUEMPIN app/carpetas.py) -------------
const SISTEMA = path.join(RAIZ, '..', '..', 'Sistema QUEMPIN');
if (fs.existsSync(path.join(SISTEMA, 'app', 'carpetas.py'))) {
  const urls = [O.enlaceCarpeta(vF), O.enlaceCarpeta(vG, true), O.enlaceCarpeta(vA), O.enlaceTraslado(vF)];
  const codigo = 'import json,sys\nfrom app import carpetas\nprint(json.dumps([list((lambda p: (p.accion, p.biblioteca, list(p.ruta)))(carpetas.pedido([u]))) for u in sys.argv[1:]], ensure_ascii=False))';
  let r = null;
  for (const py of [['py', ['-3.11']], ['py', ['-3']], ['python', []]]) {
    r = spawnSync(py[0], py[1].concat(['-c', codigo]).concat(urls), { cwd: SISTEMA, encoding: 'utf-8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
    if (r.status === 0) break;
  }
  if (r && r.status === 0) {
    const leidos = JSON.parse(r.stdout);
    check('QUEMPIN.exe lee las direcciones con la misma carpeta', JSON.stringify(leidos) === JSON.stringify([
      ['carpeta', 'formulacion', vF.ruta], ['carpeta', 'gestion', ['250. Catedral']], ['carpeta', 'formulacion', vA.ruta], ['trasladar', 'formulacion', vF.ruta]]), leidos);
  } else {
    console.log('(sin Python con Sistema QUEMPIN: se omite la lectura con app/carpetas.py)', r && (r.stderr || '').slice(0, 200));
  }
}

console.log(results.join('\n'));
const fail = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fail}/${results.length} OK`);
process.exit(fail ? 1 : 0);
