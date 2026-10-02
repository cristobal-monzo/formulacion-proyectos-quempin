/*
 * intercambio.js — Comunicación con las demás herramientas de QUEMPIN (Análisis Financiero,
 * Centro de Costos…) por su carpeta de intercambio, sincronizada por OneDrive.
 * Protocolo «quempin.intercambio/1» (ver docs/INTERCAMBIO.md):
 *   intercambio.json   manifiesto: así se reconoce la carpeta correcta
 *   buzon/             mensajes que una herramienta le envía a otra (este archivo escribe acá)
 *   procesado/         mensajes ya atendidos por su destinatario, con el resultado
 *   publicado/         lo que cada herramienta publica para las demás (este archivo lo lee)
 * Cada herramienta es dueña de sus datos: el formulador nunca escribe los archivos de otra,
 * solo deja mensajes. No usa servidores ni inicio de sesión (la página abre la carpeta con la
 * API de acceso a archivos del navegador: Chrome y Edge de escritorio) y no depende del modo
 * SharePoint ni lo cambia. La carpeta elegida se recuerda en este navegador (IndexedDB).
 * Si se eligió la biblioteca completa, se recuerda también: con ella js/oferta.js llega a la
 * carpeta de cada oferta para dejar ahí el Excel del presupuesto.
 */
