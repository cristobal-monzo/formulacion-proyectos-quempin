// Prueba de js/compartida.js sin navegador: dos "equipos" (contextos vm con su propio
// localStorage y su propio QStore) comparten una carpeta en memoria, como la que sincroniza
// OneDrive. Uso: node .prueba/compartida/unidad.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const src = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf-8');
const STORE = src('js/store.js'), COMP = src('js/compartida.js'), CALC = src('js/calc.js'), FUS = src('js/fusion.js');

const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);

// ---- Carpeta en memoria con la API de FileSystemDirectoryHandle -------------------------------
let reloj = 1000;
function crearFS() { return { archivos: new Map() }; }   // ruta -> { texto, mtime }
function clonarFS(f) { const c = crearFS(); f.archivos.forEach((v, k) => c.archivos.set(k, Object.assign({}, v))); return c; }
function dir(fsx, ruta) {
  const pre = ruta ? ruta + '/' : '';
  return {
    kind: 'directory', name: ruta.split('/').pop() || 'Intercambio',
    async getDirectoryHandle(n) { return dir(fsx, pre + n); },
    async removeEntry(n) { fsx.archivos.delete(pre + n); },
    async getFileHandle(n, o) {
      const r = pre + n;
      if (!fsx.archivos.has(r) && !(o && o.create)) { const e = new Error('no existe'); e.name = 'NotFoundError'; throw e; }
      return archivo(fsx, r, n);
    },
    async *entries() {
      const vistos = new Set();
      for (const k of Array.from(fsx.archivos.keys())) {
        if (!k.startsWith(pre)) continue;
        const resto = k.slice(pre.length);
        if (resto.includes('/')) { const d = resto.split('/')[0]; if (!vistos.has(d)) { vistos.add(d); yield [d, dir(fsx, pre + d)]; } continue; }
        yield [resto, archivo(fsx, k, resto)];
      }
    }
  };
}
function archivo(fsx, r, n) {
  return {
    kind: 'file', name: n,
    async getFile() {
      const a = fsx.archivos.get(r);
      if (!a) throw new Error('no existe');
      return { name: n, lastModified: a.mtime, size: Buffer.byteLength(a.texto), text: async () => a.texto };
    },
    async createWritable() {
      let buf = '';
      return { write: async (d) => { buf += d; }, close: async () => { fsx.archivos.set(r, { texto: buf, mtime: ++reloj }); } };
    }
  };
}

