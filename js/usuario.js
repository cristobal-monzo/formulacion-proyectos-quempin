/*
 * usuario.js — Quién usa el Formulador (pedido del usuario, 2026-10-16: «un selector de usuario» con
 * las iniciales del equipo, para seguir los proyectos de cada uno y que lo que se genera ya lleve a su
 * autor o responsable).
 *
 *   - Es el responsable de los proyectos nuevos (salvo que la Planilla de Ingreso diga otro Evaluador),
 *     el autor de la evaluación de costos en el Control de Documentos y quien firma lo que se manda a
 *     las demás herramientas.
 *   - La lista de proyectos lo usa para «Mis proyectos».
 *
 * Se guarda en este navegador, en 'quempin_usuario': la misma clave que lee y escribe el Portal QUEMPIN
 * (mismo sitio, cristobal-monzo.github.io), así que elegirlo en uno vale para el otro. La lista también
 * está en el registro del Portal y en Sistema QUEMPIN (app/config.py, USUARIOS): si el equipo cambia,
 * se cambia en los tres. Solo guarda y avisa: no pinta (lo hace app.js).
 */
(function (root) {
  'use strict';

  const LISTA = ['NB', 'ES', 'LC', 'CM', 'MP', 'SV'];
  const CLAVE = 'quempin_usuario';
  /* Hasta el 2026-10-16 cada navegador guardaba aparte las iniciales del Control de Documentos y un
     «Responsable por defecto» de texto libre: mientras no se elige, se adoptan de ahí si son del equipo. */
  const CLAVE_INICIALES = 'qpn.formulacion.iniciales';
  const CLAVE_CONFIG = 'qpn.formulacion.config.v1';

  /* Las iniciales si son del equipo (sin importar mayúsculas ni espacios), o '' */
  const valido = (v) => {
    const s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
    return LISTA.includes(s) ? s : '';
  };
  function leer(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function escribir(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function deAntes() {
    const ini = valido(leer(CLAVE_INICIALES));
    if (ini) return ini;
    try { return valido((JSON.parse(leer(CLAVE_CONFIG) || 'null') || {}).responsable); } catch (e) { return ''; }
  }

  /* Las iniciales elegidas, o '' (nadie). Sin elección guardada, se adoptan las de antes y quedan
     guardadas (así también las ve el Portal). */
  function actual() {
    const v = leer(CLAVE);
    if (v !== null) return valido(v);
    const previa = deAntes();
    if (previa) escribir(CLAVE, previa);
    return previa;
  }
  /* ¿Se eligió alguna vez en este navegador (también «Sin usuario»)? Mientras no, el Formulador
     sigue con el «Responsable por defecto» de antes. */
  function hayEleccion() { actual(); return leer(CLAVE) !== null; }

  const oyentes = [];
  function avisar() { const v = actual(); oyentes.slice().forEach((fn) => { try { fn(v); } catch (e) { console.error(e); } }); }
  function alCambiar(fn) { oyentes.push(fn); return () => { const i = oyentes.indexOf(fn); if (i >= 0) oyentes.splice(i, 1); }; }

  /* Elige (o, con '', deja sin usuario). Devuelve lo que quedó. */
  function elegir(v) {
    const antes = actual(), nuevo = valido(v);
    escribir(CLAVE, nuevo);
    if (nuevo !== antes) avisar();
    return nuevo;
  }
  // Elegido en el Portal o en otra pestaña de este navegador
  if (root.addEventListener) root.addEventListener('storage', (e) => { if (e.key === CLAVE || e.key === null) avisar(); });

  /* ¿Es esta la misma persona? Compara iniciales o, si son de antes, el texto sin mayúsculas. */
  const mismo = (a, b) => {
    const x = String(a === null || a === undefined ? '' : a).trim().toUpperCase();
    return !!x && x === String(b === null || b === undefined ? '' : b).trim().toUpperCase();
  };

  root.QUsuario = { LISTA, CLAVE, valido, actual, hayEleccion, elegir, alCambiar, mismo };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.QUsuario;
})(typeof window !== 'undefined' ? window : globalThis);
