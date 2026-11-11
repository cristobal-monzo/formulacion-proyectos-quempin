// Prueba de gantt/datos.js sin navegador (2026-10-20: la Carta Gantt, herramienta aparte del Formulador).
// Dos «navegadores» (cada uno con su localStorage) y una carpeta del equipo de mentira, en memoria:
// el traspaso desde p.gantt da la misma carta en los dos (sin conflicto), los cambios viajan por la
// carpeta y un cambio a la vez en los dos deja la carta de la carpeta y la de aquí como copia.
// Datos FICTICIOS.
// Uso: node .prueba/gantt/datos.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);

// ---- Carpeta de mentira (la API de archivos del navegador, lo que usa datos.js) ----
let reloj = 1;
function carpeta() {
  const hijos = new Map();
  return {
    kind: 'directory', hijos,
    async getDirectoryHandle(n, o) {
      if (!hijos.has(n)) { if (!(o && o.create)) throw new Error('NotFound ' + n); hijos.set(n, carpeta()); }
      return hijos.get(n);
    },
    async getFileHandle(n, o) {
      if (!hijos.has(n)) { if (!(o && o.create)) throw new Error('NotFound ' + n); hijos.set(n, archivo()); }
      return hijos.get(n);
    },
    async *entries() { for (const [n, h] of hijos) yield [n, h]; }
  };
}
function archivo() {
  const a = { kind: 'file', texto: '', mod: 0 };
  a.getFile = async () => ({ lastModified: a.mod, size: a.texto.length, text: async () => a.texto });
  a.createWritable = async () => { let buf = ''; return { write: async (t) => { buf += t; }, close: async () => { a.texto = buf; a.mod = reloj++; } }; };
  return a;
}
const equipo = carpeta();

function navegador(nombre) {
  const datos = new Map();
  const localStorage = { getItem: (k) => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => datos.set(k, String(v)), removeItem: (k) => datos.delete(k) };
  const ctx = vm.createContext({ console, Date, JSON, Math, Map, Set, Array, Object, String, Number, Promise, setTimeout, clearTimeout, setInterval, localStorage });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js', 'compartida.js'), 'utf-8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'gantt', 'gantt.js'), 'utf-8'), ctx);
  ctx.QUsuario = { actual: () => nombre };
  ctx.QIntercambio = { disponible: () => true, carpeta: async () => equipo, estado: async () => ({ conectada: true, permiso: 'granted' }), onCambio() {} };
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'gantt', 'datos.js'), 'utf-8'), ctx);
  return { D: ctx.QGanttDatos, localStorage, ctx };
}

// Un proyecto del Formulador con su carta antigua dentro (p.gantt) y otro sin carta
const conGantt = {
  uid: 'proyA1', codigo: 'QMPN-2026-901', version: 2, titulo: 'Proyecto ficticio con carta', cliente: 'Cliente Ficticio', responsable: 'NB',
  modificado: '2026-10-15T12:00:00.000Z', vinculos: { requerimiento: { numero: 901 } },
  partidas: [{ uid: 'pt1', descripcion: 'Montaje', cantidad: 1 }, { uid: 'pt2', descripcion: 'Pruebas', cantidad: 1 }],
  gantt: { inicio: '2026-10-19', calendario: 'habiles', escala: 'auto', noLaborables: [], tareas: [
    { uid: 't1', nombre: 'Montaje', partida: 'pt1', duracion: 3, hito: false, avance: 0, predecesoras: [] },
    { uid: 't2', nombre: 'Pruebas', partida: 'pt2', duracion: 2, hito: false, avance: 0, predecesoras: [{ uid: 't1', tipo: 'FC', desfase: 0 }] }] }
};
const sinGantt = { uid: 'proyB2', codigo: 'QMPN-2026-902', version: 1, titulo: 'Proyecto ficticio sin carta', modificado: '2026-10-16T12:00:00.000Z', partidas: [] };
const vacia = Object.assign({}, sinGantt, { uid: 'proyC3', codigo: 'QMPN-2026-903', gantt: { tareas: [] } });
const sembrar = (b, ps) => b.localStorage.setItem('qpn.formulacion.proyectos.v1', JSON.stringify({ schema: 'quempin-formulacion/v1', proyectos: ps }));
const enCarpeta = () => {
  const g = equipo.hijos.get('publicado') && equipo.hijos.get('publicado').hijos.get('gantt');
  return g ? Array.from(g.hijos.entries()).map(([n, a]) => ({ n, sobre: JSON.parse(a.texto) })) : [];
};

