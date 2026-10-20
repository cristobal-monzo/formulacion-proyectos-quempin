/*
 * app.js — Carta Gantt, herramienta aparte del Formulador (pedido del usuario, 2026-10-20).
 *
 * Hasta el 2026-10-20 la Carta Gantt era una pestaña del Formulador y se guardaba dentro de cada proyecto.
 * Ahora tiene su página (gantt/index.html), su lista de cartas y sus datos (gantt/datos.js); en el Portal
 * QUEMPIN es una herramienta más. Del Formulador solo lee: los proyectos, para vincular una carta y crear
 * sus tareas desde las partidas.
 *
 * Rutas:
 *   #/                     las cartas (y las eliminadas)
 *   #/c/<uid>              una carta
 *   #/proyecto/<uid>       la carta de un proyecto del Formulador (la abre el Portal con el proyecto
 *                          elegido); si todavía no tiene, una nueva que se guarda con el primer cambio
 *
 * El editor es el de antes (2026-10-13): calendario, tarjetas, lámina (SVG; la misma figura del PDF),
 * tareas con predecesoras, hitos y ruta crítica; Ctrl+Z / Ctrl+Y deshacen y rehacen.
 */
(function () {
  'use strict';

  const D = window.QGanttDatos;
  const QG = window.QGantt;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const app = $('#app');
  const EN_PORTAL = window.parent !== window;

  // ---- Formato -------------------------------------------------------------------------------
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + 's')}`;
  const fechaG = (d) => QG.fechaCorta(d);
  const fechaHora = (iso) => {
    const d = new Date(iso || '');
    return isNaN(d) ? '' : `${d.toLocaleDateString('es-CL')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    download: svg('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>'),
    more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    sheet: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
    layers: svg('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'),
    open: svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    gantt: svg('<path d="M4 6h8M8 12h10M6 18h6"/>'),
    folder: svg('<path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'),
    restore: svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>'),
    deshacer: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    rehacer: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
    luna: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
    sol: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>')
  };

  function pintar(el, html) {
    if (!el || el._pintado === html) return false;
    el._pintado = html;
    el.innerHTML = html;
    return true;
  }
  function texto(el, valor) { if (el && el.textContent !== valor) el.textContent = valor; }

  // ---- Toast, diálogo, tooltip ---------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, isErr, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, ms || (isErr ? 5000 : 2600));
  }
  /* Diálogo modal. buttons: [{label, value, primary, danger}] → Promise(value | null). Un botón del cuerpo
     con su propio value (p. ej. una fila de una lista) cierra con ese valor. alAbrir(dlg): después de abrir. */
  function ask({ title, body, buttons, wide, alAbrir }) {
    const dlg = $('#modal');
    closePop();
    dlg.className = wide ? 'wide' : '';
    const btns = (buttons || [{ label: 'Aceptar', value: true, primary: true }]).filter(Boolean);
    dlg.innerHTML = `<form method="dialog">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" value="" aria-label="Cerrar">${ICON.x}</button></div>
      <div class="modal-body">${body || ''}</div>
      <div class="modal-foot">${btns.map((b, i) => `<button class="btn ${b.primary ? 'btn-primario' : ''} ${b.danger ? 'btn-danger' : ''}" value="${i}">${esc(b.label)}</button>`).join('')}</div>
    </form>`;
    return new Promise((resolve) => {
      const onClose = () => {
        dlg.removeEventListener('close', onClose);
        const rv = dlg.returnValue || '';
        const i = /^\d+$/.test(rv) ? parseInt(rv, 10) : NaN;
        if (Number.isInteger(i) && btns[i]) resolve(btns[i].value === undefined ? null : btns[i].value);
        else resolve(rv || null);
      };
      dlg.returnValue = '';
      dlg.addEventListener('close', onClose);
      dlg.showModal();
      const primary = dlg.querySelector('.btn-primario') || dlg.querySelector('.modal-foot .btn');
      const firstInput = dlg.querySelector('.modal-body input');
      (firstInput || primary).focus();
      if (alAbrir) alAbrir(dlg);
    });
  }

  // Tooltip negro (como el Formulador y los tableros): data-tip con HTML ya escapado
  const tip = $('#tooltip');
  function placeTip(x, y) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y - h - 10;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 18;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = top + 'px';
  }
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.classList.remove('show'); return; }
    tip.innerHTML = el.dataset.tip;
    tip.classList.add('show');
    placeTip(e.clientX, e.clientY);
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.classList.remove('show'); return; }
    const r = el.getBoundingClientRect();
    tip.innerHTML = el.dataset.tip;
    tip.classList.add('show');
    placeTip(r.left + r.width / 2, r.top);
  });
  document.addEventListener('focusout', () => tip.classList.remove('show'));
  const info = (text) => `<span class="info-icon" tabindex="0" role="img" aria-label="${esc(text)}" data-tip="${esc(text)}">i</span>`;

  // ---- Menú de acciones (el mismo aspecto que los del Formulador) -----------------------------
  const pop = $('#pop');
  let P = null;
  function closePop(refocus) {
    if (!P) return;
    const a = P.anchor;
    a.setAttribute('aria-expanded', 'false');
    pop.hidden = true;
    pop.innerHTML = '';
    P = null;
    if (refocus && a && document.contains(a)) a.focus();
  }
  function openPop(anchor, items) {
    closePop();
    P = { anchor, items };
    anchor.setAttribute('aria-expanded', 'true');
    pop.innerHTML = `<div class="pop-list" role="menu">${items.map((it, i) => (it.sep ? '<div class="pop-sep" role="separator"></div>'
      : `<button type="button" class="pop-item ${it.danger ? 'danger' : ''}" role="menuitem" data-pi="${i}" ${it.disabled ? 'disabled' : ''}>
        ${it.icon || ''}<span class="pi-main"><span class="pi-title">${esc(it.title)}</span>${it.desc ? `<span class="pi-desc">${esc(it.desc)}</span>` : ''}</span></button>`)).join('')}</div>`;
    pop.hidden = false;
    pop.style.minWidth = '240px';
    ubicarPop();
    const first = $('.pop-item:not([disabled])', pop);
    if (first) first.focus({ preventScroll: true });
  }
  function ubicarPop() {
    if (!P) return;
    const r = P.anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
    pop.style.left = left + 'px';
    pop.style.top = Math.max(8, top) + 'px';
  }
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('.pop-item');
    if (!b || !P) return;
    const it = P.items[+b.dataset.pi];
    closePop(true);
    if (it && it.run) it.run();
  });
  pop.addEventListener('keydown', (e) => {
    if (!P) return;
    const items = $$('.pop-item:not([disabled])', pop);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closePop(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    else if (e.key === 'Tab') closePop();
  });
  document.addEventListener('mousedown', (e) => { if (P && !pop.contains(e.target) && !P.anchor.contains(e.target)) closePop(); });
  // Al desplazar, el menú sigue a su botón; se cierra solo si el botón sale de la vista (como en el Formulador:
  // un desplazamiento suave que termina justo al abrirlo no lo cierra)
  document.addEventListener('scroll', (e) => {
    if (!P || (e.target.closest && e.target.closest('.pop'))) return;
    const r = P.anchor.getBoundingClientRect();
    if (!document.contains(P.anchor) || r.bottom < 0 || r.top > window.innerHeight) closePop(); else ubicarPop();
  }, true);
  window.addEventListener('resize', () => closePop());

  // ---- Controles ------------------------------------------------------------------------------
  const seg = (name, opts, data, label, cls) => `<div class="segmentado ${cls || ''}" role="radiogroup" aria-label="${esc(label)}">${opts.map((o) =>
    `<label ${o.tip ? `data-tip="${esc(o.tip)}"` : ''}><input type="radio" name="${name}" value="${esc(o.v)}" ${o.checked ? 'checked' : ''} ${data}><span>${o.l}</span></label>`).join('')}</div>`;
  const abiertos = new Set();
  const plegable = (key, titulo, resumen, cuerpo) => `<details class="panel plegable" id="${key}" data-open-key="${key}" ${abiertos.has(key) ? 'open' : ''}>
      <summary><span class="pl-t"><span class="seccion-titulo">${titulo}</span><span class="pl-res" id="res-${key}">${resumen}</span></span><span class="pl-accion" aria-hidden="true"></span></summary>
      <div class="pl-cuerpo">${cuerpo}</div></details>`;
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.dataset || !d.dataset.openKey) return;
    if (d.open) abiertos.add(d.dataset.openKey); else abiertos.delete(d.dataset.openKey);
  }, true);
  const kpiTop = (label, value, sub, cls, tipText) => `<div class="kpi-card ${cls || ''}">
    <div class="kpi-label">${label}${tipText ? info(tipText) : ''}</div>
    <div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  function flashRow(uid) {
    const tr = $(`tr[data-row="${uid}"]`);
    if (!tr) return;
    tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
    tr.classList.remove('flash'); void tr.offsetWidth; tr.classList.add('flash');
  }

  // ---- Estado ---------------------------------------------------------------------------------
  const state = {
    carta: null,        // la carta abierta (puede ser nueva, todavía sin guardar)
    guardada: false,    // si la carta abierta ya está en la lista
    q: '',
    hist: { undo: [], redo: [], grupo: null }
  };
  const titulo = (c) => c.nombre || (c.proyecto && c.proyecto.titulo) || (c.proyecto && c.proyecto.codigo) || 'Carta sin nombre';
  /* El proyecto del Formulador de la carta, al día si está aquí o en la carpeta; si no, la foto guardada */
  const proyectoDe = (c) => (c && c.proyecto ? D.proyecto(c.proyecto.uid) : null);
  const identProyecto = (pr) => (pr ? `${pr.codigo || 'Sin código'} v${pr.version || 1}` : '');
  const datosProyecto = (c) => {
    const p = proyectoDe(c);
    return p ? D.fotoProyecto(p) : c.proyecto;
  };
  function codigosDe(c) {
    const p = proyectoDe(c);
    return new Map((p ? D.partidasDe(p) : []).map((pt) => [pt.uid, pt]));
  }
  const programa = () => QG.calcular(state.carta.gantt, D.hoy());
  const numeros = (g) => new Map(g.tareas.map((t, i) => [t.uid, i + 1]));
  const nuevaTarea = (o) => Object.assign({ uid: D.uid(), nombre: '', partida: '', responsable: '', duracion: 1, hito: false, avance: 0, noAntesDe: '', predecesoras: [] }, o || {});
  const listaFechas = (xs) => (xs || []).map((x) => fechaG(QG.aDia(x))).join(', ');
  const resumenCalendario = (g) => `Inicio ${g.inicio ? fechaG(QG.aDia(g.inicio)) : 'hoy'} · ${(g.calendario || 'habiles') === 'corridos' ? 'días corridos' : 'días hábiles'}${(g.noLaborables || []).length ? ` · ${plural(g.noLaborables.length, 'día no laborable', 'días no laborables')}` : ''}`;

  // ---- Guardar, deshacer ----------------------------------------------------------------------
  let saveTimer = null;
  function guardarPronto() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(guardarYa, 350);
  }
  function guardarYa() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!state.carta) return;
    D.guardar(state.carta);
    if (!state.guardada) {
      state.guardada = true;
      history.replaceState(null, '', `#/c/${state.carta.uid}`);
    }
    pintarHist();
  }
  window.addEventListener('pagehide', () => { if (saveTimer) guardarYa(); });
  const foto = () => JSON.stringify({ nombre: state.carta.nombre, proyecto: state.carta.proyecto, gantt: state.carta.gantt });
  /* Antes de cambiar la carta: lo de ahora queda para Ctrl+Z. grupo: escribir en el mismo campo es un solo paso. */
  function antes(grupo) {
    const h = state.hist;
    if (grupo && h.grupo === grupo) return;
    h.undo.push(foto());
    if (h.undo.length > 100) h.undo.shift();
    h.redo = [];
    h.grupo = grupo || null;
  }
  function volver(desde, hacia) {
    const h = state.hist;
    if (!h[desde].length || !state.carta) return;
    h[hacia].push(foto());
    const x = JSON.parse(h[desde].pop());
    Object.assign(state.carta, { nombre: x.nombre, proyecto: x.proyecto, gantt: x.gantt });
    h.grupo = null;
    renderCarta();
    guardarPronto();
    toast(desde === 'undo' ? 'Deshecho' : 'Rehecho');
  }
  function pintarHist() {
    const u = $('[data-act="deshacer"]'), r = $('[data-act="rehacer"]');
    if (u) u.disabled = !state.hist.undo.length;
    if (r) r.disabled = !state.hist.redo.length;
  }

  // ---- Rutas ----------------------------------------------------------------------------------
  function route() {
    closePop();
    const dlg = $('#modal');
    if (dlg.open) dlg.close();
    if (saveTimer) guardarYa();
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'c' && parts[1]) {
      if (state.carta && state.carta.uid === parts[1] && $('.g-volver', app)) return;   // ya está abierta
      const c = D.get(parts[1]);
      if (c && !c.eliminado) return abrir(c, true);
      if (state.carta && state.carta.uid === parts[1]) return abrir(state.carta, state.guardada);
      toast('Esa Carta Gantt no está en este navegador.', true);
      return irA('#/');
    }
    if (parts[0] === 'proyecto' && parts[1]) {
      const c = D.deProyecto(parts[1]);
      if (c) { history.replaceState(null, '', `#/c/${c.uid}`); return abrir(c, true); }
      const p = D.proyecto(parts[1]);
      if (!p) {
        state.aviso = 'Ese proyecto del Formulador no está en este navegador ni en la carpeta del equipo (si la conectas, aparece).';
        return irA('#/');
      }
      return abrir(D.nueva({ proyecto: D.fotoProyecto(p) }), false);
    }
    state.carta = null;
    renderLista();
  }
  function irA(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }
  function abrir(c, guardada) {
    if (!state.carta || state.carta.uid !== c.uid) state.hist = { undo: [], redo: [], grupo: null };
    state.carta = c;
    state.guardada = guardada;
    renderCarta();
  }

  // ---- La carpeta del equipo ------------------------------------------------------------------
  function lineaCarpeta() {
    const i = D.info();
    if (!i.disponible) return '<span>Este navegador no puede abrir la carpeta del equipo: las cartas quedan solo aquí. Usa <b>Chrome o Edge de escritorio</b> para compartirlas.</span>';
    if (i.sinCarpeta) return `<span>Conecta la <b>carpeta del equipo</b> para compartir las cartas y elegir los proyectos que formuló el equipo.</span><button type="button" class="btn btn-sm" data-act="carpeta">${ICON.folder}Conectar la carpeta</button>`;
    if (i.sinPermiso) return `<span>Da el permiso de esta sesión para usar la <b>carpeta del equipo</b>.</span><button type="button" class="btn btn-sm" data-act="carpeta">${ICON.folder}Dar permiso</button>`;
    if (i.error) return `<span class="af-aviso">No se pudo leer la carpeta del equipo: ${esc(i.error)}</span><button type="button" class="btn btn-sm" data-act="carpeta">Reintentar</button>`;
    if (i.sincronizando) return '<span>Revisando la carpeta del equipo…</span>';
    return `<span>${ICON.folder}Compartidas con el equipo por la carpeta de intercambio${i.pendientes ? ` · ${plural(i.pendientes, 'cambio')} por subir` : i.ultima ? ' · al día' : ''}.</span>`;
  }
  function pintarCarpeta() { pintar($('#g-carpeta'), lineaCarpeta()); }

  // ---- Lista de cartas ------------------------------------------------------------------------
  function resumenDe(c) {
    if (!c.gantt.tareas.length) return null;
    try { const r = QG.calcular(c.gantt, D.hoy()); return { r, avance: D.avanceDe(r) }; } catch (e) { return null; }
  }
  function renderLista() {
    document.title = 'Cartas Gantt — QUEMPIN';
    const todas = D.all().slice().sort((a, b) => String(b.modificado || '').localeCompare(String(a.modificado || '')));
    const eliminadas = D.papelera();
    const aviso = state.aviso;
    state.aviso = '';
    app.innerHTML = `<div class="viz-container page g-pagina">
      <div class="page-head">
        <div>
          <h2>Cartas Gantt</h2>
          <p>El programa de trabajo de cada proyecto: tareas, hitos, dependencias y ruta crítica, en PDF y Excel.</p>
        </div>
        ${todas.length ? `<div class="actions"><button class="btn btn-primario" data-act="nueva">${ICON.plus}Nueva Carta Gantt</button></div>` : ''}
      </div>
      ${aviso ? `<div class="nota" role="status"><span>${esc(aviso)}</span></div>` : ''}
      <p class="g-carpeta" id="g-carpeta"></p>
      ${todas.length ? `
        <div class="viz-filterbar"><div class="viz-filtergrid">
          <div class="viz-field span-6"><label for="g-buscar">Buscar</label>
            <input type="search" id="g-buscar" class="${state.q ? 'is-set' : ''}" placeholder="Nombre, código, título o cliente" value="${esc(state.q)}" autocomplete="off"></div>
        </div></div>
        <div class="tabla-contenedor">
          <table class="tbl tbl-apilable tbl-cartas">
            <thead><tr><th>Carta</th><th>Proyecto del Formulador</th><th class="num">Tareas</th><th>Inicio</th><th>Término</th><th class="num">Plazo</th><th class="num">Avance</th><th>Modificada</th><th><span class="visualmente-oculto">Acciones</span></th></tr></thead>
            <tbody id="g-lista"></tbody>
          </table>
        </div>` : `<div class="hub-grid">
          <article class="hub-card">
            <div class="hub-card-cabecera"><div class="icon" aria-hidden="true">${ICON.gantt}</div><h3>Nueva Carta Gantt</h3></div>
            <p class="desc">Elige un proyecto del Formulador para crear las tareas desde sus partidas, o parte con una carta suelta.</p>
            <button class="btn btn-primario" data-act="nueva">Crear Carta Gantt →</button>
          </article>
        </div>`}
      ${eliminadas.length ? `<details class="panel plegable g-eliminadas" data-open-key="g-eliminadas" ${abiertos.has('g-eliminadas') ? 'open' : ''}>
        <summary><span class="pl-t"><span class="seccion-titulo">Eliminadas</span><span class="pl-res">${plural(eliminadas.length, 'carta')}</span></span><span class="pl-accion" aria-hidden="true"></span></summary>
        <div class="pl-cuerpo"><ul class="g-papelera">${eliminadas.map((c) => `<li><span><b>${esc(titulo(c))}</b>${c.proyecto ? ` · ${esc(identProyecto(c.proyecto))}` : ''} · eliminada el ${esc(fechaHora(c.eliminado))}</span>
          <button type="button" class="btn btn-sm" data-act="restaurar" data-uid="${esc(c.uid)}">${ICON.restore}Restaurar</button></li>`).join('')}</ul></div>
      </details>` : ''}
    </div>`;
    pintarCarpeta();
    pintarFilas();
  }
  function pintarFilas() {
    const tb = $('#g-lista');
    if (!tb) return;
    const q = norm(state.q.trim());
    const lista = D.all().slice().sort((a, b) => String(b.modificado || '').localeCompare(String(a.modificado || '')))
      .filter((c) => !q || norm([c.nombre, c.proyecto && c.proyecto.codigo, c.proyecto && c.proyecto.titulo, c.proyecto && c.proyecto.cliente].join(' ')).includes(q));
    pintar(tb, lista.length ? lista.map((c) => {
      const s = resumenDe(c);
      const pr = datosProyecto(c);
      return `<tr data-abrir="${esc(c.uid)}" tabindex="0">
        <td data-label="Carta"><b>${esc(titulo(c))}</b></td>
        <td data-label="Proyecto">${pr ? `<span class="code-badge">${esc(identProyecto(pr))}</span> ${esc(pr.cliente || '')}` : '<span class="muted">Carta suelta</span>'}</td>
        <td data-label="Tareas" class="num">${c.gantt.tareas.length}</td>
        <td data-label="Inicio">${s ? esc(fechaG(s.r.inicio)) : '—'}</td>
        <td data-label="Término">${s ? esc(fechaG(s.r.termino)) : '—'}</td>
        <td data-label="Plazo" class="num">${s ? `${s.r.plazoLaborable} ${s.r.calendario.habiles ? 'd háb.' : 'd'}` : '—'}</td>
        <td data-label="Avance" class="num">${s ? `${s.avance} %` : '—'}</td>
        <td data-label="Modificada" class="small">${esc(fechaHora(c.modificado))}${c.modificadoPor ? ` · ${esc(c.modificadoPor)}` : ''}</td>
        <td class="cell-actions"><button type="button" class="icon-btn" data-menu="carta" data-uid="${esc(c.uid)}" aria-haspopup="menu" aria-expanded="false" aria-label="Acciones de ${esc(titulo(c))}">${ICON.more}</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="muted">Ninguna carta coincide con la búsqueda.</td></tr>');
  }

  /* Elegir un proyecto del Formulador (o ninguno: carta suelta). Devuelve 'p:<uid>', 'suelta' o null. */
  async function elegirProyecto(titulo, actual) {
    const ps = D.proyectosFormulador();
    const fila = (p) => {
      const c = D.deProyecto(p.uid);
      const yo = actual && actual === p.uid;
      return `<button class="g-pfila ${yo ? 'sel' : ''}" value="p:${esc(p.uid)}" data-q="${esc(norm([p.codigo, p.titulo, p.cliente, p.responsable].join(' ')))}">
        <span class="g-pfila-t"><span class="code-badge">${esc(identProyecto(p))}</span> ${esc(p.titulo || 'Sin título')}</span>
        <span class="g-pfila-d">${esc([p.cliente, p.responsable ? `Responsable ${p.responsable}` : '', p.estado].filter(Boolean).join(' · '))}${yo ? ' · el de ahora' : c ? ' · ya tiene su Carta Gantt' : ''}</span>
      </button>`;
    };
    const i = D.info();
    const sinCarpeta = i.disponible && (i.sinCarpeta || i.sinPermiso);
    return ask({
      title: titulo, wide: true,
      body: `<p class="small">Con un proyecto, las tareas se pueden crear desde sus partidas y la carta lleva su código. ${sinCarpeta ? 'Conecta la carpeta del equipo para ver también los que formularon tus colegas.' : ''}</p>
        ${ps.length ? `<div class="campo"><label for="g-pbuscar">Buscar proyecto</label><input class="input" type="search" id="g-pbuscar" placeholder="Código, título, cliente o responsable" autocomplete="off"></div>
        <div class="g-plista" id="g-plista">${ps.map(fila).join('')}<p class="muted small" id="g-pnada" hidden>Ningún proyecto coincide.</p></div>`
          : '<p class="muted">Todavía no hay proyectos del Formulador en este navegador.</p>'}
        <p class="g-psuelta"><button class="btn" value="suelta">${ICON.gantt}Sin proyecto: carta suelta, con nombre propio</button></p>`,
      buttons: [{ label: 'Cancelar', value: '' }],
      alAbrir: (dlg) => {
        const b = $('#g-pbuscar', dlg);
        if (!b) return;
        // Enter en la búsqueda no elige el primer proyecto de la lista
        b.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
        b.addEventListener('input', () => {
          const q = norm(b.value.trim());
          let n = 0;
          $$('.g-pfila', dlg).forEach((f) => { f.hidden = !!q && !f.dataset.q.includes(q); if (!f.hidden) n++; });
          $('#g-pnada', dlg).hidden = n > 0;
        });
      }
    });
  }
  async function nuevaCarta() {
    const v = await elegirProyecto('Nueva Carta Gantt');
    if (!v) return;
    if (v === 'suelta') {
      const c = D.nueva({});
      abiertos.add('g-cfg');
      location.hash = `#/c/${c.uid}`;
      abrir(c, false);
      const n = $('#g-nombre');
      if (n) n.focus();
      return;
    }
    const puid = v.slice(2);
    const ya = D.deProyecto(puid);
    if (ya) { toast('Ese proyecto ya tiene su Carta Gantt: se abre.'); location.hash = `#/c/${ya.uid}`; return; }
    location.hash = `#/proyecto/${encodeURIComponent(puid)}`;
  }

  // ---- Una carta ------------------------------------------------------------------------------
  function renderCarta() {
    const c = state.carta;
    const g = c.gantt;
    const pr = datosProyecto(c);
    const pf = proyectoDe(c);
    const partidas = pf ? D.partidasDe(pf) : [];
    const cods = new Map(partidas.map((pt) => [pt.uid, pt]));
    const sinTarea = partidas.filter((pt) => !g.tareas.some((t) => t.partida === pt.uid)).length;
    const nums = numeros(g);
    document.title = `${titulo(c)} — Carta Gantt QUEMPIN`;
    const ayuda = `<p><b>Crear desde las partidas</b> agrega una tarea por partida del proyecto del Formulador, una tras otra, con la duración que sugiere su mano de obra (días por unidad × cantidad, con una cuadrilla), más un hito de inicio y uno de entrega. Todo se puede cambiar.</p>
      <p><b>Predecesoras</b>: el N° de las tareas que van antes, separados por coma. <b>2</b> = empieza cuando termina la 2; <b>2CC</b> = empieza cuando empieza la 2; <b>2FF</b> = termina cuando termina la 2. <b>+n</b> o <b>−n</b> suma o resta días: <b>2+3</b> empieza tres días después de que termina la 2.</p>
      <p><b>No antes de</b> fija la fecha más temprana de una tarea. La <b>ruta crítica</b>, en naranja, son las tareas sin holgura: si una se atrasa, se atrasa el término del proyecto.</p>
      <p>Los días son <b>hábiles</b> (lunes a viernes, sin los días no laborables que indiques) o <b>corridos</b>, según el calendario. Ctrl+Z deshace y Ctrl+Y rehace.</p>`;
    const opcCal = [{ v: 'habiles', l: 'Días hábiles', tip: 'Lunes a viernes, sin los días no laborables' }, { v: 'corridos', l: 'Días corridos', tip: 'Todos los días cuentan' }]
      .map((o) => Object.assign(o, { checked: (g.calendario || 'habiles') === o.v }));
    const escala = g.escala || 'auto';
    const opcEscala = [['auto', 'Auto', 'Según el plazo'], ['dias', 'Días'], ['semanas', 'Semanas'], ['meses', 'Meses']]
      .map(([v, l, t]) => ({ v, l, tip: t, checked: escala === v }));
    const enlaceF = pr ? `../#/p/${encodeURIComponent(pr.uid)}/ficha` : '';
    const cuerpoCfg = `<div class="fila-campos">
        <div class="campo"><label for="g-nombre">Nombre de la carta ${pr ? '<span class="opc">(opcional)</span>' : ''}</label><input class="input" id="g-nombre" data-c="nombre" value="${esc(c.nombre)}" placeholder="${esc(pr ? pr.titulo || 'Título del proyecto' : 'Ej.: Mantención planta Quintero')}" autocomplete="off">
          <span class="hint">${pr ? 'Sin nombre, la carta lleva el título del proyecto.' : 'Una carta suelta se reconoce por su nombre.'}</span></div>
        <div class="campo"><span class="lbl">Proyecto del Formulador</span>
          <div class="g-vinculo">${pr ? `<span class="code-badge">${esc(identProyecto(pr))}</span> <span>${esc(pr.titulo || '')}</span>` : '<span class="muted">Ninguno: carta suelta</span>'}
            <button type="button" class="btn btn-sm" data-act="vincular">${pr ? 'Cambiar…' : 'Elegir…'}</button></div>
          <span class="hint">${pr && !pf ? 'El proyecto no está en este navegador ni en la carpeta del equipo: no se pueden crear tareas desde sus partidas.' : 'Las tareas creadas desde las partidas llevan su código.'}</span></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="g-inicio">Fecha de inicio</label><input class="input" type="date" id="g-inicio" data-g="inicio" value="${esc(g.inicio || '')}">
          <span class="hint">${g.inicio ? 'El primer día de trabajo.' : `Sin fecha, el programa parte hoy (${esc(fechaG(QG.aDia(D.hoy())))}).`}</span></div>
        <div class="campo"><span class="lbl">Calendario</span>${seg('g-cal', opcCal, 'data-g="calendario"', 'Calendario')}</div>
      </div>
      <div class="campo"><label for="g-nolab">Días no laborables <span class="opc">(opcional)</span></label><input class="input" id="g-nolab" data-g="noLaborables" value="${esc(listaFechas(g.noLaborables))}" placeholder="Ej.: 18-09-2026, 19-09-2026" autocomplete="off">
        <span class="hint">Feriados o días sin faena, separados por coma. Solo cuentan con el calendario de días hábiles.</span></div>`;
    const rows = g.tareas.map((t, i) => {
      const n = i + 1;
      const pt = t.partida ? cods.get(t.partida) : null;
      return `<tr data-row="${t.uid}" class="${t.hito ? 'g-hito' : ''}">
        <td class="code"><span class="g-num">${n}</span></td>
        <td data-label="Tarea"><div class="g-tarea">${t.hito ? '<span class="g-rombo" aria-hidden="true"></span>' : ''}<input class="ci desc" data-g="nombre" data-gt="${t.uid}" value="${esc(t.nombre || '')}" aria-label="Nombre de la tarea ${n}" placeholder="${t.hito ? 'Ej.: Entrega de la obra' : 'Ej.: Montaje de la caldera'}">${pt ? `<span class="pcode" data-tip="<b>Desde la partida ${esc(pt.code)}</b>${esc(pt.descripcion || '')}">${esc(pt.code)}</span>` : ''}</div></td>
        <td data-label="Responsable" class="g-opc"><input class="ci" data-g="responsable" data-gt="${t.uid}" value="${esc(t.responsable || '')}" aria-label="Responsable de la tarea ${n}"></td>
        <td data-label="Días" class="num tercio">${t.hito ? '<span class="g-es-hito">hito</span>' : `<input class="ci num w-xs" type="number" min="1" step="1" inputmode="numeric" data-g="duracion" data-gt="${t.uid}" value="${esc(t.duracion)}" aria-label="Duración de la tarea ${n}, en días">`}</td>
        <td data-label="Predecesoras" class="tercio"><input class="ci w-sm" data-g="predecesoras" data-gt="${t.uid}" value="${esc(QG.textoPredecesoras(t, nums))}" placeholder="—" autocomplete="off" aria-label="Predecesoras de la tarea ${n}" data-tip="<b>Predecesoras</b>N° de las tareas que van antes: 2, 3CC, 4+2"></td>
        <td data-label="No antes de" class="g-opc tercio"><input class="ci" type="date" data-g="noAntesDe" data-gt="${t.uid}" value="${esc(t.noAntesDe || '')}" aria-label="Fecha más temprana de la tarea ${n}"></td>
        <td data-label="Avance %" class="num g-opc tercio">${t.hito ? '' : `<input class="ci num w-xs" type="number" min="0" max="100" step="5" inputmode="numeric" data-g="avance" data-gt="${t.uid}" value="${esc(t.avance || 0)}" aria-label="Avance de la tarea ${n}, en porcentaje">`}</td>
        <td data-label="Inicio" class="calc tercio" data-gc="ini:${t.uid}"></td>
        <td data-label="Término" class="calc tercio" data-gc="fin:${t.uid}"></td>
        <td class="cell-actions"><button type="button" class="icon-btn" data-menu="tarea" data-uid="${t.uid}" aria-haspopup="menu" aria-expanded="false" aria-label="Acciones de la tarea ${n}" title="Acciones de la tarea ${n}">${ICON.more}</button></td>
      </tr>`;
    }).join('');
    const vacio = `<div class="g-vacio">
        <p><b>Todavía no hay tareas.</b> ${partidas.length ? `Puedes partir de las ${plural(partidas.length, 'partida')} del proyecto o escribir las tareas a mano.` : pr ? 'El proyecto no tiene partidas a la vista: escribe las tareas a mano.' : 'Escribe las tareas a mano, o elige un proyecto del Formulador para crearlas desde sus partidas.'}</p>
        <div class="actions">${partidas.length ? `<button type="button" class="btn btn-primario" data-act="g-partidas">${ICON.layers}Crear desde las partidas</button>` : ''}
          <button type="button" class="btn" data-act="g-tarea">${ICON.plus}Agregar una tarea</button></div>
      </div>`;
    app.innerHTML = `<div class="viz-container page g-pagina">
      <a class="g-volver" href="#/">${ICON.back}Todas las cartas</a>
      <div class="paso-head">
        <div class="paso-head-txt">
          <h3 class="paso-titulo"><span class="paso-num">${pr ? esc(identProyecto(pr)) : 'Carta suelta'}</span><span id="g-titulo">${esc(titulo(c))}</span></h3>
          <p class="paso-proposito">${pr ? esc([pr.cliente, pr.responsable ? `Responsable ${pr.responsable}` : ''].filter(Boolean).join(' · ')) || 'Programa de trabajo del proyecto' : 'Programa de trabajo, sin proyecto del Formulador'}${state.guardada ? '' : ' · <span class="muted">se guarda con el primer cambio</span>'}</p>
        </div>
        <div class="g-cab-acc">
          <button type="button" class="icon-btn" data-act="deshacer" aria-label="Deshacer (Ctrl+Z)" title="Deshacer (Ctrl+Z)">${ICON.deshacer}</button>
          <button type="button" class="icon-btn" data-act="rehacer" aria-label="Rehacer (Ctrl+Y)" title="Rehacer (Ctrl+Y)">${ICON.rehacer}</button>
          ${enlaceF ? `<a class="btn btn-sm" href="${esc(enlaceF)}">${ICON.open}Abrir en el Formulador</a>` : ''}
          <details class="ayuda no-print"><summary><span>Cómo se usa</span></summary><div class="ayuda-body">${ayuda}</div></details>
        </div>
      </div>
      <p class="g-carpeta" id="g-carpeta"></p>
      ${plegable('g-cfg', 'Carta y calendario', esc(resumenCalendario(g)), cuerpoCfg)}
      ${g.tareas.length ? `<div id="g-errores"></div>
      <div id="g-resumen" class="kpis g-resumen" role="status"></div>
      <div class="g-lamina-cab">
        <span class="seccion-titulo">Lámina</span>
        <div class="g-lamina-ctl">${seg('g-escala', opcEscala, 'data-g="escala"', 'Escala de la lámina', 'g-escala')}
          <button type="button" class="btn btn-primario btn-sm" data-act="g-pdf">${ICON.download}Descargar PDF</button>
          <button type="button" class="btn btn-sm" data-act="g-excel">${ICON.sheet}Excel</button></div>
      </div>
      <div class="gantt-lienzo" id="g-lienzo"></div>
      <div class="g-leyenda small" id="g-leyenda">
        <span><i class="gl-barra"></i>Tarea</span><span><i class="gl-barra gl-critica"></i>Ruta crítica</span>
        <span><i class="gl-barra gl-avance"></i>Avance</span><span><i class="gl-holgura"></i>Holgura</span>
        <span><i class="gl-rombo"></i>Hito</span><span><i class="gl-hoy"></i>Hoy</span>
        <span class="muted gl-nota">Pasa el mouse por una barra para ver el detalle; con un clic vas a su fila.</span>
      </div>
      <div class="tbl-toolbar g-toolbar">
        <div class="left"><span class="seccion-titulo">Tareas <span class="tn">${plural(g.tareas.length, 'fila')}</span></span></div>
        <div class="right">
          ${sinTarea ? `<button type="button" class="btn btn-sm" data-act="g-partidas" data-tip="<b>Desde las partidas</b>Agrega una tarea por cada partida que todavía no tiene la suya">${ICON.layers}Desde las partidas (${sinTarea})</button>` : ''}
          <button type="button" class="btn btn-sm" data-act="g-hito">${ICON.plus}Hito</button>
          <button type="button" class="btn btn-sm" data-act="g-tarea">${ICON.plus}Tarea</button>
        </div>
      </div>
      <div class="tabla-contenedor">
        <table class="tbl tbl-apilable tbl-gantt">
          <colgroup><col class="c-n"><col><col class="c-resp g-opc"><col class="c-dias"><col class="c-pred"><col class="c-nad g-opc"><col class="c-av g-opc"><col class="c-fecha"><col class="c-fecha"><col class="c-acc"></colgroup>
          <thead><tr><th>N°</th><th>Tarea</th><th class="g-opc">Responsable</th><th class="num">Días</th><th>Predecesoras</th><th class="g-opc">No antes de</th><th class="num g-opc">Avance</th><th>Inicio</th><th>Término</th><th><span class="visualmente-oculto">Acciones</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="small muted g-pie-borrar"><span>Enter en el nombre baja a la tarea siguiente; en la última, agrega una nueva.</span><button type="button" class="link-btn" data-act="g-borrar">Borrar todas las tareas</button></p>` : vacio}
      ${state.guardada ? `<p class="small muted g-pie-carta">Guardada el ${esc(fechaHora(c.modificado))}${c.modificadoPor ? ` por ${esc(c.modificadoPor)}` : ''}.</p>` : ''}
    </div>`;
    pintarCarpeta();
    pintarHist();
    pintarCalculo();
  }

  /* Lo calculado (fechas, resumen, ruta crítica y la lámina) sin redibujar los campos */
  function pintarCalculo() {
    const c = state.carta;
    if (!c) return;
    const g = c.gantt;
    const res = programa();
    const nums = numeros(g);
    const porUid = new Map(res.tareas.map((t) => [t.uid, t]));
    res.tareas.forEach((t) => {
      texto($(`[data-gc="ini:${t.uid}"]`, app), fechaG(t.dIni));
      texto($(`[data-gc="fin:${t.uid}"]`, app), fechaG(t.dFin));
      const tr = $(`tr[data-row="${t.uid}"]`, app);
      if (tr) tr.classList.toggle('g-critica', t.critica);
      const inp = $(`[data-g="predecesoras"][data-gt="${t.uid}"]`, app);
      if (inp) {
        const ds = (t.predecesoras || []).filter((d) => porUid.has(d.uid));
        const tp = ds.length
          ? `<b>Va después de</b>${ds.map((d) => { const x = porUid.get(d.uid); const des = Number(d.desfase) || 0; return `${nums.get(d.uid)} · ${esc(x.nombre || 'Sin nombre')} (${QG.NOMBRE_TIPO[d.tipo] || QG.NOMBRE_TIPO.FC}${des ? `, ${des > 0 ? '+' : '−'}${Math.abs(des)} d` : ''})`; }).join('<br>')}<div class="tt-hint">2 · 3CC · 4FF · 2+3</div>`
          : '<b>Predecesoras</b>N° de las tareas que van antes: 2, 3CC, 4+2<div class="tt-hint">Vacío: parte al inicio del proyecto</div>';
        if (inp.dataset.tip !== tp) inp.dataset.tip = tp;
      }
    });
    texto($('#res-g-cfg'), resumenCalendario(g));
    texto($('#g-titulo'), titulo(c));
    const tipoDias = res.calendario.habiles ? 'días hábiles' : 'días corridos';
    const conDur = res.tareas.filter((t) => !t.hito);
    const durTotal = conDur.reduce((a, t) => a + t.dur, 0);
    const avance = D.avanceDe(res);
    const crit = res.criticas;
    pintar($('#g-resumen'), res.tareas.length ? [
      kpiTop('Inicio', esc(fechaG(res.inicio)), g.inicio ? 'Primer día de trabajo' : 'Sin fecha fija: parte hoy'),
      kpiTop('Término', esc(fechaG(res.termino)), 'Entrega de la obra', 'accent'),
      kpiTop('Plazo', `${res.plazoLaborable} <span class="unit">${tipoDias}</span>`, res.calendario.habiles ? `${res.plazoCorrido} días corridos` : 'Todos los días cuentan'),
      kpiTop('Ruta crítica', `${crit.length} <span class="unit">de ${res.tareas.length}</span>`, crit.length ? `${crit.length === 1 ? 'Tarea' : 'Tareas'} ${crit.join(', ')}` : '—', '', 'Las tareas sin holgura: si una se atrasa, se atrasa el término del proyecto.'),
      kpiTop('Avance', `${avance} <span class="unit">%</span>`, durTotal ? 'Ponderado por la duración' : 'Solo hitos', avance >= 100 ? 'sem-ok' : '')
    ].join('') : '');
    pintar($('#g-errores'), res.errores.length ? `<div class="nota" role="alert"><span>${res.errores.map(esc).join('<br>')}</span></div>` : '');
    const cont = $('#g-lienzo');
    if (!cont) return;
    if (!res.tareas.length) { pintar(cont, ''); return; }
    const escala = QG.escalaDe(g, res);
    const auto = $('input[name="g-escala"][value="auto"]', app);
    if (auto) auto.closest('label').dataset.tip = `<b>Escala automática</b>Ahora en ${{ dias: 'días', semanas: 'semanas', meses: 'meses' }[escala]}, según el plazo`;
    const ancho = Math.max(640, Math.floor(cont.clientWidth) - 2);
    const hoy = QG.aDia(D.hoy());
    const ley = (cls, ver) => { const i = $(`#g-leyenda .${cls}`); if (i) i.parentElement.hidden = !ver; };
    ley('gl-hoy', hoy >= res.inicio && hoy <= res.termino + 1);
    ley('gl-holgura', res.tareas.some((t) => !t.hito && !t.critica && t.holgura > 0));
    ley('gl-avance', conDur.some((t) => Number(t.avance) > 0));
    ley('gl-rombo', res.tareas.some((t) => t.hito));
    pintar(cont, QG.svg(QG.dibujo(res, res.tareas, {
      ancho, escala, columnas: false, filaAlto: 26, cabeceraAlto: 38, size: 11, pantalla: true, etiquetas: true, hoy,
      nombreAncho: Math.round(Math.max(170, Math.min(280, ancho * 0.24)))
    })));
    if (enfoque) marcar(enfoque);
  }
  /* Une la fila de la tabla con su barra en la lámina: al pasar el mouse por una se marca la otra */
  let enfoque = null;
  function marcar(uid) {
    $$('.g-banda.on, .tbl-gantt tr.g-par', app).forEach((x) => x.classList.remove('on', 'g-par'));
    enfoque = uid || null;
    if (!enfoque) return;
    const b = $(`#g-lienzo .g-banda[data-uid="${enfoque}"]`);
    if (b) b.classList.add('on');
    const tr = $(`.tbl-gantt tr[data-row="${enfoque}"]`, app);
    if (tr) tr.classList.add('g-par');
  }
  document.addEventListener('mouseover', (e) => {
    if (!state.carta || !e.target.closest) return;
    const el = e.target.closest('#g-lienzo [data-uid], .tbl-gantt tr[data-row]');
    const uid = el ? (el.dataset.uid || el.dataset.row) : null;
    if (uid !== enfoque) marcar(uid);
  });
  let alRedimensionar = null;
  window.addEventListener('resize', () => {
    if (!state.carta) return;
    clearTimeout(alRedimensionar);
    alRedimensionar = setTimeout(pintarCalculo, 120);
  });

  // ---- Edición --------------------------------------------------------------------------------
  /* Un campo de la carta. Devuelve true si cambió algo (lo de antes ya quedó para Ctrl+Z). */
  function editar(el, e) {
    const c = state.carta;
    const g = c.gantt;
    const grupo = `${el.dataset.g || el.dataset.c}:${el.dataset.gt || ''}`;
    if (el.dataset.c === 'nombre') {
      if (c.nombre === el.value) return false;
      antes(grupo);
      c.nombre = el.value;
      return true;
    }
    const k = el.dataset.g, uid = el.dataset.gt;
    if (!uid) {
      if (k === 'noLaborables') {
        if (e.type !== 'change') return false;
        const fechas = [], malas = [];
        el.value.split(/[,;\s]+/).filter(Boolean).forEach((x) => { const f = QG.leerFecha(x); if (f) fechas.push(f); else malas.push(x); });
        const nuevas = [...new Set(fechas)].sort();
        if (malas.length) toast(`No se entiende ${malas.map((x) => `«${x}»`).join(', ')}: escribe las fechas como 18-09-2026.`, true);
        el.value = listaFechas(nuevas);
        if (JSON.stringify(nuevas) === JSON.stringify(g.noLaborables || [])) return false;
        antes();
        g.noLaborables = nuevas;
        return true;
      }
      const v = k === 'calendario' ? (el.value === 'corridos' ? 'corridos' : 'habiles') : el.value || '';
      if (k === 'escala' && !['auto', 'dias', 'semanas', 'meses'].includes(v)) return false;
      if (!['inicio', 'calendario', 'escala'].includes(k) || g[k] === v) return false;
      antes(grupo);
      g[k] = v;
      return true;
    }
    const tarea = g.tareas.find((x) => x.uid === uid);
    if (!tarea) return false;
    if (k === 'predecesoras') {
      if (e.type !== 'change') return false;
      const r = QG.leerPredecesoras(el.value, g.tareas, uid);
      if (r.errores.length) toast(r.errores.join(' '), true);
      const previas = JSON.stringify(tarea.predecesoras || []);
      el.value = QG.textoPredecesoras(Object.assign({}, tarea, { predecesoras: r.lista }), numeros(g));
      if (previas === JSON.stringify(r.lista)) return false;
      antes();
      tarea.predecesoras = r.lista;
      return true;
    }
    if (k === 'duracion' || k === 'avance') {
      const x = parseFloat(el.value);
      const valido = k === 'duracion' ? x >= 1 : Number.isFinite(x);
      if (!valido) { if (e.type === 'change') el.value = tarea[k] || (k === 'duracion' ? 1 : 0); return false; }
      const v = k === 'duracion' ? Math.min(3650, Math.round(x)) : Math.max(0, Math.min(100, Math.round(x)));
      if (e.type === 'change' && String(v) !== el.value) el.value = v;
      if (tarea[k] === v) return false;
      antes(grupo);
      tarea[k] = v;
      return true;
    }
    if (!['nombre', 'responsable', 'noAntesDe'].includes(k) || tarea[k] === el.value) return false;
    antes(grupo);
    tarea[k] = el.value;
    return true;
  }
  function onEdit(e) {
    const el = e.target;
    if (el.id === 'g-buscar') { state.q = el.value; el.classList.toggle('is-set', !!el.value); pintarFilas(); return; }
    if (!state.carta || !(el.dataset && (el.dataset.g || el.dataset.c))) return;
    if (el.type === 'radio' && e.type === 'input') return;   // los radios se procesan en 'change'
    if (e.type === 'change') state.hist.grupo = null;       // lo que se escriba después es otro paso de Deshacer
    if (!editar(el, e)) return;
    pintarCalculo();
    pintarHist();
    guardarPronto();
  }
  app.addEventListener('input', onEdit);
  app.addEventListener('change', onEdit);

  /* Una tarea por partida que todavía no tiene la suya, una tras otra, con hito de inicio y de entrega */
  function desdePartidas() {
    const c = state.carta;
    const p = proyectoDe(c);
    if (!p) { toast('El proyecto no está en este navegador ni en la carpeta del equipo.', true); return; }
    const g = c.gantt;
    const con = new Set(g.tareas.map((t) => t.partida).filter(Boolean));
    const nuevas = D.partidasDe(p).filter((pt) => !con.has(pt.uid));
    if (!nuevas.length) { toast('Todas las partidas ya tienen su tarea.'); return; }
    antes();
    const ts = g.tareas;
    const esEntrega = (t) => t.hito && /entrega|t[ée]rmino|recepci/i.test(t.nombre || '');
    if (!ts.length) ts.push(nuevaTarea({ nombre: 'Inicio de obras', hito: true }));
    const iEntrega = ts.findIndex(esEntrega);
    const previas = iEntrega >= 0 ? ts.slice(0, iEntrega) : ts;
    let previa = [...previas].reverse().find((t) => !t.hito) || [...previas].reverse()[0] || null;
    const agregadas = nuevas.map((pt) => {
      const t = nuevaTarea({
        nombre: pt.descripcion || (pt.base ? 'Partida base' : pt.code), partida: pt.uid,
        duracion: QG.duracionSugerida(pt, p.manoObra),
        predecesoras: previa ? [{ uid: previa.uid, tipo: 'FC', desfase: 0 }] : []
      });
      previa = t;
      return t;
    });
    if (iEntrega >= 0) {
      ts.splice(iEntrega, 0, ...agregadas);
      ts[iEntrega + agregadas.length].predecesoras = [{ uid: previa.uid, tipo: 'FC', desfase: 0 }];
    } else {
      ts.push(...agregadas, nuevaTarea({ nombre: 'Entrega y recepción', hito: true, predecesoras: [{ uid: previa.uid, tipo: 'FC', desfase: 0 }] }));
    }
    renderCarta();
    guardarPronto();
    toast(`${plural(agregadas.length, 'tarea')} desde las partidas, una tras otra, con la duración que sugiere su mano de obra. Ajusta lo que haga falta.`);
  }
  function agregarTarea(hito) {
    const g = state.carta.gantt;
    antes();
    const ultima = g.tareas[g.tareas.length - 1];
    const t = nuevaTarea({ hito: !!hito, predecesoras: ultima ? [{ uid: ultima.uid, tipo: 'FC', desfase: 0 }] : [] });
    g.tareas.push(t);
    renderCarta();
    const n = $(`[data-g="nombre"][data-gt="${t.uid}"]`);
    if (n) n.focus();
    flashRow(t.uid);
    guardarPronto();
  }
  function accionTarea(act, uid) {
    const g = state.carta.gantt;
    const i = g.tareas.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    const t = g.tareas[i];
    let foco = null;
    antes();
    if (act === 'mover-arriba' || act === 'mover-abajo') {
      const j = i + (act === 'mover-arriba' ? -1 : 1);
      if (j < 0 || j >= g.tareas.length) return;
      g.tareas.splice(j, 0, g.tareas.splice(i, 1)[0]);
    } else if (act === 'duplicar') {
      const copia = nuevaTarea(Object.assign(JSON.parse(JSON.stringify(t)), { uid: D.uid(), nombre: `${t.nombre || 'Tarea'} (copia)`, partida: '' }));
      g.tareas.splice(i + 1, 0, copia);
      foco = copia.uid;
    } else if (act === 'tipo') {
      t.hito = !t.hito;
      if (!t.hito && !(t.duracion >= 1)) t.duracion = 1;
    } else {
      g.tareas.splice(i, 1);
      g.tareas.forEach((x) => { x.predecesoras = (x.predecesoras || []).filter((d) => d.uid !== t.uid); });
      toast(`Tarea ${i + 1} eliminada · Ctrl+Z la recupera`);
    }
    renderCarta();
    if (foco) { const n = $(`[data-g="nombre"][data-gt="${foco}"]`); if (n) n.focus(); }
    if (act !== 'quitar') flashRow(foco || t.uid);
    guardarPronto();
  }
  async function vincular() {
    const c = state.carta;
    const v = await elegirProyecto(c.proyecto ? 'Cambiar el proyecto de la carta' : 'Elegir el proyecto de la carta', c.proyecto && c.proyecto.uid);
    if (!v) return;
    if (v === 'suelta') {
      if (!c.proyecto) return;
      antes();
      if (!c.nombre) c.nombre = c.proyecto.titulo || c.proyecto.codigo || '';
      c.proyecto = null;
    } else {
      const p = D.proyecto(v.slice(2));
      if (!p || (c.proyecto && c.proyecto.uid === p.uid)) return;
      const otra = D.deProyecto(p.uid);
      if (otra && otra.uid !== c.uid) { toast('Ese proyecto ya tiene su propia Carta Gantt.', true); return; }
      antes();
      c.proyecto = D.fotoProyecto(p);
    }
    renderCarta();
    guardarPronto();
    toast(c.proyecto ? `Carta vinculada a ${identProyecto(c.proyecto)}.` : 'La carta quedó suelta, sin proyecto.');
  }

  // ---- PDF y Excel ----------------------------------------------------------------------------
  const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  function nombreArchivo(c) {
    const pr = datosProyecto(c);
    return pr ? `Carta Gantt ${pr.codigo || 'SIN-CODIGO'}_v${pr.version || 1}_${slug(c.nombre || pr.titulo)}` : `Carta Gantt ${slug(titulo(c)) || 'sin_nombre'}`;
  }
  function descargar(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  /* El logo oficial en JPEG con fondo blanco (el PDF lo incrusta tal cual) */
  function logoJpeg() {
    const L = window.QLogo;
    if (!L || !L.png) return Promise.resolve(null);
    return new Promise((listo) => {
      const img = new Image();
      img.onload = () => {
        try {
          const f = Math.min(1, 480 / img.naturalWidth);
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.naturalWidth * f); cv.height = Math.round(img.naturalHeight * f);
          const x = cv.getContext('2d');
          x.fillStyle = '#ffffff'; x.fillRect(0, 0, cv.width, cv.height);
          x.drawImage(img, 0, 0, cv.width, cv.height);
          const bin = atob(cv.toDataURL('image/jpeg', 0.92).split(',')[1]);
          const u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          listo({ jpeg: u, px: cv.width, py: cv.height });
        } catch (e) { listo(null); }
      };
      img.onerror = () => listo(null);
      img.src = 'data:image/png;base64,' + L.png;
    });
  }
  async function pdf() {
    const c = state.carta;
    const res = programa();
    if (!res.tareas.length) { toast('Agrega al menos una tarea antes de descargar el PDF.', true); return; }
    const pr = datosProyecto(c) || {};
    const papel = { gantt: c.gantt, codigo: pr.codigo || '', version: pr.version || 1, titulo: c.nombre || pr.titulo || titulo(c), cliente: pr.cliente || '', responsable: pr.responsable || '' };
    const bytes = QG.pdf(papel, res, await logoJpeg(), new Date());
    descargar(new Blob([bytes], { type: 'application/pdf' }), nombreArchivo(c) + '.pdf');
    toast('Carta Gantt descargada en PDF');
  }
  async function excel() {
    const c = state.carta;
    if (!c.gantt.tareas.length) { toast('Agrega al menos una tarea antes de descargar el Excel.', true); return; }
    toast('Generando Excel…');
    const pr = datosProyecto(c);
    const ident = pr ? `${identProyecto(pr)} · ${c.nombre || pr.titulo || 'Sin título'}` : titulo(c);
    try {
      const buf = await window.QGanttExcel.libro(c, {
        titulo: ident, ident, pie: pr ? identProyecto(pr) : titulo(c), hoy: D.hoy(),
        codigos: new Map(Array.from(codigosDe(c).values()).map((pt) => [pt.uid, pt.code]))
      });
      descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo(c) + '.xlsx');
      toast('Carta Gantt descargada en Excel');
    } catch (e) { toast(e.message || String(e), true); }
  }

  // ---- Clics y teclas -------------------------------------------------------------------------
  function menuCarta(btn) {
    const c = D.get(btn.dataset.uid);
    if (!c) return;
    openPop(btn, [
      { icon: ICON.open, title: 'Abrir', run: () => { location.hash = `#/c/${c.uid}`; } },
      { icon: ICON.copy, title: 'Duplicar', desc: 'Una copia suelta, para otra versión u otro proyecto', run: () => {
        const n = D.guardar(D.duplicar(c, { proyecto: null, nombre: `${titulo(c)} (copia)` }));
        toast('Carta duplicada: elige su proyecto en «Carta y calendario».');
        abiertos.add('g-cfg');
        location.hash = `#/c/${n.uid}`;
      } },
      { sep: true },
      { icon: ICON.trash, title: 'Eliminar', desc: 'Queda en «Eliminadas»: se puede restaurar', danger: true, run: async () => {
        const v = await ask({ title: 'Eliminar la Carta Gantt', body: `<p>«${esc(titulo(c))}» pasa a <b>Eliminadas</b>, abajo en la lista: se puede restaurar.</p>`, buttons: [{ label: 'Cancelar', value: '' }, { label: 'Eliminar', value: 'si', danger: true }] });
        if (v !== 'si') return;
        D.eliminar(c.uid);
        renderLista();
        toast('Carta eliminada');
      } }
    ]);
  }
  function menuTarea(btn) {
    const g = state.carta.gantt;
    const uid = btn.dataset.uid;
    const i = g.tareas.findIndex((x) => x.uid === uid);
    const t = g.tareas[i] || {};
    openPop(btn, [
      { icon: ICON.up, title: 'Subir', disabled: i <= 0, run: () => accionTarea('mover-arriba', uid) },
      { icon: ICON.down, title: 'Bajar', disabled: i >= g.tareas.length - 1, run: () => accionTarea('mover-abajo', uid) },
      { sep: true },
      { icon: ICON.copy, title: 'Duplicar', desc: 'Copia justo debajo, con las mismas predecesoras', run: () => accionTarea('duplicar', uid) },
      { icon: ICON.gantt, title: t.hito ? 'Convertir en tarea' : 'Convertir en hito', desc: t.hito ? 'Con duración de 1 día' : 'Un momento clave, sin duración (inicio, entrega…)', run: () => accionTarea('tipo', uid) },
      { sep: true },
      { icon: ICON.trash, title: 'Eliminar', desc: 'Las que dependen de ella pierden esa predecesora', danger: true, run: () => accionTarea('quitar', uid) }
    ]);
  }
  async function act(a, d) {
    switch (a) {
      case 'tema': cambiarTema(); break;
      case 'nueva': await nuevaCarta(); break;
      case 'restaurar': D.restaurar(d.uid); renderLista(); toast('Carta restaurada'); break;
      case 'carpeta':
        try { await D.activar(); toast('Carpeta del equipo conectada'); } catch (e) { if (e && e.name !== 'AbortError') toast(e.message || String(e), true); }
        if (state.carta) pintarCarpeta(); else renderLista();
        break;
      case 'vincular': await vincular(); break;
      case 'deshacer': volver('undo', 'redo'); break;
      case 'rehacer': volver('redo', 'undo'); break;
      case 'g-partidas': desdePartidas(); break;
      case 'g-tarea': agregarTarea(false); break;
      case 'g-hito': agregarTarea(true); break;
      case 'g-pdf': await pdf(); break;
      case 'g-excel': await excel(); break;
      case 'g-borrar': {
        const v = await ask({ title: 'Borrar todas las tareas', body: '<p>Se borran todas las tareas e hitos de esta carta. El calendario se queda.</p><p>Ctrl+Z lo deshace.</p>', buttons: [{ label: 'Cancelar', value: '' }, { label: 'Borrar', value: 'si', danger: true }] });
        if (v !== 'si') break;
        antes();
        state.carta.gantt.tareas = [];
        renderCarta();
        guardarPronto();
        break;
      }
      default: break;
    }
  }
  document.addEventListener('click', (e) => {
    const mb = e.target.closest('[data-menu]');
    if (mb) { if (P && P.anchor === mb) closePop(); else if (mb.dataset.menu === 'carta') menuCarta(mb); else menuTarea(mb); return; }
    const gb = e.target.closest('#g-lienzo [data-uid]');
    if (gb) { flashRow(gb.dataset.uid); const n = $(`[data-g="nombre"][data-gt="${gb.dataset.uid}"]`); if (n) n.focus({ preventScroll: true }); return; }
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled && !b.closest('#pop')) { act(b.dataset.act, b.dataset); return; }
    const tr = e.target.closest('tr[data-abrir]');
    if (tr && !e.target.closest('button, a, input')) location.hash = `#/c/${tr.dataset.abrir}`;
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && state.carta && !$('#modal').open && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
      const rehacer = e.key === 'y' || e.key === 'Y' || e.shiftKey;
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur && app.contains(document.activeElement)) {
        // Lo escrito en el campo cuenta antes de deshacer
        const a = document.activeElement;
        if (a.dataset && (a.dataset.g || a.dataset.c)) a.dispatchEvent(new Event('change', { bubbles: true }));
      }
      volver(rehacer ? 'redo' : 'undo', rehacer ? 'undo' : 'redo');
      return;
    }
    if (e.key === 'Enter' && el.matches && el.matches('tr[data-abrir]')) { location.hash = `#/c/${el.dataset.abrir}`; return; }
    if (e.key === 'Enter' && el.dataset && el.dataset.g === 'nombre' && el.dataset.gt) {
      e.preventDefault();
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const sig = el.closest('tr').nextElementSibling;
      const n = sig && $('[data-g="nombre"]', sig);
      if (n) { n.focus(); n.select(); } else agregarTarea(false);
    }
  });

  // ---- Tema -----------------------------------------------------------------------------------
  const themeBtn = $('#themeToggle');
  function oscuro() {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || (t !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function pintarTema() {
    const t = oscuro() ? 'Modo claro' : 'Modo oscuro';
    themeBtn.innerHTML = `${oscuro() ? ICON.sol : ICON.luna}<span class="hb-t">${t}</span>`;
    themeBtn.setAttribute('aria-label', t);
  }
  function cambiarTema() {
    const t = oscuro() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('quempin_gantt_theme', t); } catch (e) { /* sin almacenamiento */ }
    pintarTema();
    if (state.carta) pintarCalculo();
  }
  // El portal cambia el tema desde afuera: la lámina se vuelve a pintar con sus colores
  new MutationObserver(() => { pintarTema(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---- Cambios que llegan de la carpeta o de otra pestaña ---------------------------------------
  D.on((ev) => {
    if (ev.type === 'sync') { pintarCarpeta(); return; }
    if (ev.type === 'local' && ev.traspaso) {
      toast(`${plural(ev.ids.length, 'Carta Gantt traspasada', 'Cartas Gantt traspasadas')} desde el Formulador.`, false, 5000);
      if (!state.carta) renderLista();
      else if (!state.guardada && state.carta.proyecto && D.deProyecto(state.carta.proyecto.uid)) route();
      return;
    }
    if (ev.type !== 'remote') return;
    if (ev.conflictos) toast(`Una carta cambió aquí y en otro equipo a la vez: quedó la del equipo y la de aquí como copia.`, true, 8000);
    if (!state.carta) { renderLista(); return; }
    const c = state.guardada ? D.get(state.carta.uid) : null;
    const escribiendo = document.activeElement && app.contains(document.activeElement) && document.activeElement.matches('input');
    if (c && c !== state.carta && !saveTimer && !escribiendo && c.modificado !== state.carta.modificado) {
      state.carta = c;
      renderCarta();
      if (c.modificadoPor) toast(`Llegó un cambio de ${c.modificadoPor}.`);
    } else if (!state.guardada && state.carta.proyecto && D.deProyecto(state.carta.proyecto.uid)) route();
  });

  // ---- Arranque -------------------------------------------------------------------------------
  if (EN_PORTAL) document.documentElement.classList.add('en-marco');
  pintarTema();
  window.addEventListener('hashchange', route);
  D.iniciar();
  route();
})();
