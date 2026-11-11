// Prueba de js/flujo.js sin navegador: el recorrido de una oferta (en qué etapa está y qué sigue)
// para cada situación del ciclo, de proyecto nuevo a proyecto cerrado. Datos FICTICIOS.
// Uso: node .prueba/flujo/unidad.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/flujo.js'), 'utf-8'), ctx);
const F = ctx.QFlujo;

const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);

const PASOS_OK = [1, 2, 3, 4, 5].map((n) => ({ n, label: `Paso ${n}`, est: 'ok', falta: '' }));
const pasos = (cambios) => PASOS_OK.map((x) => Object.assign({}, x, cambios[x.n] || {}));
const proyecto = (estado, vinculos) => ({ uid: 'u1', codigo: 'QPN-2026-001', version: 1, estado: estado || 'Borrador', vinculos: vinculos || {} });
const rec = (o) => F.recorrido(Object.assign({ req: '280', pasos: PASOS_OK, carpeta: true }, o));
const est = (r) => Object.fromEntries(Array.from(r.etapas, (e) => [e.id, e.estado]));
const ENVIO = (estado) => ({ analisisFinanciero: { tag: 'DEMO', ultimoEnvio: { id: 'm1', estado } } });
const VENTA = { ventaAF: { ultimoEnvio: { id: 'm2' } } };
const AVISO = (estado) => ({ planilla: { ultimaSugerencia: { id: 'm3', cambios: { estado } } } });

// ---- Las seis etapas, en el orden de la guía del equipo -------------------------------------------
check('seis etapas con su herramienta', F.ETAPAS.length === 6 && F.ETAPAS.every((e) => e.titulo && e.donde && e.hace),
  F.ETAPAS.map((e) => e.id));

// ---- 1. Requerimiento ------------------------------------------------------------------------------
let r = rec({ p: proyecto(), req: null, pasos: pasos({ 2: { est: 'pend', falta: 'Agrega al menos una partida.' } }) });
check('sin N°: lo que sigue es escribirlo', r.siguiente.accion === 'ir-req' && r.actual === 0, r.siguiente);
check('sin N°: el resto queda pendiente', est(r).formulacion === 'pendiente' && est(r).cotizacion === 'pendiente', est(r));

r = rec({ p: proyecto(), req: null });
check('sin N° pero formulada: la formulación se ve hecha', est(r).requerimiento === 'actual' && est(r).formulacion === 'hecha', est(r));

// ---- 2. Formulación --------------------------------------------------------------------------------
r = rec({ p: proyecto(), pasos: pasos({ 3: { est: 'pend', falta: 'Agrega los costos de cada partida.' }, 4: { est: 'pend' }, 5: { est: 'pend' } }) });
check('paso pendiente: ir a ese paso', r.siguiente.accion === 'ir-paso' && r.siguiente.paso === 3 && /paso 3/.test(r.siguiente.texto), r.siguiente);
check('con N°: requerimiento hecho y formulación actual', est(r).requerimiento === 'hecha' && est(r).formulacion === 'actual', est(r));

r = rec({ p: proyecto(), pasos: pasos({ 2: { est: 'err', falta: '1 partida con cantidad cero.' } }) });
check('errores antes que pasos pendientes', r.siguiente.accion === 'ir-paso' && r.siguiente.paso === 2 && r.siguiente.corto === 'Corregir errores', r.siguiente);

r = rec({ p: proyecto(), pasos: pasos({ 4: { est: 'warn', falta: '1 partida sin utilidad o con utilidad negativa.' } }) });
check('un aviso: lo primero es revisarlo (2026-10-06)', r.siguiente.accion === 'ir-paso' && r.siguiente.paso === 4 && r.siguiente.motivo === 'aviso' && /avisos/.test(r.siguiente.texto), r.siguiente);
check('un aviso no detiene la oferta: se puede cotizar igual', (r.siguiente.alternativas || []).some((a) => a.accion === 'herr-cotizacion'), r.siguiente);
check('con avisos la formulación no se ve «Lista»', est(r).formulacion === 'actual' && r.etapas[1].detalle === 'Avisos en el paso 4', r.etapas[1]);

r = rec({ p: proyecto(), carpeta: false });
check('sin carpeta de la oferta: elegirla', r.siguiente.accion === 'oferta-elegir' && est(r).formulacion === 'actual', r.siguiente);