(function (root) {
  'use strict';

  const ESQUEMA = 'quempin.intercambio/1';
  const MANIFIESTO = 'intercambio.json';
  const HERRAMIENTA = 'formulador';
  const BIBLIOTECA = 'Formulación de proyectos - Documentos';
  const CARPETA_HERRAMIENTAS = '.Herramientas formulación';
  const DB = 'qpn-intercambio';
  const TIENDA = 'carpetas';
  const CLAVE = 'intercambio';
  const CLAVE_BIBLIOTECA = 'biblioteca';

  /* Categorías que el Análisis Financiero compara contra el costo real, y de dónde salen en
     el cálculo del formulador. Gastos generales e imprevistos no viajan: allá se comparan
     costos directos (los gastos generales de la empresa tienen su propio proyecto). */
  const CATEGORIAS_AF = [
    { k: 'Materiales', total: 'mat' },
    { k: 'Equipos', total: 'eq' },
    { k: 'Mano de Obra', total: 'mo' },
    { k: 'Otros', total: 'otros' }
  ];

  let carpeta = null;      // FileSystemDirectoryHandle de «Intercambio»
  let biblioteca = null;   // la biblioteca completa, si fue lo que se eligió (o null)
  let cargada = false;
  const oyentes = [];   // avisos al conectar, cambiar u olvidar la carpeta

  const disponible = () => typeof root.showDirectoryPicker === 'function';

  // ---- Recordar la carpeta (IndexedDB guarda el acceso; localStorage no puede) ------------
  function idb(modo, fn) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = root.indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(TIENDA);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(TIENDA, modo);
        const r = fn(tx.objectStore(TIENDA));
        tx.oncomplete = () => { db.close(); resolve(r && r.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }
  async function cargar() {
    if (cargada) return carpeta;
    cargada = true;
    try { carpeta = (await idb('readonly', (s) => s.get(CLAVE))) || null; } catch (e) { carpeta = null; }
    try { biblioteca = carpeta ? (await idb('readonly', (s) => s.get(CLAVE_BIBLIOTECA))) || null : null; } catch (e) { biblioteca = null; }
    return carpeta;
  }
  async function recordar(h, bib) {
    const antes = carpeta;
    carpeta = h;
    biblioteca = h ? bib || null : null;
    cargada = true;
    try { await idb('readwrite', (s) => (h ? s.put(h, CLAVE) : s.delete(CLAVE))); } catch (e) { /* solo esta sesión */ }
    try { await idb('readwrite', (s) => (biblioteca ? s.put(biblioteca, CLAVE_BIBLIOTECA) : s.delete(CLAVE_BIBLIOTECA))); } catch (e) { /* solo esta sesión */ }
    // La misma carpeta elegida otra vez (p. ej. ahora desde la biblioteca completa) no es un
    // cambio: quien sincroniza con ella no tiene que empezar de cero.
    let misma = false;
    try { misma = !!(antes && h && await antes.isSameEntry(h)); } catch (e) { misma = false; }
    if (!misma) oyentes.slice().forEach((fn) => { try { fn(h); } catch (e) { console.error(e); } });
  }
  function onCambio(fn) { oyentes.push(fn); }

  // ---- Archivos -------------------------------------------------------------------------------
  async function sub(dir, nombre, crear) {
    try { return await dir.getDirectoryHandle(nombre, { create: !!crear }); } catch (e) { return null; }
  }
  async function leerJSON(dir, nombre) {
    try {
      const f = await (await dir.getFileHandle(nombre)).getFile();
      return JSON.parse((await f.text()).replace(/^﻿/, ''));
    } catch (e) { return null; }
  }
  async function escribirJSON(dir, nombre, datos) {
    const fh = await dir.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(datos, null, 2) + '\n');
    await w.close();
  }
  const esManifiesto = (m) => !!(m && typeof m.esquema === 'string' && m.esquema.indexOf('quempin.intercambio/') === 0);

  /* Subcarpeta sin distinguir mayúsculas ni la forma de las tildes: en el disco la carpeta de
     herramientas quedó como «.HERRAMIENTAS FORMULACIÓN». */
  const clave = (s) => String(s || '').normalize('NFC').toLowerCase();
  async function hijaComo(dir, nombre) {
    const k = clave(nombre);
    try {
      for await (const [n, h] of dir.entries()) if (h.kind === 'directory' && clave(n) === k) return h;
    } catch (e) { /* sin acceso */ }
    return null;
  }
  /* La carpeta vive en la biblioteca de SharePoint «Formulación de proyectos - Documentos», en
     «.Herramientas formulación › Intercambio» (oculta). Se acepta elegir la carpeta misma, la de
     herramientas o la biblioteca completa, y se baja sola. Una carpeta «Intercambio» nueva y
     vacía se prepara acá mismo (el Análisis Financiero haría lo mismo). */
  const RUTAS = [['Intercambio'], [CARPETA_HERRAMIENTAS, 'Intercambio']];
  const DESDE_BIBLIOTECA = RUTAS[1];
  async function bajar(h, ruta) {
    let d = h;
    for (const n of ruta) d = d && await hijaComo(d, n);
    return d && esManifiesto(await leerJSON(d, MANIFIESTO)) ? d : null;
  }
  /* { carpeta, biblioteca }: la carpeta de intercambio y, si lo elegido fue la biblioteca
     completa, la biblioteca (para llegar a la carpeta de cada oferta). null si no está ahí. */
  async function resolverCarpeta(h) {
    if (esManifiesto(await leerJSON(h, MANIFIESTO))) return { carpeta: h, biblioteca: null };
    for (const ruta of RUTAS) {
      const d = await bajar(h, ruta);
      if (d) return { carpeta: d, biblioteca: ruta === DESDE_BIBLIOTECA ? h : null };
    }
    if (/^intercambio$/i.test(h.name)) {
      for (const n of ['buzon', 'procesado', 'publicado']) await h.getDirectoryHandle(n, { create: true });
      await escribirJSON(h, MANIFIESTO, {
        esquema: ESQUEMA,
        descripcion: 'Carpeta de intercambio de las herramientas de QUEMPIN. Ver LEEME.md. No editar ni mover estos archivos a mano.',
        creado: isoLocal(new Date())
      });
      return { carpeta: h, biblioteca: null };
    }
    return null;
  }

  // ---- Estado y conexión ----------------------------------------------------------------------
  async function permiso(h) {
    try { return await h.queryPermission({ mode: 'readwrite' }); } catch (e) { return 'prompt'; }
  }
  /* ¿Sigue ahí la carpeta recordada? (se mueve o se borra por fuera del navegador) */
  const vigente = async (h) => esManifiesto(await leerJSON(h, MANIFIESTO));
  /* Con permiso sobre la biblioteca, la carpeta de intercambio que se abre desde ella lo hereda:
     así basta pedirlo una vez por sesión, para la biblioteca. Solo si es la misma carpeta recordada. */
  async function desdeBiblioteca() {
    if (!biblioteca || !carpeta || (await permiso(biblioteca)) !== 'granted') return null;
    const d = await bajar(biblioteca, DESDE_BIBLIOTECA);
    let misma = false;
    try { misma = !!d && await d.isSameEntry(carpeta); } catch (e) { misma = false; }
    if (!misma) return null;
    carpeta = d;
    return d;
  }
  async function permisoCarpeta(h) {
    const p = await permiso(h);
    return p !== 'granted' && (await desdeBiblioteca()) ? 'granted' : p;
  }
  /* movida: la carpeta recordada ya no está donde estaba; hay que volver a elegirla.
     biblioteca: true si se recuerda la biblioteca completa (Excel en la carpeta de cada oferta). */
  async function estado() {
    if (!disponible()) return { disponible: false, conectada: false };
    if (!(await cargar())) return { disponible: true, conectada: false };
    const p = await permisoCarpeta(carpeta);
    const h = carpeta;
    if (p === 'granted' && !(await vigente(h))) return { disponible: true, conectada: false, movida: true, nombre: h.name };
    return { disponible: true, conectada: true, nombre: h.name, permiso: p, biblioteca: !!biblioteca };
  }
  /* Abre el selector de carpetas: debe llamarse desde un clic. */
  async function conectar() {
    const h = await root.showDirectoryPicker({ id: 'quempin-intercambio', mode: 'readwrite' });
    const r = await resolverCarpeta(h);
    if (!r) throw new Error(`Ahí no está la carpeta de intercambio. Elige la biblioteca «${BIBLIOTECA}» de tu OneDrive.`);
    await recordar(r.carpeta, r.biblioteca);
    return estado();
  }
  /* Pide de nuevo el permiso de la carpeta recordada: debe llamarse desde un clic. Con la
     biblioteca recordada se pide para ella, que alcanza también para la carpeta de intercambio. */
  async function permitir() {
    const h = await cargar();
    if (!h) return false;
    if (await permisoCarpeta(h) === 'granted' && (!biblioteca || (await permiso(biblioteca)) === 'granted')) return true;
    const pedir = async (x) => { try { return (await x.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { return false; } };
    if (biblioteca && (await permiso(biblioteca)) !== 'granted') await pedir(biblioteca);
    if (await permisoCarpeta(carpeta) === 'granted') return true;
    return pedir(carpeta);
  }
  async function desconectar() { await recordar(null); }
  /* La carpeta recordada, solo si ya hay permiso para usarla y sigue ahí (no pide nada). */
  async function carpetaConPermiso() {
    const h = disponible() ? await cargar() : null;
    return h && (await permisoCarpeta(h)) === 'granted' && (await vigente(carpeta)) ? carpeta : null;
  }
  /* La biblioteca completa, solo si se recuerda y ya hay permiso (no pide nada). */
  async function bibliotecaConPermiso() {
    if (!disponible() || !(await cargar()) || !biblioteca) return null;
    return (await permiso(biblioteca)) === 'granted' ? biblioteca : null;
  }
  /* recordada: false si se conectó la carpeta de herramientas o la de intercambio en vez de la
     biblioteca (hay que volver a elegirla para llegar a las carpetas de las ofertas). */
  async function estadoBiblioteca() {
    if (!disponible()) return { disponible: false, recordada: false };
    if (!(await cargar())) return { disponible: true, conectada: false, recordada: false };
    if (!biblioteca) return { disponible: true, conectada: true, recordada: false };
    return { disponible: true, conectada: true, recordada: true, nombre: biblioteca.name, permiso: await permiso(biblioteca) };
  }

  // ---- Leer lo publicado y enviar mensajes ---------------------------------------------------
  async function leerPublicacion(nombre) {
    const h = await cargar();
    const pub = h && await sub(h, 'publicado');
    const sobre = pub && await leerJSON(pub, nombre + '.json');
    return sobre && sobre.esquema === ESQUEMA && sobre.datos ? Object.assign({ generado: sobre.generado }, sobre.datos) : null;
  }
  const leerCatalogoAF = () => leerPublicacion('analisis-financiero');
  /* Un JSON de la raíz de la carpeta (p. ej. esquemas.json, el catálogo que deja el procesador). */
  async function leerRaiz(nombre) {
    const h = await cargar();
    return h ? leerJSON(h, nombre) : null;
  }

  function nombreArchivo(m) {
    const t = String(m.origen.enviado).slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    return `${t}_${m.origen.herramienta}_${m.tipo}_${m.id}.json`;
  }
  async function enviar(m) {
    const h = await cargar();
    if (!h) throw new Error('Primero conecta la carpeta de intercambio.');
    const buzon = await h.getDirectoryHandle('buzon', { create: true });
    await escribirJSON(buzon, nombreArchivo(m), m);
    return nombreArchivo(m);
  }
  /* ¿Sigue el mensaje en el buzón? (todavía no lo atiende su destinatario) */
  async function enBuzon(id) {
    const h = await cargar();
    const buzon = h && await sub(h, 'buzon');
    if (!buzon) return false;
    for await (const nombre of buzon.keys()) if (nombre.indexOf(id) >= 0 && /\.json$/i.test(nombre)) return true;
    return false;
  }
  /* Sin la API del navegador: descargar el mensaje para dejarlo a mano en «buzon». */
  function descargar(m) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(m, null, 2) + '\n'], { type: 'application/json' }));
    a.download = nombreArchivo(m);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---- Mensajes -------------------------------------------------------------------------------
  function isoLocal(d) {
    const z = (n) => String(Math.abs(n)).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}` +
      `${off >= 0 ? '+' : '-'}${z(Math.trunc(off / 60))}:${z(off % 60)}`;
  }
  function nuevoId() {
    const r = root.crypto && root.crypto.getRandomValues ? root.crypto.getRandomValues(new Uint8Array(12)) : null;
    return r ? Array.from(r, (b) => b.toString(16).padStart(2, '0')).join('') : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  }
  /* Costos por categoría del Análisis Financiero, en pesos enteros, desde el cálculo del proyecto */
  function costosAF(totales) {
    const o = {};
    CATEGORIAS_AF.forEach((c) => { o[c.k] = Math.round(Number(totales[c.total]) || 0); });
    return o;
  }
  /* Mensaje «presupuesto-proyecto» para el Análisis Financiero.
     destino: { tag, nombre, crear } · visto: proyectados que se vieron en el catálogo (o null) */
  function mensajePresupuesto(p, totales, destino, visto, usuario) {
    const m = {
      esquema: ESQUEMA,
      id: nuevoId(),
      tipo: 'presupuesto-proyecto',
      destino: 'analisis-financiero',
      origen: { herramienta: HERRAMIENTA, usuario: usuario || '', enviado: isoLocal(new Date()) },
      proyecto: destino.crear ? { tag: destino.tag, nombre: destino.nombre, crear: true } : { tag: destino.tag },
      fuente: {
        uid: p.uid, codigo: p.codigo || '', version: p.version, titulo: p.titulo || '',
        cliente: p.cliente || '', estado: p.estado || '', modificado: p.modificado || ''
      },
      costos: costosAF(totales),
      informativo: {
        moneda: 'CLP', costoDirecto: Math.round(totales.cd || 0), gastosGenerales: Math.round(totales.gg || 0),
        imprevistos: Math.round(totales.imp || 0), costoTotal: Math.round(totales.costoTotal || 0),
        precioNeto: Math.round(totales.precioNeto || 0)
      }
    };
    // Lo que la persona vio en el Análisis Financiero al decidir: autoriza reemplazar esos
    // valores, y solo esos (si allá cambian antes de aplicarse, el envío queda pendiente).
    if (visto) m.reemplaza = visto;
    return m;
  }

  root.QIntercambio = {
    ESQUEMA, CATEGORIAS_AF, BIBLIOTECA, CARPETA_HERRAMIENTAS, disponible, estado, conectar, permitir, desconectar, onCambio,
    carpeta: carpetaConPermiso, biblioteca: bibliotecaConPermiso, estadoBiblioteca,
    leerCatalogoAF, leerPublicacion, leerRaiz, enviar, enBuzon, descargar, mensajePresupuesto, costosAF, nombreArchivo, nuevoId, isoLocal
  };
})(window);
