// Prueba de js/fusion.js (edición simultánea, 2026-11-10): juntar los cambios de dos personas
// contra la base común. Uso: node .prueba/fusion/unidad.js
'use strict';
const path = require('path');
const { fusionar, aplicarEleccion } = require(path.join(__dirname, '..', '..', 'js', 'fusion.js'));

const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);
const clon = (v) => JSON.parse(JSON.stringify(v));

const base = {
  uid: 'P', titulo: 'Oferta', cliente: 'Cliente', modificado: '2026-11-10T10:00:00.000Z',
  parametros: { iva: 19, gastosGenerales: 10, sensibilidad: { mat: 0, mo: 10 } },
  catalogoOtros: ['Almuerzo', 'Traslado'],
  partidas: [{ uid: 'p1', descripcion: 'Partida 1', cantidad: 1 }, { uid: 'p2', descripcion: 'Partida 2', cantidad: 1 }],
  materiales: [
    { uid: 'm1', descripcion: 'Flange 2', partida: 'p1', cantidad: 2, costoUnitario: 100 },
    { uid: 'm2', descripcion: 'Flange 1', partida: 'p2', cantidad: 2, costoUnitario: 50 },
    { uid: 'm3', descripcion: 'Codo', partida: 'p2', cantidad: 4, costoUnitario: 10 }
  ],
  manoObra: []
};

// 1. Datos distintos del proyecto
let A = clon(base), B = clon(base);
A.titulo = 'Oferta (A)'; A.modificado = 'a';
B.cliente = 'Cliente (B)'; B.parametros.iva = 0; B.modificado = 'b';
let f = fusionar(base, A, B);
check('campos distintos: quedan los dos', f.resultado.titulo === 'Oferta (A)' && f.resultado.cliente === 'Cliente (B)' && f.resultado.parametros.iva === 0, f.resultado);
check('campos distintos: sin choques', f.choques.length === 0, f.choques);
check('las marcas de guardado no son choque (queda la de «suyo»)', f.resultado.modificado === 'b');
check('objetos anidados intactos', f.resultado.parametros.gastosGenerales === 10 && f.resultado.parametros.sensibilidad.mo === 10, f.resultado.parametros);

// 2. Ítems distintos de la misma lista, agregados y borrados
A = clon(base); B = clon(base);
A.materiales[0].costoUnitario = 120;                                                   // A cambia m1
A.materiales.splice(1, 0, { uid: 'mA', descripcion: 'Nuevo de A', partida: 'p1', cantidad: 1, costoUnitario: 5 });   // A agrega tras m1
B.materiales[2].cantidad = 8;                                                           // B cambia m3
B.materiales.splice(1, 1);                                                              // B borra m2
B.materiales.push({ uid: 'mB', descripcion: 'Nuevo de B', partida: 'p2', cantidad: 1, costoUnitario: 7 });
f = fusionar(base, A, B);
const mats = f.resultado.materiales;
check('ítems: los cambios de los dos en ítems distintos', mats.find((m) => m.uid === 'm1').costoUnitario === 120 && mats.find((m) => m.uid === 'm3').cantidad === 8, mats);
check('ítems: se suman los agregados por cada uno', mats.some((m) => m.uid === 'mA') && mats.some((m) => m.uid === 'mB'), mats.map((m) => m.uid));
check('ítems: el borrado por uno (sin cambios del otro) se borra', !mats.some((m) => m.uid === 'm2'), mats.map((m) => m.uid));
check('ítems: el agregado por A queda tras el ítem que le precedía', mats.map((m) => m.uid).join(',') === 'm1,mA,m3,mB', mats.map((m) => m.uid));
check('ítems: sin choques', f.choques.length === 0, f.choques);

