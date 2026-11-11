// Prueba de js/pendientes.js sin navegador: plazos de cierre, requerimientos por ofertar, sugerencias
// para la Planilla agrupadas por N° y borradores que esperan en Sistema QUEMPIN. Datos FICTICIOS.
// Uso: node .prueba/pendientes/unidad.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/pendientes.js'), 'utf-8'), ctx);
const P = ctx.QPendientes;

const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);
const HOY = new Date(2026, 9, 14, 10, 30);   // 14-10-2026, a media mañana

// ---- Fechas de cierre --------------------------------------------------------------------------
check('fecha ISO con hora', JSON.stringify(P.fechaDe('2026-10-15T17:00')) === JSON.stringify({ fecha: '2026-10-15', hora: '17:00' }), P.fechaDe('2026-10-15T17:00'));
check('fecha ISO sin hora', JSON.stringify(P.fechaDe('2026-10-15')) === JSON.stringify({ fecha: '2026-10-15', hora: '' }));
check('fecha escrita como texto dd-mm-aaaa', JSON.stringify(P.fechaDe('30-03-2026')) === JSON.stringify({ fecha: '2026-03-30', hora: '' }), P.fechaDe('30-03-2026'));
check('fecha con barras y hora', JSON.stringify(P.fechaDe('5/11/2026 9:30')) === JSON.stringify({ fecha: '2026-11-05', hora: '09:30' }), P.fechaDe('5/11/2026 9:30'));
check('medianoche no se muestra como hora', P.fechaDe('2026-10-15T00:00').hora === '');
check('texto que no es fecha → null', P.fechaDe('-') === null && P.fechaDe('') === null && P.fechaDe(null) === null && P.fechaDe('31-02-2026') === null);
check('días hasta: mañana = 1 aunque sea en la tarde', P.diasHasta('2026-10-15T17:00', HOY) === 1);
check('días hasta: hoy = 0', P.diasHasta('2026-10-14T09:00', HOY) === 0);
check('días hasta: cambio de mes', P.diasHasta('2026-11-02', HOY) === 19, P.diasHasta('2026-11-02', HOY));
check('días hasta: ya cerró', P.diasHasta('2026-10-10', HOY) === -4);
check('textos del plazo', [0, 1, 4, -1, -6].map(P.textoPlazo).join('|') === 'Cierra hoy|Cierra mañana|Cierra en 4 días|Cerró ayer|Cerró hace 6 días',
  [0, 1, 4, -1, -6].map(P.textoPlazo));
check('color del plazo: ≤2 rojo, ≤5 ámbar, después neutro, cerrado sin color', [0, 2, 3, 5, 6, -1, null].map(P.nivelPlazo).join(',') === 'bad,bad,warn,warn,info,na,na',
  [0, 2, 3, 5, 6, -1, null].map(P.nivelPlazo));
check('fecha de cierre legible', P.fechaCierre('2026-10-15T17:00') === '15-10-2026 17:00' && P.fechaCierre('2026-10-15') === '15-10-2026');

// ---- Por ofertar ---------------------------------------------------------------------------------
const REQS = [
  { numero: 312, estado: 'Evaluación', titulo: 'Calefacción gimnasio (ficticio)', cierre: '2026-10-28T15:00' },
  { numero: 311, estado: 'En evaluación', titulo: 'Medidores edificio (ficticio)', cierre: '2026-10-15T12:00' },
  { numero: 310, estado: 'Evaluación', titulo: 'Sin fecha (ficticio)' },
  { numero: 309, estado: 'Ofertado', titulo: 'Ya ofertada (ficticio)', cierre: '2026-10-16' },
  { numero: 308, estado: 'Descartado', titulo: 'Descartada (ficticio)', cierre: '2026-10-16' },
  { numero: 307, estado: null, titulo: 'Sin estado, por cerrar (ficticio)', cierre: '2026-10-20' },
  { numero: 12, estado: null, titulo: 'Sin estado y vieja (ficticio)', cierre: '2025-01-10' },
  { numero: 305, estado: 'Evaluación', titulo: 'Cerró sin cambiar estado (ficticio)', cierre: '2026-10-10' }
];
const PROY = { '311': [{ uid: 'a', codigo: 'QMPN-2026-311', estado: 'Borrador' }] };
const po = P.porOfertar(REQS, (n) => PROY[n] || [], HOY);
check('por ofertar: solo en evaluación (o sin estado y por cerrar)', po.map((x) => x.numero).join(',') === '311,307,312,305,310', po.map((x) => x.numero));
check('por ofertar: lo que cierra primero arriba, ya cerrados y sin fecha al final', po[0].dias === 1 && po[3].dias === -4 && po[4].dias === null);
check('por ofertar: trae su proyecto del Formulador', po[0].proyectos.length === 1 && po[0].proyectos[0].codigo === 'QMPN-2026-311');
check('por ofertar: plazo y color', po[0].plazo === 'Cierra mañana' && po[0].nivel === 'bad' && po[0].fechaCierre === '15-10-2026 12:00', po[0]);
check('por ofertar: el que cerró se ve gris', po[3].plazo === 'Cerró hace 4 días' && po[3].nivel === 'na');
check('por ofertar: sin planilla no falla', P.porOfertar(null, null, HOY).length === 0);