// ---- Un "equipo": localStorage + QStore + QCompartida propios ---------------------------------
function equipo(nombre, fsRef) {
  const ls = new Map();
  const ctx = {
    console, JSON, Math, Date, Promise, Map, Set, Array, Object, String, Number, Error, RegExp, Symbol, Buffer,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    crypto: require('crypto').webcrypto,
    addEventListener: () => {}, navigator: {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(STORE, ctx);
  vm.runInContext(CALC, ctx);
  vm.runInContext(FUS, ctx);
  const descargas = [];
  ctx.QIntercambio = {
    disponible: () => true,
    estado: async () => ({ disponible: true, conectada: true, permiso: 'granted', nombre: 'Intercambio' }),
    carpeta: async () => dir(fsRef.actual, ''),
    onCambio: () => {}, permitir: async () => true, conectar: async () => ({}),
    costosAF: (t) => ({ Materiales: Math.round(t.mat), Equipos: Math.round(t.eq), 'Mano de Obra': Math.round(t.mo), Otros: Math.round(t.otros) }),
    nuevoId: () => 'abcdef123456abcdef123456', isoLocal: () => '2026-09-30T15:00:00-03:00',
    nombreArchivo: (m) => `20260930-150000_formulador_${m.tipo}_${m.id}.json`,
    descargar: (m) => descargas.push(m)
  };
  vm.runInContext(COMP, ctx);
  const S = ctx.QStore, C = ctx.QCompartida;
  ctx.localStorage.setItem('qpn.formulacion.compartida.v1', JSON.stringify({ activo: true }));
  const eventos = [];
  S.on((ev) => {
    eventos.push(ev);
    // Lo que hace app.js (alConflicto) con un proyecto cerrado: guardar lo de aquí como copia.
    if (ev.type === 'remote' && ev.conflicto && ev.local) {
      const c = S.cloneProject(ev.local, { codigo: S.nextCodigo('QPN', 2026), version: 1, titulo: (ev.local.titulo || 'Proyecto') + ' (cambios sin subir)' });
      S.upsert(c);
    }
  });
  C.iniciar();
  return { nombre, S, C, eventos, ls, ctx, descargas, sync: () => C.sincronizar() };
}
const titulos = (eq) => eq.S.all().map((p) => p.titulo).sort();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function editar(eq, uid, cambios) { await esperar(3); const p = eq.S.get(uid); Object.assign(p, cambios); eq.S.upsert(p); }

(async () => {
  // ---- 1. Tabla de decisiones ------------------------------------------------------------------
  const { decidir } = require(path.join(RAIZ, 'js', 'compartida.js'));
  const L = (m) => ({ modificado: m });
  const R = (m, h) => ({ mod: m, historia: h || [] });
  const b = (base, h) => ({ base, historia: h || [] });
  // 50 versiones seguidas desde «desde» (una cada 20 s), como la historia de la 310 el 2026-10-22
  const llena = (desde) => Array.from({ length: 50 }, (_, i) => new Date(Date.parse(desde + ':00.000Z') + i * 20000).toISOString());
  const casos = [
    ['sin archivo: sube', L('a'), null, null, 'subir'],
    ['sin nada', null, null, null, 'nada'],
    ['solo en la carpeta: baja', null, R('a'), null, 'bajar'],
    ['iguales', L('a'), R('a'), b('a'), 'igual'],
    ['la carpeta avanzó desde la base: baja', L('a'), R('c', ['a', 'b']), b('a'), 'bajar'],
    ['aquí se editó, carpeta en la base: sube', L('x'), R('a'), b('a'), 'subir'],
    ['los dos cambiaron: conflicto', L('x'), R('c', ['a']), b('a'), 'conflicto'],
    ['OneDrive perdió lo subido aquí: conflicto', L('a2'), R('b2', ['a']), b('a2', ['a']), 'conflicto'],
    ['primera vez, la carpeta incluye esta versión: baja', L('a'), R('c', ['a']), null, 'bajar'],
    ['primera vez, distintas: conflicto', L('x'), R('y', ['w']), null, 'conflicto'],
    ['la carpeta quedó atrás de lo subido: sube', L('c'), R('a'), b('c', ['a', 'b']), 'subir'],
    // 2026-10-25: la historia (50 versiones hasta entonces) dejaba atrás la base de quien no había editado
    ['sin tocar aquí, base traída, la historia ya no la nombra: baja', L('a'), R('z', ['x', 'y']), Object.assign(b('a'), { propio: false }), 'bajar'],
    ['sin tocar aquí, base subida aquí, historia llena que empieza después: baja',
      L('2026-10-21T10:00:00.000Z'), R('2026-10-22T19:01:27.478Z', llena('2026-10-22T18:44')), Object.assign(b('2026-10-21T10:00:00.000Z'), { propio: true }), 'bajar'],
    ['sin tocar aquí, base de origen desconocido, historia llena que empieza después: baja',
      L('2026-10-21T10:00:00.000Z'), R('2026-10-22T19:01:27.478Z', llena('2026-10-22T18:44')), b('2026-10-21T10:00:00.000Z'), 'bajar'],
    ['base subida aquí, historia corta que no la nombra (OneDrive la perdió): conflicto', L('a2'), R('b2', ['a']), Object.assign(b('a2', ['a']), { propio: true }), 'conflicto'],
    ['base subida aquí, historia llena que empieza antes y no la nombra: conflicto',
      L('2026-10-22T18:50:07.000Z'), R('2026-10-22T19:01:27.478Z', llena('2026-10-22T18:44')), Object.assign(b('2026-10-22T18:50:07.000Z'), { propio: true }), 'conflicto'],
    ['editado aquí aunque la base fuera traída: conflicto', L('x'), R('z', ['y']), Object.assign(b('a'), { propio: false }), 'conflicto']
  ];
  casos.forEach(([n, l, r, bb, esperado]) => { const d = decidir(l, r, bb); check('decidir: ' + n, d === esperado, d); });

  // ---- 2. Dos equipos, una carpeta -------------------------------------------------------------
  const carpeta = { actual: crearFS() };
  const A = equipo('A', carpeta), B = equipo('B', carpeta);
  const p = A.S.newProject({ titulo: 'Oferta uno', cliente: 'Cliente X' });
  A.S.upsert(p);
  check('guardar aquí deja 1 pendiente', A.C.info().pendientes === 1, A.C.info());
  await A.sync();
  check('A sube el proyecto: 1 archivo en publicado/formulador', carpeta.actual.archivos.has(`publicado/formulador/${p.uid}.json`), Array.from(carpeta.actual.archivos.keys()));
  check('sin pendientes tras sincronizar', A.C.info().pendientes === 0 && !A.C.info().error, A.C.info());
  const sobre = JSON.parse(carpeta.actual.archivos.get(`publicado/formulador/${p.uid}.json`).texto);
  check('sobre del protocolo (esquema, tipo, datos)', sobre.esquema === 'quempin.intercambio/1' && sobre.tipo === 'proyecto' && sobre.datos.uid === p.uid && Array.isArray(sobre.historia), Object.keys(sobre));

  await B.sync();
  check('B ve el proyecto de A', titulos(B).join('|') === 'Oferta uno', titulos(B));
  check('B lo guarda en su navegador (localStorage)', B.S.localProjects().some((x) => x.uid === p.uid));
  check('B recibe un aviso de la carpeta', B.eventos.some((e) => e.type === 'remote' && e.origen === 'carpeta' && e.ids.includes(p.uid)));
  await B.sync();
  check('una segunda pasada no escribe nada', carpeta.actual.archivos.get(`publicado/formulador/${p.uid}.json`).texto === JSON.stringify(sobre) + '\n');

  // B edita, A recibe
  await editar(B, p.uid, { titulo: 'Oferta uno (rev. B)' });
  await B.sync();
  await A.sync();
  check('A recibe la edición de B', A.S.get(p.uid).titulo === 'Oferta uno (rev. B)', A.S.get(p.uid).titulo);
  check('sin copias de conflicto en una edición normal', A.S.all().length === 1 && B.S.all().length === 1, [titulos(A), titulos(B)]);

  // Edición simultánea: los dos cambian antes de sincronizar
  await editar(A, p.uid, { titulo: 'Versión de A' });
  await editar(B, p.uid, { titulo: 'Versión de B' });
  await B.sync();
  await A.sync();   // conflicto en A: gana la carpeta (B) y lo de A queda como copia
  await A.sync();   // sube la copia
  await B.sync();
  check('conflicto: el proyecto queda con la versión de la carpeta en A', A.S.get(p.uid).titulo === 'Versión de B', A.S.get(p.uid).titulo);
  check('conflicto: los cambios de A quedan en una copia, en los dos equipos',
    titulos(A).includes('Versión de A (cambios sin subir)') && titulos(B).includes('Versión de A (cambios sin subir)'), [titulos(A), titulos(B)]);
  check('conflicto: A recibió el aviso con su versión local', A.eventos.some((e) => e.conflicto && e.local && e.local.titulo === 'Versión de A'));

  // OneDrive pierde una versión: B escribe sin haber recibido la de A, y OneDrive se queda con la de B
  const antes = clonarFS(carpeta.actual);
  await editar(A, p.uid, { titulo: 'A3' });
  await A.sync();
  const deA = carpeta.actual;
  carpeta.actual = antes;   // B todavía no recibe lo de A
  await editar(B, p.uid, { titulo: 'B3' });
  await B.sync();
  const ruta = `publicado/formulador/${p.uid}.json`;
  deA.archivos.set(ruta, Object.assign({}, antes.archivos.get(ruta), { mtime: ++reloj }));   // "gana" la de B
  antes.archivos.forEach((v, k) => { if (!deA.archivos.has(k)) deA.archivos.set(k, v); });
  carpeta.actual = deA;
  await A.sync(); await A.sync(); await B.sync();
  check('versión perdida por OneDrive: A trae la que quedó (B3)', A.S.get(p.uid).titulo === 'B3', A.S.get(p.uid).titulo);
  check('versión perdida por OneDrive: A3 no se pierde (queda como copia)', titulos(A).includes('A3 (cambios sin subir)') && titulos(B).includes('A3 (cambios sin subir)'), [titulos(A), titulos(B)]);

  // Papelera
  B.S.remove(p.uid);
  await B.sync(); await A.sync();
  check('eliminar en B lo manda a la papelera de A', A.S.trash().some((x) => x.uid === p.uid) && !A.S.all().some((x) => x.uid === p.uid));
  check('el archivo sigue en la carpeta', carpeta.actual.archivos.has(ruta));
  B.S.restore(p.uid);
  await B.sync(); await A.sync();
  check('restaurar en B lo restaura en A', A.S.all().some((x) => x.uid === p.uid));

  // Dos guardados seguidos en el mismo equipo tienen fechas distintas
  const r0 = B.S.get(p.uid).modificado;
  B.S.upsert(B.S.get(p.uid));
  check('cada guardado tiene una fecha de modificación posterior', B.S.get(p.uid).modificado > r0, [r0, B.S.get(p.uid).modificado]);
  await B.sync(); await A.sync();

  // Dos equipos guardan en el mismo milisegundo con distinto contenido: no se da por igual
  await editar(A, p.uid, { titulo: 'Mismo ms A' });
  await editar(B, p.uid, { titulo: 'Mismo ms B' });
  const pb = JSON.parse(JSON.stringify(B.S.get(p.uid)));
  pb.modificado = A.S.get(p.uid).modificado;
  B.S.applyRemote([pb], [], {});
  await B.sync(); await A.sync(); await A.sync(); await B.sync();
  check('misma fecha y distinto contenido: se trata como conflicto', A.S.get(p.uid).titulo === 'Mismo ms B' && titulos(A).includes('Mismo ms A (cambios sin subir)') && titulos(B).includes('Mismo ms A (cambios sin subir)'), [titulos(A), titulos(B)]);

  // Una tarde de trabajo de otra persona (2026-10-25): A guarda más versiones de las que caben en la
  // historia mientras B y C no abren la herramienta. B solo había traído el proyecto; C había subido la
  // última versión antes de esa tarde. Ninguno editó: ninguno debe dejar una copia con código nuevo.
  const C3 = equipo('C', carpeta);
  const tarde = A.S.newProject({ titulo: 'Tarde de A' });
  A.S.upsert(tarde);
  await A.sync(); await B.sync(); await C3.sync();
  await editar(C3, tarde.uid, { titulo: 'Tarde de A (rev. C)' });
  await C3.sync(); await A.sync(); await B.sync();
  const nTarde = (eq) => eq.S.all().filter((x) => /Tarde de A/.test(x.titulo)).length;
  for (let i = 0; i < 205; i++) { await editar(A, tarde.uid, { descripcion: 'versión ' + i }); await A.sync(); }
  const sTarde = JSON.parse(carpeta.actual.archivos.get(`publicado/formulador/${tarde.uid}.json`).texto);
  check('la historia guarda hasta 200 versiones', sTarde.historia.length === 200, sTarde.historia.length);
  await B.sync(); await C3.sync();
  check('tarde de otra persona: B (sin editar) trae la última versión, sin copia',
    B.S.get(tarde.uid).descripcion === 'versión 204' && nTarde(B) === 1, [B.S.get(tarde.uid).descripcion, titulos(B)]);
  check('tarde de otra persona: C (había subido antes, sin editar después) trae la última, sin copia',
    C3.S.get(tarde.uid).descripcion === 'versión 204' && nTarde(C3) === 1, [C3.S.get(tarde.uid).descripcion, titulos(C3)]);
  check('tarde de otra persona: la carpeta no recibe copias', nTarde(A) === 1 && !Array.from(carpeta.actual.archivos.values()).some((a) => /Tarde de A \(rev\. C\) \(cambios sin subir\)/.test(a.texto)));
  // Y si C sí editó mientras tanto otro dato: se juntan (edición simultánea, 2026-11-10), sin copia
  await editar(A, tarde.uid, { descripcion: 'otra tarde' });
  await A.sync();
  await editar(C3, tarde.uid, { titulo: 'Tarde de A (C editó)' });
  await C3.sync(); await C3.sync();
  check('si C también editó otro dato: se juntan, sin copia', C3.S.get(tarde.uid).descripcion === 'otra tarde' && C3.S.get(tarde.uid).titulo === 'Tarde de A (C editó)' && nTarde(C3) === 1, titulos(C3));
  await A.sync(); await B.sync();
  check('lo juntado por C llega a A', A.S.get(tarde.uid).descripcion === 'otra tarde' && A.S.get(tarde.uid).titulo === 'Tarde de A (C editó)' && nTarde(A) === 1, titulos(A));
  // Si C cambió el mismo dato: conflicto como siempre, lo de C queda como copia
  await editar(A, tarde.uid, { descripcion: 'A de nuevo' });
  await A.sync();
  await editar(C3, tarde.uid, { descripcion: 'C de nuevo' });
  await C3.sync(); await C3.sync();
  check('si C cambió el mismo dato: lo de C queda como copia', C3.S.get(tarde.uid).descripcion === 'A de nuevo' && titulos(C3).includes('Tarde de A (C editó) (cambios sin subir)'), titulos(C3));
  check('el aviso de conflicto trae la base común (para elegir dato por dato con el proyecto abierto)',
    C3.eventos.some((e) => e.conflicto && e.base && e.base.descripcion === 'otra tarde'));
  await A.sync(); await B.sync();   // la copia de C llega a todos antes de seguir

  // ---- 3. Edición simultánea (2026-11-10): ítems distintos del mismo presupuesto -------------------
  const sim = A.S.newProject({ titulo: 'Simultáneo' });
  sim.partidas = [{ uid: 'pt1', descripcion: 'P1', unidad: 'Un.', cantidad: 1 }];
  sim.materiales = [{ uid: 'ma1', descripcion: 'Flange', partida: 'pt1', unidad: 'Un.', cantidad: 2, costoUnitario: 100 },
    { uid: 'ma2', descripcion: 'Codo', partida: 'pt1', unidad: 'Un.', cantidad: 4, costoUnitario: 10 }];
  A.S.upsert(sim);
  await A.sync(); await B.sync();
  const nTot = (eq) => eq.S.all().length;
  const n0A = nTot(A), n0B = nTot(B);
  await editar(A, sim.uid, { cliente: 'Cliente de A', materiales: A.S.get(sim.uid).materiales.map((m) => (m.uid === 'ma1' ? Object.assign({}, m, { costoUnitario: 120 }) : m)) });
  const pB = B.S.get(sim.uid);
  await editar(B, sim.uid, { titulo: 'Simultáneo (B)', materiales: pB.materiales.map((m) => (m.uid === 'ma2' ? Object.assign({}, m, { cantidad: 8 }) : m)).concat([{ uid: 'ma3', descripcion: 'Válvula', partida: 'pt1', unidad: 'Un.', cantidad: 1, costoUnitario: 30 }]) });
  await B.sync();          // B sube primero
  await A.sync();          // A junta sus cambios con los de B
  await A.sync();          // y sube lo juntado
  await B.sync();
  const ver = (eq) => { const x = eq.S.get(sim.uid); return { t: x.titulo, c: x.cliente, m: x.materiales.map((m) => `${m.uid}:${m.cantidad}x${m.costoUnitario}`).join(',') }; };
  const esperado = { t: 'Simultáneo (B)', c: 'Cliente de A', m: 'ma1:2x120,ma2:8x10,ma3:1x30' };
  check('simultáneo en datos e ítems distintos: A tiene lo de los dos', JSON.stringify(ver(A)) === JSON.stringify(esperado), ver(A));
  check('simultáneo en datos e ítems distintos: B también', JSON.stringify(ver(B)) === JSON.stringify(esperado), ver(B));
  check('simultáneo en datos e ítems distintos: sin copias', nTot(A) === n0A && nTot(B) === n0B, [titulos(A), titulos(B)]);
  check('A recibe el aviso «juntado» (la app dice «Se juntaron tus cambios…»)', A.eventos.some((e) => e.type === 'remote' && e.juntado && e.ids.includes(sim.uid)));
  const sSim = JSON.parse(carpeta.actual.archivos.get(`publicado/formulador/${sim.uid}.json`).texto);
  check('lo juntado sube con la versión de B en su historia', sSim.historia.includes(B.S.get(sim.uid).modificado) || sSim.datos.modificado === B.S.get(sim.uid).modificado, sSim.historia.slice(-3));

  // El caso más común: los dos suben casi a la vez y OneDrive se queda con una (la de B). A juntó contra
  // la versión anterior a su propia subida, que es la que B también tenía.
  const rutaSim = `publicado/formulador/${sim.uid}.json`;
  const previa = clonarFS(carpeta.actual);
  await editar(A, sim.uid, { ubicacion: 'Punta Arenas' });
  await A.sync();                       // A sube...
  const conA = carpeta.actual;
  carpeta.actual = previa;              // ...pero B todavía no lo ve
  await editar(B, sim.uid, { descripcion: 'Alcance según B' });
  await B.sync();                       // B sube encima
  conA.archivos.set(rutaSim, Object.assign({}, previa.archivos.get(rutaSim), { mtime: ++reloj }));   // OneDrive se queda con la de B
  previa.archivos.forEach((v, k) => { if (!conA.archivos.has(k)) conA.archivos.set(k, v); });
  carpeta.actual = conA;
  const n1A = nTot(A);
  await A.sync(); await A.sync(); await B.sync();
  check('OneDrive se quedó con la de B: A junta las dos, sin copia', A.S.get(sim.uid).ubicacion === 'Punta Arenas' && A.S.get(sim.uid).descripcion === 'Alcance según B' && nTot(A) === n1A,
    [A.S.get(sim.uid).ubicacion, A.S.get(sim.uid).descripcion, titulos(A)]);
  check('OneDrive se quedó con la de B: B recibe lo de A', B.S.get(sim.uid).ubicacion === 'Punta Arenas' && B.S.get(sim.uid).descripcion === 'Alcance según B', [B.S.get(sim.uid).ubicacion, B.S.get(sim.uid).descripcion]);

  // B guarda en el mismo milisegundo que A y OneDrive deja la de B encima de la que subió A: misma fecha,
  // otro contenido. Antes A la daba por suya y nunca veía lo de B.
  await editar(A, sim.uid, { idLicitacion: '1234-5-LE26' });
  await A.sync();
  const sobreA = JSON.parse(carpeta.actual.archivos.get(rutaSim).texto);
  const deB = JSON.parse(JSON.stringify(sobreA));
  deB.datos.idLicitacion = ''; deB.datos.responsable = 'Responsable según B';
  carpeta.actual.archivos.set(rutaSim, { texto: JSON.stringify(deB) + '\n', mtime: ++reloj });
  await A.sync(); await A.sync();
  check('mismo milisegundo sobre lo subido aquí: A ve lo de B y junta', A.S.get(sim.uid).responsable === 'Responsable según B' && A.S.get(sim.uid).idLicitacion === '1234-5-LE26',
    [A.S.get(sim.uid).responsable, A.S.get(sim.uid).idLicitacion]);
  await B.sync();

  // ---- 4. Quién tiene abierto cada proyecto -----------------------------------------------------
  A.S.setConfig(Object.assign({}, A.S.getConfig(), { responsable: 'CM' }));
  B.S.setConfig(Object.assign({}, B.S.getConfig(), { responsable: 'NB' }));
  let abiertoA = sim.uid;
  A.C.alAbrir(() => abiertoA);
  B.C.alAbrir(() => sim.uid);
  await A.sync(); await B.sync(); await A.sync();
  check('B ve que CM tiene abierto el proyecto', B.C.editando(sim.uid).map((x) => x.usuario).join() === 'CM', B.C.editando(sim.uid));
  check('A ve que NB lo tiene abierto, y no se ve a sí mismo', A.C.editando(sim.uid).map((x) => x.usuario).join() === 'NB', A.C.editando(sim.uid));
  check('la marca va en publicado/formulador/editando/', Array.from(carpeta.actual.archivos.keys()).some((k) => k.startsWith('publicado/formulador/editando/') && k.endsWith('~CM.json')));
  abiertoA = null;
  await A.sync(); await B.sync();
  check('al cerrar el proyecto, A saca su marca y B deja de verlo', !B.C.editando(sim.uid).length && !Array.from(carpeta.actual.archivos.keys()).some((k) => k.endsWith('~CM.json')), B.C.editando(sim.uid));
  // Una marca vieja (página cerrada sin avisar) no cuenta
  const vieja = { esquema: 'quempin.intercambio/1', tipo: 'editando', uid: sim.uid, usuario: 'LC', visto: new Date(Date.now() - 10 * 60000).toISOString() };
  carpeta.actual.archivos.set(`publicado/formulador/editando/${sim.uid}~LC.json`, { texto: JSON.stringify(vieja), mtime: ++reloj });
  await B.sync();
  check('una marca de hace 10 minutos no cuenta', !B.C.editando(sim.uid).some((x) => x.usuario === 'LC'), B.C.editando(sim.uid));
  B.C.alAbrir(() => null);
  await B.sync();
  carpeta.actual.archivos.delete(`publicado/formulador/editando/${sim.uid}~LC.json`);

  // Mismo contenido guardado en los dos equipos (p. ej. el mismo JSON importado): sin copia
  const q = A.S.newProject({ titulo: 'Importado igual' });
  const qB = JSON.parse(JSON.stringify(q));
  A.S.upsert(q); await esperar(3); B.S.upsert(qB);
  const nA = A.S.all().length, nB = B.S.all().length;
  await A.sync(); await B.sync(); await A.sync();
  check('mismo contenido en dos equipos no genera copias', A.S.all().length === nA && B.S.all().length === nB && nA === nB, [titulos(A), titulos(B)]);

  // Archivos que no son de la herramienta se ignoran
  carpeta.actual.archivos.set('publicado/formulador/basura.json', { texto: '{no es json', mtime: ++reloj });
  carpeta.actual.archivos.set(`publicado/formulador/${p.uid}-ESCRITORIO.json`, { texto: carpeta.actual.archivos.get(ruta).texto, mtime: ++reloj });
  carpeta.actual.archivos.set('publicado/analisis-financiero.json', { texto: '{"esquema":"quempin.intercambio/1"}', mtime: ++reloj });
  const n0 = A.S.all().length + A.S.trash().length;
  await A.sync();
  check('ignora archivos inválidos y copias de conflicto de OneDrive', A.S.all().length + A.S.trash().length === n0 && !A.C.info().error, A.C.info());
  check('nunca escribe fuera de publicado/formulador', Array.from(carpeta.actual.archivos.keys()).every((k) => k.startsWith('publicado/formulador/') || k === 'publicado/analisis-financiero.json'),
    Array.from(carpeta.actual.archivos.keys()));

  // Resumen calculado en cada archivo: cuadra con el Excel original del ejemplo
  const ej = A.S.exampleProject();
  A.S.upsert(ej);
  await A.sync();
  const sEj = JSON.parse(carpeta.actual.archivos.get(`publicado/formulador/${ej.uid}.json`).texto);
  check('el archivo trae el resumen del motor de cálculo (costo $2.046.404, precio $4.092.808)',
    sEj.resumen && sEj.resumen.costoDirecto === 2046404 && sEj.resumen.precioNeto === 4092808 && sEj.resumen.margen === 0.5, sEj.resumen);
  check('el resumen trae los costos por categoría del Análisis Financiero',
    sEj.resumen.costosAF && Object.values(sEj.resumen.costosAF).reduce((a, b) => a + b, 0) === 2046404, sEj.resumen.costosAF);
  check('en la carpeta: enRepositorio y fuera de «sinSubir»', A.C.enRepositorio(A.S.get(ej.uid)) && !A.C.sinSubir(A.S.all()).some((x) => x.uid === ej.uid));

  // Entrega por archivo (sin carpeta): mensaje «formulacion» para el buzón
  const sinCarpeta = A.S.newProject({ titulo: 'Presupuesto por archivo' });
  A.S.upsert(sinCarpeta);
  check('recién guardado y sin sincronizar: está en «sinSubir»', A.C.sinSubir(A.S.all()).some((x) => x.uid === sinCarpeta.uid));
  const nombre = A.C.descargar(A.S.get(sinCarpeta.uid));
  const m = A.descargas[A.descargas.length - 1];
  check('mensaje de entrega: tipo formulacion, destino formulador, con datos y resumen',
    m.tipo === 'formulacion' && m.destino === 'formulador' && m.datos.uid === sinCarpeta.uid && m.resumen && Array.isArray(m.historia) && /formulacion/.test(nombre), m);
  check('entregado: sale de «sinSubir» hasta que se vuelva a cambiar', !A.C.sinSubir(A.S.all()).some((x) => x.uid === sinCarpeta.uid));
  await editar(A, sinCarpeta.uid, { titulo: 'Presupuesto por archivo (cambiado)' });
  check('al cambiarlo vuelve a «sinSubir»', A.C.sinSubir(A.S.all()).some((x) => x.uid === sinCarpeta.uid));

  // Navegador sin acceso a carpetas: no intenta sincronizar
  A.ctx.QIntercambio.disponible = () => false;
  const c0 = carpeta.actual.archivos.size;
  A.S.upsert(A.S.newProject({ titulo: 'Firefox' }));
  await A.sync();
  check('sin acceso a carpetas: no sincroniza (se entrega por archivo)', !A.C.activa() && carpeta.actual.archivos.size === c0);

  console.log(results.join('\n'));
  const fallas = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fallas}/${results.length} OK`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
