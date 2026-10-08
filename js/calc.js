/*
 * calc.js — Motor de cálculo de la formulación de proyectos QUEMPIN.
 *
 * Replica la lógica de la hoja "Costos" y "Resumen" del Excel
 * "Excel General Proyectos_CLP.xlsm":
 *   Subtotal Materiales = Cant. partida × Cant. M × Costo un. M
 *   Subtotal Equipos    = Cant. partida × Cant. E × Costo un. E
 *   Subtotal MO         = Cant. partida × Σ(personas_nivel × días_nivel × tarifa_nivel)
 *   Días-Hombre         = Cant. partida × Σ(personas_nivel × días_nivel)
 *   Subtotal Otros      = Cant. partida × Cant. O × Costo un. O
 *   Utilidad partida    = % sobre el costo directo de la partida, o monto fijo
 *
 * Agrega (con valor 0 por defecto, para mantener paridad con el Excel):
 *   Gastos generales e imprevistos como % del costo directo.
 *
 * Todas las cantidades de detalle son POR UNIDAD DE PARTIDA.
 * Los porcentajes se guardan como número de 0 a 100 (19 = 19 %).
 */
(function (root) {
  'use strict';

  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const div = (a, b) => (b ? a / b : null);
  const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

  const CATEGORIAS = [
    { key: 'materiales', campo: 'mat', prefijo: 'M', nombre: 'Materiales' },
    { key: 'equipos', campo: 'eq', prefijo: 'E', nombre: 'Equipos' },
    { key: 'manoObra', campo: 'mo', prefijo: 'H', nombre: 'Mano de obra' },
    { key: 'otros', campo: 'otros', prefijo: 'O', nombre: 'Otros' }
  ];

  function horasNivel(it) {
    return [
      num(it.n1p) * num(it.n1d),
      num(it.n2p) * num(it.n2d),
      num(it.n3p) * num(it.n3d)
    ];
  }

  function computeProject(p) {
    const par = p.parametros || {};
    const tarifas = [num(par.tarifaN1), num(par.tarifaN2), num(par.tarifaN3)];
    const ggPct = num(par.gastosGenerales) / 100;
    const impPct = num(par.imprevistos) / 100;
    const ivaPct = num(par.iva) / 100;

    const warnings = [];
    const warn = (level, tab, uid, msg) => warnings.push({ level, tab, uid, msg });

    // --- Partidas -----------------------------------------------------------
    const partidas = (p.partidas || []).map((pt, i) => ({
      uid: pt.uid,
      code: 'P' + (i + 1),
      descripcion: pt.descripcion || '',
      unidad: pt.unidad || '',
      cantidad: num(pt.cantidad),
      utilidadTipo: pt.utilidadTipo === 'monto' ? 'monto' : 'pct',
      utilidadValor: num(pt.utilidadValor),
      mat: 0, eq: 0, mo: 0, otros: 0, dh: 0,
      items: { materiales: [], equipos: [], manoObra: [], otros: [] }
    }));
    const byUid = new Map(partidas.map((x) => [x.uid, x]));

    // --- Detalle ------------------------------------------------------------
    const lines = { materiales: [], equipos: [], manoObra: [], otros: [] };

    CATEGORIAS.forEach((cat) => {
      (p[cat.key] || []).forEach((it, i) => {
        const pt = byUid.get(it.partida) || null;
        const qtyP = pt ? pt.cantidad : 0;
        let unit = 0; // costo por unidad de partida
        let dhUnit = 0;
        if (cat.key === 'manoObra') {
          const h = horasNivel(it);
          dhUnit = h[0] + h[1] + h[2];
          unit = h[0] * tarifas[0] + h[1] * tarifas[1] + h[2] * tarifas[2];
        } else {
          unit = num(it.cantidad) * num(it.costoUnitario);
        }
        const subtotal = pt ? qtyP * unit : 0;
        const dh = pt ? qtyP * dhUnit : 0;
        const line = {
          uid: it.uid,
          code: cat.prefijo + (i + 1),
          descripcion: it.descripcion || '',
          partidaUid: pt ? pt.uid : null,
          partidaCode: pt ? pt.code : null,
          qtyPartida: qtyP,
          costoPorUnidadPartida: unit,
          dhPorUnidadPartida: dhUnit,
          subtotal,
          dh
        };
        lines[cat.key].push(line);

        const etiqueta = `${line.code}${line.descripcion ? ' «' + line.descripcion + '»' : ''}`;
        if (!pt) {
          if (unit > 0 || !isBlank(it.descripcion)) {
            warn('error', cat.key, it.uid,
              `${etiqueta} no tiene partida asociada: su costo no se suma al proyecto.`);
          }
        } else {
          pt[cat.campo] += subtotal;
          pt.dh += dh;
          pt.items[cat.key].push(line);
          if (unit === 0) {
            warn('warn', cat.key, it.uid, `${etiqueta} tiene costo cero (revisa cantidad y costo unitario).`);
          }
        }
        if (isBlank(it.descripcion) && unit > 0) {
          warn('warn', cat.key, it.uid, `${line.code} tiene costo pero no tiene descripción.`);
        }
      });
    });

    // --- Totales por partida -------------------------------------------------
    // (las alertas de utilidad apuntan a la pestaña Resumen, donde se ingresa la utilidad)
    let utilidadTotal = 0;
    partidas.forEach((pt) => {
      pt.cd = pt.mat + pt.eq + pt.mo + pt.otros;
      pt.utilidad = pt.utilidadTipo === 'monto' ? pt.utilidadValor : pt.cd * pt.utilidadValor / 100;
      pt.ggimp = pt.cd * (ggPct + impPct);
      pt.precio = pt.cd + pt.ggimp + pt.utilidad;
      pt.pu = div(pt.precio, pt.cantidad);
      utilidadTotal += pt.utilidad;

      const etiqueta = `${pt.code}${pt.descripcion ? ' «' + pt.descripcion + '»' : ''}`;
      if (pt.cantidad <= 0) {
        warn('error', 'partidas', pt.uid, `${etiqueta} tiene cantidad cero: todos sus costos quedan en $0.`);
      } else if (pt.cd === 0) {
        warn('warn', 'partidas', pt.uid, `${etiqueta} no tiene costos asociados.`);
      }
      if (pt.cd > 0 && pt.utilidad === 0) {
        warn('warn', 'resumen', pt.uid, `${etiqueta} no tiene utilidad asignada.`);
      }
      if (pt.utilidad < 0) {
        warn('warn', 'resumen', pt.uid, `${etiqueta} tiene utilidad negativa (se vende bajo costo).`);
      }
    });

    const t = { mat: 0, eq: 0, mo: 0, otros: 0, dh: 0 };
    partidas.forEach((pt) => {
      t.mat += pt.mat; t.eq += pt.eq; t.mo += pt.mo; t.otros += pt.otros; t.dh += pt.dh;
    });
    t.cd = t.mat + t.eq + t.mo + t.otros;
    t.gg = t.cd * ggPct;
    t.imp = t.cd * impPct;
    t.costoTotal = t.cd + t.gg + t.imp;
    t.utilidad = utilidadTotal;
    t.precioNeto = t.costoTotal + t.utilidad;
    t.iva = t.precioNeto * ivaPct;
    t.precioBruto = t.precioNeto + t.iva;
    partidas.forEach((pt) => { pt.pctPrecio = div(pt.precio, t.precioNeto); });

    if (partidas.length === 0) {
      warn('info', 'partidas', null, 'El proyecto aún no tiene partidas.');
    }

    // --- KPIs ---------------------------------------------------------------
    const sens = par.sensibilidad || {};
    const sv = { mat: num(sens.mat) / 100, eq: num(sens.eq) / 100, mo: num(sens.mo) / 100, otros: num(sens.otros) / 100 };
    const deltaCosto = t.mat * sv.mat + t.eq * sv.eq + t.mo * sv.mo + t.otros * sv.otros;
    const utilidadSens = t.utilidad - deltaCosto;

    const presupuesto = num(par.presupuestoMaximo);
    const precioComparable = par.presupuestoIncluyeIva ? t.precioBruto : t.precioNeto;

    const k = {
      margen: div(t.utilidad, t.precioNeto),
      markup: div(t.utilidad, t.costoTotal),
      dh: t.dh,
      rentDH: div(t.utilidad, t.dh),
      ventaDH: div(t.precioNeto, t.dh),
      costoMODH: div(t.mo, t.dh),
      incidenciaMO: div(t.mo, t.precioNeto),
      holguraMO: div(t.utilidad, t.mo),
      sensDeltaCosto: deltaCosto,
      sensUtilidad: utilidadSens,
      sensMargen: div(utilidadSens, t.precioNeto),
      sensVarUtilidad: t.utilidad ? -deltaCosto / t.utilidad : null,
      competitividad: presupuesto > 0 ? precioComparable / presupuesto : null,
      holguraPresupuesto: presupuesto > 0 ? 1 - precioComparable / presupuesto : null,
      precioComparable,
      presupuesto
    };

    return { partidas, lines, totals: t, kpis: k, warnings, status: evaluate(k, par) };
  }

  /* Semáforos: 'ok' | 'warn' | 'bad' | 'na' | 'info' */
  function evaluate(k, par) {
    const s = {};
    const mObj = num(par.margenObjetivo) / 100;
    const mMin = num(par.margenMinimo) / 100;
    if (k.margen === null) s.margen = 'na';
    else if (k.margen >= mObj) s.margen = 'ok';
    else if (k.margen >= mMin) s.margen = 'warn';
    else s.margen = 'bad';
    s.markup = s.margen;

    const metaDH = num(par.metaUtilidadDH);
    if (k.rentDH === null) s.rentDH = 'na';
    else if (metaDH > 0) s.rentDH = k.rentDH >= metaDH ? 'ok' : (k.rentDH >= metaDH * 0.8 ? 'warn' : 'bad');
    else s.rentDH = 'info';

    if (k.competitividad === null) s.competitividad = 'na';
    else if (k.competitividad > 1) s.competitividad = 'bad';
    else if (k.competitividad >= num(par.umbralAjustado || 95) / 100) s.competitividad = 'warn';
    else s.competitividad = 'ok';

    if (k.sensMargen === null) s.sensibilidad = 'na';
    else if (k.sensUtilidad < 0) s.sensibilidad = 'bad';
    else if (k.sensMargen < mMin) s.sensibilidad = 'warn';
    else s.sensibilidad = 'ok';

    s.incidenciaMO = k.incidenciaMO === null ? 'na' : 'info';
    s.holguraMO = k.holguraMO === null ? 'na' : 'info';
    s.dh = 'info';
    return s;
  }

  /* Interpreta la utilidad escrita como en el Excel ("100%", "$500.000", "30").
     Devuelve { tipo, valor, nota }. */
  function parseUtilidadExcel(raw) {
    if (raw === null || raw === undefined || raw === '') return { tipo: 'pct', valor: 0 };
    if (typeof raw === 'number') {
      // Número real en la celda: Excel lo habría tratado como monto;
      // si es ≤ 1 casi seguro es un porcentaje con formato %.
      if (raw > 0 && raw <= 1) return { tipo: 'pct', valor: raw * 100, nota: 'número ≤ 1 interpretado como %' };
      return { tipo: 'monto', valor: raw };
    }
    const t = String(raw).replace(/\s/g, '');
    const esPct = t.includes('%');
    const esMon = t.includes('$');
    let s = t.replace(/[$%]/g, '');
    if (esPct) {
      s = s.replace(',', '.'); // en % se respeta el decimal (el Excel convertía "12.5%" en 125 %)
    } else {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return { tipo: 'pct', valor: 0, nota: `valor no reconocido: "${raw}"` };
    if (esPct) return { tipo: 'pct', valor: n };
    return { tipo: 'monto', valor: n, nota: esMon ? undefined : 'sin símbolo: interpretado como monto $ (igual que el Excel)' };
  }

  /* Moneda del proyecto (parametros.moneda): todos sus montos se ingresan y se muestran en
     ella, sin conversión. Pesos en unidades enteras; soles, dólares y euros con centavos
     (los mismos códigos y decimales de Sistema QUEMPIN, app/calculos.py). */
  const MONEDAS = {
    CLP: { simbolo: '$', nombre: 'Pesos chilenos', corto: 'pesos', decimales: 0 },
    PEN: { simbolo: 'S/', nombre: 'Soles peruanos', corto: 'soles', decimales: 2 },
    USD: { simbolo: 'US$', nombre: 'Dólares (US$)', corto: 'dólares', decimales: 2 },
    EUR: { simbolo: '€', nombre: 'Euros', corto: 'euros', decimales: 2 }
  };
  const monedaDe = (p) => {
    const m = p && p.parametros && p.parametros.moneda;
    return MONEDAS[m] ? m : 'CLP';
  };
  /* Redondea un monto a los decimales de su moneda */
  const redondear = (v, moneda) => {
    const f = Math.pow(10, (MONEDAS[moneda] || MONEDAS.CLP).decimales);
    return Math.round(v * f) / f;
  };

  const api = { computeProject, evaluate, parseUtilidadExcel, num, CATEGORIAS, MONEDAS, monedaDe, redondear };
  root.QCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