r = rec({ p: proyecto(), carpeta: null });
check('carpeta que no aplica (SharePoint o sin acceso): no se pide', r.siguiente.accion === 'herr-cotizacion', r.siguiente);

// ---- 3. Cotización ---------------------------------------------------------------------------------
r = rec({ p: proyecto('En revisión') });
check('formulación lista: preparar la cotización', r.siguiente.accion === 'herr-cotizacion' && r.siguiente.boton === 'Preparar la cotización' && est(r).cotizacion === 'actual', r.siguiente);
check('con la alternativa de marcarla enviada', (r.siguiente.alternativas || []).some((a) => a.accion === 'marcar-enviada'), r.siguiente);

r = rec({ p: proyecto('Borrador', { sistemaQuempin: { ultimoBorrador: { id: 'b1', version: 1 } } }) });
check('borrador enviado: espera en Sistema QUEMPIN', r.siguiente.espera && est(r).cotizacion === 'espera' && !r.siguiente.accion, r.siguiente);

r = rec({ p: proyecto('Borrador', { sistemaQuempin: { ultimoBorrador: { id: 'b1' } } }), estadoBorrador: 'descartado' });
check('borrador descartado: prepararla de nuevo', r.siguiente.accion === 'herr-cotizacion' && /de nuevo/.test(r.siguiente.boton), r.siguiente);
check('borrador descartado sin motivo: el texto no inventa uno', !/motivo/.test(r.siguiente.texto), r.siguiente.texto);
r = rec({ p: proyecto('Borrador', { sistemaQuempin: { ultimoBorrador: { id: 'b1' } } }), estadoBorrador: 'descartado', motivoBorrador: 'Los precios están por revisar.' });
check('borrador descartado con motivo (Sistema QUEMPIN 1.3.7): lo dice', /motivo: Los precios están por revisar\)/.test(r.siguiente.texto), r.siguiente.texto);
r = rec({ p: proyecto('Borrador', { sistemaQuempin: { ultimoBorrador: { id: 'b1', estado: 'descartado', motivo: 'Era una prueba' } } }) });
check('motivo guardado en el proyecto (sin leer la carpeta)', /motivo: Era una prueba\)/.test(r.siguiente.texto), r.siguiente.texto);
r = rec({ p: proyecto('Borrador', { sistemaQuempin: { ultimoBorrador: { id: 'b1' } } }), estadoBorrador: 'rechazado', motivoBorrador: 'x' });
check('rechazado (no descartado): sin motivo de descarte', !/motivo/.test(r.siguiente.texto), r.siguiente.texto);

r = rec({ p: proyecto('Borrador', { sistemaQuempin: { ultimoBorrador: { id: 'b1' } } }), cotizaciones: [{ folio: '602695' }] });
check('cotización emitida: marcar la oferta como Enviada', r.siguiente.accion === 'marcar-enviada' && /602695/.test(r.siguiente.texto), r.siguiente);
check('la cotización queda hecha con su N°', est(r).cotizacion === 'hecha' && r.etapas[2].detalle === 'N° 602695', r.etapas[2]);

r = rec({ p: proyecto('Borrador', { sistemaQuempin: { ultimoBorrador: { id: 'b1', estado: 'aplicado', folio: '602700' } } }) });
check('el N° guardado en el proyecto basta (lista y aviso del editor)', r.siguiente.accion === 'marcar-enviada' && r.etapas[2].detalle === 'N° 602700', r.siguiente);

// ---- 4. Oferta y adjudicación ----------------------------------------------------------------------
r = rec({ p: proyecto('Enviada') });
check('enviada: avisar a la planilla', r.siguiente.accion === 'exp-planilla' && /Ofertado/.test(r.siguiente.texto) && est(r).oferta === 'actual', r.siguiente);
check('enviada sin cotización registrada aquí: la etapa se ve omitida', est(r).cotizacion === 'omitida', est(r));

r = rec({ p: proyecto('Enviada', AVISO('Ofertado')) });
check('enviada y avisada: esperar la respuesta', r.siguiente.espera && est(r).oferta === 'espera'
  && r.siguiente.alternativas.map((a) => a.accion).join() === 'marcar-adjudicada,marcar-perdida', r.siguiente);

r = rec({ p: proyecto('Enviada'), filaPlanilla: { estado: 'ofertado' } });
check('la planilla ya dice Ofertado: no se pide avisar', r.siguiente.espera, r.siguiente);