// ---- Sugerencias para la Planilla ------------------------------------------------------------------
const msg = (n, cambios, enviado, fuente) => ({ tipo: 'actualizar-requerimiento', destino: 'planilla-requerimientos', requerimiento: { numero: n }, cambios,
  origen: { herramienta: (fuente || {}).herramienta || 'formulador', enviado, usuario: 'Persona Ficticia' }, fuente: Object.assign({ herramienta: 'formulador', codigo: 'QMPN-2026-' + n }, fuente || {}) });
const PLANILLA = {
  289: { numero: 289, estado: 'Adjudicado', titulo: 'Mantención (ficticio)', valorOfertado: 1190000, valorAdjudicado: null },
  302: { numero: 302, estado: 'Descartado', titulo: 'Caldera (ficticio)' },
  304: { numero: 304, estado: 'Ofertado', titulo: 'Medidores (ficticio)', valorOfertado: 500000 },
  290: { numero: 290, estado: 'Ofertado', titulo: 'Calderas (ficticio)' }
};
const SUG = [
  // 289: Ofertado y después Adjudicado (dos veces): queda solo el valor adjudicado por escribir
  msg(289, { estado: 'Ofertado', valorOfertado: 1190000 }, '2026-10-06T17:31:00-03:00'),
  msg(289, { estado: 'Adjudicado', valorAdjudicado: 1190000 }, '2026-10-06T17:32:00-03:00'),
  msg(289, { estado: 'Adjudicado', valorAdjudicado: 1200000 }, '2026-10-07T17:02:00-03:00'),
  // 302: la más nueva dice No adjudicado
  msg(302, { estado: 'Ofertado', valorOfertado: 800000 }, '2026-10-13T08:23:48-03:00'),
  msg(302, { estado: 'No adjudicado' }, '2026-10-13T08:23:54-03:00'),
  // 304: el estado ya está; falta el valor (la planilla tiene otro)
  msg(304, { estado: 'Ofertado', valorOfertado: 650000 }, '2026-10-05T16:27:09-03:00'),
  // 290: del monitor de Mercado Público, con su motivo
  msg(290, { estado: 'No adjudicado' }, '2026-10-13T18:01:00-03:00', { herramienta: 'mercado-publico', motivo: 'Mercado Público: 1175-63-LE26 declarada desierta.' }),
  // 999: un N° que no está en la planilla
  msg(999, { estado: 'Ofertado' }, '2026-10-12T10:00:00-03:00'),
  // 291: la planilla ya lo muestra (con otra forma de escribir el estado)
  msg(291, { estado: 'no ADJUDICADO' }, '2026-10-11T10:00:00-03:00')
];
PLANILLA[291] = { numero: 291, estado: 'No adjudicado', titulo: 'Al día (ficticio)' };
const sg = P.sugerencias(SUG, (n) => PLANILLA[n] || null);
const de = (n) => sg.find((g) => g.numero === n);
check('sugerencias: un grupo por N°', sg.length === 6, sg.map((g) => g.numero));
check('sugerencias: lo que falta primero, los al día al final', sg[sg.length - 1].numero === 291 && sg[sg.length - 1].alDia);
const g289 = de(289);
check('289: el estado ya dice Adjudicado; falta solo el valor adjudicado, el más nuevo', g289.campos.length === 1 && g289.campos[0].campo === 'valorAdjudicado' && g289.campos[0].valor === 1200000 && g289.mensajes === 3, g289);
check('289: valor ofertado ya está (no se pide)', !g289.campos.some((c) => c.campo === 'valorOfertado'));
const g302 = de(302);
check('302: el estado que se pide es el más nuevo (No adjudicado), con lo que dice hoy', g302.campos.find((c) => c.campo === 'estado').valor === 'No adjudicado' && g302.campos.find((c) => c.campo === 'estado').actual === 'Descartado', g302);
check('302: el valor ofertado de la sugerencia anterior sigue pendiente', g302.campos.some((c) => c.campo === 'valorOfertado' && c.valor === 800000));
const g304 = de(304);
check('304: solo el valor (el estado ya está)', g304.campos.length === 1 && g304.campos[0].campo === 'valorOfertado' && g304.campos[0].actual === 500000, g304);
const g290 = de(290);
check('290: trae el motivo de Mercado Público', g290.campos[0].fuente.herramienta === 'mercado-publico' && /desierta/.test(g290.campos[0].fuente.motivo), g290);
const g999 = de(999);
check('999: no está en la planilla', g999.enPlanilla === false && g999.campos.length === 1 && !g999.alDia);
check('títulos de columna como en la planilla', P.CAMPOS.valorAdjudicado === 'Valor adjudicado (IVA inc)');
check('valor para copiar: monto entero sin separadores', P.valorParaCopiar({ valor: 1200000.4 }) === '1200000' && P.valorParaCopiar({ valor: 'Adjudicado' }) === 'Adjudicado');
check('igual: montos a medio peso, textos sin tildes', P.igual(100, 100.4) && !P.igual(100, 101) && P.igual('Evaluación', 'evaluacion') && P.igual(null, '') && !P.igual(null, 0));
check('sugerencias: sin mensajes no falla', P.sugerencias(null, null).length === 0);
check('sugerencias: mensaje sin N° o sin cambios se ignora', P.sugerencias([{ cambios: { estado: 'Ofertado' } }, { requerimiento: { numero: 5 } }], () => null).length === 0);

