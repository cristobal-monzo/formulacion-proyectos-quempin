/*
 * oferta.js — Excel de cada presupuesto en la carpeta de su oferta (modo local).
 *
 * El presupuesto ya queda en el repositorio del equipo: un JSON por presupuesto en
 * «.Herramientas formulación › Intercambio › publicado › formulador» (js/compartida.js). Es el formato
 * completo, el que la herramienta vuelve a abrir y el que leen las demás herramientas y Claude.
 * Este módulo deja además, en la carpeta de su oferta de la biblioteca «Formulación de proyectos -
 * Documentos», una copia en Excel para las personas: «Formulación <código> v<versión>.xlsx», la misma
 * exportación de «Exportar Excel» (ficha con el resultado y los indicadores, y hojas con fórmulas).
 * Se mantiene al día sola: se reescribe tras unos segundos sin editar, al salir del presupuesto y al
 * ocultar la página. La escribe el equipo donde se hizo el cambio.
 *
 * La carpeta se elige una vez por presupuesto y queda en el propio presupuesto
 * (vinculos.carpetaOferta = { nombre, ruta, numero }), así llega a los demás equipos por el
 * repositorio. Si la carpeta se mueve (a Presentadas, Adjudicadas o Cerradas), se la busca por su
 * nombre. Necesita la biblioteca completa conectada (js/intercambio.js la recuerda).
 *
 * Reglas que protegen los documentos reales (escribirExcel es la única función que escribe):
 *  - Solo se escriben archivos «Formulación … .xlsx», y solo dentro de una carpeta de oferta: las
 *    que cuelgan de la biblioteca o de sus carpetas «0 …», nunca las que empiezan con punto.
 *  - Un archivo que ya existe se reemplaza solo si es el Excel de este mismo presupuesto (su hoja
 *    oculta _datos trae el mismo identificador); si no, se usa «… (2).xlsx».
 *  - Nunca se elimina, mueve ni renombra nada, y no se crean carpetas.
 * Con SharePoint configurado no hace nada: ahí cloud.js guarda el Excel junto al proyecto.
 */
