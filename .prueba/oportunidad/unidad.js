// Prueba de js/oportunidad.js sin navegador: la oportunidad de Mercado Público que llega del tablero
// «Oportunidades» con «Llevar al Formulador» (2026-10-16). Datos FICTICIOS.
// Uso: node .prueba/oportunidad/unidad.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const ctx = vm.createContext({ atob, btoa, TextEncoder, TextDecoder });
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/oportunidad.js'), 'utf-8'), ctx);
const O = ctx.QOportunidad;

const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);

/* Lo mismo que arma enlaceFormulador() del tablero (template.html de Oportunidades) */
const DATOS = {
  v: 1, codigo: '5555-12-le26', compraAgil: false, nombre: 'MANTENCIÓN DE CALDERAS LICEO (FICTICIO)',
  organismo: 'Municipalidad Ficticia', unidad: 'Departamento de Educación', comuna: 'Quilpué', region: 'Región de Valparaíso',
  tipo: 'LE', cierre: '2026-11-05T15:00', monto: 17421600, duracionMeses: 24,
  visita: { fecha: '2026-10-20T10:00', obligatoria: true, pasada: false },
  descripcion: 'Mantención preventiva y correctiva\r\nde 3 calderas.', req: ''
};
const enlace = O.codificar(DATOS);

// ---- El texto del enlace ---------------------------------------------------------------------------
check('base64url: sin «/», «+», «=» ni «%»', /^[A-Za-z0-9_-]+$/.test(enlace), enlace);
const op = O.leer(enlace);
check('se lee de vuelta, con el código en mayúsculas', op && op.codigo === '5555-12-LE26', op);
check('nombre, organismo, lugar y tipo', op.nombre === DATOS.nombre && op.organismo === 'Municipalidad Ficticia' && op.comuna === 'Quilpué' && op.tipo === 'LE', op);
check('monto, cierre y duración', op.monto === 17421600 && op.cierre === '2026-11-05T15:00' && op.duracionMeses === 24, op);
check('visita obligatoria', op.visita && op.visita.fecha === '2026-10-20T10:00' && op.visita.obligatoria === true && op.visita.pasada === false, op.visita);
check('la descripción conserva el salto de línea (sin \\r)', op.descripcion === 'Mantención preventiva y correctiva\nde 3 calderas.', op.descripcion);

// ---- Lo que no se acepta -----------------------------------------------------------------------------
check('texto vacío o con caracteres raros → null', O.leer('') === null && O.leer('abc/def%20ghi') === null && O.leer(null) === null);
check('un código de licitación suelto no es un enlace con datos', O.leer('514862-140-LE26') === null);
check('JSON sin versión → null', O.leer(O.codificar({ codigo: '5555-12-LE26' })) === null);
check('código inválido → null', O.leer(O.codificar(Object.assign({}, DATOS, { codigo: '<script>' }))) === null &&
  O.leer(O.codificar(Object.assign({}, DATOS, { codigo: 'a b' }))) === null);
const raro = O.leer(O.codificar(Object.assign({}, DATOS, {
  monto: -5, duracionMeses: 'doce', cierre: 'mañana', tipo: 'LE; DROP', req: '12a', nombre: 'x'.repeat(500),
  visita: { fecha: 'pronto' }, organismo: { malo: 1 }, descripcion: 'a\u0000b'
})));
check('valores raros se descartan o se acotan', raro && raro.monto === null && raro.duracionMeses === null && raro.cierre === '' && raro.tipo === '' &&
  raro.req === '' && raro.nombre.length === 300 && raro.nombre.endsWith('…') && raro.visita === null && raro.organismo === '' && raro.descripcion === 'a b', raro);

// ---- Los campos del proyecto -----------------------------------------------------------------------
const c = O.campos(op);
check('título, cliente, ID y ubicación', c.titulo === DATOS.nombre && c.cliente === 'Municipalidad Ficticia' && c.idLicitacion === '5555-12-LE26' && c.ubicacion === 'Quilpué, Región de Valparaíso', c);
check('descripción: el alcance y una línea con cierre, visita y duración',
  c.descripcion === 'Mantención preventiva y correctiva\nde 3 calderas.\n\nMercado Público 5555-12-LE26 (licitación LE) · cierre 05-11-2026 15:00 · visita a terreno 20-10-2026 10:00 (obligatoria) · contrato de 24 meses.', c.descripcion);