// ---- Borradores en Sistema QUEMPIN -------------------------------------------------------------------
const BORR = [
  { tipo: 'borrador-cotizacion', destino: 'sistema-quempin', id: 'b2', origen: { enviado: '2026-10-12T09:00:00-03:00', usuario: 'Otra Persona' },
    fuente: { uid: 'u2', codigo: 'QMPN-2026-312', version: 2, titulo: 'Calefacción (ficticio)' }, proyecto: { req: '312' }, cotizacion: { cliente: { razon_social: 'Municipio Ficticio' } } },
  { tipo: 'borrador-cotizacion', destino: 'sistema-quempin', id: 'b1', origen: { enviado: '2026-10-09T17:20:00-03:00' },
    fuente: { uid: 'u1', codigo: 'QMPN-2026-301', version: 1 }, cotizacion: { referencia: 'Medidores (ficticio)' } },
  { tipo: 'registro-documento', destino: 'sistema-quempin', id: 'r1', origen: { enviado: '2026-10-10T10:00:00-03:00' } }
];
const bo = P.borradores(BORR);
check('borradores: solo los de cotización, del más antiguo al más nuevo', bo.map((b) => b.id).join(',') === 'b1,b2', bo);
check('borradores: título desde la referencia si no viene en la fuente', bo[0].titulo === 'Medidores (ficticio)' && bo[1].cliente === 'Municipio Ficticio' && bo[1].req === '312');
check('días desde el envío', P.diasDesde('2026-10-09T17:20:00-03:00', HOY) === 5 && P.hace(5) === 'hace 5 días' && P.hace(0) === 'hoy' && P.hace(1) === 'ayer');

results.forEach((r) => console.log(r));
const fallas = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fallas}/${results.length} OK`);
process.exit(fallas ? 1 : 0);