// 3. Mismo campo del mismo ítem: choque
A = clon(base); B = clon(base);
A.materiales[0].costoUnitario = 120; B.materiales[0].costoUnitario = 130;
A.materiales[0].cantidad = 3;                                                           // y otro campo solo de A
f = fusionar(base, A, B);
check('mismo campo: un choque', f.choques.length === 1 && f.choques[0].mio === 120 && f.choques[0].suyo === 130, f.choques);
check('mismo campo: mientras no se elija, queda lo de «suyo»', f.resultado.materiales[0].costoUnitario === 130);
check('mismo ítem, otro campo: se junta igual', f.resultado.materiales[0].cantidad === 3);
check('la ruta del choque nombra la lista, el ítem y el campo', JSON.stringify(f.choques[0].ruta) === JSON.stringify(['materiales', { uid: 'm1' }, 'costoUnitario']), f.choques[0].ruta);
aplicarEleccion(f.resultado, f.choques[0], 'mio');
check('elegir «mío» lo pone en el resultado', f.resultado.materiales[0].costoUnitario === 120);
aplicarEleccion(f.resultado, f.choques[0], 'suyo');
check('elegir «suyo» lo vuelve a poner', f.resultado.materiales[0].costoUnitario === 130);

// 4. Los dos cambian igual: no es choque
A = clon(base); B = clon(base);
A.titulo = 'Mismo'; B.titulo = 'Mismo';
f = fusionar(base, A, B);
check('el mismo cambio en los dos no es choque', !f.choques.length && f.resultado.titulo === 'Mismo');

// 5. Uno borra un ítem que el otro cambió: choque de ítem
A = clon(base); B = clon(base);
A.materiales.splice(2, 1);              // A borra m3
B.materiales[2].costoUnitario = 99;     // B lo cambia
f = fusionar(base, A, B);
check('borrar lo que el otro cambió: choque de ítem', f.choques.length === 1 && f.choques[0].item && f.choques[0].mio === undefined, f.choques);
check('borrar lo que el otro cambió: mientras tanto queda el ítem de «suyo»', f.resultado.materiales.some((m) => m.uid === 'm3' && m.costoUnitario === 99));
aplicarEleccion(f.resultado, f.choques[0], 'mio');
check('elegir «mío» (borrado) lo saca', !f.resultado.materiales.some((m) => m.uid === 'm3'));
// Al revés: «mío» lo cambió y «suyo» lo borró
f = fusionar(base, B, A);
check('al revés: choque, y mientras tanto el ítem no está (lo de «suyo»)', f.choques.length === 1 && !f.resultado.materiales.some((m) => m.uid === 'm3'), f.resultado.materiales.map((m) => m.uid));
aplicarEleccion(f.resultado, f.choques[0], 'mio');
check('elegir «mío» (cambiado) lo devuelve', f.resultado.materiales.some((m) => m.uid === 'm3' && m.costoUnitario === 99));

// 6. Listas sin uid se comparan enteras
A = clon(base); B = clon(base);
A.catalogoOtros.push('Peaje');
f = fusionar(base, A, B);
check('lista sin uid cambiada por uno: queda su cambio', f.resultado.catalogoOtros.join('|') === 'Almuerzo|Traslado|Peaje' && !f.choques.length);
B.catalogoOtros = ['Almuerzo'];
f = fusionar(base, A, B);
check('lista sin uid cambiada por los dos: choque', f.choques.length === 1 && f.choques[0].ruta[0] === 'catalogoOtros', f.choques);

// 7. Campos que aparecen o desaparecen
A = clon(base); B = clon(base);
A.categoria = 'Mantención';
delete B.cliente;
f = fusionar(base, A, B);
check('campo nuevo en uno: queda', f.resultado.categoria === 'Mantención');
check('campo quitado por uno (sin cambio del otro): se quita', !('cliente' in f.resultado), f.resultado.cliente);

// 8. Una lista vacía en la base que los dos llenan
A = clon(base); B = clon(base);
A.manoObra.push({ uid: 'o1', descripcion: 'Soldador', n1p: 1, n1d: 2 });
B.manoObra.push({ uid: 'o2', descripcion: 'Ayudante', n1p: 2, n1d: 2 });
f = fusionar(base, A, B);
check('lista vacía llenada por los dos: quedan ambos ítems', f.resultado.manoObra.map((x) => x.uid).sort().join(',') === 'o1,o2' && !f.choques.length, f.resultado.manoObra);

// 9. No toca las entradas
const antes = JSON.stringify([base, A, B]);
fusionar(base, A, B);
check('no modifica base, mío ni suyo', JSON.stringify([base, A, B]) === antes);

console.log(results.join('\n'));
const fallas = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fallas}/${results.length} OK`);
process.exit(fallas ? 1 : 0);
