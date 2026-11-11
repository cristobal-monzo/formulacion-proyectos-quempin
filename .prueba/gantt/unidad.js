// Prueba de gantt/gantt.js y gantt/pdf.js sin navegador: calendario, dependencias, ruta crítica, lectura de
// predecesoras, dibujo y el PDF (estructura válida, texto con tildes, varias páginas). Datos FICTICIOS.
// Uso: node .prueba/gantt/unidad.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const ctx = vm.createContext({ TextEncoder });
['gantt/pdf.js', 'gantt/gantt.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf-8'), ctx));
const G = ctx.QGantt, PDF = ctx.QPdf;

const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);
const f = (d) => G.aIso(d);
let k = 0;
const T = (o) => Object.assign({ uid: 't' + (++k), nombre: 'Tarea ' + k, duracion: 1, predecesoras: [] }, o);
const FC = (t, desfase, tipo) => ({ uid: t.uid, tipo: tipo || 'FC', desfase: desfase || 0 });

// ---- Fechas ----------------------------------------------------------------------------------------
check('aDia/aIso ida y vuelta', f(G.aDia('2026-10-16')) === '2026-10-16');
check('leerFecha acepta dd-mm-aaaa y rechaza fechas imposibles', G.leerFecha('05-11-2026') === '2026-11-05' && G.leerFecha('31-02-2026') === null && G.leerFecha('2026-12-25') === '2026-12-25');

// ---- Calendario hábil: viernes + 3 días = viernes, lunes, martes ------------------------------------
{
  const a = T({ duracion: 3 });
  const r = G.calcular({ inicio: '2026-10-16', calendario: 'habiles', tareas: [a] });
  check('3 días hábiles desde un viernes terminan el martes', f(r.tareas[0].dIni) === '2026-10-16' && f(r.tareas[0].dFin) === '2026-10-20', [f(r.tareas[0].dIni), f(r.tareas[0].dFin)]);
  check('plazo: 3 hábiles y 5 corridos', r.plazoLaborable === 3 && r.plazoCorrido === 5, [r.plazoLaborable, r.plazoCorrido]);
  const s = G.calcular({ inicio: '2026-10-17', calendario: 'habiles', tareas: [T({ duracion: 1 })] });
  check('un inicio en sábado pasa al lunes', f(s.tareas[0].dIni) === '2026-10-19');
  const c = G.calcular({ inicio: '2026-10-16', calendario: 'corridos', tareas: [T({ duracion: 3 })] });
  check('en días corridos el fin de semana cuenta', f(c.tareas[0].dFin) === '2026-10-18');
  const fer = G.calcular({ inicio: '2026-10-16', calendario: 'habiles', noLaborables: ['2026-10-19'], tareas: [T({ duracion: 2 })] });
  check('un día no laborable se salta', f(fer.tareas[0].dFin) === '2026-10-20', f(fer.tareas[0].dFin));
}

// ---- Dependencias ----------------------------------------------------------------------------------
{
  const a = T({ duracion: 2 }), b = T({ duracion: 3 }), c = T({ duracion: 1 }), d = T({ duracion: 2 });
  b.predecesoras = [FC(a)];
  c.predecesoras = [FC(a, 1, 'CC')];
  d.predecesoras = [FC(b, 0, 'FF')];
  const r = G.calcular({ inicio: '2026-10-19', tareas: [a, b, c, d] }); // lunes
  const t = r.tareas;
  check('FC: la sucesora empieza al día hábil siguiente', f(t[1].dIni) === '2026-10-21', f(t[1].dIni));
  check('CC+1: empieza un día después de que empieza la predecesora', f(t[2].dIni) === '2026-10-20', f(t[2].dIni));
  check('FF: termina el mismo día que la predecesora', f(t[3].dFin) === f(t[1].dFin), [f(t[3].dFin), f(t[1].dFin)]);
  check('ruta crítica: A, B y D; C tiene holgura', JSON.stringify(r.criticas) === '[1,2,4]' && t[2].holgura > 0, r.criticas);
  const neg = T({ duracion: 1, predecesoras: [FC(b, -1)] });
  const r2 = G.calcular({ inicio: '2026-10-19', tareas: [a, b, neg] });
  check('desfase negativo: se solapa un día con el final de la predecesora', f(r2.tareas[2].dIni) === f(r2.tareas[1].dFin), [f(r2.tareas[2].dIni), f(r2.tareas[1].dFin)]);
}
{
  const a = T({ duracion: 1, noAntesDe: '2026-10-22' });
  const r = G.calcular({ inicio: '2026-10-19', tareas: [a] });
  check('«no antes de» atrasa el inicio', f(r.tareas[0].dIni) === '2026-10-22');
}