(function (root) {
  'use strict';

  const LS_ESTADO = 'qpn.formulacion.oferta.v1';
  const T = {
    espera: 30000,        // ms sin editar hasta reescribir el Excel…
    esperaMax: 180000,    // …y al menos cada 3 minutos mientras se edita
    reintento: 60000,     // tras un error, no se reintenta solo antes de un minuto
    vigenciaLista: 60000  // la lista de carpetas de oferta se relee cada minuto
  };
  const RE_PROPIO = /^Formulación .+\.xlsx$/;
  const RE_CARPETA_OFERTA = /^(\d+)\s*[.\-]\s*(.*)$/;
  const MAX_PROF = 4;      // carpetas «0 …» anidadas que se recorren
  const MAX_COPIAS = 9;

  const S = () => root.QStore;
  const X = () => root.QIntercambio;
  const nfc = (s) => String(s || '').normalize('NFC');
  const limpiarNombre = (s) => nfc(s).replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');

  // ---- Carpetas de oferta (sin efectos: se prueba en node) -------------------------------------
  /* Mismos criterios que el modo SharePoint (cloud.js): «0 OFERTAS ADJUDICADAS», «0 Ofertas
     Cerradas 2025»… agrupan; «1 CARPETA MODELO» y «2 ARCHIVOS…» no son ofertas. */
  function grupoDe(nombre, previo) {
    if (!/^0 /.test(nombre)) return previo;
    if (/adjudicad/i.test(nombre)) return 'Adjudicada';
    const m = /cerradas\s*(\d{4})?/i.exec(nombre);
    if (m) return 'Cerrada' + (m[1] ? ' ' + m[1] : '');
    if (/presentadas/i.test(nombre)) return 'Presentada';
    return previo;
  }
  function numeroDe(nombre) { const m = RE_CARPETA_OFERTA.exec(nombre || ''); return m ? m[1] : ''; }
  function grupoDeRuta(ruta) {
    let g = 'En curso';
    (ruta || []).slice(0, -1).forEach((n) => { g = grupoDe(n, g); });
    return g;
  }
  /* ¿Es esta ruta (desde la biblioteca) una carpeta de oferta? Las intermedias son todas «0 …». */
  function rutaValida(ruta) {
    if (!Array.isArray(ruta) || !ruta.length || ruta.length > MAX_PROF + 1) return false;
    const nombres = ruta.every((n) => typeof n === 'string' && n.trim() && n !== '.' && n !== '..' && !/[\\/]/.test(n) && n.charAt(0) !== '.');
    if (!nombres) return false;
    const ultima = ruta[ruta.length - 1];
    if (/^0 /.test(ultima) || (/^[1-9] /.test(ultima) && !numeroDe(ultima))) return false;
    return ruta.slice(0, -1).every((n) => /^0 /.test(n));
  }
  const rutaIgual = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((n, i) => nfc(n) === nfc(b[i]));
  /* El vínculo del presupuesto con su carpeta, o null si no tiene (o no es válido). */
  function vinculo(p) {
    const v = p && p.vinculos && p.vinculos.carpetaOferta;
    return v && typeof v === 'object' && rutaValida(v.ruta) ? v : null;
  }
  function nuevoVinculo(carpeta) {
    return { nombre: carpeta.nombre, ruta: carpeta.ruta.slice(), numero: carpeta.numero || numeroDe(carpeta.nombre) };
  }
  function nombreBase(p) { return `Formulación ${limpiarNombre(p.codigo) || 'S-N'} v${parseInt(p.version, 10) || 1}`; }
  /* Nombres posibles del Excel, en orden: el que ya usó este navegador (si sigue siendo de este
     código y versión), el nombre de siempre y sus alternativas «(2)», «(3)»… */
  function candidatos(p, previo) {
    const base = nombreBase(p);
    const lista = [];
    for (let i = 1; i <= MAX_COPIAS; i++) lista.push(i === 1 ? `${base}.xlsx` : `${base} (${i}).xlsx`);
    if (previo && lista.includes(previo)) { lista.splice(lista.indexOf(previo), 1); lista.unshift(previo); }
    return lista.filter((n) => RE_PROPIO.test(n));
  }

  // ---- Lectura de la biblioteca ------------------------------------------------------------------
  async function subcarpetas(dir) {
    const out = [];
    for await (const [n, h] of dir.entries()) if (h.kind === 'directory') out.push([n, h]);
    return out;
  }
  /* [{ id, nombre, numero, titulo, grupo, ruta }] de toda la biblioteca. */
  async function listar(bib) {
    const out = [];
    const recorrer = async (dir, grupo, ruta, prof) => {
      if (prof > MAX_PROF) return;
      for (const [n, h] of await subcarpetas(dir)) {
        if (n.charAt(0) === '.') continue;
        if (/^0 /.test(n)) { await recorrer(h, grupoDe(n, grupo), ruta.concat(n), prof + 1); continue; }
        if (/^[1-9] /.test(n) && !numeroDe(n)) continue;
        const m = RE_CARPETA_OFERTA.exec(n);
        const r = ruta.concat(n);
        out.push({ id: r.join('/'), nombre: n, numero: m ? m[1] : '', titulo: m ? m[2] : n, grupo, ruta: r });
      }
    };
    await recorrer(bib, 'En curso', [], 0);
    return out;
  }
  let lista = null;   // { bib, t, carpetas }
  async function carpetasDe(bib, fresca) {
    if (!fresca && lista && lista.bib === bib && Date.now() - lista.t < T.vigenciaLista) return lista.carpetas;
    const c = await listar(bib);
    lista = { bib, t: Date.now(), carpetas: c };
    return c;
  }
  /* Las carpetas de oferta de la biblioteca conectada, o null si no hay biblioteca con permiso. */
  async function carpetas(fresca) {
    const bib = X() ? await X().biblioteca() : null;
    return bib ? carpetasDe(bib, fresca) : null;
  }
  async function abrirRuta(bib, ruta) {
    let d = bib;
    for (const n of ruta) {
      let h = null;
      try { h = await d.getDirectoryHandle(n); } catch (e) { h = null; }
      if (!h) {   // las mismas letras con otra forma de las tildes o de las mayúsculas
        const k = nfc(n).toLowerCase();
        for (const [m, x] of await subcarpetas(d)) if (nfc(m).toLowerCase() === k) { h = x; break; }
      }
      if (!h) return null;
      d = h;
    }
    return d;
  }
  /* La carpeta del vínculo: { dir, ruta, movida }, o null si ya no está. Si se movió dentro de la
     biblioteca, se la encuentra por su nombre (solo si hay una sola con ese nombre). */
  async function ubicar(bib, v) {
    if (!v || !rutaValida(v.ruta)) return null;
    const d = await abrirRuta(bib, v.ruta);
    if (d) return { dir: d, ruta: v.ruta.slice(), movida: false };
    const nombre = nfc(v.nombre || v.ruta[v.ruta.length - 1]);
    const iguales = (await carpetasDe(bib, true)).filter((c) => nfc(c.nombre) === nombre);
    if (iguales.length !== 1) return null;
    const d2 = await abrirRuta(bib, iguales[0].ruta);
    return d2 ? { dir: d2, ruta: iguales[0].ruta.slice(), movida: true } : null;
  }
  /* Carpetas cuyo N° es el del requerimiento del presupuesto (la sugerencia al elegir). */
  async function sugerencias(p) {
    const H = root.QHerramientas;
    const req = H && H.reqDe ? H.reqDe(p) : null;
    const c = req ? await carpetas() : null;
    return c ? c.filter((x) => x.numero === req) : [];
  }

  // ---- Escritura (único punto que escribe en la biblioteca) ---------------------------------
  async function uidDe(file) {
    if (!file.size) return '';   // vacío (una escritura que no terminó): no hay nada que cuidar
    try { return (await root.QExcel.uidDeExcel(await file.arrayBuffer())) || null; } catch (e) { return null; }
  }
  /* Escribe el Excel de p en la carpeta de su oferta. Devuelve { archivo, ruta, movida, lastModified, size }. */
  async function escribirExcel(p, previo) {
    const bib = X() ? await X().biblioteca() : null;
    if (!bib) throw new Error('Falta conectar la biblioteca «Formulación de proyectos - Documentos» (o darle permiso).');
    const v = vinculo(p);
    if (!v) throw new Error('El presupuesto no tiene carpeta de oferta.');
    const u = await ubicar(bib, v);
    if (!u) throw new Error(`No se encuentra la carpeta «${v.nombre}» en la biblioteca. Si le cambiaron el nombre, vuelve a elegirla.`);
    const datos = await root.QExcel.exportProject(p, { soloDatos: true, copiaOferta: true });
    const mismoLugar = !!(previo && rutaIgual(previo.ruta, u.ruta));
    for (const nombre of candidatos(p, mismoLugar ? previo.archivo : '')) {
      let fh = null;
      try { fh = await u.dir.getFileHandle(nombre); } catch (e) {
        const n = e && e.name;
        if (n === 'TypeMismatchError') continue;   // hay una carpeta con ese nombre
        if (n !== 'NotFoundError') throw e;
      }
      if (fh) {
        const f = await fh.getFile();
        const conocido = mismoLugar && previo.archivo === nombre && previo.lastModified === f.lastModified && previo.size === f.size;
        const uid = conocido ? p.uid : await uidDe(f);
        if (uid !== p.uid && uid !== '') continue;   // es de otro presupuesto, o no es de la herramienta
      } else {
        fh = await u.dir.getFileHandle(nombre, { create: true });
      }
      const w = await fh.createWritable();
      try { await w.write(datos); await w.close(); } catch (e) {
        try { await w.abort(); } catch (e2) { /* ya cerrado */ }
        throw e;
      }
      const f2 = await fh.getFile();
      return { archivo: nombre, ruta: u.ruta, movida: u.movida, lastModified: f2.lastModified, size: f2.size };
    }
    throw new Error('La carpeta de la oferta ya tiene demasiados Excel con ese nombre.');
  }
  function mensajeError(err) {
    const n = err && err.name;
    if (n === 'NoModificationAllowedError' || n === 'InvalidStateError') return 'el archivo está abierto o bloqueado (¿en Excel?). Se vuelve a intentar en un minuto.';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'el navegador no tiene permiso para la biblioteca.';
    if (n === 'QuotaExceededError') return 'no hay espacio en el disco.';
    return (err && err.message) || String(err);
  }

  // ---- Estado de este navegador ---------------------------------------------------------------
  /* { pendientes: { uid: modificado } cambios hechos aquí cuyo Excel falta escribir,
       escritos: { uid: { modificado, archivo, ruta, hora, lastModified, size } } lo último escrito } */
  function leerEstado() {
    try { return JSON.parse(root.localStorage.getItem(LS_ESTADO)) || {}; } catch (e) { return {}; }
  }
  function guardarEstado(e) {
    try { root.localStorage.setItem(LS_ESTADO, JSON.stringify(e)); } catch (err) { /* sin almacenamiento */ }
  }
  function marcar(uid, mod) {
    const e = leerEstado();
    (e.pendientes || (e.pendientes = {}))[uid] = mod || '';
    guardarEstado(e);
  }
  function desmarcar(uid) {
    const e = leerEstado();
    if (e.pendientes && uid in e.pendientes) { delete e.pendientes[uid]; guardarEstado(e); }
  }
  const pendientes = () => Object.keys(leerEstado().pendientes || {});

  const enModoLocal = () => !!(S() && S().getMode() === 'local');
  function activa() { return enModoLocal() && !!X() && X().disponible(); }

  const errores = new Map();   // uid → { mensaje, t }: el último intento falló
  const enCurso = new Set();
  function avisar(ids) { if (S()) S().emit({ type: 'oferta', ids: ids || [] }); }

  /* Cómo está el Excel de p, para la interfaz (sin leer la carpeta). */
  function info(p) {
    const v = vinculo(p);
    if (!v) return { estado: 'sin-carpeta' };
    const e = leerEstado();
    const w = (e.escritos || {})[p.uid];
    // Lo último escrito cuenta si fue en esta misma carpeta (aunque después se haya movido).
    const ultima = (r) => nfc(r[r.length - 1]);
    const mismo = !!(w && Array.isArray(w.ruta) && w.ruta.length && ultima(w.ruta) === ultima(v.ruta));
    const base = { vinculo: v, ruta: mismo ? w.ruta : v.ruta, archivo: mismo ? w.archivo : `${nombreBase(p)}.xlsx`, hora: mismo ? w.hora : '' };
    if (enCurso.has(p.uid)) return Object.assign(base, { estado: 'guardando' });
    if ((e.pendientes || {})[p.uid] !== undefined) {
      const err = errores.get(p.uid);
      return Object.assign(base, err ? { estado: 'error', error: err.mensaje } : { estado: 'pendiente' });
    }
    if (mismo && w.modificado === p.modificado) return Object.assign(base, { estado: 'guardado' });
    return Object.assign(base, { estado: 'vinculada' });
  }

  // ---- Cuándo se escribe ----------------------------------------------------------------------
  let timer = null, desde = 0, corriendo = null, otraVez = false, forzarOtra = false;
  function programar(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; guardarPendientes(); }, Math.max(0, ms));
  }
  /* Escribe ya todos los Excel pendientes. Una sola vez a la vez, también entre pestañas. */
  function guardarPendientes(opts) {
    const forzar = !!(opts && opts.forzar);
    if (corriendo) { otraVez = true; forzarOtra = forzarOtra || forzar; return corriendo; }
    clearTimeout(timer); timer = null;
    const candado = (fn) => (root.navigator && root.navigator.locks ? root.navigator.locks.request('qpn-formulador-oferta', fn) : fn());
    corriendo = (async () => {
      let f = forzar;
      try {
        do { otraVez = false; await candado(() => correr(f)); f = forzarOtra; forzarOtra = false; } while (otraVez);
      } finally { corriendo = null; desde = 0; }
    })();
    return corriendo;
  }
  async function correr(forzar) {
    if (!activa()) return;
    const uids = pendientes();
    if (!uids.length) return;
    if (!(await X().biblioteca())) { avisar(uids); return; }   // sin biblioteca o sin permiso: esperar
    for (const uid of uids) {
      const p = S().get(uid);
      if (!p || p.eliminado || !vinculo(p)) { desmarcar(uid); errores.delete(uid); avisar([uid]); continue; }
      const err = errores.get(uid);
      if (err && !forzar && Date.now() - err.t < T.reintento) continue;
      try { await escribirUno(p); } catch (e) { /* queda pendiente con su error */ }
    }
  }
  async function escribirUno(p) {
    enCurso.add(p.uid);
    avisar([p.uid]);
    try {
      const r = await escribirExcel(p, (leerEstado().escritos || {})[p.uid]);
      const e = leerEstado();
      (e.escritos || (e.escritos = {}))[p.uid] = {
        modificado: p.modificado, archivo: r.archivo, ruta: r.ruta, hora: new Date().toISOString(),
        lastModified: r.lastModified, size: r.size
      };
      // Si mientras tanto se volvió a editar, queda pendiente para la próxima vuelta.
      if (e.pendientes && e.pendientes[p.uid] === p.modificado) delete e.pendientes[p.uid];
      guardarEstado(e);
      errores.delete(p.uid);
      return r;
    } catch (err) {
      errores.set(p.uid, { mensaje: mensajeError(err), t: Date.now() });
      console.warn('Excel en la carpeta de la oferta:', err);
      throw err;
    } finally {
      enCurso.delete(p.uid);
      avisar([p.uid]);
    }
  }
  /* Escribir ya el Excel de un presupuesto (al elegir su carpeta o con «Guardar ahora»).
     Devuelve lo escrito o lanza el error. */
  async function guardar(uid) {
    const p = S().get(uid);
    if (!p || !vinculo(p)) throw new Error('El presupuesto no tiene carpeta de oferta.');
    marcar(uid, p.modificado);
    await guardarPendientes({ forzar: true });
    const err = errores.get(uid);
    if (err) throw new Error(err.mensaje);
    // Escrita esta versión o una más nueva (las fechas ISO se comparan como texto)
    const w = (leerEstado().escritos || {})[uid];
    if (!w || !(String(w.modificado) >= String(p.modificado))) throw new Error('falta conectar la biblioteca «Formulación de proyectos - Documentos» o darle permiso en esta sesión.');
    return w;
  }

  function iniciar() {
    if (!S() || !X()) return;
    S().on((ev) => {
      if (!activa()) return;
      if (ev.type === 'local') {
        let alguno = false;
        ev.ids.forEach((uid) => {
          const p = S().get(uid);
          if (p && !p.eliminado && vinculo(p)) { marcar(uid, p.modificado); alguno = true; } else desmarcar(uid);
        });
        if (!alguno) return;
        const ahora = Date.now();
        if (!desde) desde = ahora;
        programar(Math.min(T.espera, desde + T.esperaMax - ahora));
        avisar(ev.ids);
      } else if (ev.type === 'sync' && !timer && !corriendo && pendientes().length) {
        // La carpeta del equipo volvió (permiso de la sesión, reconexión): ponerse al día.
        programar(2000);
      }
    });
    const ocultar = () => { if (root.document && root.document.visibilityState === 'hidden' && pendientes().length) guardarPendientes(); };
    if (root.document) root.document.addEventListener('visibilitychange', ocultar);
    if (pendientes().length) programar(5000);
  }

  const api = {
    grupoDe, numeroDe, grupoDeRuta, rutaValida, vinculo, nuevoVinculo, nombreBase, candidatos, listar, ubicar,
    activa, carpetas, sugerencias, info, guardar, guardarPendientes, iniciar,
    _tiempos: (o) => Object.assign(T, o || {}), _estado: leerEstado, _escribirExcel: escribirExcel
  };
  root.QOferta = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
