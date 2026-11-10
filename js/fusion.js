/*
 * fusion.js — Junta los cambios de dos personas que editaron el mismo proyecto a la vez
 * (pedido del usuario, 2026-11-10: edición simultánea).
 *
 * Mezcla de tres vías: «base» es la última versión que los dos tenían en común, «mio» y «suyo» las
 * dos versiones que salieron de ella. Por cada dato:
 *   - si solo uno lo cambió, queda su cambio;
 *   - si los dos lo dejaron igual, queda así;
 *   - si los dos lo cambiaron distinto, es un choque: el resultado lleva el de «suyo» y el choque
 *     queda en la lista para que la persona elija (aplicarEleccion).
 * Las listas con uid (partidas, materiales, equipos, mano de obra, otros, entregables, tareas) se
 * juntan ítem por ítem: un ítem agregado por uno se suma, uno borrado por uno se borra, y borrar
 * un ítem que el otro cambió es un choque. Las demás listas (catálogo de otros, predecesoras) se
 * comparan enteras.
 *
 * Sin efectos ni DOM: se prueba en node (.prueba/fusion/unidad.js).
 */
(function (root) {
  'use strict';

  // Marcas de guardado: las pone quien guarda el resultado, no la mezcla.
  const FUERA = new Set(['modificado', 'modificadoPor']);

  function estable(v) {
    if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + estable(v[k])).join(',') + '}';
    }
    return v === undefined ? 'undefined' : JSON.stringify(v);
  }
  const igual = (a, b) => estable(a) === estable(b);
  const clon = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const conUid = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => esObjeto(x) && typeof x.uid === 'string' && x.uid);
  /* Una lista se junta por uid si alguna de las tres versiones tiene ítems con uid y ninguna
     tiene ítems sin él (una lista vacía no dice nada). */
  function listaPorUid(b, m, s) {
    const ls = [b, m, s].filter(Array.isArray);
    if (ls.length !== [b, m, s].filter((x) => x !== undefined).length) return false;
    return ls.some(conUid) && ls.every((l) => !l.length || conUid(l));
  }

  /* Un dato cualquiera. ruta: dónde está, para los choques. */
  function valor(b, m, s, ruta, choques) {
    if (igual(m, s)) return clon(m);
    if (igual(m, b)) return clon(s);
    if (igual(s, b)) return clon(m);
    if (esObjeto(m) && esObjeto(s) && (b === undefined || esObjeto(b))) return objeto(b || {}, m, s, ruta, choques);
    if (listaPorUid(b, m, s)) return lista(b || [], m, s, ruta, choques);
    choques.push({ ruta, base: clon(b), mio: clon(m), suyo: clon(s) });
    return clon(s);
  }

  function objeto(b, m, s, ruta, choques) {
    const out = {};
    const claves = [];
    [s, m, b].forEach((o) => Object.keys(o).forEach((k) => { if (!claves.includes(k)) claves.push(k); }));
    claves.forEach((k) => {
      if (!ruta.length && FUERA.has(k)) { if (s[k] !== undefined) out[k] = s[k]; return; }
      const v = valor(b[k], m[k], s[k], ruta.concat(k), choques);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  /* Listas con uid. El orden es el de «suyo»; lo que agregó «mio» va detrás del ítem que le
     precedía en su lista (o al comienzo). */
  function lista(b, m, s, ruta, choques) {
    const porUid = (l) => new Map(l.map((x) => [x.uid, x]));
    const B = porUid(b), M = porUid(m), S = porUid(s);
    const quedan = new Map();   // uid -> ítem resultante
    const uids = [];
    [s, m, b].forEach((l) => l.forEach((x) => { if (!uids.includes(x.uid)) uids.push(x.uid); }));
    uids.forEach((uid) => {
      const xb = B.get(uid), xm = M.get(uid), xs = S.get(uid);
      const r = ruta.concat({ uid });
      if (!xb) {                                   // nuevo en uno o en los dos
        if (xm && xs) quedan.set(uid, valor(undefined, xm, xs, r, choques));
        else quedan.set(uid, clon(xm || xs));
        return;
      }
      if (!xm && !xs) return;                      // borrado por los dos
      if (!xm || !xs) {                            // borrado por uno
        const otro = xm || xs;
        if (igual(otro, xb)) return;               // el otro no lo tocó: se borra
        // Uno lo borró y el otro lo cambió: choque. Mientras no se elija, queda la versión de «suyo»
        choques.push({ ruta: r, base: clon(xb), mio: clon(xm), suyo: clon(xs), item: true });
        if (xs) quedan.set(uid, clon(xs));
        return;
      }
      quedan.set(uid, objeto(xb, xm, xs, r, choques));
    });
    const out = s.filter((x) => quedan.has(x.uid)).map((x) => x.uid);
    m.forEach((x, i) => {
      if (out.includes(x.uid) || !quedan.has(x.uid)) return;
      let j = i - 1;
      while (j >= 0 && !out.includes(m[j].uid)) j--;
      out.splice(j >= 0 ? out.indexOf(m[j].uid) + 1 : 0, 0, x.uid);
    });
    // Ítems que solo seguían en la base (no pasa: borrados por los dos) o elegidos de «base»
    quedan.forEach((_, uid) => { if (!out.includes(uid)) out.push(uid); });
    return out.map((uid) => quedan.get(uid));
  }

  /* { resultado, choques }. resultado: el proyecto con lo de los dos (en los choques, lo de
     «suyo»), sin marcas de guardado nuevas. */
  function fusionar(base, mio, suyo) {
    const choques = [];
    const resultado = objeto(base || {}, mio || {}, suyo || {}, [], choques);
    return { resultado, choques };
  }

  /* Pone en «resultado» el valor elegido para un choque (lado: 'mio' | 'suyo'). Devuelve resultado. */
  function aplicarEleccion(resultado, choque, lado) {
    const v = clon(lado === 'mio' ? choque.mio : choque.suyo);
    let o = resultado;
    const r = choque.ruta;
    for (let i = 0; i < r.length; i++) {
      const paso = r[i], ultimo = i === r.length - 1;
      if (paso && typeof paso === 'object') {      // ítem de una lista con uid
        if (!Array.isArray(o)) return resultado;
        const k = o.findIndex((x) => x && x.uid === paso.uid);
        if (ultimo) {
          if (v === undefined) { if (k >= 0) o.splice(k, 1); }
          else if (k >= 0) o[k] = v;
          else o.push(v);
          return resultado;
        }
        if (k < 0) return resultado;
        o = o[k];
      } else {
        if (ultimo) {
          if (v === undefined) delete o[paso]; else o[paso] = v;
          return resultado;
        }
        if (o[paso] === undefined || o[paso] === null) return resultado;
        o = o[paso];
      }
    }
    return resultado;
  }

  const api = { fusionar, aplicarEleccion, igual };
  root.QFusion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
