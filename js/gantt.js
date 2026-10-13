/*
 * gantt.js — Carta Gantt del proyecto (2026-10-13). Opcional: no es un paso de la formulación.
 *
 * Modelo (p.gantt, ver js/store.js):
 *   { inicio: 'AAAA-MM-DD', calendario: 'habiles' | 'corridos', escala: 'auto' | 'dias' | 'semanas' | 'meses',
 *     noLaborables: ['AAAA-MM-DD', …],
 *     tareas: [{ uid, nombre, partida, responsable, duracion, hito, avance, noAntesDe,
 *                predecesoras: [{ uid, tipo: 'FC' | 'CC' | 'FF', desfase }] }] }
 *
 * El cálculo trabaja en días laborables numerados desde el inicio (índice 0 = primer día laborable):
 * una tarea ocupa [ini, ini + duración); un hito tiene duración 0. Dependencias:
 *   FC (fin-comienzo):    sucesora.ini ≥ predecesora.ini + predecesora.dur + desfase
 *   CC (comienzo-comienzo): sucesora.ini ≥ predecesora.ini + desfase
 *   FF (fin-fin):          sucesora.ini + sucesora.dur ≥ predecesora.ini + predecesora.dur + desfase
 * Ruta crítica: las tareas sin holgura (paso hacia atrás desde el término del proyecto).
 *
 * dibujo() arma la lámina con figuras simples (rect, línea, polígono, texto) que se pintan igual en
 * pantalla (SVG) y en el PDF (js/pdf.js): una sola lógica de diseño para los dos.
 */
