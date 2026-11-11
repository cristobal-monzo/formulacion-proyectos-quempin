// Prueba de js/oferta.js sin navegador: una biblioteca «Formulación de proyectos - Documentos» en
// memoria (carpetas de oferta FICTICIAS), con QStore real y el exportador de Excel simulado.
// Uso: node .prueba/oferta/unidad.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const src = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf-8');
const STORE = src('js/store.js'), CALC = src('js/calc.js'), OFERTA = src('js/oferta.js');

const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 300) : ''}`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Biblioteca en memoria con la API de FileSystemDirectoryHandle ----------------------------
let reloj = 1000;
const err = (name, msg) => Object.assign(new Error(msg || name), { name });
function crearFS() { return new Map([['', { dir: true }]]); }   // ruta → { dir } | { datos: Buffer, mtime }
const hijo = (ruta, n) => (ruta ? ruta + '/' + n : n);
const fallas = { cerrar: null, leer: 0 };   // leer: veces que el Excel existente no se puede leer   // error que lanza close() (archivo abierto en Excel)
function dir(fsx, ruta) {
  return {
    kind: 'directory', name: ruta.split('/').pop() || 'Formulación de proyectos - Documentos',
    async getDirectoryHandle(n, o) {
      if (!n || n === '.' || n === '..' || /[\\/]/.test(n)) throw err('TypeError', 'nombre inválido');
      const r = hijo(ruta, n), x = fsx.get(r);
      if (x && !x.dir) throw err('TypeMismatchError');
      if (!x) { if (!(o && o.create)) throw err('NotFoundError'); fsx.set(r, { dir: true }); }
      return dir(fsx, r);
    },
    async getFileHandle(n, o) {
      if (!n || /[\\/]/.test(n)) throw err('TypeError', 'nombre inválido');
      const r = hijo(ruta, n), x = fsx.get(r);
      if (x && x.dir) throw err('TypeMismatchError');
      if (!x) { if (!(o && o.create)) throw err('NotFoundError'); fsx.set(r, { datos: Buffer.alloc(0), mtime: ++reloj }); }
      return archivo(fsx, r, n);
    },
    async *entries() {
      const pre = ruta ? ruta + '/' : '';
      for (const [k, x] of Array.from(fsx)) {
        if (!k || !k.startsWith(pre)) continue;
        const resto = k.slice(pre.length);
        if (!resto || resto.includes('/')) continue;
        yield [resto, x.dir ? dir(fsx, k) : archivo(fsx, k, resto)];
      }
    }
  };
}
function archivo(fsx, r, n) {
  return {
    kind: 'file', name: n,
    async getFile() {
      const a = fsx.get(r);
      if (!a || a.dir) throw err('NotFoundError');
      return { name: n, lastModified: fallas.leer ? Date.now() : a.mtime, size: a.datos.length, arrayBuffer: async () => (fallas.leer ? Buffer.concat([Buffer.from('PK'), a.datos]) : a.datos), text: async () => a.datos.toString() };
    },
    async createWritable() {
      const partes = [];
      return {
        write: async (d) => { partes.push(Buffer.from(d)); },
        close: async () => { if (fallas.cerrar) throw err(fallas.cerrar); fsx.set(r, { datos: Buffer.concat(partes), mtime: ++reloj }); },
        abort: async () => {}
      };
    }
  };
}
function crearCarpetas(fsx, rutas) {
  rutas.forEach((r) => { let acc = ''; r.split('/').forEach((n) => { acc = hijo(acc, n); if (!fsx.has(acc)) fsx.set(acc, { dir: true }); }); });
}
function escribir(fsx, ruta, texto) {
  crearCarpetas(fsx, [ruta.split('/').slice(0, -1).join('/')].filter(Boolean));
  fsx.set(ruta, { datos: Buffer.from(texto), mtime: ++reloj });
}
/* Mueve una carpeta (con todo lo de adentro), como si alguien la arrastrara en el Explorador. */
let antes = null;   // contenido original de cada archivo (sigue a las carpetas que mueve la prueba)
function mover(fsx, de, a) {
  Array.from(fsx.keys()).filter((k) => k === de || k.startsWith(de + '/')).forEach((k) => {
    const x = fsx.get(k); fsx.delete(k); fsx.set(a + k.slice(de.length), x);
    if (antes && antes.has(k)) { antes.set(a + k.slice(de.length), antes.get(k)); antes.delete(k); }
  });
}
const texto = (fsx, r) => (fsx.has(r) ? fsx.get(r).datos.toString() : null);
const archivos = (fsx) => Array.from(fsx).filter(([, x]) => !x.dir).map(([k]) => k).sort();

// ---- El "equipo": localStorage + QStore + QOferta, con la biblioteca simulada ------------------
function equipo(fsx) {
  const ls = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error: console.error }, JSON, Math, Date, Promise, Map, Set, Array, Object, String, Number, Error, RegExp, Symbol, Buffer,
    setTimeout, clearTimeout, setInterval: () => 0,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    crypto: require('crypto').webcrypto, addEventListener: () => {}, navigator: {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(STORE, ctx);
  vm.runInContext(CALC, ctx);
  const estado = { permiso: true };
  ctx.QIntercambio = {
    disponible: () => true,
    biblioteca: async () => (estado.permiso ? dir(fsx, '') : null)
  };
  // Exportador simulado: el "Excel" lleva el uid y la versión del proyecto
  const exportados = [];
  ctx.QExcel = {
    exportProject: async (p, o) => { exportados.push({ uid: p.uid, copia: !!(o && o.copiaOferta), soloDatos: !!(o && o.soloDatos) }); return Buffer.from(`XLSX|${p.uid}|${p.modificado}|${p.titulo}`); },
    uidDeExcel: async (buf) => { const m = /^XLSX\|([^|]+)\|/.exec(Buffer.from(buf).toString()); return m ? m[1] : null; },
    versionDeExcel: async (buf) => {
      if (fallas.leer) { fallas.leer -= 1; throw err('Error', 'zip incompleto'); }
      const m = /^XLSX\|([^|]+)\|([^|]*)\|/.exec(Buffer.from(buf).toString());
      return m ? { uid: m[1], modificado: m[2] } : { uid: null, modificado: null };
    }
  };
  ctx.QHerramientas = { reqDe: (p) => (p.vinculos && p.vinculos.requerimiento ? String(p.vinculos.requerimiento.numero) : null) };
  vm.runInContext(OFERTA, ctx);
  const O = ctx.QOferta;
  O._tiempos({ espera: 30, esperaMax: 200, reintento: 80, vigenciaLista: 0 });
  const eventos = [];
  ctx.QStore.on((ev) => { if (ev.type === 'oferta') eventos.push(ev); });
  O.iniciar();
  return { S: ctx.QStore, O, ctx, estado, exportados, eventos, ls };
}
const RUTA_298 = ['298. SAG Quemadores'];
const vinc = (ruta) => ({ carpetaOferta: { nombre: ruta[ruta.length - 1], ruta, numero: (/^(\d+)\./.exec(ruta[ruta.length - 1]) || [])[1] || '' } });
const XLSX = (uid, cod, v) => `${cod} v${v}`;   // (solo para leer las pruebas)
void XLSX;

(async () => {
  // ---- 1. Reglas sin efectos ---------------------------------------------------------------------
  const O0 = require(path.join(RAIZ, 'js', 'oferta.js'));
  check('grupo: presentadas', O0.grupoDe('0 OFERTAS PRESENTADAS', 'En curso') === 'Presentada');
  check('grupo: adjudicadas', O0.grupoDe('0 OFERTAS ADJUDICADAS', 'En curso') === 'Adjudicada');
  check('grupo: cerradas con año', O0.grupoDe('0 Ofertas Cerradas 2025', 'Presentada') === 'Cerrada 2025');
  check('número de la carpeta', O0.numeroDe('298. SAG Quemadores') === '298' && O0.numeroDe('15 SALAS CALDERAS') === '' && O0.numeroDe('Quemador de plumas') === '');
  const validas = [['298. SAG Quemadores'], ['Quemador de plumas'], ['0 OFERTAS PRESENTADAS', '303. Quemador Osorno'], ['0 OFERTAS PRESENTADAS', '0 Ofertas Cerradas 2025', 'Hospital de ejemplo']];
  const invalidas = [[], ['.HERRAMIENTAS FORMULACIÓN', 'Intercambio'], ['..'], ['0 OFERTAS PRESENTADAS'], ['1 CARPETA MODELO'], ['2 ARCHIVOS Y INFORMACION FRECUENTE'],
    ['a/b'], ['Otra carpeta', '298. SAG Quemadores'], ['0 A', '0 B', '0 C', '0 D', '0 E', 'X'], 'texto', ['0 OFERTAS PRESENTADAS', '.oculta']];
  check('rutas de carpeta de oferta válidas', validas.every((r) => O0.rutaValida(r)), validas.filter((r) => !O0.rutaValida(r)));
  check('nunca: carpetas ocultas, contenedores, modelos, «..» ni rutas raras', invalidas.every((r) => !O0.rutaValida(r)), invalidas.filter((r) => O0.rutaValida(r)));
  check('nombre del Excel', O0.nombreBase({ codigo: 'QPN-2026-014', version: 2 }) === 'Formulación QPN-2026-014 v2' && O0.nombreBase({ codigo: 'A/B:C', version: '1' }) === 'Formulación A-B-C v1');
  const cands = O0.candidatos({ codigo: 'QPN-2026-001', version: 1 }, 'Formulación QPN-2026-001 v1 (3).xlsx');
  check('candidatos: primero el que ya se usó, después el de siempre', cands[0] === 'Formulación QPN-2026-001 v1 (3).xlsx' && cands[1] === 'Formulación QPN-2026-001 v1.xlsx' && cands.length === 9, cands);
  check('candidatos: un nombre de otra versión no se reutiliza', O0.candidatos({ codigo: 'QPN-2026-001', version: 1 }, 'Formulación QPN-2026-001 v10.xlsx')[0] === 'Formulación QPN-2026-001 v1.xlsx');
  check('vínculo inválido en el presupuesto: se ignora', O0.vinculo({ vinculos: { carpetaOferta: { nombre: 'x', ruta: ['.HERRAMIENTAS FORMULACIÓN'] } } }) === null);

  // ---- 2. Carpetas de la biblioteca ----------------------------------------------------------------
  const fsx = crearFS();
  crearCarpetas(fsx, [
    '.HERRAMIENTAS FORMULACIÓN/Intercambio/publicado', '0 OFERTAS PRESENTADAS/303. Quemador Osorno/Experiencia',
    '0 OFERTAS PRESENTADAS/0 Ofertas Cerradas 2025/Hospital de ejemplo', '0 OFERTAS ADJUDICADAS/250. Catedral',
    '1 CARPETA MODELO/ANTECEDENTES', '2 ARCHIVOS Y INFORMACION FRECUENTE', '298. SAG Quemadores/ANTECEDENTES', 'Calderas de ejemplo'
  ]);
  escribir(fsx, '298. SAG Quemadores/Oferta.pdf', 'pdf de prueba');
  escribir(fsx, 'Planilla de Ingreso de Requerimientos.xlsx', 'planilla');
  antes = new Map(Array.from(fsx).filter(([, x]) => !x.dir).map(([k, x]) => [k, x.datos.toString()]));
  const A = equipo(fsx);
  const lista = await A.O.carpetas(true);
  const por = (n) => lista.find((c) => c.nombre === n);
  check('lista: ofertas en curso, presentadas, cerradas y adjudicadas', lista.length === 5 && por('298. SAG Quemadores').grupo === 'En curso' && por('303. Quemador Osorno').grupo === 'Presentada' &&
    por('Hospital de ejemplo').grupo === 'Cerrada 2025' && por('250. Catedral').grupo === 'Adjudicada' && por('Calderas de ejemplo').numero === '', lista.map((c) => `${c.grupo}:${c.nombre}`));
  check('lista: sin la carpeta de herramientas, la carpeta modelo ni la de archivos', !lista.some((c) => /HERRAMIENTAS|MODELO|ARCHIVOS|Experiencia|ANTECEDENTES/.test(c.nombre)));
  check('lista: cada una con su ruta desde la biblioteca', por('303. Quemador Osorno').ruta.join('/') === '0 OFERTAS PRESENTADAS/303. Quemador Osorno');

  // ---- 2b. Carpeta de oferta nueva, desde el formulario del proyecto (2026-10-06) ---------------------
  const N = O0.nombreCarpetaNueva;
  const falla = (f) => { try { f(); return null; } catch (e) { return e; } };
  check('carpeta nueva: «N°. Nombre»', N('312', 'Calefacción gimnasio', lista).nombre === '312. Calefacción gimnasio');
  check('carpeta nueva: sin N°, solo el nombre', N('', 'Quemador piloto', lista).nombre === 'Quemador piloto');
  check('carpeta nueva: el nombre es obligatorio', /nombre de la oferta/.test((falla(() => N('312', '   ', lista)) || {}).message || ''));
  check('carpeta nueva: el N° solo con dígitos', /número/.test((falla(() => N('3a2', 'X', lista)) || {}).message || ''));
  const repetida = falla(() => N('298', 'Otra', lista));
  check('carpeta nueva: un N° que ya tiene carpeta se avisa con esa carpeta, aun sin nombre', !!repetida && !!repetida.existente && repetida.existente.nombre === '298. SAG Quemadores' && !!(falla(() => N('298', '', lista)) || {}).existente);
  check('carpeta nueva: mismo nombre sin N°, aunque cambien las mayúsculas', !!(falla(() => N('', 'calderas DE ejemplo', lista)) || {}).existente);
  const raros = N('', 'Calderas: sector A/B', lista);
  check('carpeta nueva: los caracteres no válidos se cambian y se avisa', raros.nombre === 'Calderas- sector A-B' && raros.cambiado, raros);
  check('carpeta nueva: no puede parecer una carpeta de grupo', !!falla(() => N('', '0 OFERTAS NUEVAS', lista)) && !!falla(() => N('', '1 Copia', lista)));
  check('carpeta nueva: nombres reservados de Windows', !!falla(() => N('', 'CON', lista)));
  check('carpeta nueva: sin punto inicial (no queda oculta)', N('', '.oculta', lista).nombre === 'oculta');
  check('carpeta nueva: hasta 100 caracteres', N('312', 'x'.repeat(300), lista).nombre.length === 100);
  const nueva = await A.O.crearCarpeta('312', 'Calefacción gimnasio');
  check('crear: queda en la raíz, en curso, y la lista la incluye', fsx.has('312. Calefacción gimnasio') && nueva.grupo === 'En curso' && nueva.ruta.join('/') === '312. Calefacción gimnasio' &&
    (await A.O.carpetas(true)).some((c) => c.nombre === '312. Calefacción gimnasio'), nueva);
  let otra = null; try { await A.O.crearCarpeta('312', 'Otra cosa'); } catch (e) { otra = e; }
  check('crear: el mismo N° dos veces no crea otra carpeta', !!otra && !fsx.has('312. Otra cosa'));
  let misma = null; try { await A.O.crearCarpeta('', 'calderas de EJEMPLO'); } catch (e) { misma = e; }
  check('crear: nunca reutiliza una carpeta que ya existe', !!misma);
  A.estado.permiso = false;
  let sinBib = null; try { await A.O.crearCarpeta('313', 'Sin permiso'); } catch (e) { sinBib = e; }
  check('crear: sin la biblioteca (o sin permiso) lo dice y no crea nada', !!sinBib && /biblioteca/.test(sinBib.message) && !fsx.has('313. Sin permiso'));
  A.estado.permiso = true;

  // ---- 3. El Excel se escribe solo, tras unos instantes sin editar ------------------------------------
  const p = A.S.newProject({ titulo: 'Quemadores de prueba', vinculos: Object.assign(vinc(RUTA_298), { requerimiento: { numero: '298' } }) });
  A.S.upsert(p);
  const RUTA_X1 = `298. SAG Quemadores/Formulación ${p.codigo} v1.xlsx`;
  check('al guardar queda pendiente', A.O.info(A.S.get(p.uid)).estado === 'pendiente', A.O.info(A.S.get(p.uid)));
  check('todavía no se escribe (espera unos segundos sin editar)', !fsx.has(RUTA_X1));
  await esperar(120);
  check('se escribe en la carpeta de la oferta', (texto(fsx, RUTA_X1) || '').startsWith(`XLSX|${p.uid}|`), archivos(fsx));
  check('es la copia de la carpeta de la oferta (exportación con nota)', A.exportados.length === 1 && A.exportados[0].copia && A.exportados[0].soloDatos, A.exportados);
  check('queda «guardado» con la hora', A.O.info(A.S.get(p.uid)).estado === 'guardado' && !!A.O.info(A.S.get(p.uid)).hora);
  check('la interfaz recibe avisos «oferta»', A.eventos.some((e) => e.ids.includes(p.uid)));

  // Varias ediciones seguidas: un solo Excel al final
  const n0 = A.exportados.length;
  for (let i = 0; i < 5; i++) { const x = A.S.get(p.uid); x.titulo = 'Quemadores de prueba ' + i; A.S.upsert(x); await esperar(8); }
  await esperar(120);
  check('ediciones seguidas: se escribe una vez, con lo último', A.exportados.length === n0 + 1 && texto(fsx, RUTA_X1).endsWith('|Quemadores de prueba 4'), { n: A.exportados.length - n0, t: texto(fsx, RUTA_X1) });

  // Edición continua: se escribe igual dentro del máximo
  A.O._tiempos({ espera: 60, esperaMax: 100 });
  const n1 = A.exportados.length;
  for (let i = 0; i < 9; i++) { const x = A.S.get(p.uid); x.descripcion = 'tecleando ' + i; A.S.upsert(x); await esperar(25); }
  check('edición continua: se escribe al menos una vez sin esperar la pausa', A.exportados.length > n1, A.exportados.length - n1);
  await esperar(150);
  A.O._tiempos({ espera: 30, esperaMax: 200 });

  // ---- 4. Lo que llega de otro equipo no lo reescribe este navegador -----------------------------------
  const n2 = A.exportados.length;
  const remoto = JSON.parse(JSON.stringify(A.S.get(p.uid)));
  remoto.titulo = 'Cambiado en otro equipo';
  remoto.modificado = new Date(Date.now() + 5000).toISOString();
  A.S.applyRemote([remoto], [], { origen: 'carpeta' });
  await esperar(80);
  check('cambio de otro equipo: no se escribe aquí', A.exportados.length === n2 && A.O.info(A.S.get(p.uid)).estado === 'vinculada', A.O.info(A.S.get(p.uid)));

  // ---- 5. Sin carpeta, eliminados y versiones ------------------------------------------------------------
  const sin = A.S.newProject({ titulo: 'Sin carpeta' });
  A.S.upsert(sin);
  await esperar(80);
  check('sin carpeta elegida: no se escribe nada', !archivos(fsx).some((f) => f.includes(sin.codigo)) && A.O.info(A.S.get(sin.uid)).estado === 'sin-carpeta');
  const v2 = A.S.cloneProject(A.S.get(p.uid), { version: 2 });
  A.S.upsert(v2);
  const RUTA_V2 = `298. SAG Quemadores/Formulación ${p.codigo} v2.xlsx`;
  await esperar(80);
  check('nueva versión: su propio Excel junto al de la v1', (texto(fsx, RUTA_V2) || '').startsWith(`XLSX|${v2.uid}|`) && texto(fsx, RUTA_X1).startsWith(`XLSX|${p.uid}|`));
  const del = A.S.newProject({ titulo: 'Se elimina', vinculos: vinc(RUTA_298) });
  A.S.upsert(del);
  A.S.remove(del.uid);
  await esperar(80);
  check('enviado a la papelera antes de escribirse: no se escribe', !archivos(fsx).some((f) => f.includes(`${del.codigo} v1`)) && !(A.O._estado().pendientes || {})[del.uid]);

  // ---- 6. Nunca pisa un archivo que no es de este presupuesto ---------------------------------------
  const otro = A.S.newProject({ titulo: 'Mismo código', vinculos: vinc(['0 OFERTAS ADJUDICADAS', '250. Catedral']) });
  otro.codigo = 'QPN-2026-777';
  escribir(fsx, '0 OFERTAS ADJUDICADAS/250. Catedral/Formulación QPN-2026-777 v1.xlsx', 'XLSX|uid-de-otro-presupuesto|x|otro');
  escribir(fsx, '0 OFERTAS ADJUDICADAS/250. Catedral/Formulación QPN-2026-777 v1 (2).xlsx', 'no es un excel de la herramienta');
  A.S.upsert(otro);
  await esperar(80);
  const cat = '0 OFERTAS ADJUDICADAS/250. Catedral/';
  check('el de otro presupuesto queda intacto', texto(fsx, cat + 'Formulación QPN-2026-777 v1.xlsx') === 'XLSX|uid-de-otro-presupuesto|x|otro');
  check('un archivo que no es de la herramienta queda intacto', texto(fsx, cat + 'Formulación QPN-2026-777 v1 (2).xlsx') === 'no es un excel de la herramienta');
  check('se usa el siguiente nombre libre: «(3)»', (texto(fsx, cat + 'Formulación QPN-2026-777 v1 (3).xlsx') || '').startsWith(`XLSX|${otro.uid}|`), archivos(fsx).filter((f) => f.startsWith(cat)));
  const x7 = A.S.get(otro.uid); x7.titulo = 'Mismo código, editado'; A.S.upsert(x7);
  await esperar(80);
  check('después sigue usando su «(3)»', texto(fsx, cat + 'Formulación QPN-2026-777 v1 (3).xlsx').endsWith('|Mismo código, editado') && !fsx.has(cat + 'Formulación QPN-2026-777 v1 (4).xlsx'));
  // Un archivo vacío (escritura que no terminó) se puede usar
  const vac = A.S.newProject({ titulo: 'Vacío', vinculos: vinc(['Calderas de ejemplo']) });
  escribir(fsx, `Calderas de ejemplo/Formulación ${vac.codigo} v1.xlsx`, '');
  A.S.upsert(vac);
  await esperar(80);
  check('un archivo vacío con su nombre se reutiliza', (texto(fsx, `Calderas de ejemplo/Formulación ${vac.codigo} v1.xlsx`) || '').startsWith(`XLSX|${vac.uid}|`));

  // ---- 7. La carpeta se movió (a Adjudicadas) o cambió de nombre -------------------------------------
  mover(fsx, '298. SAG Quemadores', '0 OFERTAS ADJUDICADAS/298. SAG Quemadores');
  const xm = A.S.get(p.uid); xm.titulo = 'Después de mover la carpeta'; A.S.upsert(xm);
  await esperar(80);
  const MOVIDA = `0 OFERTAS ADJUDICADAS/298. SAG Quemadores/Formulación ${p.codigo} v1.xlsx`;
  check('carpeta movida: la sigue (por su nombre) y reemplaza su Excel', (texto(fsx, MOVIDA) || '').endsWith('|Después de mover la carpeta') && !archivos(fsx).some((f) => f.startsWith('298. ')), archivos(fsx).filter((f) => f.includes('298')));
  check('carpeta movida: el estado muestra la ruta nueva', A.O.info(A.S.get(p.uid)).ruta.join('/') === '0 OFERTAS ADJUDICADAS/298. SAG Quemadores', A.O.info(A.S.get(p.uid)).ruta);
  mover(fsx, '0 OFERTAS ADJUDICADAS/298. SAG Quemadores', '0 OFERTAS ADJUDICADAS/298. SAG - renombrada');
  const xr = A.S.get(p.uid); xr.titulo = 'Carpeta renombrada'; A.S.upsert(xr);
  await esperar(80);
  const ir = A.O.info(A.S.get(p.uid));
  check('carpeta renombrada: queda el error para elegirla de nuevo', ir.estado === 'error' && /No se encuentra la carpeta/.test(ir.error), ir);
  check('carpeta renombrada: no crea carpetas nuevas', !fsx.has('298. SAG Quemadores') && !fsx.has('0 OFERTAS ADJUDICADAS/298. SAG Quemadores'));
  mover(fsx, '0 OFERTAS ADJUDICADAS/298. SAG - renombrada', '0 OFERTAS ADJUDICADAS/298. SAG Quemadores');

  // ---- 8. Archivo abierto en Excel, sin permiso, y «Guardar ahora» -------------------------------------
  fallas.cerrar = 'NoModificationAllowedError';
  let lanzo = '';
  try { await A.O.guardar(p.uid); } catch (e) { lanzo = e.message; }
  const ib = A.O.info(A.S.get(p.uid));
  check('archivo bloqueado: error claro y queda pendiente', /abierto o bloqueado/.test(lanzo) && ib.estado === 'error' && !!(A.O._estado().pendientes || {})[p.uid], { lanzo, ib });
  fallas.cerrar = null;
  const w = await A.O.guardar(p.uid);
  check('«Guardar ahora» después: se escribe y se limpia el error', !!w && A.O.info(A.S.get(p.uid)).estado === 'guardado' && texto(fsx, MOVIDA).endsWith('|Carpeta renombrada'), A.O.info(A.S.get(p.uid)));
  A.estado.permiso = false;
  const xs = A.S.get(p.uid); xs.titulo = 'Sin permiso'; A.S.upsert(xs);
  await esperar(80);
  check('sin permiso para la biblioteca: no escribe, sin error, queda pendiente', !texto(fsx, MOVIDA).endsWith('|Sin permiso') && A.O.info(A.S.get(p.uid)).estado === 'pendiente');
  let sinPermiso = '';
  try { await A.O.guardar(p.uid); } catch (e) { sinPermiso = e.message; }
  check('«Guardar ahora» sin permiso: avisa que falta la biblioteca (no dice «guardado»)', /falta conectar la biblioteca/.test(sinPermiso), sinPermiso);
  A.estado.permiso = true;
  A.S.emit({ type: 'sync', pendientes: 0 });   // la carpeta del equipo volvió
  await esperar(2300);
  check('vuelve el permiso: se pone al día solo', texto(fsx, MOVIDA).endsWith('|Sin permiso') && A.O.info(A.S.get(p.uid)).estado === 'guardado');

  // ---- 9. Otro navegador (otro PC) con lo pendiente guardado: se pone al día al abrir ------------------
  const xp = A.S.get(p.uid); xp.titulo = 'Pendiente al cerrar'; A.S.upsert(xp);
  const lsCopia = new Map(A.ls);
  A.O._tiempos({ espera: 100000, esperaMax: 100000 });   // A se "cierra" antes de escribir
  const B = (() => { const e = equipo(fsx); lsCopia.forEach((v, k) => e.ls.set(k, v)); return e; })();
  B.O._tiempos({ espera: 30, esperaMax: 200 });
  B.S._resetCache();
  await (async () => { B.O.iniciar(); })();
  await esperar(5300);
  check('al volver a abrir: escribe lo que quedó pendiente', texto(fsx, MOVIDA).endsWith('|Pendiente al cerrar'), texto(fsx, MOVIDA));

  // ---- 9b. Sin reescrituras iguales (2026-10-19: un Excel se reescribía cada 20 s sin cambios) --------
  // Lo pendiente era una versión de aquí, pero llegó otra de otro equipo: no se escribe más.
  const n9 = B.exportados.length;
  const est9 = JSON.parse(B.ls.get('qpn.formulacion.oferta.v1'));
  est9.pendientes = { [p.uid]: '2026-01-01T00:00:00.000Z' };   // versión vieja, ya reemplazada
  B.ls.set('qpn.formulacion.oferta.v1', JSON.stringify(est9));
  for (let i = 0; i < 3; i++) { B.S.emit({ type: 'sync', pendientes: 0 }); await esperar(2300); }
  check('marca de una versión reemplazada: no reescribe y se borra', B.exportados.length === n9 && !(B.O._estado().pendientes || {})[p.uid], { n: B.exportados.length - n9, e: B.O._estado().pendientes });
  // El Excel ya tiene esta versión: «Guardar ahora» no lo vuelve a subir
  const mt = fsx.get(MOVIDA).mtime;
  const w9 = await B.O.guardar(p.uid);
  check('misma versión ya escrita: no se reescribe', !!w9 && fsx.get(MOVIDA).mtime === mt && B.exportados.length === n9, { mt, ahora: fsx.get(MOVIDA).mtime });
  // El Excel existente no se puede leer por un momento: se reintenta, nunca «(2)»
  B.estado.permiso = true;
  const x9 = B.S.get(p.uid); x9.titulo = 'Después del archivo ocupado'; B.S.upsert(x9);
  B.ls.set('qpn.formulacion.oferta.v1', JSON.stringify(Object.assign(B.O._estado(), { escritos: {} })));   // sin recuerdo: hay que leerlo
  fallas.leer = 1;
  let ocupado = '';
  try { await B.O.guardar(p.uid); } catch (e) { ocupado = e.message; }
  check('archivo ilegible un momento: error de ocupado, sin «(2)»', /abierto o bloqueado/.test(ocupado) && !archivos(fsx).some((k) => k.includes(`${p.codigo} v1 (2)`)), { ocupado, a: archivos(fsx).filter((k) => k.includes('298')) });
  await B.O.guardar(p.uid);
  check('después se escribe el de siempre', texto(fsx, MOVIDA).endsWith('|Después del archivo ocupado'));

  // ---- 10. Solo escribió sus propios Excel, dentro de carpetas de oferta ------------------------------
  const cambiados = archivos(fsx).filter((k) => antes.get(k) !== texto(fsx, k));
  const ajenos = cambiados.filter((k) => !/^(0 [^/]+\/)*[^./][^/]*\/Formulación [^/]+\.xlsx$/.test(k) && !k.startsWith('0 OFERTAS ADJUDICADAS/250. Catedral/Formulación QPN-2026-777 v1') && !k.startsWith('Calderas de ejemplo/Formulación'));
  check('solo archivos «Formulación … .xlsx» en carpetas de oferta', ajenos.length === 0, ajenos);
  check('los antecedentes de la oferta siguen iguales', texto(fsx, '0 OFERTAS ADJUDICADAS/298. SAG Quemadores/Oferta.pdf') === 'pdf de prueba' && texto(fsx, 'Planilla de Ingreso de Requerimientos.xlsx') === 'planilla');
  check('nada en la carpeta de herramientas', !archivos(fsx).some((k) => k.startsWith('.HERRAMIENTAS')));

  console.log(results.join('\n'));
  const fail = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fail}/${results.length} OK`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