// ---- Hitos -----------------------------------------------------------------------------------------
{
  const ini = T({ nombre: 'Inicio de obras', hito: true });
  const a = T({ duracion: 3, predecesoras: [FC(ini)] });
  const fin = T({ nombre: 'Entrega', hito: true, predecesoras: [FC(a)] });
  const r = G.calcular({ inicio: '2026-10-19', tareas: [ini, a, fin] });
  check('el hito de inicio no consume días', f(r.tareas[1].dIni) === '2026-10-19', f(r.tareas[1].dIni));
  check('el hito final cae el día en que termina la obra', f(r.tareas[2].dIni) === f(r.tareas[1].dFin) && r.tareas[2].alFinal, [f(r.tareas[2].dIni), f(r.tareas[1].dFin)]);
  check('el término del proyecto es el de la obra', f(r.termino) === '2026-10-21' && r.plazoLaborable === 3, [f(r.termino), r.plazoLaborable]);
}

// ---- Ciclos ----------------------------------------------------------------------------------------
{
  const a = T({ duracion: 1 }), b = T({ duracion: 1 });
  a.predecesoras = [FC(b)]; b.predecesoras = [FC(a)];
  let r = null, error = null;
  try { r = G.calcular({ inicio: '2026-10-19', tareas: [a, b] }); } catch (e) { error = e; }
  check('una dependencia circular no rompe el cálculo y se avisa', !error && r.errores.length === 1 && /circular/.test(r.errores[0]), error ? String(error) : r.errores);
}

// ---- Predecesoras escritas ---------------------------------------------------------------------------
{
  const ts = [T({}), T({}), T({}), T({})];
  const l = G.leerPredecesoras('1, 2cc+1; 3FF-2, 2', ts, ts[3].uid);
  check('lee «1, 2cc+1; 3FF-2» y no repite', l.errores.length === 0 && l.lista.length === 3 && l.lista[1].tipo === 'CC' && l.lista[1].desfase === 1 && l.lista[2].tipo === 'FF' && l.lista[2].desfase === -2, l);
  const e = G.leerPredecesoras('9, 4, abc, 2SS', ts, ts[3].uid);
  check('avisa N° inexistente, la propia tarea y lo que no entiende; SS es CC', e.errores.length === 3 && e.lista.length === 1 && e.lista[0].tipo === 'CC', e);
  const numeros = new Map(ts.map((t, i) => [t.uid, i + 1]));
  const t = Object.assign({}, ts[3], { predecesoras: l.lista });
  check('se vuelve a escribir igual', G.textoPredecesoras(t, numeros) === '1, 2CC+1, 3FF-2', G.textoPredecesoras(t, numeros));
}

// ---- Duración sugerida desde la mano de obra -------------------------------------------------------
{
  const pt = { uid: 'p1', cantidad: 3 };
  const mo = [{ partida: 'p1', n1d: 0, n2d: 0.5, n3d: 2 }, { partida: 'p1', n1d: 1, n2d: 0, n3d: 0 }, { partida: 'otra', n3d: 9 }];
  check('duración sugerida = (2 + 1) días por unidad × 3', G.duracionSugerida(pt, mo) === 9, G.duracionSugerida(pt, mo));
  check('sin mano de obra, 1 día', G.duracionSugerida({ uid: 'x', cantidad: 5 }, []) === 1);
}

// ---- Escala automática ------------------------------------------------------------------------------
{
  const corta = G.calcular({ inicio: '2026-10-19', tareas: [T({ duracion: 10 })] });
  const media = G.calcular({ inicio: '2026-10-19', tareas: [T({ duracion: 60 })] });
  const larga = G.calcular({ inicio: '2026-10-19', tareas: [T({ duracion: 200 })] });
  check('escala automática: días, semanas y meses', G.escalaDe({}, corta) === 'dias' && G.escalaDe({}, media) === 'semanas' && G.escalaDe({}, larga) === 'meses');
}