(async () => {
  const A = navegador('NB'), B = navegador('ES');
  sembrar(A, [conGantt, sinGantt, vacia]);
  sembrar(B, [conGantt]);

  // 1. Traspaso: solo los proyectos con tareas, con uid y fecha deterministas
  const n = A.D.traspasar(A.D.proyectosFormulador());
  const cA = A.D.all();
  check('traspasa solo el proyecto con tareas', n === 1 && cA.length === 1, cA.map((c) => c.uid));
  check('la carta lleva uid «f<proyecto>», la fecha del proyecto y su foto', cA[0].uid === 'fproyA1' && cA[0].modificado === conGantt.modificado
    && cA[0].proyecto.codigo === 'QMPN-2026-901' && cA[0].proyecto.version === 2 && cA[0].proyecto.req === '901' && cA[0].gantt.tareas.length === 2, cA[0]);
  check('el proyecto del Formulador no se toca', JSON.parse(A.localStorage.getItem('qpn.formulacion.proyectos.v1')).proyectos[0].gantt.tareas.length === 2);
  check('traspasar otra vez no duplica', A.D.traspasar(A.D.proyectosFormulador()) === 0 && A.D.all().length === 1);

  // 2. Primera sincronización de A: la sube a publicado/gantt/
  await A.D.sincronizar();
  let arch = enCarpeta();
  check('A sube la carta a publicado/gantt/fproyA1.json', arch.length === 1 && arch[0].n === 'fproyA1.json' && arch[0].sobre.tipo === 'carta-gantt' && arch[0].sobre.herramienta === 'gantt', arch.map((x) => x.n));
  check('el sobre trae un resumen legible (tareas, plazo)', arch[0].sobre.resumen.tareas === 2 && arch[0].sobre.resumen.plazo === 5, arch[0].sobre.resumen);

  // 3. B, que tiene el mismo proyecto, llega a la misma carta sin conflicto
  await B.D.sincronizar();
  check('B no crea una copia: queda una sola carta', B.D.all().length === 1 && B.D.all()[0].uid === 'fproyA1', B.D.all().map((c) => c.nombre || c.uid));
  check('la carpeta sigue con un solo archivo', enCarpeta().length === 1);

  // 4. Un cambio en A llega a B
  const ca = A.D.get('fproyA1');
  ca.gantt.tareas[0].duracion = 4;
  A.D.guardar(ca);
  await A.D.sincronizar();
  await B.D.sincronizar();
  check('el cambio de A llega a B', B.D.get('fproyA1').gantt.tareas[0].duracion === 4 && B.D.get('fproyA1').modificadoPor === 'NB', B.D.get('fproyA1').gantt.tareas[0]);

  // 5. Una carta suelta de B llega a A
  const suelta = B.D.guardar(B.D.nueva({ nombre: 'Mantención ficticia' }));
  await B.D.sincronizar();
  await A.D.sincronizar();
  check('la carta suelta de B aparece en A', !!A.D.get(suelta.uid) && A.D.get(suelta.uid).nombre === 'Mantención ficticia');

  // 6. Cambio a la vez en los dos: queda la de la carpeta y la de aquí como copia
  const a2 = A.D.get('fproyA1'); a2.gantt.tareas[1].duracion = 7; A.D.guardar(a2);
  const b2 = B.D.get('fproyA1'); b2.gantt.tareas[1].duracion = 9; B.D.guardar(b2);
  await A.D.sincronizar();
  await B.D.sincronizar();
  const enB = B.D.all();
  const copia = enB.find((c) => /copia de este equipo/.test(c.nombre));
  check('B queda con la de A (la de la carpeta) y la suya como copia', B.D.get('fproyA1').gantt.tareas[1].duracion === 7 && !!copia && copia.gantt.tareas[1].duracion === 9, enB.map((c) => [c.nombre, c.gantt.tareas.length && c.gantt.tareas[1] && c.gantt.tareas[1].duracion]));
  check('la copia es suelta en tareas: otros uid, predecesoras apuntando a las suyas', copia && copia.gantt.tareas[0].uid !== 't1' && copia.gantt.tareas[1].predecesoras[0].uid === copia.gantt.tareas[0].uid);

  // 7. Eliminar: queda en la papelera, viaja, y el traspaso no la vuelve a crear
  A.D.eliminar('fproyA1');
  await A.D.sincronizar();
  await B.D.sincronizar();
  check('eliminada en A, en B pasa a la papelera', !B.D.get('fproyA1') || !!B.D.get('fproyA1').eliminado);
  check('el traspaso no la vuelve a crear', B.D.traspasar(B.D.proyectosFormulador()) === 0 && !B.D.all().some((c) => c.uid === 'fproyA1'));

  // 8. Los proyectos del Formulador que están en la carpeta también se pueden elegir
  const pubF = await (await equipo.getDirectoryHandle('publicado', { create: true })).getDirectoryHandle('formulador', { create: true });
  const w = await (await pubF.getFileHandle('proyD4.json', { create: true })).createWritable();
  await w.write(JSON.stringify({ esquema: 'quempin.intercambio/1', herramienta: 'formulador', tipo: 'proyecto', historia: [], datos: { uid: 'proyD4', codigo: 'QMPN-2026-904', version: 1, titulo: 'Del colega', modificado: '2026-10-17T00:00:00.000Z',
    gantt: { tareas: [{ uid: 'x1', nombre: 'Algo', duracion: 2 }] } } }));
  await w.close();
  await B.D.sincronizar();
  check('B ve el proyecto que solo está en la carpeta', !!B.D.proyecto('proyD4'));
  check('…y traspasa su carta antigua', !!B.D.get('fproyD4') && B.D.get('fproyD4').proyecto.titulo === 'Del colega');

  // 9. Códigos de las partidas como en el Formulador
  const cods = A.D.partidasDe({ partidas: [{ uid: 'a' }, { uid: 'b', base: true }, { uid: 'c' }] }).map((x) => x.code).join(',');
  check('códigos de partida: P1, PB, P2', cods === 'P1,PB,P2', cods);

  results.forEach((r) => console.log(r));
  const ok = results.filter((r) => r.startsWith('OK')).length;
  console.log(`\n${ok}/${results.length} OK`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