(function (root) {
  'use strict';

  const DIA = 86400000;
  const TIPOS = ['FC', 'CC', 'FF'];
  const NOMBRE_TIPO = { FC: 'fin–comienzo', CC: 'comienzo–comienzo', FF: 'fin–fin' };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const COLOR = {
    critica: '#ff5100', criticaAvance: '#b23a00', tarea: '#54565a', tareaAvance: '#1c1a18',
    hito: '#000000', texto: '#171513', suave: '#52514e', muted: '#898781', grilla: '#e1e0d9',
    base: '#c3c2b7', finde: '#f4f2ee', cabecera: '#f4f2ee', flecha: '#898781', holgura: '#898781',
    hoy: '#ff5100', fondo: '#ffffff', sobreBarra: '#fffffe' // sobreBarra: blanco también en modo oscuro
  };
  /* En pantalla cada color es una variable CSS (con el de papel como respaldo): la lámina sigue el
     modo oscuro (css/styles.css, .gantt-lienzo). El PDF usa los colores tal cual. */
  const VARIABLE = {
    '#ff5100': '--g-critica', '#b23a00': '--g-critica-avance', '#54565a': '--g-tarea', '#1c1a18': '--g-tarea-avance',
    '#000000': '--g-hito', '#171513': '--g-texto', '#52514e': '--g-suave', '#898781': '--g-muted',
    '#e1e0d9': '--g-grilla', '#c3c2b7': '--g-base', '#f4f2ee': '--g-finde', '#ffffff': '--g-fondo'
  };

  // ---- Fechas (siempre en UTC: 'AAAA-MM-DD' ⇄ número de día) -------------------------------
  function aDia(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Number.isFinite(t) ? Math.round(t / DIA) : null;
  }
  const aIso = (d) => new Date(d * DIA).toISOString().slice(0, 10);
  const semana = (d) => new Date(d * DIA).getUTCDay(); // 0 = domingo
  const fechaCorta = (d) => { const f = new Date(d * DIA); return `${String(f.getUTCDate()).padStart(2, '0')}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${f.getUTCFullYear()}`; };
  /* 'dd-mm-aaaa', 'dd/mm/aaaa' o 'aaaa-mm-dd' → 'aaaa-mm-dd' (o null) */
  function leerFecha(t) {
    const s = String(t || '').trim();
    if (aDia(s) !== null) return s;
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
    if (!m) return null;
    const a = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const iso = `${a}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    const d = aDia(iso);
    return d !== null && aIso(d) === iso ? iso : null;
  }

  /* Calendario: qué días se trabaja y cómo pasar de índice laborable a fecha y viceversa */
  function calendario(g, desde) {
    const habiles = (g && g.calendario) !== 'corridos';
    const libres = new Set(((g && g.noLaborables) || []).map(aDia).filter((x) => x !== null));
    const laborable = (d) => !libres.has(d) && (!habiles || (semana(d) !== 0 && semana(d) !== 6));
    let d0 = desde;
    for (let i = 0; i < 400 && !laborable(d0); i++) d0++;
    const dias = [d0]; // dias[i] = fecha (número) del i-ésimo día laborable
    const fecha = (i) => {
      if (i < 0) return d0 + i; // antes del inicio no se usa; queda acotado
      while (dias.length <= i) {
        let d = dias[dias.length - 1] + 1;
        for (let k = 0; k < 400 && !laborable(d); k++) d++;
        dias.push(d);
      }
      return dias[i];
    };
    /* Primer índice cuya fecha es ≥ d */
    const indice = (d) => {
      if (d <= d0) return 0;
      let i = 0;
      while (fecha(i) < d && i < 20000) i++;
      return i;
    };
    return { habiles, laborable, fecha, indice, inicio: d0 };
  }

  // ---- Predecesoras escritas como texto: «2, 3CC+1, 4FF-2» -----------------------------------
  /* numeros: Map uid → n° de fila (desde 1). Devuelve el texto para mostrar. */
  function textoPredecesoras(t, numeros) {
    return (t.predecesoras || []).map((d) => {
      const n = numeros.get(d.uid);
      if (!n) return null;
      const des = Number(d.desfase) || 0;
      return `${n}${d.tipo && d.tipo !== 'FC' ? d.tipo : ''}${des ? (des > 0 ? '+' : '') + des : ''}`;
    }).filter(Boolean).join(', ');
  }
  /* Lee el texto escrito en la fila propia (uid) contra la lista de tareas. Devuelve
     { lista: [{uid, tipo, desfase}], errores: [texto] }. Acepta FS/SS (inglés) por FC/CC. */
  function leerPredecesoras(texto, tareas, uidPropio) {
    const lista = [], errores = [];
    String(texto || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean).forEach((tok) => {
      const m = /^(\d+)\s*(FC|CC|FF|FS|SS)?\s*(?:([+-])\s*(\d+)\s*(?:d|dias|días)?)?$/i.exec(tok);
      if (!m) { errores.push(`«${tok}» no se entiende: escribe el N° de la tarea, por ejemplo 2, 3CC o 4+2.`); return; }
      const n = +m[1];
      const t = tareas[n - 1];
      if (!t) { errores.push(`No hay tarea N° ${n}.`); return; }
      if (t.uid === uidPropio) { errores.push('Una tarea no puede depender de sí misma.'); return; }
      let tipo = (m[2] || 'FC').toUpperCase();
      if (tipo === 'FS') tipo = 'FC';
      if (tipo === 'SS') tipo = 'CC';
      const desfase = m[3] ? (m[3] === '-' ? -1 : 1) * +m[4] : 0;
      if (lista.some((x) => x.uid === t.uid)) return;
      lista.push({ uid: t.uid, tipo, desfase });
    });
    return { lista, errores };
  }

  // ---- Cálculo del programa ---------------------------------------------------------------------
  const durDe = (t) => (t.hito ? 0 : Math.max(1, Math.round(Number(t.duracion) || 1)));

  /* Programa del proyecto. hoyIso: fecha de inicio por defecto si no hay una escrita.
     Devuelve { tareas: [{…tarea, n, ini, dur, fin (índices), dIni, dFin (fechas), critica, holgura}],
     inicio, termino (fechas), plazoLaborable, plazoCorrido, criticas: [n], errores: [texto] } */
  function calcular(g, hoyIso) {
    const lista = (g && g.tareas) || [];
    const errores = [];
    const inicioIso = aDia(g && g.inicio) !== null ? g.inicio : (hoyIso || aIso(Math.floor(Date.now() / DIA)));
    const cal = calendario(g, aDia(inicioIso));
    const porUid = new Map(lista.map((t, i) => [t.uid, i]));
    const n = lista.length;
    // Aristas válidas: predecesora existente, distinta de la tarea
    const entrantes = lista.map((t) => (t.predecesoras || []).filter((d) => porUid.has(d.uid) && d.uid !== t.uid)
      .map((d) => ({ de: porUid.get(d.uid), tipo: TIPOS.includes(d.tipo) ? d.tipo : 'FC', desfase: Math.round(Number(d.desfase) || 0) })));
    // Orden topológico (Kahn); lo que queda en un ciclo se avisa y se programa sin esas dependencias
    const grado = entrantes.map((e) => e.length);
    const salientes = lista.map(() => []);
    entrantes.forEach((es, i) => es.forEach((e) => salientes[e.de].push(i)));
    const orden = [];
    const cola = [];
    grado.forEach((gr, i) => { if (!gr) cola.push(i); });
    while (cola.length) {
      const i = cola.shift();
      orden.push(i);
      salientes[i].forEach((j) => { if (--grado[j] === 0) cola.push(j); });
    }
    const enCiclo = new Set();
    if (orden.length < n) {
      for (let i = 0; i < n; i++) if (!orden.includes(i)) enCiclo.add(i);
      errores.push(`Dependencia circular entre las tareas ${[...enCiclo].map((i) => i + 1).join(', ')}: se programan sin esas dependencias. Revisa sus predecesoras.`);
      enCiclo.forEach((i) => orden.push(i));
    }
    const dur = lista.map(durDe);
    const ini = new Array(n).fill(0);
    orden.forEach((i) => {
      const t = lista[i];
      let s = 0;
      const nad = aDia(t.noAntesDe);
      if (nad !== null) s = Math.max(s, cal.indice(nad));
      entrantes[i].forEach((e) => {
        if (enCiclo.has(i) && enCiclo.has(e.de)) return;
        if (e.tipo === 'CC') s = Math.max(s, ini[e.de] + e.desfase);
        else if (e.tipo === 'FF') s = Math.max(s, ini[e.de] + dur[e.de] + e.desfase - dur[i]);
        else s = Math.max(s, ini[e.de] + dur[e.de] + e.desfase);
      });
      ini[i] = Math.max(0, s);
    });
    const finExcl = ini.map((s, i) => s + dur[i]);
    const termino = n ? Math.max(...finExcl) : 0;
    // Paso hacia atrás: último fin (exclusivo) que no atrasa el término del proyecto
    const lf = new Array(n).fill(termino);
    [...orden].reverse().forEach((i) => {
      salientes[i].forEach((j) => {
        if (enCiclo.has(i) && enCiclo.has(j)) return;
        const e = entrantes[j].find((x) => x.de === i);
        const lsJ = lf[j] - dur[j];
        if (e.tipo === 'CC') lf[i] = Math.min(lf[i], lsJ - e.desfase + dur[i]);
        else if (e.tipo === 'FF') lf[i] = Math.min(lf[i], lf[j] - e.desfase);
        else lf[i] = Math.min(lf[i], lsJ - e.desfase);
      });
    });
    const tareas = lista.map((t, i) => {
      const holgura = lf[i] - finExcl[i];
      // Un hito después del inicio queda al final del día laborable anterior (el término de lo que lo
      // precede), no al comienzo del siguiente: «Entrega» cae el mismo día en que termina la obra.
      const alFinal = !dur[i] && ini[i] > 0;
      const dIni = alFinal ? cal.fecha(ini[i] - 1) : cal.fecha(ini[i]);
      const dFin = dur[i] ? cal.fecha(finExcl[i] - 1) : dIni;
      return Object.assign({}, t, { n: i + 1, ini: ini[i], dur: dur[i], fin: finExcl[i], dIni, dFin, alFinal, holgura, critica: n > 0 && holgura <= 0, entrantes: entrantes[i] });
    });
    const dInicio = n ? Math.min(...tareas.map((t) => t.dIni)) : cal.inicio;
    const dTermino = n ? Math.max(...tareas.map((t) => t.dFin)) : cal.inicio;
    return {
      tareas, errores, calendario: cal,
      inicio: dInicio, termino: dTermino,
      plazoLaborable: termino, plazoCorrido: n ? dTermino - dInicio + 1 : 0,
      criticas: tareas.filter((t) => t.critica).map((t) => t.n)
    };
  }

  /* Duración sugerida para la tarea de una partida: los días de su mano de obra por unidad (cada línea
     dura lo que su nivel más largo; las líneas, una tras otra) por la cantidad. Una cuadrilla; mínimo 1. */
  function duracionSugerida(partida, manoObra) {
    const num = (v) => (Number.isFinite(+v) ? +v : 0);
    const porUnidad = (manoObra || []).filter((m) => m.partida === partida.uid)
      .reduce((a, m) => a + Math.max(num(m.n1d), num(m.n2d), num(m.n3d)), 0);
    return Math.max(1, Math.ceil(porUnidad * Math.max(1, num(partida.cantidad))));
  }

  /* Escala de la lámina: la elegida o, en automático, según el plazo */
  function escalaDe(g, res) {
    const e = g && g.escala;
    if (e === 'dias' || e === 'semanas' || e === 'meses') return e;
    const dias = res.termino - res.inicio + 1;
    return dias <= 45 ? 'dias' : dias <= 240 ? 'semanas' : 'meses';
  }

  // ---- Lámina: figuras simples para SVG y PDF -----------------------------------------------------
  /* Mide un texto (puntos). Con js/pdf.js cargado usa los anchos de Helvetica; si no, una aproximación. */
  const medir = (s, size, bold) => (root.QPdf ? root.QPdf.ancho(s, size, bold) : String(s).length * size * (bold ? 0.58 : 0.52));
  const recortar = (s, size, bold, maxW) => {
    if (root.QPdf) return root.QPdf.recortar(s, size, bold, maxW);
    const max = Math.max(1, Math.floor(maxW / (size * 0.52)));
    return String(s).length > max ? String(s).slice(0, max - 1) + '…' : String(s);
  };

  /* res: calcular(); filas: las tareas a dibujar (res.tareas o un tramo, para paginar el PDF).
     o: { ancho, escala, columnas: true (N°, duración, fechas) | false (solo N° y nombre), responsable,
          filaAlto, cabeceraAlto, todas: res.tareas para las flechas entre tramos, nombreAncho,
          etiquetas: días y avance junto a cada barra, hoy: número de día para la línea «Hoy»,
          pantalla: franjas por fila, esquinas redondeadas y ayudas (data-uid, data-tip) solo para el SVG }
     Devuelve { ancho, alto, figuras: [...] }. Las figuras con pantalla: true no van al PDF. */
  function dibujo(res, filas, o) {
    const op = Object.assign({ ancho: 1000, escala: 'semanas', columnas: true, filaAlto: 16, cabeceraAlto: 30, size: 7.5 }, o || {});
    const figs = [];
    const R = (x, y, w, h, st) => figs.push(Object.assign({ t: 'rect', x, y, w, h }, st));
    const L = (x1, y1, x2, y2, st) => figs.push(Object.assign({ t: 'linea', x1, y1, x2, y2 }, st));
    const P = (pts, st) => figs.push(Object.assign({ t: 'poli', pts }, st));
    const T = (x, y, s, st) => figs.push(Object.assign({ t: 'texto', x, y, s: String(s) }, st));
    const sz = op.size;
    const conResp = op.columnas && op.responsable && filas.some((t) => String(t.responsable || '').trim());
    // Columnas de la tabla
    const cols = [{ k: 'n', w: 20, al: 'right', tit: 'N°' }, { k: 'nombre', w: op.nombreAncho || (op.columnas ? 170 : 150), al: 'left', tit: 'Tarea' }];
    if (conResp) cols.push({ k: 'responsable', w: 70, al: 'left', tit: 'Responsable' });
    if (op.columnas) cols.push({ k: 'dur', w: 34, al: 'right', tit: 'Días' }, { k: 'dIni', w: 50, al: 'center', tit: 'Inicio' }, { k: 'dFin', w: 50, al: 'center', tit: 'Término' });
    let x = 0;
    cols.forEach((c) => { c.x = x; x += c.w; });
    const x0 = x + 6, x1 = op.ancho;
    const H = op.cabeceraAlto, F = op.filaAlto;
    const alto = H + filas.length * F;
    // Rango de fechas de la escala, ajustado a sus límites
    const esc = op.escala;
    // Un día de margen al final: el hito de entrega cae al término del último día y no quede en el borde
    let d0 = res.inicio, d1 = res.termino + 2;
    if (esc === 'semanas') { d0 -= (semana(d0) + 6) % 7; d1 += (7 - ((semana(d1) + 6) % 7)) % 7; }
    if (esc === 'meses') {
      const a = new Date(d0 * DIA), b = new Date((d1 - 1) * DIA);
      d0 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1) / DIA;
      d1 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1) / DIA;
    }
    const span = Math.max(1, d1 - d0);
    const px = (x1 - x0) / span;
    const X = (d) => x0 + (d - d0) * px;
    const xHito = (t) => X(t.alFinal ? t.dIni + 1 : t.dIni);
    // Cabecera
    R(0, 0, x1, H, { fill: COLOR.cabecera });
    cols.forEach((c) => T(c.al === 'right' ? c.x + c.w - 3 : c.al === 'center' ? c.x + c.w / 2 : c.x + 3, H - 6, c.tit, { size: sz, bold: true, color: COLOR.texto, align: c.al }));
    const mitad = H / 2;
    // Fila superior: meses (o años); inferior: días, semanas o meses
    const meses = [];
    for (let d = d0; d < d1;) {
      const f = new Date(d * DIA);
      const sig = Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 1) / DIA;
      meses.push({ d, hasta: Math.min(sig, d1), m: f.getUTCMonth(), a: f.getUTCFullYear() });
      d = sig;
    }
    const sup = esc === 'meses' ? [] : meses;
    sup.forEach((m) => {
      const xa = X(m.d), xb = X(m.hasta);
      L(xa, 0, xa, H, { stroke: COLOR.base, lw: 0.5 });
      if (xb - xa > 18) T((xa + xb) / 2, mitad - 4, `${MESES[m.m]} ${m.a}`, { size: sz, bold: true, color: COLOR.texto, align: 'center', maxW: xb - xa - 2 });
    });
    if (esc === 'meses') {
      const anios = [];
      meses.forEach((m) => { const u = anios[anios.length - 1]; if (u && u.a === m.a) u.hasta = m.hasta; else anios.push({ a: m.a, d: m.d, hasta: m.hasta }); });
      anios.forEach((a) => { const xa = X(a.d), xb = X(a.hasta); L(xa, 0, xa, H, { stroke: COLOR.base, lw: 0.5 }); T((xa + xb) / 2, mitad - 4, String(a.a), { size: sz, bold: true, color: COLOR.texto, align: 'center' }); });
    }
    L(x0, mitad, x1, mitad, { stroke: COLOR.base, lw: 0.4 });
    // Divisiones de la fila inferior, la grilla y los fines de semana
    const cal = res.calendario;
    if (esc === 'dias' || esc === 'semanas') {
      for (let d = d0; d < d1; d++) {
        if (!cal.laborable(d)) R(X(d), H, px, filas.length * F, { fill: COLOR.finde });
      }
    }
    if (esc === 'dias') {
      for (let d = d0; d < d1; d++) {
        const xa = X(d);
        L(xa, mitad, xa, alto, { stroke: COLOR.grilla, lw: 0.3 });
        if (px >= 9) T(xa + px / 2, H - 6, String(new Date(d * DIA).getUTCDate()), { size: Math.min(sz, px * 0.7), color: cal.laborable(d) ? COLOR.texto : COLOR.muted, align: 'center' });
        else if (px >= 4 && semana(d) === 1) T(xa + 1, H - 6, String(new Date(d * DIA).getUTCDate()), { size: sz - 1, color: COLOR.suave });
      }
    } else if (esc === 'semanas') {
      for (let d = d0; d < d1; d += 7) {
        const xa = X(d);
        L(xa, mitad, xa, alto, { stroke: COLOR.grilla, lw: 0.4 });
        if (px * 7 >= 16) T(xa + (px * 7) / 2, H - 6, String(new Date(d * DIA).getUTCDate()), { size: sz, color: COLOR.suave, align: 'center' });
      }
    } else {
      meses.forEach((m) => {
        const xa = X(m.d), xb = X(m.hasta);
        L(xa, mitad, xa, alto, { stroke: COLOR.grilla, lw: 0.4 });
        if (xb - xa > 14) T((xa + xb) / 2, H - 6, MESES[m.m], { size: sz, color: COLOR.suave, align: 'center' });
      });
    }
    // Filas
    const yDe = new Map();
    const unidad = cal.habiles ? 'hábiles' : 'corridos';
    const ayuda = (t) => {
      const lineas = [t.hito ? `Hito · ${fechaCorta(t.dIni)}` : `${fechaCorta(t.dIni)} → ${fechaCorta(t.dFin)} · ${t.dur} ${t.dur === 1 ? 'día' : 'días'} ${unidad}`];
      if (!t.hito) lineas.push(`Avance ${Math.max(0, Math.min(100, Number(t.avance) || 0))} %`);
      lineas.push(t.critica ? 'Ruta crítica: si se atrasa, se atrasa la entrega' : `Holgura: ${t.holgura} ${t.holgura === 1 ? 'día' : 'días'} ${unidad}`);
      if (String(t.responsable || '').trim()) lineas.push(`Responsable: ${t.responsable}`);
      return { titulo: `${t.n}. ${String(t.nombre || '').trim() || 'Sin nombre'}`, lineas };
    };
    filas.forEach((t, i) => {
      const y = H + i * F;
      yDe.set(t.uid, y + F / 2);
      if (op.pantalla) R(0, y, x1, F, { fill: 'transparent', uid: t.uid, cls: 'g-banda', tip: ayuda(t), pantalla: true });
      L(0, y + F, x1, y + F, { stroke: COLOR.grilla, lw: 0.3 });
      cols.forEach((c) => {
        let v = c.k === 'dur' ? (t.hito ? 'hito' : String(t.dur)) : c.k === 'dIni' ? fechaCorta(t.dIni) : c.k === 'dFin' ? fechaCorta(t.dFin) : c.k === 'n' ? String(t.n) : String(t[c.k] || '');
        if (c.k === 'nombre' && !v.trim()) v = 'Sin nombre';
        const xt = c.al === 'right' ? c.x + c.w - 3 : c.al === 'center' ? c.x + c.w / 2 : c.x + 3;
        T(xt, y + F / 2 + sz * 0.35, v, { size: sz, bold: c.k === 'nombre' && t.hito, color: c.k === 'nombre' || c.k === 'n' ? COLOR.texto : COLOR.suave, align: c.al, maxW: c.w - 6 });
      });
      const yc = y + F / 2;
      const marca = op.pantalla ? { uid: t.uid, cls: 'g-barra', tip: ayuda(t) } : {};
      if (t.hito) {
        const xc = xHito(t), r = Math.min(F * 0.32, 5);
        P([[xc, yc - r], [xc + r, yc], [xc, yc + r], [xc - r, yc]], Object.assign({ fill: t.critica ? COLOR.critica : COLOR.hito }, marca));
        // El nombre a la derecha del rombo; si no cabe y a la izquierda hay más lugar, a la izquierda
        const der = x1 - xc - r - 4, izq = xc - r - 4 - x0;
        const aLaIzq = medir(t.nombre || '', sz - 0.5, false) > der && izq > der;
        const etiqueta = recortar(t.nombre || '', sz - 0.5, false, Math.max(0, aLaIzq ? izq : der));
        if (etiqueta) T(aLaIzq ? xc - r - 3 : xc + r + 3, yc + sz * 0.35, etiqueta, { size: sz - 0.5, color: COLOR.suave, align: aLaIzq ? 'right' : 'left' });
      } else {
        const xa = X(t.dIni), xb = X(t.dFin + 1), hb = F * 0.56;
        // Holgura: hasta dónde puede correrse sin atrasar la entrega (línea fina tras la barra)
        if (!t.critica && t.holgura > 0) {
          const xh = Math.min(x1, X(cal.fecha(t.fin + t.holgura - 1) + 1));
          const yh = yc + hb / 2 - 0.3;
          if (xh > xb + 1) { L(xb, yh, xh, yh, { stroke: COLOR.holgura, lw: 0.6, dash: [1.5, 1.5] }); L(xh, yh - hb / 3, xh, yh, { stroke: COLOR.holgura, lw: 0.6 }); }
        }
        R(xa, yc - hb / 2, Math.max(1.5, xb - xa), hb, Object.assign({ fill: t.critica ? COLOR.critica : COLOR.tarea, r: op.pantalla ? Math.min(3, hb / 3) : 0 }, marca));
        const av = Math.max(0, Math.min(100, Number(t.avance) || 0));
        if (av > 0) R(xa, yc - hb / 2 + hb * 0.3, Math.max(1, (xb - xa) * av / 100), hb * 0.4, Object.assign({ fill: t.critica ? COLOR.criticaAvance : COLOR.tareaAvance }, marca));
        if (op.etiquetas) {
          const txt = `${t.dur} d${av > 0 ? ` · ${av} %` : ''}`;
          const w = medir(txt, sz - 1, false);
          if (xb + 4 + w <= x1) T(xb + 4, yc + (sz - 1) * 0.35, txt, { size: sz - 1, color: COLOR.suave });
          else if (xb - xa > w + 8) T(xb - 4, yc + (sz - 1) * 0.35, txt, { size: sz - 1, color: COLOR.sobreBarra, align: 'right' });
        }
      }
    });
    // Hoy: línea vertical punteada si cae dentro de la lámina
    if (op.hoy !== undefined && op.hoy !== null && op.hoy >= d0 && op.hoy < d1) {
      const xh = X(op.hoy) + (esc === 'dias' ? px / 2 : 0);
      L(xh, mitad, xh, alto, { stroke: COLOR.hoy, lw: 0.9, dash: [3, 2] });
      const xp = Math.max(x0, Math.min(xh - 11, x1 - 22));
      R(xp, mitad + 1, 22, mitad - 3, { fill: COLOR.hoy, r: 2 });
      T(xp + 11, H - 5.5, 'Hoy', { size: sz - 1.5, bold: true, color: COLOR.sobreBarra, align: 'center' });
    }
    // Flechas de dependencia (las dos tareas en esta lámina). FC: del fin de la predecesora baja a la
    // barra sucesora; CC: sale por la izquierda; FF: llega por la derecha; un solape (desfase negativo)
    // rodea la barra.
    const hb = F * 0.56, rh = Math.min(F * 0.32, 5);
    filas.forEach((t) => {
      (t.entrantes || []).forEach((e) => {
        const todas = op.todas || res.tareas;
        const pred = todas[e.de];
        if (!pred || !yDe.has(pred.uid)) return;
        const ya = yDe.get(pred.uid), yb = yDe.get(t.uid);
        const xa = pred.hito ? xHito(pred) : e.tipo === 'CC' ? X(pred.dIni) : X(pred.dFin + 1);
        const xb = t.hito ? xHito(t) : e.tipo === 'FF' ? X(t.dFin + 1) : X(t.dIni);
        const st = { stroke: COLOR.flecha, lw: 0.6 };
        const abajo = yb > ya;
        const borde = yb + (abajo ? -1 : 1) * (t.hito ? rh : hb / 2);
        const punta = (x, y, dx, dy) => P([[x, y], [x - 3.2 * dx - 2 * dy, y - 3.2 * dy - 2 * dx], [x - 3.2 * dx + 2 * dy, y - 3.2 * dy + 2 * dx]], { fill: COLOR.flecha });
        if (e.tipo === 'CC') {
          const xv = Math.min(xa, xb) - 4;
          L(xa, ya, xv, ya, st); L(xv, ya, xv, yb, st); L(xv, yb, xb, yb, st);
          punta(xb, yb, 1, 0);
        } else if (e.tipo === 'FF') {
          const xv = Math.max(xa, xb) + 4;
          L(xa, ya, xv, ya, st); L(xv, ya, xv, yb, st); L(xv, yb, xb, yb, st);
          punta(xb, yb, -1, 0);
        } else if (xb >= xa - 0.5) {
          const xv = Math.max(xa + 3, t.hito ? xb : xb + 3);
          L(xa, ya, xv, ya, st); L(xv, ya, xv, borde, st);
          punta(xv, borde, 0, abajo ? 1 : -1);
        } else {
          const ym = yb + (abajo ? -1 : 1) * F * 0.45;
          L(xa, ya, xa + 4, ya, st); L(xa + 4, ya, xa + 4, ym, st); L(xa + 4, ym, xb - 4, ym, st); L(xb - 4, ym, xb - 4, yb, st); L(xb - 4, yb, xb, yb, st);
          punta(xb, yb, 1, 0);
        }
      });
    });
    // Bordes: separación tabla / tiempo
    L(x0 - 6, 0, x0 - 6, alto, { stroke: COLOR.base, lw: 0.6 });
    L(0, H, x1, H, { stroke: COLOR.base, lw: 0.6 });
    return { ancho: x1, alto, figuras: figs };
  }

  /* La lámina como SVG (pantalla). Texto en Helvetica/Arial: mide igual que en el PDF. Los colores van
     como variables CSS (VARIABLE) para el modo oscuro; las figuras con uid llevan data-uid y su ayuda. */
  function svg(lam) {
    const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const r2 = (v) => Math.round(v * 100) / 100;
    const c = (hex) => (VARIABLE[hex] ? `var(${VARIABLE[hex]}, ${hex})` : hex);
    const st = (f) => `style="fill:${f.fill ? c(f.fill) : 'none'}${f.stroke ? `;stroke:${c(f.stroke)};stroke-width:${f.lw || 0.5}` : ''}${f.dash ? `;stroke-dasharray:${f.dash.join(' ')}` : ''}"`;
    const extra = (f) => (f.uid ? ` data-uid="${e(f.uid)}"` : '') + (f.cls ? ` class="${f.cls}"` : '')
      + (f.tip ? ` data-tip="${e(`<b>${e(f.tip.titulo)}</b>${f.tip.lineas.map(e).join('<br>')}`)}"` : '');
    const out = lam.figuras.map((f) => {
      if (f.t === 'rect') return `<rect x="${r2(f.x)}" y="${r2(f.y)}" width="${r2(f.w)}" height="${r2(f.h)}"${f.r ? ` rx="${r2(f.r)}"` : ''} ${st(f)}${extra(f)}/>`;
      if (f.t === 'linea') return `<line x1="${r2(f.x1)}" y1="${r2(f.y1)}" x2="${r2(f.x2)}" y2="${r2(f.y2)}" ${st({ stroke: f.stroke || '#000000', lw: f.lw, dash: f.dash })}/>`;
      if (f.t === 'poli') return `<polygon points="${f.pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' ')}" ${st(f)}${extra(f)}/>`;
      const anchor = f.align === 'center' ? 'middle' : f.align === 'right' ? 'end' : 'start';
      const s = f.maxW ? recortar(f.s, f.size, f.bold, f.maxW) : f.s;
      return `<text x="${r2(f.x)}" y="${r2(f.y)}" font-size="${f.size}" ${f.bold ? 'font-weight="700"' : ''} style="fill:${c(f.color || '#000000')}" text-anchor="${anchor}">${e(s)}</text>`;
    }).join('');
    return `<svg class="gantt-svg" viewBox="0 0 ${r2(lam.ancho)} ${r2(lam.alto)}" width="${r2(lam.ancho)}" height="${r2(lam.alto)}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="Carta Gantt">${out}</svg>`;
  }

  function pintarEnPdf(doc, lam, dx, dy) {
    lam.figuras.forEach((f) => {
      if (f.pantalla) return;
      if (f.t === 'rect') doc.rect(f.x + dx, f.y + dy, f.w, f.h, f);
      else if (f.t === 'linea') doc.linea(f.x1 + dx, f.y1 + dy, f.x2 + dx, f.y2 + dy, f);
      else if (f.t === 'poli') doc.poligono(f.pts.map((p) => [p[0] + dx, p[1] + dy]), f);
      else doc.texto(f.x + dx, f.y + dy, f.s, f);
    });
  }

  /* El PDF de la Carta Gantt (A4 horizontal; varias páginas si hay muchas tareas).
     p: el proyecto; logo: { jpeg: Uint8Array, px, py } opcional. Devuelve Uint8Array. */
  function pdf(p, res, logo, ahora) {
    if (!root.QPdf) throw new Error('Falta js/pdf.js');
    const doc = root.QPdf.documento({ ancho: 842, alto: 595 });
    const g = p.gantt || {};
    const M = 28, W = 842 - 2 * M;
    const escala = escalaDe(g, res);
    const filaAlto = res.tareas.length > 40 ? 13 : 16;
    const arriba = M + 46, abajo = 50;
    const porPagina = Math.max(1, Math.floor((595 - arriba - abajo - 28) / filaAlto));
    const tramos = [];
    for (let i = 0; i < Math.max(1, res.tareas.length); i += porPagina) tramos.push(res.tareas.slice(i, i + porPagina));
    const fecha = ahora || new Date();
    const gen = `${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${fecha.getFullYear()}`;
    const tipoDias = res.calendario.habiles ? 'días hábiles' : 'días corridos';
    const hoy = Math.round(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) / DIA);
    const conHoy = hoy >= res.inicio && hoy <= res.termino + 1;
    const conHolgura = res.tareas.some((t) => !t.hito && !t.critica && t.holgura > 0);
    tramos.forEach((filas, k) => {
      doc.pagina();
      // Encabezado: logo, título, proyecto y fechas clave
      let xt = M;
      if (logo && logo.jpeg) {
        const h = 26, w = (logo.px / logo.py) * h;
        doc.imagen(logo.jpeg, logo.px, logo.py, M, M - 4, w, h);
        xt = M + w + 12;
      }
      doc.texto(xt, M + 10, 'Carta Gantt', { size: 16, bold: true, color: '#171513' });
      doc.texto(xt, M + 24, `${p.codigo || ''} v${p.version || 1} · ${p.titulo || 'Proyecto sin título'}`, { size: 9, color: '#52514e', maxW: 430 });
      const der = 842 - M;
      doc.texto(der, M + 2, p.cliente ? `Cliente: ${p.cliente}` : '', { size: 8.5, color: '#52514e', align: 'right', maxW: 300 });
      doc.texto(der, M + 14, `Inicio ${fechaCorta(res.inicio)} · Término ${fechaCorta(res.termino)}`, { size: 9, bold: true, color: '#171513', align: 'right' });
      doc.texto(der, M + 26, `Plazo: ${res.plazoLaborable} ${tipoDias}${res.calendario.habiles ? ` (${res.plazoCorrido} corridos)` : ''}`, { size: 8.5, color: '#52514e', align: 'right' });
      doc.rect(M, M + 34, W, 1.6, { fill: '#ff5100' });
      // Lámina
      const lam = dibujo(res, filas, { ancho: W, escala, filaAlto, cabeceraAlto: 28, columnas: true, responsable: true, todas: res.tareas, hoy });
      pintarEnPdf(doc, lam, M, arriba);
      // Leyenda y pie
      const yl = 595 - abajo + 8;
      let xl = M;
      const ley = (dib, txt) => { dib(xl, yl); doc.texto(xl + 22, yl + 3, txt, { size: 7.5, color: '#52514e' }); xl += 22 + root.QPdf.ancho(txt, 7.5) + 18; };
      ley((x0, y0) => doc.rect(x0, y0 - 3, 16, 6, { fill: COLOR.tarea }), 'Tarea');
      ley((x0, y0) => doc.rect(x0, y0 - 3, 16, 6, { fill: COLOR.critica }), 'Ruta crítica (sin holgura)');
      ley((x0, y0) => { doc.rect(x0, y0 - 3, 16, 6, { fill: COLOR.tarea }); doc.rect(x0, y0 - 1.2, 9, 2.4, { fill: COLOR.tareaAvance }); }, 'Avance');
      ley((x0, y0) => doc.poligono([[x0 + 8, y0 - 4], [x0 + 12, y0], [x0 + 8, y0 + 4], [x0 + 4, y0]], { fill: COLOR.hito }), 'Hito');
      ley((x0, y0) => { doc.linea(x0, y0, x0 + 14, y0, { stroke: COLOR.flecha, lw: 0.6 }); doc.poligono([[x0 + 16, y0], [x0 + 12.8, y0 - 2], [x0 + 12.8, y0 + 2]], { fill: COLOR.flecha }); }, 'Dependencia');
      if (conHolgura) ley((x0, y0) => { doc.linea(x0, y0 + 2, x0 + 16, y0 + 2, { stroke: COLOR.holgura, lw: 0.6, dash: [1.5, 1.5] }); doc.linea(x0 + 16, y0 - 1, x0 + 16, y0 + 2, { stroke: COLOR.holgura, lw: 0.6 }); }, 'Holgura');
      if (conHoy) ley((x0, y0) => doc.linea(x0 + 8, y0 - 5, x0 + 8, y0 + 5, { stroke: COLOR.hoy, lw: 0.9, dash: [3, 2] }), `Hoy (${gen})`);
      doc.linea(M, 595 - 26, 842 - M, 595 - 26, { stroke: '#e1e0d9', lw: 0.5 });
      doc.texto(M, 595 - 16, `QUEMPIN SpA · Formulación de proyectos · generado el ${gen}`, { size: 7, color: '#898781' });
      doc.texto(842 - M, 595 - 16, `Página ${k + 1} de ${tramos.length}`, { size: 7, color: '#898781', align: 'right' });
    });
    return doc.bytes();
  }

  const api = {
    TIPOS, NOMBRE_TIPO, COLOR, aDia, aIso, fechaCorta, leerFecha, calendario, calcular, duracionSugerida,
    textoPredecesoras, leerPredecesoras, escalaDe, dibujo, svg, pdf
  };
  root.QGantt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