// ---- 5. Ejecución ----------------------------------------------------------------------------------
r = rec({ p: proyecto('Adjudicada') });
check('adjudicada: pasar a ejecución en un solo envío', r.siguiente.accion === 'enviar-af' && /Planilla/.test(r.siguiente.texto) && est(r).ejecucion === 'actual', r.siguiente);
check('adjudicada: la oferta queda hecha', est(r).oferta === 'hecha', est(r));

r = rec({ p: proyecto('Adjudicada', AVISO('Adjudicado')) });
check('con la planilla ya avisada, el texto no la repite', r.siguiente.accion === 'enviar-af' && !/Planilla/.test(r.siguiente.texto), r.siguiente);

// «Cerrado» en la Planilla (2026-11-09: su carpeta pasó a «0 Proyectos Entregados»): cumple lo que pide «Adjudicado»
r = rec({ p: proyecto('Adjudicada'), filaPlanilla: { estado: 'Cerrado' } });
check('la planilla ya dice Cerrado: no se pide avisar Adjudicado', r.siguiente.accion === 'enviar-af' && !/Planilla/.test(r.siguiente.texto), r.siguiente);
r = rec({ p: proyecto('Enviada'), filaPlanilla: { estado: 'Cerrado' } });
check('Cerrado no cumple lo que pide Ofertado', r.siguiente.accion === 'exp-planilla', r.siguiente);
{
  const hctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/herramientas.js'), 'utf-8'), hctx);
  const H = hctx.QHerramientas;
  check('estadoCumple: Cerrado cumple Adjudicado, no al revés', H.estadoCumple('Cerrado', 'Adjudicado') && !H.estadoCumple('Adjudicado', 'Cerrado') && H.estadoCumple(' adjudicado ', 'Adjudicado'));
  const campos = (estadoOferta, estadoFila) => Array.from(H.camposParaExportar({ estado: estadoOferta, titulo: 'X' }, { estado: estadoFila, titulo: 'X' }, { valor: 0 }), (c) => c.campo + ':' + c.nuevo);
  check('Exportar a la Planilla no ofrece volver un Cerrado a Adjudicado (lo reabriría)', campos('Cerrada', 'Cerrado').length === 0 && campos('Adjudicada', 'Cerrado').length === 0, campos('Cerrada', 'Cerrado'));
  check('Exportar a la Planilla sigue ofreciendo Adjudicado sobre Ofertado', campos('Adjudicada', 'Ofertado').join() === 'estado:Adjudicado', campos('Adjudicada', 'Ofertado'));
}

r = rec({ p: proyecto('Adjudicada', ENVIO('pendiente')) });
check('envío que espera una decisión en el AF', r.siguiente.espera && /administra las finanzas/.test(r.siguiente.texto), r.siguiente);

r = rec({ p: proyecto('Adjudicada', ENVIO('rechazado')) });
check('envío rechazado: volver a enviar', r.siguiente.accion === 'enviar-af' && /Volver/.test(r.siguiente.boton), r.siguiente);

r = rec({ p: proyecto('Adjudicada', ENVIO('descartado')) });
check('envío descartado en el AF: ofrecer volver a enviarlo', r.siguiente.accion === 'enviar-af' && r.siguiente.corto === 'Envío descartado', r.siguiente);

r = rec({ p: proyecto('Adjudicada', ENVIO('aplicado')) });
check('costos enviados sin venta: enviar la venta', r.siguiente.accion === 'herr-venta', r.siguiente);

r = rec({ p: proyecto('Adjudicada', Object.assign({}, ENVIO('en-buzon'), VENTA)) });
check('costos y venta sin aviso: avisar la adjudicación', r.siguiente.accion === 'exp-planilla' && /Adjudicado/.test(r.siguiente.texto), r.siguiente);

r = rec({ p: proyecto('Adjudicada', Object.assign({}, ENVIO('aplicado'), VENTA, AVISO('Adjudicado'))) });
check('todo enviado: en ejecución, con el tablero del AF', r.siguiente.accion === 'abrir-af' && r.siguiente.fin && est(r).ejecucion === 'actual' && est(r).cierre === 'pendiente', r.siguiente);

// ---- 6. Cierre -------------------------------------------------------------------------------------
r = rec({ p: proyecto('Adjudicada', Object.assign({}, ENVIO('aplicado'), VENTA, AVISO('Adjudicado'))), proyectoAF: { avance: 1 } });
check('avance 100 %: propone marcarlo Cerrada', r.siguiente.etapa === 'cierre' && r.siguiente.accion === 'marcar-cerrada' && !r.siguiente.fin && est(r).ejecucion === 'hecha' && est(r).cierre === 'actual', r.siguiente);

