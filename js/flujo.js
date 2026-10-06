/*
 * flujo.js — El recorrido de una oferta por las herramientas de QUEMPIN: en qué etapa está y qué
 * sigue. Son las mismas seis etapas de «El viaje de un proyecto» en la guía del equipo
 * (Proyectos Claude/Guia flujo herramientas): requerimiento → formulación → cotización → oferta y
 * adjudicación → ejecución → cierre. Pedido del usuario (2026-10-05): que quede claro qué hace cada
 * herramienta y qué sigue al terminar una etapa.
 *
 * Solo calcula: no lee la carpeta ni pinta. app.js le pasa lo que sabe del proyecto (y, en el
 * paso 5, lo que publican las demás herramientas) y dibuja el resultado en el paso 5, en el aviso
 * del editor y en la lista de proyectos, para que los tres digan lo mismo.
 */
(function (root) {
  'use strict';

  const ETAPAS = [
    { id: 'requerimiento', titulo: 'Requerimiento', donde: 'Planilla de Ingreso',
      hace: 'La Planilla de Ingreso le da su N°: la clave que une el proyecto en todas las herramientas.' },
    { id: 'formulacion', titulo: 'Formulación', donde: 'Formulador',
      hace: 'El Formulador arma costos, precio y evaluación. El Excel queda al día en la carpeta de la oferta.' },
    { id: 'cotizacion', titulo: 'Cotización', donde: 'Sistema QUEMPIN',
      hace: 'Sistema QUEMPIN emite la cotización con su folio y su PDF, a partir del borrador que envía el Formulador.' },
    { id: 'oferta', titulo: 'Oferta y adjudicación', donde: 'Formulador y Planilla',
      hace: 'La oferta se envía al cliente. El estado y el valor vuelven a la Planilla de Ingreso como aviso.' },
    { id: 'ejecucion', titulo: 'Ejecución', donde: 'Análisis Financiero',
      hace: 'El Análisis Financiero recibe los costos y la venta. El Centro de Costos registra el gasto real con cada factura.' },
    { id: 'cierre', titulo: 'Cierre', donde: 'Análisis Financiero',
      hace: 'Al terminar, lo gastado frente a lo presupuestado vuelve al Formulador como sesgo real para las próximas ofertas.' }
  ];
  const EN_FORMULACION = ['Borrador', 'En revisión'];
  /* Lo que la Planilla de Ingreso debe mostrar según el estado de la oferta (mismo mapa que
     herramientas.js cambiosParaPlanilla). */
  const EN_PLANILLA = { 'Enviada': 'Ofertado', 'Adjudicada': 'Adjudicado', 'Perdida': 'No adjudicado', 'Descartada': 'Descartado' };
  const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  /* Lo que se sabe del proyecto, con o sin lo publicado por las demás herramientas.
     ctx: { p, req, pasos, carpeta, cotizaciones?, estadoBorrador?, filaPlanilla?, proyectoAF? }
       pasos         los 5 pasos del editor: [{ n, label, est: 'ok'|'warn'|'err'|'pend', falta }]
       carpeta       true / false = carpeta de la oferta elegida o no; null = no aplica (SharePoint, o
                     un navegador que no abre carpetas)
       cotizaciones  emitidas en Sistema QUEMPIN para este proyecto ([{ folio }]); sin el dato, undefined
       estadoBorrador  en qué quedó el último borrador según Sistema QUEMPIN ('pendiente', 'aplicado'…)
       filaPlanilla  la fila del requerimiento en la Planilla ({ estado }), si se leyó
       proyectoAF    el proyecto en el Análisis Financiero ({ avance, venta }), si se leyó */
  function hechos(ctx) {
    const p = ctx.p || {};
    const v = p.vinculos || {};
    const estado = p.estado || 'Borrador';
    const pasos = ctx.pasos || [];
    const conError = pasos.find((x) => x.est === 'err');
    const sinHacer = pasos.find((x) => x.est === 'pend');
    const conAviso = pasos.find((x) => x.est === 'warn');
    const borr = (v.sistemaQuempin || {}).ultimoBorrador || null;
    const estBorr = ctx.estadoBorrador || (borr && borr.estado) || (borr ? 'pendiente' : null);
    const emitidas = (ctx.cotizaciones || []).filter((c) => c && c.folio);
    const folio = emitidas.length ? emitidas[0].folio : (borr && borr.folio) || '';
    const envioAF = ((v.analisisFinanciero || {}).ultimoEnvio) || null;
    const sug = (v.planilla || {}).ultimaSugerencia || null;
    const enPlanilla = EN_PLANILLA[estado] || null;
    const avisada = !!enPlanilla && ((sug && sug.cambios && igual(sug.cambios.estado, enPlanilla))
      || (ctx.filaPlanilla && igual(ctx.filaPlanilla.estado, enPlanilla)));
    const af = ctx.proyectoAF || null;
    return {
      p, estado, req: ctx.req || null,
      enFormulacion: EN_FORMULACION.includes(estado),
      conError, sinHacer, conAviso,
      carpetaFalta: ctx.carpeta === false,
      cotizacion: {
        emitida: !!folio || estBorr === 'aplicado' || estBorr === 'sin-cambios',
        folio,
        enEspera: !!borr && !folio && (estBorr === 'pendiente' || !estBorr),
        descartada: !folio && (estBorr === 'descartado' || estBorr === 'rechazado')
      },
      planilla: { esperado: enPlanilla, avisada },
      af: {
        enviado: !!envioAF,
        estado: envioAF ? envioAF.estado || 'en-buzon' : null,
        venta: !!((v.ventaAF || {}).ultimoEnvio),
        cerrado: !!af && Number(af.avance) >= 1
      }
    };
  }

  /* La acción que sigue: { etapa, texto, corto, accion?, boton?, paso?, motivo?, espera?, fin?, alternativas? }
     motivo (con 'ir-paso'): 'error' | 'pendiente' | 'aviso'
     accion: 'ir-req' | 'ir-paso' | 'oferta-elegir' | 'herr-cotizacion' | 'marcar-enviada' |
             'marcar-adjudicada' | 'marcar-perdida' | 'herr-planilla' | 'enviar-af' | 'herr-venta' | 'abrir-af' */
  function siguiente(h) {
    const conReq = !!h.req;
    if (!conReq) {
      return { etapa: 'requerimiento', accion: 'ir-req', boton: 'Escribir el N° de requerimiento', corto: 'Falta el N° de requerimiento',
        texto: 'Falta el N° de requerimiento de la Planilla de Ingreso: es lo que une este presupuesto con su cotización, el Análisis Financiero y el Flujo de Caja.' };
    }
    if (h.enFormulacion) {
      if (h.conError) {
        return { etapa: 'formulacion', accion: 'ir-paso', paso: h.conError.n, motivo: 'error', boton: `Corregir el paso ${h.conError.n}`, corto: 'Corregir errores',
          texto: `La formulación tiene errores en el paso ${h.conError.n} (${h.conError.label}). ${h.conError.falta || ''}`.trim() };
      }
      if (h.sinHacer) {
        return { etapa: 'formulacion', accion: 'ir-paso', paso: h.sinHacer.n, motivo: 'pendiente', boton: `Ir al paso ${h.sinHacer.n}: ${h.sinHacer.label}`, corto: 'En formulación',
          texto: `Sigue la formulación en el paso ${h.sinHacer.n} (${h.sinHacer.label}). ${h.sinHacer.falta || ''}`.trim() };
      }
      // Un aviso (una partida sin utilidad…) no detiene la oferta, pero lo primero es revisarlo: la barra no
      // puede decir «lista» con un paso marcado (2026-10-06). Se puede cotizar igual.
      if (h.conAviso) {
        return { etapa: 'formulacion', accion: 'ir-paso', paso: h.conAviso.n, motivo: 'aviso', boton: `Revisar el paso ${h.conAviso.n}`, corto: 'Revisar avisos',
          alternativas: [{ accion: 'herr-cotizacion', boton: 'Preparar la cotización igual' }],
          texto: `El paso ${h.conAviso.n} (${h.conAviso.label}) tiene avisos. ${h.conAviso.falta || ''} Revísalos antes de cotizar.`.replace(/\s+/g, ' ').trim() };
      }
      if (h.carpetaFalta) {
        return { etapa: 'formulacion', accion: 'oferta-elegir', boton: 'Elegir la carpeta de la oferta', corto: 'Elegir la carpeta',
          texto: 'Elige la carpeta de su oferta: ahí queda el Excel de la formulación, al día, y la evaluación de costos toma su N° del Control de Documentos.' };
      }
      const c = h.cotizacion;
      const yaEnviada = { accion: 'marcar-enviada', boton: 'Ya la envié: marcar como Enviada' };
      if (c.emitida) {
        return { etapa: 'oferta', accion: 'marcar-enviada', boton: 'Marcar como Enviada', corto: 'Enviar al cliente',
          texto: `La cotización${c.folio ? ` ${c.folio}` : ''} ya está emitida. Cuando la envíes al cliente, márcala como Enviada: se avisa el valor ofertado a la Planilla de Ingreso.` };
      }
      if (c.enEspera) {
        return { etapa: 'cotizacion', espera: true, corto: 'En Sistema QUEMPIN', alternativas: [yaEnviada],
          texto: 'La cotización espera en Sistema QUEMPIN, en «Borradores del Formulador»: ahí alguien la revisa y la emite con su número, y este proyecto lo verá solo.' };
      }
      return { etapa: 'cotizacion', accion: 'herr-cotizacion', boton: c.descartada ? 'Preparar la cotización de nuevo' : 'Preparar la cotización', corto: 'Preparar la cotización',
        alternativas: [yaEnviada],
        texto: c.descartada
          ? 'Sistema QUEMPIN no emitió el borrador anterior. Revisa los valores y prepara la cotización otra vez.'
          : 'La formulación está lista. Prepara la cotización con los valores por partida del paso 4: llega a Sistema QUEMPIN, donde se revisa y se emite con su número.' };
    }
    if (h.estado === 'Enviada') {
      if (!h.planilla.avisada) {
        return { etapa: 'oferta', accion: 'herr-planilla', boton: 'Avisar a la Planilla de Ingreso', corto: 'Avisar a la planilla',
          texto: 'La oferta está enviada. Avisa a la Planilla de Ingreso que quedó «Ofertado», con su valor: quien la lleva lo pasa a mano.' };
      }
      return { etapa: 'oferta', espera: true, corto: 'Esperando respuesta',
        alternativas: [{ accion: 'marcar-adjudicada', boton: 'Marcar como Adjudicada' }, { accion: 'marcar-perdida', boton: 'Marcar como Perdida' }],
        texto: 'Esperando la respuesta del cliente. Cuando llegue, marca la oferta como Adjudicada o Perdida: lo que sigue depende de eso.' };
    }
    if (h.estado === 'Adjudicada') {
      const af = h.af;
      if (!af.enviado) {
        return { etapa: 'ejecucion', accion: 'enviar-af', boton: 'Pasar a ejecución…', corto: 'Pasar a ejecución',
          texto: `Oferta adjudicada. Pasa el proyecto a ejecución: sus costos y su venta van al Análisis Financiero${h.planilla.avisada ? '' : ', y la adjudicación a la Planilla de Ingreso'}, en un solo envío.` };
      }
      if (af.estado === 'pendiente') {
        return { etapa: 'ejecucion', espera: true, corto: 'Espera una decisión',
          texto: 'El envío al Análisis Financiero espera una decisión: allá hay un valor escrito a mano. Pide a quien administra las finanzas que lo confirme o lo descarte.' };
      }
      if (af.estado === 'rechazado' || af.estado === 'descartado') {
        return { etapa: 'ejecucion', accion: 'enviar-af', boton: 'Volver a enviar…', corto: af.estado === 'rechazado' ? 'Envío rechazado' : 'Envío descartado',
          texto: af.estado === 'rechazado'
            ? 'El Análisis Financiero rechazó el envío de costos: revisa el detalle más abajo y vuelve a enviarlo.'
            : 'En el Análisis Financiero se descartó el envío de costos y quedó lo que había. Si corresponde, vuelve a enviarlo.' };
      }
      if (!af.venta) {
        return { etapa: 'ejecucion', accion: 'herr-venta', boton: 'Enviar la venta', corto: 'Enviar la venta',
          texto: 'Falta enviar el monto de venta al Análisis Financiero: sin él, el proyecto no entra completo a sus indicadores.' };
      }
      if (!h.planilla.avisada) {
        return { etapa: 'ejecucion', accion: 'herr-planilla', boton: 'Avisar a la Planilla de Ingreso', corto: 'Avisar a la planilla',
          texto: 'Falta avisar a la Planilla de Ingreso que la oferta quedó «Adjudicado», con su valor.' };
      }
      if (af.cerrado) {
        return { etapa: 'cierre', fin: true, corto: 'Cerrado',
          texto: 'Proyecto terminado: lo gastado frente a lo presupuestado ya cuenta en el sesgo real que usa el simulador del paso 5.' };
      }
      return { etapa: 'ejecucion', accion: 'abrir-af', boton: 'Abrir el tablero de Análisis Financiero', corto: 'En ejecución', fin: true,
        texto: 'En ejecución: no queda nada pendiente en el Formulador. El avance, las fechas y la mano de obra real se ingresan en el tablero de Análisis Financiero (pestaña «Ingresar datos»), y las facturas se registran en el Centro de Costos.' };
    }
    // Perdida o Descartada
    const palabra = h.estado === 'Perdida' ? 'perdida' : 'descartada';
    if (!h.planilla.avisada) {
      return { etapa: 'oferta', accion: 'herr-planilla', boton: 'Avisar a la Planilla de Ingreso', corto: 'Avisar a la planilla',
        texto: `Oferta ${palabra}. Avisa a la Planilla de Ingreso que quedó «${h.planilla.esperado}»: con eso se calcula la tasa de adjudicación que usa el Flujo de Caja.` };
    }
    return { etapa: 'oferta', fin: true, corto: 'Cerrada', texto: `Oferta ${palabra}: no queda nada pendiente con este presupuesto.` };
  }

  /* Estado de cada etapa: 'hecha' | 'actual' | 'espera' | 'pendiente' | 'omitida' | 'no-aplica', con
     una línea de detalle. Cada etapa se juzga por sí misma (una formulación lista se ve hecha aunque
     falte el N° de requerimiento); la de la acción que sigue es la actual. */
  function etapas(h, sig) {
    const cerrada = h.estado === 'Perdida' || h.estado === 'Descartada';
    const c = h.cotizacion;
    const formulada = !h.enFormulacion || (!h.conError && !h.sinHacer && !h.conAviso && !h.carpetaFalta);
    const hecha = {
      requerimiento: !!h.req,
      formulacion: formulada,
      cotizacion: c.emitida,
      oferta: !h.enFormulacion && h.estado !== 'Enviada',
      ejecucion: h.af.cerrado,
      cierre: h.af.cerrado
    };
    const detalle = {
      requerimiento: h.req ? `N° ${h.req}` : 'Falta el N°',
      formulacion: formulada ? 'Lista' : h.conError ? `Errores en el paso ${h.conError.n}` : h.sinHacer ? `Paso ${h.sinHacer.n} pendiente` : h.conAviso ? `Avisos en el paso ${h.conAviso.n}` : 'Falta la carpeta',
      cotizacion: c.folio ? `N° ${c.folio}` : c.emitida ? 'Emitida' : c.enEspera ? 'En Sistema QUEMPIN' : c.descartada ? 'No se emitió' : h.enFormulacion ? 'Por preparar' : 'Sin registrar aquí',
      oferta: h.enFormulacion ? 'Por enviar' : h.estado,
      ejecucion: cerrada ? 'No aplica' : h.estado !== 'Adjudicada' ? 'Al adjudicarse' : h.af.cerrado ? 'Terminada' : h.af.enviado ? 'En curso' : 'Por traspasar',
      cierre: cerrada ? 'No aplica' : h.af.cerrado ? 'Terminado' : 'Al terminar'
    };
    return ETAPAS.map((e, i) => {
      let est;
      if (cerrada && (e.id === 'ejecucion' || e.id === 'cierre')) est = 'no-aplica';
      else if (e.id === sig.etapa) est = sig.espera ? 'espera' : sig.fin && e.id !== 'ejecucion' ? 'hecha' : 'actual';
      else if (hecha[e.id]) est = 'hecha';
      else if (e.id === 'cotizacion' && c.enEspera) est = 'espera';
      else if (e.id === 'cotizacion' && !h.enFormulacion) est = 'omitida';
      else est = 'pendiente';
      return Object.assign({}, e, { n: i + 1, estado: est, detalle: detalle[e.id] });
    });
  }

  /* El recorrido completo: { etapas, actual (índice), siguiente }. */
  function recorrido(ctx) {
    const h = hechos(ctx || {});
    const sig = siguiente(h);
    const lista = etapas(h, sig);
    return { etapas: lista, actual: lista.findIndex((e) => e.id === sig.etapa), siguiente: sig };
  }

  root.QFlujo = { ETAPAS, EN_PLANILLA, recorrido };
})(typeof window !== 'undefined' ? window : globalThis);
