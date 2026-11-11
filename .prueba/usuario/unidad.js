// Prueba de js/usuario.js sin navegador (2026-10-16, selector de usuario): la lista del equipo, lo que
// se adopta de antes, elegir y avisar, y que store.js lo use como responsable de los proyectos nuevos.
// Uso: node .prueba/usuario/unidad.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', '..');
const results = [];
const check = (n, c, x) => results.push(`${c ? 'OK  ' : 'FAIL'} ${n}${x !== undefined && !c ? ' → ' + JSON.stringify(x).slice(0, 400) : ''}`);

/* Un navegador de mentira: localStorage en memoria y eventos 'storage' que se disparan a mano */
function navegador(inicial) {
  const datos = new Map(Object.entries(inicial || {}));
  const oyentes = [];
  const localStorage = {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => { datos.set(k, String(v)); },
    removeItem: (k) => { datos.delete(k); }
  };
  const ctx = vm.createContext({
    console, localStorage, crypto: { randomUUID: () => '0123456789abcdef0123456789abcdef' },
    addEventListener: (t, fn) => { if (t === 'storage') oyentes.push(fn); }
  });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/usuario.js'), 'utf-8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js/store.js'), 'utf-8'), ctx);
  return { U: ctx.QUsuario, S: ctx.QStore, datos, desdeOtraPestana: (k, v) => { datos.set(k, v); oyentes.forEach((fn) => fn({ key: k, newValue: v })); } };
}

// ---- La lista ------------------------------------------------------------------------------------
{
  const { U } = navegador();
  check('la lista es la pedida, en su orden', JSON.stringify(U.LISTA) === JSON.stringify(['NB', 'ES', 'LC', 'CM', 'MP', 'SV']), U.LISTA);
  check('la clave es la del Portal QUEMPIN', U.CLAVE === 'quempin_usuario');
  check('valido: sin importar mayúsculas ni espacios', U.valido(' lc ') === 'LC' && U.valido('Sv') === 'SV');
  check('valido: unas iniciales que no son del equipo no valen', U.valido('JB') === '' && U.valido('') === '' && U.valido(null) === '' && U.valido(undefined) === '');
  check('mismo: compara sin mayúsculas, y vacío nunca es nadie', U.mismo('lc', 'LC') && U.mismo('Ana Pérez', 'ana pérez') && !U.mismo('', '') && !U.mismo('LC', 'CM'));
}

// ---- Sin nada guardado ---------------------------------------------------------------------------
{
  const { U, S, datos } = navegador();
  check('sin nada: no hay usuario', U.actual() === '' && !U.hayEleccion());
  check('sin nada: no escribe la clave al leer', !datos.has('quempin_usuario'));
  check('sin nada: el proyecto nuevo parte sin responsable', S.newProject().responsable === '');
}

// ---- Lo de antes ---------------------------------------------------------------------------------
{
  const { U, datos } = navegador({ 'qpn.formulacion.iniciales': 'CM' });
  check('adopta las iniciales del Control de Documentos de antes', U.actual() === 'CM');
  check('y las deja guardadas para el Portal', datos.get('quempin_usuario') === 'CM' && U.hayEleccion());
}
{
  const { U } = navegador({ 'qpn.formulacion.config.v1': JSON.stringify({ responsable: 'lc' }) });
  check('adopta el «Responsable por defecto» de antes si son iniciales del equipo', U.actual() === 'LC');
}
{
  const { U, S, datos } = navegador({ 'qpn.formulacion.iniciales': 'PQ', 'qpn.formulacion.config.v1': JSON.stringify({ responsable: 'Persona Ficticia' }) });
  check('unas de antes que no son del equipo no se adoptan', U.actual() === '' && !datos.has('quempin_usuario'));
  check('mientras no se elige, el responsable por defecto de antes sigue', S.getConfig().responsable === 'Persona Ficticia' && S.newProject().responsable === 'Persona Ficticia');
  U.elegir('ES');
  check('elegido, el usuario manda sobre el texto de antes', S.getConfig().responsable === 'ES' && S.newProject().responsable === 'ES');
  U.elegir('');
  check('«Sin usuario» es una elección: no vuelve el texto de antes', U.hayEleccion() && S.getConfig().responsable === '' && datos.get('quempin_usuario') === '');
}

// ---- Elegir y avisar -----------------------------------------------------------------------------
{
  const { U, desdeOtraPestana } = navegador();
  const vistos = [];
  const quitar = U.alCambiar((v) => vistos.push(v));
  check('elegir devuelve las iniciales normalizadas', U.elegir('mp') === 'MP' && U.actual() === 'MP');
  U.elegir('MP');
  check('avisa solo cuando cambia', JSON.stringify(vistos) === JSON.stringify(['MP']), vistos);
  check('unas que no son del equipo dejan sin usuario', U.elegir('XX') === '' && U.actual() === '');
  desdeOtraPestana('quempin_usuario', 'NB');
  check('lo elegido en el Portal (otra página del sitio) llega con el evento storage', U.actual() === 'NB' && vistos[vistos.length - 1] === 'NB', vistos);
  desdeOtraPestana('otra_clave', 'x');
  check('otras claves no avisan', vistos.length === 3, vistos);
  quitar();
  U.elegir('SV');
  check('alCambiar devuelve con qué dejar de escuchar', vistos.length === 3, vistos);
}

const malos = results.filter((r) => r.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${results.length - malos.length}/${results.length} OK`);
process.exit(malos.length ? 1 : 0);