const agil = O.leer(O.codificar(Object.assign({}, DATOS, { codigo: '100-9-COT26', compraAgil: true, tipo: 'COT', comuna: '', duracionMeses: 0.5, visita: null, descripcion: '' })));
const ca = O.campos(agil);
check('compra ágil: sin comuna usa la región; plazo de entrega en días', ca.ubicacion === 'Región de Valparaíso' &&
  ca.descripcion === 'Mercado Público 100-9-COT26 (compra ágil) · cierre 05-11-2026 15:00 · entrega en 15 días.', ca);

// ---- Aplicar a un proyecto: solo lo vacío ---------------------------------------------------------
const nuevo = () => ({ titulo: '', cliente: '', idLicitacion: '', ubicacion: '', descripcion: '', parametros: { presupuestoMaximo: null, presupuestoIncluyeIva: false } });
let p = nuevo();
let hechos = O.aplicar(p, op, 'CLP');
check('proyecto vacío: llena todo, primero la categoría', hechos.join(',') === 'categoría Licitación,título,cliente,ID de licitación,ubicación,descripción,presupuesto (con IVA)', hechos);
check('la licitación queda con su categoría', p.categoria === 'Licitación', p.categoria);
check('presupuesto en pesos y con IVA', p.parametros.presupuestoMaximo === 17421600 && p.parametros.presupuestoIncluyeIva === true, p.parametros);
p = nuevo();
Object.assign(p, { titulo: 'Calderas liceo (planilla)', ubicacion: 'Quilpué' });
p.parametros.presupuestoMaximo = 15000000;
p.parametros.presupuestoIncluyeIva = true;
hechos = O.aplicar(p, op, 'CLP');
check('lo que trajo la planilla manda', p.titulo === 'Calderas liceo (planilla)' && p.ubicacion === 'Quilpué' && p.parametros.presupuestoMaximo === 15000000 &&
  hechos.join(',') === 'categoría Licitación,cliente,ID de licitación,descripción', { p, hechos });
p = nuevo();
hechos = O.aplicar(p, agil, 'CLP');
check('compra ágil: categoría «Compra ágil» y «ID de la compra ágil»', p.categoria === 'Compra ágil' && ca.categoria === 'Compra ágil' &&
  hechos[0] === 'categoría Compra ágil' && hechos.includes('ID de la compra ágil'), { categoria: p.categoria, hechos });
p = nuevo();
p.categoria = 'Trato directo';
hechos = O.aplicar(p, op, 'CLP');
check('una categoría ya elegida no se cambia', p.categoria === 'Trato directo' && !hechos.some((h) => h.startsWith('categoría')), hechos);
p = nuevo();
hechos = O.aplicar(p, op, 'USD');
check('proyecto en otra moneda: no lleva el presupuesto', p.parametros.presupuestoMaximo === null && !hechos.includes('presupuesto (con IVA)'), hechos);
p = nuevo();
hechos = O.aplicar(p, O.leer(O.codificar(Object.assign({}, DATOS, { monto: null }))), 'CLP');
check('sin monto publicado: sin presupuesto', p.parametros.presupuestoMaximo === null && !hechos.includes('presupuesto (con IVA)'), hechos);

// ---- Carpeta y búsqueda ---------------------------------------------------------------------------------
check('nombre de carpeta corto: igual', O.nombreCarpeta(op) === DATOS.nombre);
const largo = O.nombreCarpeta({ nombre: 'C.A. – SERVICIO DE INTEGRACIÓN DE ALMACENAMIENTO EN SISTEMA DE PRODUCCIÓN, Y USO DE HIDRÓGENO PARA LABORATORIO (FICTICIO)' });
check('nombre de carpeta largo: hasta 100, cortado en una palabra y sin coma al final', largo.length <= 100 && !/[ ,]$/.test(largo) && largo.startsWith('C.A. – SERVICIO'), largo);
check('esDe: por el ID de licitación, sin importar mayúsculas ni espacios', O.esDe({ idLicitacion: ' 5555-12-le26 ' }, '5555-12-LE26') && !O.esDe({ idLicitacion: '' }, '5555-12-LE26') && !O.esDe({ idLicitacion: 'X' }, ''));

console.log(results.join('\n'));
const fallas = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fallas}/${results.length} OK`);
process.exit(fallas ? 1 : 0);
