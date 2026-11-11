// Prueba de js/pegar.js sin navegador: filas de costos pegadas desde Excel, desde la planilla de
// formulación antigua o desde la cotización del Cotizador Histórico. Datos FICTICIOS.
// Uso: node .prueba/pegar/unidad.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/pegar.js'), 'utf-8'), ctx);
const G = ctx.QPegar;

const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);
const J = (x) => JSON.stringify(x);

// ---- Números como se escriben en Chile -----------------------------------------------------------
const casos = [['$180.000', 180000], ['180000', 180000], ['1.234.567', 1234567], ['1.234,56', 1234.56], ['12,5', 12.5], ['0,75', 0.75],
  ['1.5', 1.5], ['0.500', 0.5], ['12.50', 12.5], ['1,234,567', 1234567], ['$ 14.580', 14580], ['(1.000)', -1000], ['abc', null], ['', null], ['US$ 1.200,50', 1200.5]];
casos.forEach(([t, v]) => check(`número «${t}» → ${v}`, G.numero(t) === v, G.numero(t)));

// ---- Unidades ---------------------------------------------------------------------------------------
check('unidades comunes → las del Formulador', ['un', 'UND', 'c/u', 'mts', 'ML', 'm²', 'Kgs', 'Global', 'lts', 'hrs', 'días'].map(G.unidad).join(',') === 'Un.,Un.,Un.,m,m,m2,kg,gl,lt,hr,día',
  ['un', 'UND', 'c/u', 'mts', 'ML', 'm²', 'Kgs', 'Global', 'lts', 'hrs', 'días'].map(G.unidad));
check('unidad desconocida queda tal cual', G.unidad('rollo') === 'rollo' && G.unidad('') === '');

// ---- Con encabezado (cualquier orden) ------------------------------------------------------------------
let r = G.interpretar('Cantidad\tDescripción\tUnidad\tCosto unitario\tTotal\n3\tMedidor G4 (ficticio)\tUn.\t$180.000\t$540.000\n40\tCañería cobre 3/4" (ficticio)\tmts\t9.000\t360.000\n\tTotal\t\t\t$900.000');
check('encabezado en cualquier orden: 2 filas, el total se omite', r.encabezado && r.filas.length === 2 && r.omitidas === 1, r);
check('fila 1 completa', J(r.filas[0]) === J({ descripcion: 'Medidor G4 (ficticio)', unidad: 'Un.', cantidad: 3, costoUnitario: 180000 }), r.filas[0]);
check('fila 2: comillas y unidad normalizada', r.filas[1].descripcion === 'Cañería cobre 3/4" (ficticio)' && r.filas[1].unidad === 'm' && r.filas[1].costoUnitario === 9000, r.filas[1]);
check('el costo es el unitario, no el total', r.columnas.costo === 3, r.columnas);

// ---- La cotización del tablero del Cotizador («Copiar tabla para Excel») -----------------------------
r = G.interpretar('Elemento\tPromedio de costo\tCosto más barato\tProveedor más barato\tCosto actualizado según UF\nVálvula bola 2" (ficticio)\t41000\t38000\tFerretería Ficticia\t42500\nFlange 2" (ficticio)\t14000\t13500\tProveedor Demo\t14580');
check('cotizador: usa el costo actualizado por UF', r.filas.length === 2 && r.filas[0].costoUnitario === 42500 && r.filas[1].costoUnitario === 14580 && r.filas[0].cantidad === 1, r);
r = G.interpretar('Descripción\tUnidad\tCantidad\tCosto unitario c/IVA\nTermocupla (ficticio)\tUn.\t2\t11.900');
check('encabezado que dice c/IVA', r.conIva === true && r.filas[0].costoUnitario === 11900, r);
r = G.interpretar('Descripción\tUnidad\tCantidad\tCosto unitario neto\nTermocupla (ficticio)\tUn.\t2\t10.000');
check('encabezado que dice neto', r.conIva === false, r);
r = G.interpretar('Descripción\tCantidad\tCosto\nSin unidad (ficticio)\t2,5\t1.000');
check('sin columna de unidad: unidad vacía; cantidad decimal con coma', r.filas[0].unidad === '' && r.filas[0].cantidad === 2.5, r.filas[0]);

// ---- Sin encabezado: por contenido ---------------------------------------------------------------------
r = G.interpretar('Medidor G4 (ficticio)\tUn.\t3\t180.000\t540.000\nRegulador (ficticio)\t2\t25.000\nSolo costo (ficticio)\t$ 7.500\nSolo nombre (ficticio)');
check('sin encabezado: 4 filas', !r.encabezado && r.filas.length === 4, r);
check('sin encabezado: unidad, cantidad y costo; el total no se usa', J(r.filas[0]) === J({ descripcion: 'Medidor G4 (ficticio)', unidad: 'Un.', cantidad: 3, costoUnitario: 180000 }), r.filas[0]);
check('sin encabezado: dos números = cantidad y costo', r.filas[1].cantidad === 2 && r.filas[1].costoUnitario === 25000, r.filas[1]);
check('sin encabezado: un número = costo, cantidad 1', r.filas[2].cantidad === 1 && r.filas[2].costoUnitario === 7500, r.filas[2]);
check('sin encabezado: solo el nombre (costo 0, se completa después)', r.filas[3].costoUnitario === 0 && r.filas[3].cantidad === 1, r.filas[3]);
r = G.interpretar('Medidor (ficticio);Un.;3;180000\nRegulador (ficticio);Un.;1;25000');
check('separado por punto y coma (CSV de Excel en español)', r.filas.length === 2 && r.filas[0].costoUnitario === 180000, r);
r = G.interpretar('Medidor (ficticio)\tProveedor Ficticio\nTotal\t900000');
check('sin números ni unidad se omite; «Total» también', r.filas.length === 0 && r.omitidas === 2, r);
check('texto vacío', G.interpretar('').filas.length === 0 && G.interpretar('  \n ').filas.length === 0);
check('cantidad 0 o negativa queda en 1; costo negativo en 0', (() => { const x = G.interpretar('A (ficticio)\t0\t-5').filas[0]; return x.cantidad === 1 && x.costoUnitario === 0; })(), G.interpretar('A (ficticio)\t0\t-5'));

results.forEach((x) => console.log(x));
const fallas = results.filter((x) => x.startsWith('FAIL')).length;
console.log(`\n${results.length - fallas}/${results.length} OK`);
process.exit(fallas ? 1 : 0);