// ---- Dibujo y PDF -----------------------------------------------------------------------------------
const proyecto = (n) => {
  const tareas = [];
  for (let i = 0; i < n; i++) tareas.push(T({ nombre: `Instalación de la línea ${i + 1} con válvulas`, duracion: 2, responsable: 'Técnico', predecesoras: i ? [FC(tareas[i - 1])] : [] }));
  return { codigo: 'QMPN-2026-999', version: 1, titulo: 'Proyecto ficticio de prueba', cliente: 'Cliente Ficticio', gantt: { inicio: '2026-10-19', calendario: 'habiles', escala: 'auto', tareas } };
};
{
  const p = proyecto(6);
  const r = G.calcular(p.gantt);
  const lam = G.dibujo(r, r.tareas, { ancho: 900, escala: 'dias', responsable: true });
  check('la lámina trae barras, textos y flechas', lam.figuras.some((x) => x.t === 'rect') && lam.figuras.some((x) => x.t === 'texto' && x.s === 'Término') && lam.figuras.filter((x) => x.t === 'poli').length >= 5);
  check('el ancho de la lámina no pasa el pedido', lam.figuras.every((x) => (x.t !== 'rect' || x.x + x.w <= 900.01)), null);
  const s = G.svg(lam);
  check('el SVG se arma', s.startsWith('<svg') && s.includes('Instalación de la línea 1'));
  // En pantalla (2026-10-13, mejoras de UX): franjas y ayudas por tarea, días junto a la barra, línea «Hoy»
  const hoy = G.aDia('2026-10-21');
  const pan = G.dibujo(r, r.tareas, { ancho: 900, escala: 'dias', pantalla: true, etiquetas: true, hoy });
  check('pantalla: una franja por tarea con su ayuda', pan.figuras.filter((x) => x.cls === 'g-banda').length === 6 && pan.figuras.find((x) => x.cls === 'g-barra').tip.lineas[0].includes('19-10-2026'));
  check('pantalla: los días van junto a la barra', pan.figuras.some((x) => x.t === 'texto' && x.s === '2 d'));
  check('la línea «Hoy» se dibuja si cae en la lámina', pan.figuras.some((x) => x.t === 'texto' && x.s === 'Hoy') && !G.dibujo(r, r.tareas, { ancho: 900, escala: 'dias', hoy: G.aDia('2027-01-01') }).figuras.some((x) => x.s === 'Hoy'));
  check('pantalla: el ancho tampoco pasa el pedido', pan.figuras.every((x) => (x.t !== 'rect' || x.x + x.w <= 900.01)));
  const sp = G.svg(pan);
  check('el SVG usa variables de color (modo oscuro) y marca las barras', sp.includes('var(--g-critica, #ff5100)') && /class="g-barra" data-tip="&lt;b&gt;1\. Instalaci/.test(sp.replace(/data-uid="[^"]*" /g, '')));
}
{
  // Holgura: una tarea corta en paralelo a una larga se dibuja con su línea de holgura
  const a = T({ nombre: 'Larga', duracion: 10 }), b = T({ nombre: 'Corta', duracion: 3 });
  const r = G.calcular({ inicio: '2026-10-19', tareas: [a, b] });
  const lam = G.dibujo(r, r.tareas, { ancho: 900, escala: 'dias' });
  check('la tarea con holgura lleva su línea punteada', r.tareas[1].holgura === 7 && lam.figuras.some((x) => x.t === 'linea' && x.dash && x.stroke === G.COLOR.holgura));
}
function revisarPdf(bytes) {
  const txt = Buffer.from(bytes).toString('latin1');
  const m = /startxref\n(\d+)\n%%EOF\n$/.exec(txt);
  if (!m) return 'sin startxref';
  const xref = txt.slice(+m[1]);
  const filas = xref.split('\n').slice(3).filter((l) => / n $/.test(l));
  for (let i = 0; i < filas.length; i++) {
    const off = +filas[i].slice(0, 10);
    if (txt.slice(off, off + String(i + 1).length + 6) !== `${i + 1} 0 obj`) return `objeto ${i + 1} fuera de lugar`;
  }
  return 'ok';
}
{
  const p = proyecto(6);
  const r = G.calcular(p.gantt);
  const bytes = G.pdf(p, r, null, new Date(2026, 9, 13));
  const txt = Buffer.from(bytes).toString('latin1');
  check('el PDF empieza y termina como un PDF', txt.startsWith('%PDF-1.4') && txt.endsWith('%%EOF\n'));
  check('la tabla de desplazamientos apunta a cada objeto', revisarPdf(bytes) === 'ok', revisarPdf(bytes));
  check('el texto con tildes va en WinAnsi', txt.includes('(T\\351rmino)') && txt.includes('Instalaci\\363n'));
  check('una página para 6 tareas', (txt.match(/\/Type \/Page /g) || []).length === 1);
  const g = proyecto(80);
  const bytes2 = G.pdf(g, G.calcular(g.gantt), null, new Date(2026, 9, 13));
  const txt2 = Buffer.from(bytes2).toString('latin1');
  const paginas = (txt2.match(/\/Type \/Page /g) || []).length;
  check('80 tareas van en varias páginas, cada una con su número', paginas >= 2 && txt2.includes(`(P\\341gina ${paginas} de ${paginas})`), paginas);
  check('la de 80 tareas también es un PDF válido', revisarPdf(bytes2) === 'ok', revisarPdf(bytes2));
  // Con logo (un JPEG cualquiera: el PDF solo lo copia)
  const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]);
  const bytes3 = G.pdf(p, r, { jpeg, px: 4, py: 2 }, new Date(2026, 9, 13));
  check('el logo entra como imagen JPEG', Buffer.from(bytes3).toString('latin1').includes('/Filter /DCTDecode') && revisarPdf(bytes3) === 'ok');
  fs.mkdirSync(path.join(__dirname, 'salida'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'salida', 'gantt-6.pdf'), bytes);
  fs.writeFileSync(path.join(__dirname, 'salida', 'gantt-80.pdf'), bytes2);
}
{
  check('ancho de Helvetica: «Término» mide lo mismo que «Termino»', PDF.ancho('Término', 10) === PDF.ancho('Termino', 10));
  check('recortar deja «…» y cabe', PDF.ancho(PDF.recortar('Un nombre de tarea muy largo para la columna', 8, false, 60), 8) <= 60);
}

const ok = results.filter((r) => r.startsWith('OK')).length;
results.forEach((r) => console.log(r));
console.log(`\n${ok}/${results.length} OK`);
process.exit(ok === results.length ? 0 : 1);