// Cerrada (2026-10-26): estado propio, después de Adjudicada
r = rec({ p: proyecto('Adjudicada', Object.assign({}, ENVIO('aplicado'), VENTA, AVISO('Adjudicado'))) });
check('en ejecución: «Cerrar el proyecto» como alternativa', (r.siguiente.alternativas || []).some((a) => a.accion === 'marcar-cerrada'), r.siguiente);

r = rec({ p: proyecto('Cerrada', Object.assign({}, ENVIO('aplicado'), VENTA, AVISO('Adjudicado'))), proyectoAF: { avance: 1 } });
check('cerrada: fin en el cierre, todo hecho', r.siguiente.etapa === 'cierre' && r.siguiente.fin && !r.siguiente.accion && r.siguiente.corto === 'Cerrado'
  && est(r).ejecucion === 'hecha' && est(r).cierre === 'hecha' && est(r).oferta === 'hecha', { s: r.siguiente, e: est(r) });
check('cerrada: el cierre dice «Cerrado»', r.etapas.find((e) => e.id === 'cierre').detalle === 'Cerrado', r.etapas);

r = rec({ p: proyecto('Cerrada') });
check('cerrada sin Análisis Financiero (proyecto antiguo): igual queda cerrada, sin pedir «Pasar a ejecución»', r.siguiente.fin && r.siguiente.etapa === 'cierre'
  && est(r).ejecucion === 'hecha' && est(r).cierre === 'hecha', { s: r.siguiente, e: est(r) });
check('cerrada sin aviso: avisar «Adjudicado» queda como opción', (r.siguiente.alternativas || []).some((a) => a.accion === 'exp-planilla'), r.siguiente);
check('cerrada: en la planilla sigue «Adjudicado»', F.EN_PLANILLA.Cerrada === 'Adjudicado' && F.GANADAS.includes('Cerrada'));

r = rec({ p: proyecto('Cerrada', AVISO('Adjudicado')) });
check('cerrada y avisada: sin alternativas', !r.siguiente.alternativas, r.siguiente);

// ---- Perdida y descartada --------------------------------------------------------------------------
r = rec({ p: proyecto('Perdida') });
check('perdida: avisar «No adjudicado» a la planilla', r.siguiente.accion === 'exp-planilla' && /No adjudicado/.test(r.siguiente.texto), r.siguiente);
check('perdida: ejecución y cierre no aplican', est(r).ejecucion === 'no-aplica' && est(r).cierre === 'no-aplica', est(r));

r = rec({ p: proyecto('Perdida', AVISO('No adjudicado')) });
check('perdida y avisada: nada pendiente', r.siguiente.fin && !r.siguiente.accion && est(r).oferta === 'hecha', r.siguiente);
check('perdida: no se confunde con Cerrada', r.siguiente.corto !== 'Cerrada' && r.siguiente.corto !== 'Cerrado', r.siguiente);

r = rec({ p: proyecto('Descartada') });
check('descartada: avisar «Descartado»', r.siguiente.accion === 'exp-planilla' && /Descartado/.test(r.siguiente.texto), r.siguiente);

// ---- Prioridades -----------------------------------------------------------------------------------
r = rec({ p: proyecto('Adjudicada'), req: null });
check('adjudicada sin N°: primero el N° (lo necesitan la planilla y el AF)', r.siguiente.accion === 'ir-req' && est(r).oferta === 'hecha', r.siguiente);

r = rec({ p: proyecto('Enviada'), pasos: pasos({ 3: { est: 'err' } }) });
check('después de enviar, la formulación ya no se exige', r.siguiente.accion === 'exp-planilla' && est(r).formulacion === 'hecha', r.siguiente);

r = rec({ p: proyecto('Adjudicada'), carpeta: false });
check('después de formular, la carpeta no bloquea lo que sigue', r.siguiente.accion === 'enviar-af', r.siguiente);

r = F.recorrido({});
check('sin datos no falla', r.etapas.length === 6 && r.siguiente.accion === 'ir-req', r);

console.log(results.join('\n'));
const fail = results.filter((x) => x.startsWith('FAIL')).length;
console.log(`\n${results.length - fail}/${results.length} OK`);
process.exit(fail ? 1 : 0);
