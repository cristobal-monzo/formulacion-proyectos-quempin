/*
 * app.js — Interfaz de la herramienta de formulación de proyectos QUEMPIN.
 * Vistas: listado de proyectos (#/), editor de proyecto (#/p/<id>/<pestaña>) y guía de KPIs (#/guia).
 * El editor se recorre en 5 pasos: datos, partidas, costos, utilidad y precio, y evaluación.
 * La utilidad de cada partida se ingresa en el paso «Utilidad y precio», junto al margen
 * que cambia, para ver el efecto al instante.
 */
(function () {
  'use strict';

  const { computeProject, num } = window.QCalc;
  const S = window.QStore;
  const X = window.QExcel;
  const KP = window.QKPIs;
  const app = document.getElementById('app');
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  // ---------------------------------------------------------------------------
  //  Formato
  // ---------------------------------------------------------------------------
  const fCLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const fNum = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
  const ok = (v) => v !== null && v !== undefined && Number.isFinite(v);
  const clp = (v) => (ok(v) ? fCLP.format(Math.round(v)) : '—');
  const pct = (v) => (ok(v) ? (v * 100).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' : '—');
  const nf = (v) => (ok(v) ? fNum.format(v) : '—');
  const fmt = (v, f) => (f === 'clp' ? clp(v) : f === 'pct' ? pct(v) : nf(v));
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + 's')}`;
  const fechaCorta = (iso) => {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso)); // fecha sin hora: evitar desfase de zona horaria
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const d = new Date(iso);
    return isNaN(d) ? String(iso) : d.toLocaleDateString('es-CL');
  };

  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    upload: svg('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'),
    download: svg('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
    print: svg('<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>'),
    more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    caret: '<svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    chevR: svg('<path d="M9 6l6 6-6 6"/>'),
    sheet: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
    file: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    archive: svg('<path d="M3 7h18v4H3zM5 11v9h14v-9M10 15h4"/>'),
    layers: svg('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'),
    version: svg('<path d="M8 4h11a1 1 0 0 1 1 1v11"/><rect x="4" y="8" width="12" height="12" rx="1"/><path d="M10 11v6M7 14h6"/>'),
    open: svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
    target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    luna: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
    sol: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.5M12 17h.01"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    folder: svg('<path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'),
    login: svg('<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M9 16l4-4-4-4M13 12H3"/>'),
    logout: svg('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>'),
    restore: svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>')
  };

  // ---------------------------------------------------------------------------
  //  Estado de la interfaz
  // ---------------------------------------------------------------------------
  const state = {
    project: null,
    result: null,
    lineIdx: new Map(),
    partIdx: new Map(),
    tab: 'ficha',
    filtro: { materiales: '', equipos: '', manoObra: '', otros: '' },
    apuOpen: new Set(),
    kpiOpen: new Set(),
    abiertos: new Set(), // secciones desplegables abiertas (parámetros de la ficha, ayudas)
    costoTab: 'materiales', // último tipo de costo visitado: el paso 3 vuelve ahí
    imprimir: false, // true mientras se imprime: utilidad y evaluación en una sola página
    /* Utilidad que había antes de "Aplicar" / "Llevar al margen objetivo", para "Deshacer":
       { puid, antes: Map(uid de partida → { utilidadTipo, utilidadValor }), accion } */
    utilUndo: null,
    list: { q: '', estado: '', resp: '', sort: { k: 'mod', dir: -1 } },
    conflicto: false
  };
  /* Modo nube: activa = hay configuración de SharePoint; lista = sesión iniciada y proyectos cargados. */
  const nube = { activa: false, lista: false, ultimo: '' };

  const DETALLE = {
    materiales: { titulo: 'Materiales', singular: 'material', total: 'mat', factory: S.newMaterial, cat: 'cat-mat' },
    equipos: { titulo: 'Equipos', singular: 'equipo', total: 'eq', factory: S.newEquipo, cat: 'cat-eq' },
    manoObra: { titulo: 'Mano de obra', singular: 'tarea', total: 'mo', factory: S.newManoObra, cat: 'cat-mo' },
    otros: { titulo: 'Otros', singular: 'costo', total: 'otros', factory: S.newOtro, cat: 'cat-otros' }
  };
  /* Vistas del editor. Se agrupan en 5 pasos numerados (PASOS): los cuatro tipos de
     costo son subpestañas del paso 3. Los id se mantienen para no romper enlaces guardados. */
  const TABS = [
    { id: 'ficha', label: 'Datos del proyecto', paso: 1 },
    { id: 'partidas', label: 'Partidas', list: 'partidas', paso: 2 },
    { id: 'materiales', label: 'Materiales', list: 'materiales', paso: 3 },
    { id: 'equipos', label: 'Equipos', list: 'equipos', paso: 3 },
    { id: 'manoObra', label: 'Mano de obra', list: 'manoObra', paso: 3 },
    { id: 'otros', label: 'Otros', list: 'otros', paso: 3 },
    { id: 'resumen', label: 'Utilidad y precio', paso: 4 },
    { id: 'evaluacion', label: 'Evaluación', paso: 5 }
  ];
  const COSTOS = ['materiales', 'equipos', 'manoObra', 'otros'];
  const PASOS = [
    { n: 1, label: 'Datos', tabs: ['ficha'] },
    { n: 2, label: 'Partidas', tabs: ['partidas'] },
    { n: 3, label: 'Costos', tabs: COSTOS },
    { n: 4, label: 'Utilidad y precio', tabs: ['resumen'] },
    { n: 5, label: 'Evaluación', tabs: ['evaluacion'] }
  ];
  const tabInfo = (id) => TABS.find((t) => t.id === id) || TABS[0];
  /* Orden de recorrido con «Siguiente»: pasa por cada tipo de costo */
  const ORDEN = TABS.map((t) => t.id);

  /* Qué es cada vista, en una frase, y cómo se usa (ayuda desplegable) */
  const PROPOSITO = {
    ficha: 'Identifica el proyecto. Los parámetros de cálculo ya vienen con los valores habituales.',
    partidas: 'Divide el trabajo en partidas, por ejemplo «3 medidores de 2"».',
    materiales: 'Insumos de cada partida, por una unidad de la partida: la herramienta multiplica por su cantidad.',
    equipos: 'Equipos que se compran o arriendan, por una unidad de la partida.',
    manoObra: 'Personas y días por nivel para ejecutar una unidad de la partida.',
    otros: 'Traslados, viáticos y otros gastos por unidad de partida.',
    resumen: 'Define la utilidad de cada partida y copia los valores para la cotización.',
    evaluacion: '¿Conviene enviar la oferta? Rentabilidad, riesgo y presupuesto del mandante.'
  };

  /* Categorías de costo en los gráficos: colores oficiales y, cuando se acaban,
     texturas con esos mismos colores (ver css/styles.css). Orden y color fijos. */
  const CATS = [
    { k: 'mat', n: 'Materiales', cls: 'cat-mat' },
    { k: 'eq', n: 'Equipos', cls: 'cat-eq' },
    { k: 'mo', n: 'Mano de obra', cls: 'cat-mo' },
    { k: 'otros', n: 'Otros', cls: 'cat-otros' },
    { k: 'gg', n: 'Gastos generales + imprevistos', cls: 'cat-gg' },
    { k: 'util', n: 'Utilidad', cls: 'cat-util' }
  ];

  const ESTADO_INFO = {
    'Borrador': { cls: 'eb-borrador', desc: 'En formulación' },
    'En revisión': { cls: 'eb-revision', desc: 'Lista para revisión interna' },
    'Enviada': { cls: 'eb-enviada', desc: 'Oferta enviada al cliente' },
    'Adjudicada': { cls: 'eb-adjudicada', desc: 'El cliente aceptó la oferta' },
    'Perdida': { cls: 'eb-perdida', desc: 'Se adjudicó a otro oferente' },
    'Descartada': { cls: 'eb-descartada', desc: 'No se presentó la oferta' }
  };
  const EN_CURSO = ['Borrador', 'En revisión', 'Enviada'];

  const UNIDAD_NOMBRE = { 'Un.': 'Unidad', kg: 'Kilogramo', m: 'Metro lineal', m2: 'Metro cuadrado', m3: 'Metro cúbico', gl: 'Global', km: 'Kilómetro', 'día': 'Día', hr: 'Hora', lt: 'Litro', noche: 'Noche' };

  // ---------------------------------------------------------------------------
  //  Toast, diálogo, tooltip
  // ---------------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, isErr ? 5000 : 2600);
  }

  /* Portapapeles: API moderna y, si no está disponible, el método antiguo */
  async function copiarTexto(txt) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); return true; }
    } catch (e) { /* se intenta el método antiguo */ }
    const prev = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let hecho = false;
    try { hecho = document.execCommand('copy'); } catch (e) { hecho = false; }
    ta.remove();
    if (prev && prev.focus) prev.focus();
    return hecho;
  }
  function marcarCopiado(btn) {
    if (!btn) return;
    const icono = btn.classList.contains('copiar');
    btn.classList.add('hecho');
    if (icono) btn.innerHTML = ICON.check;
    clearTimeout(btn._copiado);
    btn._copiado = setTimeout(() => { btn.classList.remove('hecho'); if (icono) btn.innerHTML = ICON.copy; }, 1500);
  }

  /* Diálogo modal. buttons: [{label, value, primary, danger, left}] → Promise(value | null) */
  function ask({ title, body, buttons, wide }) {
    const dlg = $('#modal');
    closePop();
    dlg.className = wide ? 'wide' : '';
    const btns = (buttons || [{ label: 'Aceptar', value: true, primary: true }]).filter(Boolean);
    dlg.innerHTML = `<form method="dialog">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" value="" aria-label="Cerrar">${ICON.x}</button></div>
      <div class="modal-body">${body || ''}</div>
      <div class="modal-foot">${btns.map((b, i) => `<button class="btn ${b.primary ? 'btn-primario' : ''} ${b.danger ? 'btn-danger' : ''} ${b.left ? 'izq' : ''}" value="${i}">${esc(b.label)}</button>`).join('')}</div>
    </form>`;
    return new Promise((resolve) => {
      const onClose = () => {
        dlg.removeEventListener('close', onClose);
        const rv = dlg.returnValue || '';
        const i = /^\d+$/.test(rv) ? parseInt(rv, 10) : NaN;
        if (Number.isInteger(i) && btns[i]) resolve(btns[i].value === undefined ? null : btns[i].value);
        else resolve(rv && !/^\d+$/.test(rv) ? rv : null); // botones del cuerpo con valor propio
      };
      dlg.returnValue = '';
      dlg.addEventListener('close', onClose);
      dlg.showModal();
      const primary = dlg.querySelector('.btn-primario') || dlg.querySelector('.modal-foot .btn');
      const firstInput = dlg.querySelector('.modal-body input, .modal-body select');
      (firstInput || primary).focus();
    });
  }

  // Tooltip negro (igual que los tableros de Finanzas): data-tip con HTML ya escapado
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

  // ---------------------------------------------------------------------------
  //  Menús y selectores desplegables propios
  //  Un solo "popover" para menús de acciones (role=menu) y listas de opciones
  //  (role=listbox): opciones completas y legibles, iconos, descripciones,
  //  búsqueda y manejo con teclado (flechas, Inicio/Fin, Enter, Esc).
  // ---------------------------------------------------------------------------
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
  function openPop(anchor, o) {
    closePop();
    P = Object.assign({ anchor, q: '', kind: 'menu' }, o);
    anchor.setAttribute('aria-expanded', 'true');
    pop.innerHTML = `${o.search ? `<div class="pop-search"><input type="search" placeholder="${esc(o.search)}" aria-label="${esc(o.search)}" autocomplete="off"></div>` : ''}
      <div class="pop-list" role="${P.kind === 'menu' ? 'menu' : 'listbox'}" aria-label="${esc(o.label || '')}"></div>
      ${o.foot ? `<div class="pop-foot">${o.foot}</div>` : ''}`;
    renderPopList();
    pop.hidden = false;
    pop.style.minWidth = Math.max(o.minWidth || 220, anchor.getBoundingClientRect().width) + 'px';
    positionPop();
    const s = $('.pop-search input', pop);
    if (s) s.focus();
    else {
      const first = $('.pop-item[aria-selected="true"]', pop) || $('.pop-item:not([disabled])', pop);
      if (first) first.focus();
    }
  }
  function renderPopList() {
    const list = $('.pop-list', pop);
    const q = norm(P.q.trim());
    const vis = P.items.map((it, i) => ({ it, i }))
      .filter(({ it }) => !q || (!it.sep && !it.head && norm(`${it.title} ${it.desc || ''} ${it.right || ''}`).includes(q)));
    const role = P.kind === 'menu' ? 'menuitem' : 'option';
    list.innerHTML = vis.length ? vis.map(({ it, i }) => {
      if (it.sep) return '<div class="pop-sep" role="separator"></div>';
      if (it.head) return `<div class="pop-head" role="presentation">${esc(it.head)}</div>`;
      return `<button type="button" class="pop-item ${it.danger ? 'danger' : ''}" role="${role}" data-pi="${i}" ${it.disabled ? 'disabled' : ''} ${P.kind === 'menu' ? '' : `aria-selected="${!!it.selected}"`}>
        ${P.kind === 'menu' ? '' : `<span class="check" aria-hidden="true">${it.selected ? '✓' : ''}</span>`}
        ${it.lead || it.icon || ''}
        <span class="pi-main"><span class="pi-title">${esc(it.title)}</span>${it.desc ? `<span class="pi-desc">${esc(it.desc)}</span>` : ''}</span>
        ${it.right ? `<span class="pi-right">${esc(it.right)}</span>` : ''}
      </button>`;
    }).join('') : '<div class="pop-empty">Sin coincidencias</div>';
  }
  function positionPop() {
    if (!P) return;
    const r = P.anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = P.align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  pop.addEventListener('input', (e) => {
    if (!P || !e.target.closest('.pop-search')) return;
    P.q = e.target.value;
    renderPopList();
    positionPop();
  });
  document.addEventListener('keydown', (e) => {
    if (!P) return;
    if (e.key === 'Escape') { e.preventDefault(); closePop(true); return; }
    if (e.key === 'Tab') { closePop(false); return; }
    if (!pop.contains(document.activeElement)) return;
    const items = $$('.pop-item:not([disabled])', pop);
    const inSearch = document.activeElement.closest('.pop-search');
    const idx = items.indexOf(document.activeElement);
    if (inSearch) {
      if (e.key === 'ArrowDown' && items[0]) { e.preventDefault(); items[0].focus(); }
      if (e.key === 'Enter' && items[0]) { e.preventDefault(); items[0].click(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const s = $('.pop-search input', pop);
      if (idx <= 0 && s) s.focus(); else (items[idx - 1] || items[items.length - 1]).focus();
    } else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
  }, true);
  window.addEventListener('resize', () => closePop());
  document.addEventListener('scroll', (e) => { if (P && !(e.target.closest && e.target.closest('.pop'))) closePop(); }, true);

  /* Menús de acciones */
  function openMenu(btn) {
    const key = btn.dataset.menu;
    const id = btn.dataset.id;
    const n = S.all().length;
    let items = [];
    let extra = {};
    if (key === 'list-more') {
      items = [
        { head: 'Cartera' },
        { icon: ICON.sheet, title: 'Exportar cartera a Excel', desc: 'Todos los proyectos con sus KPI en una planilla', act: 'exportar-cartera', disabled: !n },
        { icon: ICON.archive, title: 'Respaldar todos los proyectos', desc: enSP() ? 'Copia en JSON de toda la cartera, para archivar fuera de SharePoint' : 'Archivo JSON para restaurar o llevar a otro navegador', act: 'respaldar', disabled: !n },
        { icon: ICON.trash, title: `Papelera (${S.trash().length})`, desc: enSP() ? 'Proyectos eliminados: restaurar' : 'Proyectos eliminados: restaurar o eliminar definitivamente', act: 'papelera' },
        enSP() ? null : { sep: true },
        enSP() ? null : { icon: ICON.sparkle, title: 'Cargar proyecto de ejemplo', desc: 'Mismos datos del Excel original, para comparar resultados', act: 'ejemplo' }
      ].filter(Boolean);
    } else if (key === 'proj' || key === 'editor-more') {
      const enEditor = key === 'editor-more';
      const ub = enSP() ? window.QCloud.ubicacion(id) : null;
      items = [
        enEditor ? { icon: ICON.print, title: 'Imprimir resumen', desc: 'Utilidad, precio y evaluación en una página', act: 'imprimir' } : null,
        enEditor ? { sep: true } : null,
        enEditor ? null : { icon: ICON.open, title: 'Abrir', act: 'abrir', id },
        ub && ub.webUrl ? { icon: ICON.folder, title: 'Abrir la carpeta en SharePoint', desc: ub.ruta, act: 'abrir-carpeta', id } : null,
        ub ? { icon: ICON.sheet, title: 'Guardar Excel en la carpeta', desc: 'Copia para ver o imprimir desde SharePoint', act: 'excel-carpeta', id } : null,
        enEditor ? null : { icon: ICON.download, title: 'Exportar a Excel', desc: 'Planilla con fórmulas vivas y ficha de KPI', act: 'exp-xlsx', id },
        { icon: ICON.file, title: 'Exportar a JSON', desc: 'Para respaldar o compartir y volver a importar', act: 'exp-json', id },
        { sep: true },
        { icon: ICON.layers, title: 'Duplicar como proyecto nuevo', desc: enSP() ? 'En la carpeta de otra oferta, versión 1' : 'Nuevo código correlativo, versión 1', act: 'duplicar', id },
        { icon: ICON.version, title: 'Crear nueva versión', desc: 'Mismo código para una revisión de la oferta', act: 'version', id },
        { sep: true },
        { icon: ICON.trash, title: enEditor ? 'Eliminar proyecto' : 'Eliminar', act: 'eliminar', id, danger: true }
      ].filter(Boolean);
    } else if (key === 'cuenta') {
      const u = S.getUser() || {};
      const c = window.QCloud.info();
      const pend = window.QCloud.proyectosLocalesPendientes().length;
      items = [
        { head: u.nombre || u.email || '' },
        { icon: ICON.user, title: u.email || '', desc: textoGuardado()[0], disabled: true },
        { sep: true },
        c.sitioUrl ? { icon: ICON.folder, title: 'Abrir la biblioteca en SharePoint', desc: 'Las carpetas de las ofertas', act: 'abrir-biblioteca' } : null,
        pend ? { icon: ICON.upload, title: `Proyectos de este navegador (${pend})`, desc: 'Guardados aquí antes de usar SharePoint', act: 'subir-locales' } : null,
        { icon: ICON.logout, title: 'Cerrar sesión', act: 'salir' }
      ].filter(Boolean);
      extra = { minWidth: 300 };
    } else if (key === 'fila') {
      const list = btn.dataset.list, uid = btn.dataset.uid;
      if (list === 'partidas') {
        const arr = state.project.partidas;
        const i = arr.findIndex((x) => x.uid === uid);
        items = [
          { icon: ICON.layers, title: 'Ver o agregar sus costos', desc: `Costos · ${DETALLE[state.costoTab].titulo}, solo de esta partida`, act: 'ver-costos', uid },
          { sep: true },
          { icon: ICON.up, title: 'Subir', act: 'mover', list, uid, dir: '-1', disabled: i <= 0 },
          { icon: ICON.down, title: 'Bajar', act: 'mover', list, uid, dir: '1', disabled: i >= arr.length - 1 },
          { sep: true },
          { icon: ICON.trash, title: 'Eliminar partida', act: 'del-row', list, uid, danger: true }
        ];
      } else {
        items = [
          { icon: ICON.copy, title: 'Duplicar fila', desc: 'Copia justo debajo, con la misma partida', act: 'dup-row', list, uid },
          { sep: true },
          { icon: ICON.trash, title: 'Eliminar', act: 'del-row', list, uid, danger: true }
        ];
      }
    } else if (key === 'alertas') {
      // Alertas de validación: cada una lleva directo a la fila que hay que corregir
      const ws = state.result.warnings.filter((w) => w.level !== 'info');
      items = ws.length ? ws.map((w) => ({
        lead: `<span class="marca-pop ${w.level}" aria-hidden="true"></span>`,
        title: w.msg, desc: w.tab ? `Corregir en ${tabInfo(w.tab).label} →` : '',
        act: 'ir', tab: w.tab, uid: w.uid || ''
      })) : [{ title: 'Sin alertas', desc: 'Todos los costos están asociados a una partida y tienen valores.', disabled: true }];
      extra = { minWidth: 340, foot: '<button type="button" class="link-btn" data-act="tab" data-tab="evaluacion" data-focus="veredicto">Ver la evaluación completa</button>' };
    } else if (key === 'catalogo') {
      const cat = state.project.catalogoOtros || [];
      items = cat.length ? cat.map((c, i) => ({ icon: ICON.plus, title: c.descripcion || 'Sin descripción', right: `${clp(num(c.costoUnitario))} / ${c.unidad || 'un'}`, catIdx: i }))
        : [{ title: 'El catálogo está vacío', desc: 'Agrega referencias en Datos del proyecto', disabled: true }];
      extra = { foot: '<button type="button" class="link-btn" data-act="tab" data-tab="ficha" data-focus="catalogo">Editar el catálogo en Datos del proyecto</button>', minWidth: 320, search: cat.length > 8 ? 'Buscar en el catálogo' : '' };
    }
    openPop(btn, Object.assign({
      kind: 'menu', align: btn.dataset.align || 'right', label: btn.getAttribute('aria-label') || btn.textContent.trim(), items,
      onPick: (it) => {
        if (it.catIdx !== undefined) addFromCatalog(it.catIdx);
        else if (it.act) doAct(it.act, { id: it.id, tab: it.tab, uid: it.uid, list: it.list, dir: it.dir });
      }
    }, extra));
  }

  /* Selectores de opciones (partida, unidad, estado) */
  function openPicker(btn) {
    const kind = btn.dataset.picker;
    if (kind === 'partida') {
      const p = state.project;
      const it = findItem(btn.dataset.list, btn.dataset.uid);
      if (!it) return;
      const cur = state.partIdx.has(it.partida) ? it.partida : '';
      const items = p.partidas.map((pt, i) => ({
        value: pt.uid, selected: cur === pt.uid,
        lead: `<span class="pcode">P${i + 1}</span>`,
        title: pt.descripcion || 'Partida sin descripción',
        right: `${nf(num(pt.cantidad))} ${pt.unidad || ''}`.trim()
      }));
      if (items.length) items.push({ sep: true });
      items.push({ value: '', selected: !cur, lead: '<span class="pcode none">—</span>', title: 'Sin partida', desc: 'El costo no se suma al proyecto hasta asociarlo' });
      openPop(btn, {
        kind: 'listbox', align: 'left', label: 'Partida asociada', items, minWidth: 320,
        search: p.partidas.length > 7 ? 'Buscar partida' : '',
        foot: p.partidas.length ? '' : '<button type="button" class="link-btn" data-act="tab" data-tab="partidas">Crear partidas en la pestaña Partidas</button>',
        onPick: (o) => {
          it.partida = o.value;
          recalc();
          renderTab(`[data-picker="partida"][data-uid="${it.uid}"]`);
          scheduleSave();
        }
      });
    } else if (kind === 'unidad') {
      const input = btn.parentElement.querySelector('input');
      const cur = input.value.trim();
      const usadas = new Set();
      const p = state.project;
      ['partidas', 'materiales', 'equipos', 'otros'].forEach((k) => p[k].forEach((x) => { if (x.unidad) usadas.add(String(x.unidad).trim()); }));
      (p.catalogoOtros || []).forEach((c) => { if (c.unidad) usadas.add(String(c.unidad).trim()); });
      const extras = Array.from(usadas).filter((u) => u && !S.UNIDADES.includes(u));
      const items = S.UNIDADES.map((u) => ({ value: u, title: u, right: UNIDAD_NOMBRE[u] || '', selected: u === cur }));
      if (extras.length) {
        items.push({ sep: true }, { head: 'Otras usadas en este proyecto' });
        extras.forEach((u) => items.push({ value: u, title: u, selected: u === cur }));
      }
      openPop(btn, {
        kind: 'listbox', align: 'left', label: 'Unidad', items, minWidth: 200,
        onPick: (o) => {
          input.value = o.value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }
      });
    } else if (kind === 'estado') {
      const p = state.project;
      openPop(btn, {
        kind: 'listbox', align: 'left', label: 'Estado del proyecto', minWidth: 260,
        items: S.ESTADOS.map((e) => ({ value: e, title: e, desc: ESTADO_INFO[e].desc, selected: p.estado === e, lead: `<span class="swatch ${ESTADO_INFO[e].cls}"></span>` })),
        onPick: (o) => {
          p.estado = o.value;
          const sel = $('#f-estado');
          if (sel) sel.value = o.value;
          updateHeader();
          scheduleSave();
          const b = $('#ed-meta [data-picker="estado"]');
          if (b) b.focus();
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  //  Guardado
  // ---------------------------------------------------------------------------
  let saveTimer = null;
  function setSaveState(text, cls) {
    const el = $('#save-state');
    if (el) { el.textContent = text; el.className = 'en-vivo ' + (cls || ''); }
  }
  function scheduleSave() {
    setSaveState('Guardando…', 'saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 350);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!state.project) return;
    if (S.getMode() === 'nube') {
      // Otra persona guardó este proyecto mientras se editaba: preguntar antes de sobrescribir.
      const cur = S.get(state.project.uid);
      if (cur && cur !== state.project) { resolverConflicto(cur); return; }
    }
    const okSave = S.upsert(state.project);
    if (!okSave) setSaveState('No se pudo guardar en este navegador: exporta el proyecto', 'err');
    else showSyncState();
  }
  window.addEventListener('beforeunload', (e) => {
    if (saveTimer) saveNow();
    // Cambios aún no subidos a SharePoint: se suben ya y el navegador pide confirmar la salida
    if (enSP() && window.QCloud.info().pendientes > 0) { window.QCloud.vaciar(true); e.preventDefault(); e.returnValue = ''; }
  });
  function enSP() { return S.getMode() === 'nube' && !!window.QCloud; }

  /* Texto del indicador de guardado según el modo y la sincronización. */
  function textoGuardado() {
    if (S.getMode() !== 'nube') return ['Guardado en este navegador', ''];
    const c = window.QCloud.info();
    if (c.pendientes > 0) return c.enLinea ? ['Cambios por subir a SharePoint…', 'saving'] : ['Sin conexión: se subirá al reconectar', 'saving'];
    return c.enLinea ? ['Guardado en SharePoint', ''] : ['Sin conexión: guardado en este equipo', 'saving'];
  }
  function showSyncState() {
    if (saveTimer || state.conflicto) return;
    const [t, cls] = textoGuardado();
    setSaveState(t, cls);
  }

  async function resolverConflicto(cur) {
    if (state.conflicto) return;
    state.conflicto = true;
    setSaveState('Cambios sin guardar: otra persona modificó este proyecto', 'err');
    const mio = state.project;
    const quien = cur.modificadoPor && cur.modificadoPor !== (S.getUser() || {}).email ? cur.modificadoPor : 'Tú, desde otra ventana,';
    const v = await ask({
      title: 'Otra persona modificó este proyecto',
      body: `<p><b>${esc(quien)}</b> guardó cambios en <b>${esc(cur.codigo)} v${esc(cur.version)}</b> (${esc(new Date(cur.modificado).toLocaleString('es-CL'))}) mientras tú lo editabas.</p>
        <p>Elige qué hacer con tus cambios, que aún no se han guardado:</p>
        <ul><li><b>Guardar los míos como copia:</b> ${enSP() ? 'tus cambios quedan como una versión nueva en la misma carpeta de la oferta' : 'tus cambios quedan en un proyecto nuevo'} y el original conserva los de la otra persona.</li>
        <li><b>Ver su versión:</b> descarta tus cambios y carga la versión guardada.</li>
        <li><b>Sobrescribir:</b> tus cambios reemplazan los de la otra persona.</li></ul>`,
      buttons: [{ label: 'Sobrescribir', value: 'mia', danger: true, left: true }, { label: 'Ver su versión', value: 'suya' }, { label: 'Guardar los míos como copia', value: 'copia', primary: true }]
    });
    state.conflicto = false;
    if (state.project !== mio) return;
    if (v === 'mia') { S.upsert(mio); showSyncState(); toast('Tus cambios reemplazaron la versión guardada'); }
    else if (v === 'suya') { recargarProyecto(S.get(mio.uid)); toast('Se cargó la versión guardada'); }
    else if (v === 'copia') {
      const c = copiaDeCambios(mio, ' (mis cambios)');
      toast(`Tus cambios quedaron en ${c.codigo} v${c.version}`);
      goProject(c, state.tab);
    } else setSaveState('Cambios sin guardar: otra persona modificó este proyecto. Edita algo para decidir.', 'err');
  }

  /* Reemplaza el proyecto abierto por su versión guardada, manteniendo la pestaña y el foco. */
  function recargarProyecto(p) {
    if (!p) return;
    const foco = document.activeElement && app.contains(document.activeElement) ? focusKeyOf(document.activeElement) : null;
    state.project = p;
    state.utilUndo = null;
    recalc();
    renderTab(foco);
    showSyncState();
  }

  // ---------------------------------------------------------------------------
  //  Cálculo
  // ---------------------------------------------------------------------------
  function recalc() {
    const r = computeProject(state.project);
    state.result = r;
    state.lineIdx = new Map();
    Object.values(r.lines).forEach((arr) => arr.forEach((l) => state.lineIdx.set(l.uid, l)));
    state.partIdx = new Map(r.partidas.map((p) => [p.uid, p]));
    return r;
  }
  function resolve(key) {
    const r = state.result;
    const [t, a, b, c] = key.split(':');
    if (t === 'T') return r.totals[a];
    if (t === 'K') return r.kpis[a];
    if (t === 'P') {
      const p = state.partIdx.get(a);
      if (!p) return null;
      if (b === 'margen') return p.precio ? p.utilidad / p.precio : null;
      return p[b];
    }
    if (t === 'L') { const l = state.lineIdx.get(b); return l ? l[c] : null; }
    return null;
  }
  function updateCalc() {
    const r = state.result;
    $$('[data-c]', app).forEach((el) => { el.textContent = fmt(resolve(el.dataset.c), el.dataset.fmt); });
    const lvl = new Map();
    const msgs = new Map();
    r.warnings.forEach((w) => {
      if (!w.uid) return;
      if (w.level === 'error' || !lvl.has(w.uid)) lvl.set(w.uid, w.level);
      msgs.set(w.uid, (msgs.get(w.uid) ? msgs.get(w.uid) + '\n' : '') + w.msg);
    });
    $$('tr[data-row]', app).forEach((tr) => {
      const l = lvl.get(tr.dataset.row);
      tr.classList.toggle('has-error', l === 'error');
      tr.classList.toggle('has-warn', l === 'warn');
      if (msgs.has(tr.dataset.row)) tr.title = msgs.get(tr.dataset.row); else tr.removeAttribute('title');
    });
    // Conteo de ítems por tipo de costo (subpestañas del paso 3)
    $$('[data-count]', app).forEach((el) => {
      const k = el.dataset.count;
      el.textContent = state.project[k].length;
      el.classList.toggle('err', r.warnings.some((w) => w.tab === k && w.level === 'error'));
    });
    // Ayuda emergente con el cálculo de cada subtotal
    $$('[data-formula]', app).forEach((el) => { el.dataset.tip = formulaLinea(el.dataset.formula); });
    renderLectura();
    updateTabs();
    updateHeader();
    refreshFicha();
    refreshResumen();
    pintarFalta();
  }

  // ---------------------------------------------------------------------------
  //  Navegación
  // ---------------------------------------------------------------------------
  function route() {
    if (saveTimer) saveNow();
    if (state.project && enSP()) window.QCloud.vaciar();
    closePop();
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (nube.activa && !nube.lista && parts[0] !== 'guia') { state.project = null; renderNube(); return; }
    let where = 'lista';
    if (parts[0] === 'p' && parts[1]) {
      const p = S.get(parts[1]);
      if (!p) { toast('No se encontró el proyecto.', true); location.hash = '#/'; return; }
      if (p.eliminado) { toast('Ese proyecto está en la papelera. Restáuralo para editarlo.', true); location.hash = '#/papelera'; return; }
      where = 'proyecto';
      openProject(p, parts[2]);
    } else if (parts[0] === 'guia') {
      where = 'guia';
      state.project = null;
      renderGuide();
    } else if (parts[0] === 'papelera') {
      state.project = null;
      renderPapelera();
    } else {
      state.project = null;
      renderList();
    }
    renderModnav(where);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  function renderModnav(where) {
    const p = state.project;
    if (nube.activa && !nube.lista) {
      $('#modnav').innerHTML = `<a class="viz-modnav-tab ${where === 'guia' ? '' : 'is-active'}" href="#/">Ingreso</a>
        <a class="viz-modnav-tab ${where === 'guia' ? 'is-active' : ''}" href="#/guia">Guía de uso</a>`;
      return;
    }
    $('#modnav').innerHTML = `
      <a class="viz-modnav-tab ${where === 'lista' ? 'is-active' : ''}" href="#/" ${where === 'lista' ? 'aria-current="page"' : ''}>Proyectos</a>
      ${p ? `<a class="viz-modnav-tab is-active" id="modnav-proj" href="#/p/${p.uid}/${state.tab}" aria-current="page"><span></span></a>` : ''}
      <a class="viz-modnav-tab ${where === 'guia' ? 'is-active' : ''}" href="#/guia" ${where === 'guia' ? 'aria-current="page"' : ''}>Guía de uso</a>`;
    const sub = $('#hdr-sub');
    if (where === 'guia') sub.textContent = 'Cómo formular un proyecto y leer su evaluación';
    else if (where === 'lista') sub.textContent = 'Costos, precio y evaluación de ofertas por partida';
    if (p) updateHeader();
  }

  function goProject(p, tab) { location.hash = `#/p/${p.uid}/${tab || 'ficha'}`; }

  // ---------------------------------------------------------------------------
  //  LISTADO DE PROYECTOS
  // ---------------------------------------------------------------------------
  function renderList() {
    const all = S.all();
    document.title = 'Proyectos — Formulación QUEMPIN';
    const L = state.list;
    const responsables = Array.from(new Set(all.map((p) => (p.responsable || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
    if (L.resp && !responsables.includes(L.resp)) L.resp = '';
    app.innerHTML = `<div class="viz-container page">
      <div class="page-head">
        <div>
          <h2>Proyectos formulados</h2>
          <p>Abre un proyecto para seguir formulándolo o crea uno nuevo.</p>
        </div>
        ${all.length ? `<div class="actions">
          <button class="btn btn-primario" data-act="nuevo">${ICON.plus}Nuevo proyecto</button>
          <button class="btn" data-act="importar">${ICON.upload}Importar</button>
          <button class="btn" data-menu="list-more" aria-haspopup="menu" aria-expanded="false" aria-label="Más acciones">${ICON.more}Más${ICON.caret}</button>
        </div>` : ''}
      </div>
      ${all.length ? `
        <div class="kpis" id="list-kpis"></div>
        <div class="viz-filterbar">
          <div class="viz-filtergrid">
            <div class="viz-field span-8"><label for="list-search">Buscar</label>
              <input type="search" id="list-search" class="${L.q ? 'is-set' : ''}" placeholder="${enSP() ? 'N° de oferta, título, cliente, carpeta o responsable' : 'Código, título, cliente, ubicación o responsable'}" value="${esc(L.q)}" autocomplete="off"></div>
            <div class="viz-field span-4"><label for="list-resp">Responsable</label>
              <select id="list-resp" class="${L.resp ? 'is-set' : ''}" ${responsables.length ? '' : 'disabled'}>
                <option value="">${responsables.length ? 'Todos los responsables' : 'Sin responsables asignados'}</option>
                ${responsables.map((r) => `<option value="${esc(r)}" ${L.resp === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
              </select></div>
          </div>
          <div class="filtro-estados" id="list-cartera" role="group" aria-label="Filtrar por estado"></div>
          <div class="viz-filterfoot" id="list-foot"></div>
        </div>
        <div class="tabla-contenedor">
          <table class="tbl tbl-apilable tbl-lista" id="list-table" style="min-width:980px">
            <thead id="list-head"></thead>
            <tbody id="list-body"></tbody>
          </table>
        </div>` : emptyHub()}
    </div>`;
    if (all.length) refreshList();
  }

  function emptyHub() {
    const card = (icon, titulo, desc, btn) => `<article class="hub-card">
      <div class="hub-card-cabecera"><div class="icon" aria-hidden="true">${icon}</div><h3>${titulo}</h3></div>
      <p class="desc">${desc}</p>${btn}</article>`;
    return `<div class="hub-grid">
      ${enSP()
        ? card(ICON.plus, 'Nuevo proyecto', 'Elige la carpeta de la oferta. El título, la ubicación y el presupuesto se toman de la planilla de ingreso.', `<button class="btn btn-primario" data-act="nuevo">Crear proyecto →</button>`)
        : card(ICON.plus, 'Nuevo proyecto', 'Parte de cero con los parámetros habituales de QUEMPIN (IVA, tarifas y metas).', `<button class="btn btn-primario" data-act="nuevo">Crear proyecto →</button>`)}
      ${enSP() ? '' : card(ICON.sparkle, 'Proyecto de ejemplo', 'Tres partidas de medidores de gas natural con los datos del Excel original, para ver cómo funciona.', `<button class="btn" data-act="ejemplo">Cargar ejemplo</button>`)}
      ${card(ICON.upload, 'Importar archivo', enSP() ? 'Un Excel de formulación antiguo (.xlsm) o un proyecto exportado desde aquí (.xlsx o .json). Se guarda en la carpeta de la oferta que elijas.' : 'Un proyecto exportado desde aquí (.xlsx o .json) o un Excel de formulación antiguo (.xlsm).', `<button class="btn" data-act="importar">Importar archivo</button>`)}
    </div>
    <section class="section">
      <div class="section-head"><h3 class="seccion-titulo">Cómo se formula un proyecto</h3><a href="#/guia">Guía de uso</a></div>
      <ol class="pasos-mini">
        <li><b>Datos</b><span>Título, cliente y parámetros</span></li>
        <li><b>Partidas</b><span>En qué se divide el trabajo</span></li>
        <li><b>Costos</b><span>Materiales, equipos, mano de obra y otros</span></li>
        <li><b>Utilidad y precio</b><span>Valores para la cotización</span></li>
        <li><b>Evaluación</b><span>¿Conviene enviar la oferta?</span></li>
      </ol>
    </section>`;
  }

  function listFiltered() {
    const L = state.list;
    const q = norm(L.q.trim());
    return S.all()
      .filter((p) => !L.estado || p.estado === L.estado)
      .filter((p) => !L.resp || (p.responsable || '').trim() === L.resp)
      .filter((p) => !q || norm([p.codigo, p.titulo, p.cliente, p.responsable, p.ubicacion, enSP() ? (window.QCloud.ubicacion(p.uid) || {}).ruta : ''].join(' ')).includes(q));
  }

  function refreshList() {
    const list = listFiltered();
    const rs = new Map(list.map((p) => [p.uid, computeProject(p)]));
    renderListKpis(list, rs);
    renderCartera(list, rs);
    renderListFoot(list.length);
    renderListHead();
    renderListBody(list, rs);
  }

  const kpiTop = (label, value, sub, cls, tipText) => `<div class="kpi-card ${cls || ''}">
    <div class="kpi-label">${label}${tipText ? info(tipText) : ''}</div>
    <div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;

  function renderListKpis(list, rs) {
    const el = $('#list-kpis');
    if (!el) return;
    const par = S.getConfig().parametros;
    const mObj = num(par.margenObjetivo) / 100, mMin = num(par.margenMinimo) / 100;
    const precio = (p) => rs.get(p.uid).totals.precioNeto;
    const enCurso = list.filter((p) => EN_CURSO.includes(p.estado));
    const adj = list.filter((p) => p.estado === 'Adjudicada');
    const perd = list.filter((p) => p.estado === 'Perdida');
    const vivos = list.filter((p) => p.estado !== 'Perdida' && p.estado !== 'Descartada');
    const pn = vivos.reduce((a, p) => a + precio(p), 0);
    const ut = vivos.reduce((a, p) => a + rs.get(p.uid).totals.utilidad, 0);
    const margen = pn > 0 ? ut / pn : null;
    const semM = margen === null ? '' : margen >= mObj ? 'sem-ok' : margen >= mMin ? 'sem-warn' : 'sem-bad';
    const conErr = list.filter((p) => rs.get(p.uid).warnings.some((w) => w.level === 'error')).length;
    const cerradas = adj.length + perd.length;
    el.innerHTML = [
      kpiTop('Ofertas en curso', clp(enCurso.reduce((a, p) => a + precio(p), 0)), `${plural(enCurso.length, 'oferta')} sin cerrar · precio neto`, 'accent', 'Suma del precio de venta neto (sin IVA) de los proyectos en estado Borrador, En revisión o Enviada.'),
      kpiTop('Adjudicado', clp(adj.reduce((a, p) => a + precio(p), 0)), cerradas ? `Tasa de adjudicación ${pct(adj.length / cerradas)} (${adj.length} de ${cerradas} cerradas)` : 'Sin ofertas cerradas aún', '', 'Precio neto de los proyectos adjudicados. La tasa compara adjudicadas contra adjudicadas + perdidas.'),
      kpiTop('Margen ponderado', pct(margen), `Objetivo ${pct(mObj)} · mínimo ${pct(mMin)}`, semM, 'Utilidad total ÷ precio neto total, sin contar proyectos perdidos ni descartados. Las metas son las predeterminadas de Configuración.'),
      kpiTop('Con errores', String(conErr), conErr ? 'Revísalos antes de exportar' : 'Todos pasan la validación', conErr ? 'sem-bad' : 'sem-ok')
    ].join('');
  }

  /* Filtro por estado: cada estado con su cantidad y su precio neto */
  function renderCartera(list, rs) {
    const el = $('#list-cartera');
    if (!el) return;
    const L = state.list;
    el.innerHTML = `<span class="fe-l">Estado</span>` + S.ESTADOS.map((e) => {
      const ps = list.filter((p) => p.estado === e);
      const v = ps.reduce((a, p) => a + Math.max(0, rs.get(p.uid).totals.precioNeto), 0);
      const on = L.estado === e;
      return `<button type="button" class="viz-chip chip-estado ${on ? 'on' : ''}" data-act="filtro-estado" data-e="${esc(e)}" aria-pressed="${on}" ${ps.length || on ? '' : 'disabled'} title="${esc(ESTADO_INFO[e].desc)}">
          <span class="swatch ${ESTADO_INFO[e].cls}" aria-hidden="true"></span><span class="v">${esc(e)}</span><span class="k">${ps.length}${v ? ` · ${esc(clp(v))}` : ''}</span></button>`;
    }).join('');
  }

  function renderListFoot(n) {
    const el = $('#list-foot');
    if (!el) return;
    const L = state.list;
    const total = S.all().length;
    const chips = [];
    if (L.q) chips.push(['q', 'Búsqueda', L.q]);
    if (L.estado) chips.push(['estado', 'Estado', L.estado]);
    if (L.resp) chips.push(['resp', 'Responsable', L.resp]);
    el.innerHTML = `<span class="viz-resultcount"><strong>${n}</strong> de ${plural(total, 'proyecto')}${chips.length ? '' : ' · sin filtros'}</span>
      <span class="viz-chips">${chips.map(([k, l, v]) => `<button type="button" class="viz-chip" data-act="quitar-filtro" data-k="${k}" aria-label="Quitar filtro ${esc(l)}"><span class="k">${esc(l)}:</span><span class="v">${esc(v)}</span><span class="x" aria-hidden="true">×</span></button>`).join('')}</span>
      ${chips.length ? '<button type="button" class="viz-clearbtn" data-act="limpiar-filtros">Limpiar filtros</button>' : ''}`;
  }

  const LIST_COLS = [
    { k: 'codigo', l: 'Código' }, { k: 'titulo', l: 'Proyecto' }, { k: null, l: 'Responsable' },
    { k: 'fecha', l: 'Fecha' }, { k: 'estado', l: 'Estado' }, { k: 'precio', l: 'Precio neto', num: true },
    { k: 'margen', l: 'Margen', num: true }, { k: 'rentDH', l: 'Utilidad<span class="th-sub">por día-hombre</span>', num: true }, { k: null, l: 'Alertas', num: true }, { k: null, l: '<span class="visualmente-oculto">Acciones</span>' }
  ];
  function renderListHead() {
    const s = state.list.sort;
    $('#list-head').innerHTML = `<tr>${LIST_COLS.map((c) => c.k
      ? `<th class="ordenable ${c.num ? 'num' : ''} ${s.k === c.k ? 'es-orden' : ''}" data-sort="${c.k}" tabindex="0" aria-sort="${s.k === c.k ? (s.dir > 0 ? 'ascending' : 'descending') : 'none'}">${c.l}<span class="orden">${s.k === c.k ? (s.dir > 0 ? '▲' : '▼') : '↕'}</span></th>`
      : `<th class="${c.num ? 'num' : ''}">${c.l}</th>`).join('')}</tr>`;
  }

  function renderListBody(list, rs) {
    const body = $('#list-body');
    if (!body) return;
    const s = state.list.sort;
    const val = (p) => {
      const r = rs.get(p.uid);
      switch (s.k) {
        case 'codigo': return `${p.codigo || ''} ${String(p.version).padStart(3, '0')}`;
        case 'titulo': return p.titulo || '';
        case 'fecha': return p.fecha || '';
        case 'estado': return S.ESTADOS.indexOf(p.estado);
        case 'precio': return r.totals.precioNeto;
        case 'margen': return ok(r.kpis.margen) ? r.kpis.margen : -Infinity;
        case 'rentDH': return ok(r.kpis.rentDH) ? r.kpis.rentDH : -Infinity;
        default: return String(p.modificado || '');
      }
    };
    const sorted = list.slice().sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true });
      return c * s.dir;
    });
    if (!sorted.length) { body.innerHTML = `<tr class="empty-row"><td colspan="${LIST_COLS.length}">No hay proyectos que coincidan con los filtros. <button type="button" class="link-btn" data-act="limpiar-filtros">Limpiar filtros</button></td></tr>`; return; }
    body.innerHTML = sorted.map((p) => {
      const r = rs.get(p.uid);
      const nAlert = r.warnings.filter((w) => w.level !== 'info').length;
      const nErr = r.warnings.filter((w) => w.level === 'error').length;
      return `<tr class="clickable" data-open="${p.uid}" tabindex="0" aria-label="Abrir ${esc(p.codigo)} ${esc(p.titulo || 'Sin título')}">
        <td class="nowrap code"><span class="code-badge">${esc(p.codigo || '—')}</span><span class="ver">v${esc(p.version)}</span></td>
        <td class="col-titulo" style="min-width:240px"><div class="proj-title">${esc(p.titulo || 'Sin título')}</div><div class="proj-sub">${esc([p.cliente, p.ubicacion].filter(Boolean).join(' · ') || '—')}</div>${carpetaCorta(p)}</td>
        <td data-label="Responsable">${esc(p.responsable || '—')}</td>
        <td class="nowrap" data-label="Fecha">${esc(fechaCorta(p.fecha))}</td>
        <td data-label="Estado"><span class="estado" data-e="${esc(p.estado)}">${esc(p.estado)}</span></td>
        <td class="num" data-label="Precio neto"><b>${clp(r.totals.precioNeto)}</b></td>
        <td class="num" data-label="Margen"><span class="dot ${r.status.margen}" aria-hidden="true"></span>${pct(r.kpis.margen)}</td>
        <td class="num" data-label="Utilidad por día-hombre">${clp(r.kpis.rentDH)}</td>
        <td class="num" data-label="Alertas">${nAlert ? `<span class="chip ${nErr ? 'bad' : 'warn'}">${nErr ? '✖' : '▲'} ${nAlert}</span>` : '<span class="muted">0</span>'}</td>
        <td class="cell-actions"><button type="button" class="icon-btn" data-menu="proj" data-id="${p.uid}" aria-haspopup="menu" aria-expanded="false" aria-label="Acciones de ${esc(p.codigo)}">${ICON.more}</button></td>
      </tr>`;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  //  EDITOR
  // ---------------------------------------------------------------------------
  function openProject(p, tab) {
    const valid = TABS.some((t) => t.id === tab);
    if (!state.project || state.project.uid !== p.uid) {
      state.filtro = { materiales: '', equipos: '', manoObra: '', otros: '' };
      state.apuOpen = new Set();
      state.utilUndo = null;
    }
    state.project = p;
    state.tab = valid ? tab : 'ficha';
    recalc();
    renderEditor();
  }

  function renderEditor() {
    const p = state.project;
    app.innerHTML = `<div class="viz-container">
        <div class="editor-head">
          <div class="editor-title">
            <h2 id="ed-title"></h2>
            <div class="meta" id="ed-meta"></div>
          </div>
          <div class="editor-actions">
            <div class="actions">
              <button class="btn" data-act="exp-xlsx" data-id="${p.uid}">${ICON.download}Exportar Excel</button>
              <button class="btn" data-menu="editor-more" data-id="${p.uid}" aria-haspopup="menu" aria-expanded="false" aria-label="Más acciones del proyecto">${ICON.more}</button>
            </div>
            <span class="en-vivo ${textoGuardado()[1]}" id="save-state">${textoGuardado()[0]}</span>
          </div>
        </div>
      </div>
      <div class="barra-pestanas">
        <div class="viz-container barra-pestanas-interior">
          <nav class="pasos-bar" aria-label="Pasos para formular el proyecto" id="tabs"></nav>
          <div class="lectura" id="lectura"></div>
        </div>
      </div>
      <div class="viz-container page" id="tab-body"></div>`;
    renderTab();
  }

  function metaCarpeta(p, sep) {
    const u = enSP() ? window.QCloud.ubicacion(p.uid) : null;
    if (!u) return '';
    const t = `${ICON.folder}<span>${esc(u.carpeta)}</span>`;
    return `${sep}${u.webUrl ? `<a class="meta-carpeta" href="${esc(u.webUrl)}" target="_blank" rel="noopener" title="Abrir la carpeta en SharePoint: ${esc(u.ruta)}">${t}</a>` : `<span class="meta-carpeta">${t}</span>`}`;
  }

  function updateHeader() {
    const p = state.project;
    const t = $('#ed-title');
    if (!p || !t) return;
    t.textContent = p.titulo || 'Proyecto sin título';
    t.classList.toggle('sin-titulo', !p.titulo);
    const sep = '<span class="sep" aria-hidden="true">·</span>';
    $('#ed-meta').innerHTML = `<span class="code-badge">${esc(p.codigo || 'SIN CÓDIGO')}</span><span>versión ${esc(p.version)}</span>
      <button type="button" class="estado" data-e="${esc(p.estado)}" data-picker="estado" aria-haspopup="listbox" aria-expanded="false" aria-label="Estado: ${esc(p.estado)}. Cambiar el estado">${esc(p.estado)}${svg('<path d="M6 9l6 6 6-6"/>')}</button>
      ${p.cliente ? `${sep}<span>${esc(p.cliente)}</span>` : ''}${p.responsable ? `${sep}<span>${esc(p.responsable)}</span>` : ''}${p.fecha ? `${sep}<span>${esc(fechaCorta(p.fecha))}</span>` : ''}${metaCarpeta(p, sep)}`;
    document.title = `${p.codigo || ''} ${p.titulo || 'Proyecto'} — Formulación QUEMPIN`;
    const sub = $('#hdr-sub');
    if (sub) sub.textContent = 'Costos, precio y evaluación de ofertas por partida';
    const mn = $('#modnav-proj');
    if (mn) {
      mn.href = `#/p/${p.uid}/${state.tab}`;
      mn.firstElementChild.textContent = `${p.codigo || 'Sin código'} v${p.version}`;
    }
  }

  /* Lectura fija junto a los pasos: precio, margen y alertas (el botón de alertas abre la lista
     y cada alerta lleva a la fila que hay que corregir) */
  function renderLectura() {
    const el = $('#lectura');
    if (!el) return;
    const r = state.result;
    const nErr = r.warnings.filter((w) => w.level === 'error').length;
    const nWarn = r.warnings.filter((w) => w.level === 'warn').length;
    const txt = nErr || nWarn ? [nErr ? plural(nErr, 'error', 'errores') : '', nWarn ? plural(nWarn, 'aviso') : ''].filter(Boolean).join(' y ') : 'sin alertas';
    el.innerHTML = `
      <div class="lectura-item"><span class="l">Precio neto</span><span class="v">${clp(r.totals.precioNeto)}</span></div>
      <div class="lectura-item"><span class="l">Margen</span><span class="v"><span class="dot ${r.status.margen}" aria-hidden="true" style="margin:0"></span>${pct(r.kpis.margen)}</span></div>
      <div class="lectura-item"><span class="l">Alertas</span><button type="button" class="v" data-menu="alertas" aria-haspopup="menu" aria-expanded="false" aria-label="Alertas: ${txt}. Ver y corregir">${nErr ? `<span class="chip bad">✖ ${nErr}</span>` : ''}${nWarn ? `<span class="chip warn">▲ ${nWarn}</span>` : ''}${!nErr && !nWarn ? '<span class="chip ok">✔ 0</span>' : ''}</button></div>`;
  }

  /* Estado de cada paso: 'ok' (completo), 'err', 'warn' o 'pend', y qué falta para completarlo */
  function estadoPasos() {
    const p = state.project;
    const r = state.result;
    const ws = r.warnings;
    const cuenta = (lvl, tabs) => ws.filter((w) => w.level === lvl && tabs.includes(w.tab)).length;
    const nCostos = COSTOS.reduce((a, k) => a + p[k].length, 0);
    const errTot = ws.filter((w) => w.level === 'error').length;
    return PASOS.map((ps) => {
      let est = 'pend', cant = null, falta = '';
      if (ps.n === 1) {
        est = String(p.titulo || '').trim() ? 'ok' : 'pend';
        if (est !== 'ok') falta = 'Falta el título del proyecto.';
      } else if (ps.n === 2) {
        cant = p.partidas.length;
        const e = cuenta('error', ['partidas']);
        est = e ? 'err' : cant ? 'ok' : 'pend';
        falta = !cant ? 'Agrega al menos una partida.' : e ? `${plural(e, 'partida')} con cantidad cero.` : '';
      } else if (ps.n === 3) {
        cant = nCostos;
        const e = cuenta('error', COSTOS);
        est = e ? 'err' : r.totals.cd > 0 ? 'ok' : 'pend';
        falta = e ? `${plural(e, 'costo')} sin partida: no se ${e === 1 ? 'suma' : 'suman'} al precio.` : r.totals.cd > 0 ? '' : 'Agrega los costos de cada partida.';
      } else if (ps.n === 4) {
        const w = cuenta('warn', ['resumen']);
        est = !(r.totals.cd > 0) ? 'pend' : w ? 'warn' : 'ok';
        falta = !(r.totals.cd > 0) ? 'Primero ingresa los costos.' : w ? `${plural(w, 'partida')} sin utilidad o con utilidad negativa.` : '';
      } else {
        est = errTot ? 'err' : r.totals.precioNeto > 0 ? 'ok' : 'pend';
        falta = errTot ? `Corrige ${plural(errTot, 'error', 'errores')} antes de enviar la oferta.` : '';
      }
      return Object.assign({}, ps, { est, cant, falta });
    });
  }

  function updateTabs() {
    const el = $('#tabs');
    if (!el) return;
    const paso = tabInfo(state.tab).paso;
    const EST = { ok: 'completo', err: 'con errores', warn: 'con avisos', pend: 'pendiente' };
    el.innerHTML = estadoPasos().map((ps) => {
      const on = ps.n === paso;
      const destino = ps.n === 3 ? (COSTOS.includes(state.tab) ? state.tab : state.costoTab) : ps.tabs[0];
      const marca = ps.est === 'ok' ? '✓' : ps.est === 'err' || ps.est === 'warn' ? '!' : ps.n;
      return `<button type="button" class="paso-tab est-${ps.est} ${on ? 'active' : ''}" data-act="tab" data-tab="${destino}" ${on ? 'aria-current="step"' : ''}
          aria-label="Paso ${ps.n}: ${esc(ps.label)}${ps.n === 2 ? ` (${plural(ps.cant, 'partida')})` : ps.n === 3 ? ` (${plural(ps.cant, 'costo')})` : ''}, ${EST[ps.est]}">
          <span class="paso-marca" aria-hidden="true">${marca}</span><span class="paso-l">${esc(ps.label)}</span>${ps.n === 2 || ps.n === 3 ? `<span class="count" aria-hidden="true">${ps.cant}</span>` : ''}
        </button>`;
    }).join('<span class="paso-sep" aria-hidden="true"></span>');
    // En pantallas angostas la barra se desplaza: mantener visible el paso activo
    const act = $('.paso-tab.active', el);
    if (act && el.scrollWidth > el.clientWidth) {
      const l = act.offsetLeft - el.offsetLeft, r = l + act.offsetWidth;
      if (l < el.scrollLeft) el.scrollLeft = l - 12;
      else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth + 28;
    }
  }

  /* Encabezado de cada paso: número, título, para qué sirve (una frase) y ayuda desplegable */
  function pasoHead(tab, ayuda, rotulo) {
    const t = tabInfo(tab);
    const titulo = t.paso === 3 ? 'Costos' : t.label;
    const k = 'ayuda-' + tab;
    return `<div class="paso-head">
        <div class="paso-head-txt">
          <h3 class="paso-titulo"><span class="paso-num">Paso ${t.paso} de ${PASOS.length}</span>${esc(titulo)}</h3>
          <p class="paso-proposito">${esc(PROPOSITO[tab])}</p>
        </div>
        ${ayuda ? `<details class="ayuda no-print" data-open-key="${k}" ${state.abiertos.has(k) ? 'open' : ''}>
          <summary>${ICON.help}<span>${rotulo || '¿Cómo se calcula?'}</span></summary>
          <div class="ayuda-body">${ayuda}</div></details>` : ''}
      </div>`;
  }

  /* Pie de cada paso: anterior, lo que falta y siguiente */
  function pasoNav(tab) {
    const i = ORDEN.indexOf(tab);
    const prev = ORDEN[i - 1], next = ORDEN[i + 1];
    const nombre = (id) => (COSTOS.includes(id) ? (COSTOS.includes(tab) ? DETALLE[id].titulo : `Costos · ${DETALLE[id].titulo}`) : tabInfo(id).label);
    // En partidas y costos la acción principal es «Agregar»; en los demás pasos, avanzar
    const principal = !(tab === 'partidas' || COSTOS.includes(tab));
    const sig = next
      ? `<button type="button" class="btn ${principal ? 'btn-primario' : 'btn-sig'}" data-act="tab" data-tab="${next}">Siguiente: ${esc(nombre(next))}${ICON.arrow}</button>`
      : `<button type="button" class="btn btn-primario" data-act="exp-xlsx" data-id="${state.project.uid}">${ICON.download}Exportar Excel</button>`;
    return `<nav class="paso-pie no-print" aria-label="Pasos">
        ${prev ? `<button type="button" class="btn btn-ghost" data-act="tab" data-tab="${prev}">← ${esc(nombre(prev))}</button>` : '<span></span>'}
        <span class="paso-falta" id="paso-falta" role="status"></span>
        ${sig}
      </nav>`;
  }
  function pintarFalta() {
    const el = $('#paso-falta');
    if (!el) return;
    const tab = state.tab;
    let falta = estadoPasos()[tabInfo(tab).paso - 1].falta;
    if (COSTOS.includes(tab)) {
      const e = state.result.warnings.filter((w) => w.tab === tab && w.level === 'error').length;
      falta = e ? `${plural(e, 'costo')} sin partida: no se ${e === 1 ? 'suma' : 'suman'} al precio.` : '';
    }
    el.innerHTML = falta ? `<span class="marca-pop warn" aria-hidden="true"></span>${esc(falta)}` : '';
  }

  /* Subpestañas del paso 3: un tipo de costo a la vez, con su total */
  function costosSubnav() {
    return `<div class="subtabs" role="tablist" aria-label="Tipo de costo">${COSTOS.map((k) => {
      const on = state.tab === k;
      return `<button type="button" role="tab" aria-selected="${on}" class="subtab ${on ? 'active' : ''}" data-act="tab" data-tab="${k}">
          <span class="swatch ${DETALLE[k].cat}" aria-hidden="true"></span><span class="st-t">${DETALLE[k].titulo}</span>
          <span class="count" data-count="${k}"></span><span class="st-v" data-c="T:${DETALLE[k].total}" data-fmt="clp"></span>
        </button>`;
    }).join('')}</div>`;
  }

  function renderTab(focusKey) {
    const body = $('#tab-body');
    if (!body) return;
    closePop();
    const tab = state.tab;
    if (COSTOS.includes(tab)) state.costoTab = tab;
    let html;
    if (state.imprimir) html = viewResumen() + viewEvaluacion();
    else if (tab === 'ficha') html = viewFicha();
    else if (tab === 'partidas') html = viewPartidas();
    else if (tab === 'manoObra') html = viewManoObra();
    else if (DETALLE[tab]) html = viewDetalle(tab);
    else if (tab === 'resumen') html = viewResumen();
    else html = viewEvaluacion();
    body.innerHTML = html + (state.imprimir ? '' : pasoNav(tab));
    history.replaceState(null, '', `#/p/${state.project.uid}/${tab}`);
    updateCalc();
    if (tab === 'ficha') updateCodigoHint();
    if (focusKey) {
      const el = $(focusKey, body);
      if (el) { el.focus(); if (el.select && el.type !== 'number' && el.tagName === 'INPUT') el.select(); }
    }
  }

  // ---- Controles reutilizables -------------------------------------------------
  const fInput = (path, label, opts) => {
    const o = opts || {};
    const v = getPath(state.project, path);
    const type = o.type || 'text';
    const attrs = type === 'num' ? 'type="number" step="any" inputmode="decimal" data-t="num"' : (type === 'date' ? 'type="date"' : 'type="text"');
    const input = `<input class="input" id="f-${path}" ${attrs} data-f="${path}" value="${esc(v === null || v === undefined ? '' : v)}" ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''}>`;
    const wrapped = o.suffix ? `<div class="input-affix">${input}<span class="affix">${o.suffix}</span></div>`
      : o.prefix ? `<div class="input-affix pre">${input}<span class="affix">${o.prefix}</span></div>` : input;
    return `<div class="campo ${o.cls || ''}"><label for="f-${path}">${label}${o.opcional ? ' <span class="opc">(opcional)</span>' : ''}</label>${wrapped}${o.hint ? `<span class="hint" ${o.hintId ? `id="${o.hintId}"` : ''}>${o.hint}</span>` : ''}</div>`;
  };
  const rowInput = (list, it, k, label, cls, isNum, extra) =>
    `<input class="ci ${cls || ''} ${isNum ? 'num' : ''}" ${isNum ? 'type="number" step="any" inputmode="decimal" data-t="num"' : 'type="text"'} data-list="${list}" data-uid="${it.uid}" data-k="${k}" value="${esc(it[k] === null || it[k] === undefined ? '' : it[k])}" aria-label="${esc(label)}" ${extra || ''}>`;
  const unitCombo = (inputHtml, label) => `<div class="combo">${inputHtml}<button type="button" class="combo-btn" data-picker="unidad" tabindex="-1" aria-haspopup="listbox" aria-expanded="false" aria-label="Elegir ${esc(label)}">${svg('<path d="M6 9l6 6 6-6"/>')}</button></div>`;
  const rowUnit = (list, it, label) => unitCombo(rowInput(list, it, 'unidad', label, 'w-xs', false, 'autocomplete="off"'), label);
  const btnFila = (list, uid, code) => `<button type="button" class="icon-btn" data-menu="fila" data-list="${list}" data-uid="${uid}" aria-haspopup="menu" aria-expanded="false" aria-label="Acciones de ${esc(code)}" title="Acciones de ${esc(code)}">${ICON.more}</button>`;
  const seg = (name, opts, attrs, cls) => `<div class="segmentado ${cls || ''}" role="radiogroup" ${attrs.label ? `aria-label="${esc(attrs.label)}"` : ''}>${opts.map((o) =>
    `<label><input type="radio" name="${name}" value="${esc(o.v)}" ${o.checked ? 'checked' : ''} ${attrs.data || ''}><span>${o.l}</span></label>`).join('')}</div>`;
  /* Sección plegable con el resumen de sus valores en la línea de título */
  const plegable = (key, titulo, resumen, cuerpo, cls) => `<details class="panel plegable ${cls || ''}" id="${key}" data-open-key="${key}" ${state.abiertos.has(key) || state.imprimir ? 'open' : ''}>
      <summary><span class="pl-t"><span class="seccion-titulo">${titulo}</span><span class="pl-res" id="res-${key}">${resumen}</span></span><span class="pl-accion" aria-hidden="true"></span></summary>
      <div class="pl-cuerpo">${cuerpo}</div></details>`;

  // ---- Paso 1: datos del proyecto ------------------------------------------------
  const resumenPrecio = (par) => `IVA ${nf(num(par.iva))} % · gastos generales ${nf(num(par.gastosGenerales))} % · imprevistos ${nf(num(par.imprevistos))} % · día-hombre ${clp(num(par.tarifaN1))} / ${clp(num(par.tarifaN2))} / ${clp(num(par.tarifaN3))}`;
  const resumenMetas = (par) => `Margen objetivo ${nf(num(par.margenObjetivo))} % · mínimo ${nf(num(par.margenMinimo))} % · ${num(par.metaUtilidadDH) > 0 ? `meta ${clp(num(par.metaUtilidadDH))} por día-hombre` : 'sin meta por día-hombre'}`;
  const resumenCatalogo = (p) => `${plural((p.catalogoOtros || []).length, 'referencia')} para agregar rápido en Costos · Otros`;

  function viewFicha() {
    const p = state.project;
    const par = p.parametros;
    const cuerpoPrecio = `<div class="fila-campos tres">
          ${fInput('parametros.iva', 'IVA', { type: 'num', suffix: '%' })}
          ${fInput('parametros.gastosGenerales', 'Gastos generales', { type: 'num', suffix: '%', hint: '% del costo directo' })}
          ${fInput('parametros.imprevistos', 'Imprevistos', { type: 'num', suffix: '%', hint: '% del costo directo' })}
        </div>
        <div class="bloque" id="tarifas">
          <h4 class="sub-t">Tarifa por día-hombre <span class="tn">(costo de una persona por un día de trabajo)</span></h4>
          <div class="fila-campos tres">
            ${fInput('parametros.tarifaN1', 'Nivel 1', { type: 'num', prefix: '$' })}
            ${fInput('parametros.tarifaN2', 'Nivel 2', { type: 'num', prefix: '$' })}
            ${fInput('parametros.tarifaN3', 'Nivel 3', { type: 'num', prefix: '$' })}
          </div>
        </div>`;
    const cuerpoMetas = `<p class="panel-sub">Definen los semáforos de la evaluación (paso 5).</p>
        <div class="fila-campos">
          ${fInput('parametros.margenObjetivo', 'Margen objetivo', { type: 'num', suffix: '%' })}
          ${fInput('parametros.margenMinimo', 'Margen mínimo aceptable', { type: 'num', suffix: '%' })}
          ${fInput('parametros.metaUtilidadDH', 'Meta de utilidad por día-hombre', { type: 'num', prefix: '$', hint: '0 = sin meta' })}
          ${fInput('parametros.umbralAjustado', 'Oferta «ajustada» desde', { type: 'num', suffix: '%', hint: '% del presupuesto del mandante' })}
        </div>`;
    const cuerpoCatalogo = `<div class="tabla-contenedor">
          <table class="tbl tbl-catalogo">
            <thead><tr><th>Descripción</th><th>Unidad</th><th class="num">Costo unitario</th><th><span class="visualmente-oculto">Acciones</span></th></tr></thead>
            <tbody>${(p.catalogoOtros || []).map((c, i) => `<tr>
              <td data-label="Descripción"><input class="ci" style="min-width:180px" data-cat="${i}" data-k="descripcion" value="${esc(c.descripcion)}" aria-label="Descripción de la referencia ${i + 1}"></td>
              <td data-label="Unidad">${unitCombo(`<input class="ci w-xs" data-cat="${i}" data-k="unidad" value="${esc(c.unidad)}" aria-label="Unidad de la referencia ${i + 1}" autocomplete="off">`, 'unidad')}</td>
              <td data-label="Costo unitario"><input class="ci num w-sm" type="number" step="any" data-t="num" data-cat="${i}" data-k="costoUnitario" value="${esc(c.costoUnitario)}" aria-label="Costo unitario de la referencia ${i + 1}"></td>
              <td class="cell-actions"><button type="button" class="icon-btn del" data-act="del-cat" data-i="${i}" aria-label="Eliminar referencia ${i + 1}" title="Eliminar">${ICON.trash}</button></td>
            </tr>`).join('') || '<tr class="empty-row"><td colspan="4">Sin referencias.</td></tr>'}</tbody>
          </table>
        </div>
        <div style="margin-top:12px"><button type="button" class="btn btn-sm" data-act="add-cat">${ICON.plus}Agregar referencia</button></div>`;
    const ayuda = `<p>Los parámetros se guardan con este proyecto: cambiarlos aquí no afecta a los demás.
      Con gastos generales e imprevistos en 0 % el cálculo es idéntico al Excel original.</p>
      <p>Para cambiar los valores con que parten los proyectos nuevos, usa <b>Configuración</b> (arriba a la derecha).</p>`;
    return `${pasoHead('ficha', ayuda, 'Ayuda')}
    <div class="grid-2">
      <div class="col">
        <section class="panel">
          <h4 class="seccion-titulo">Identificación</h4>
          <div class="fila-campos">
            ${fInput('titulo', 'Título del proyecto', { cls: 'ancho', placeholder: 'Ej.: Instalación de medidores de gas natural' })}
            ${fInput('cliente', 'Cliente / mandante')}
            ${fInput('ubicacion', 'Ubicación')}
            ${fInput('responsable', 'Responsable')}
            ${fInput('fecha', 'Fecha de formulación', { type: 'date' })}
            ${fInput('codigo', 'Código', { hint: ' ', hintId: 'codigo-hint' })}
            ${fInput('version', 'Versión', { type: 'num' })}
            <div class="campo ancho"><label for="f-descripcion">Descripción / alcance <span class="opc">(opcional)</span></label>
              <textarea class="textarea" id="f-descripcion" data-f="descripcion" rows="3">${esc(p.descripcion)}</textarea></div>
          </div>
        </section>
      </div>
      <div class="col">
        <section class="panel">
          <h4 class="seccion-titulo">Presupuesto del mandante <span class="tn">(opcional)</span></h4>
          <p class="panel-sub">Si lo conoces, la evaluación indica si la oferta cabe en él.</p>
          <div class="fila-campos">
            ${fInput('parametros.presupuestoMaximo', 'Presupuesto máximo', { type: 'num', prefix: '$', placeholder: 'Sin informar' })}
            <div class="campo"><span class="label" id="lbl-iva-ppto">Se informa</span>
              ${seg('f-ppto-iva', [{ v: '0', l: 'Neto', checked: !par.presupuestoIncluyeIva }, { v: '1', l: 'Con IVA', checked: !!par.presupuestoIncluyeIva }], { label: 'El presupuesto se informa', data: 'data-f="parametros.presupuestoIncluyeIva" data-t="bool01"' })}</div>
          </div>
        </section>
        <div class="grupo-plegable">
          <p class="grupo-plegable-t">Parámetros de este proyecto <span class="tn">· ya vienen con los valores habituales</span></p>
          ${plegable('f-precio', 'Estructura de precio y tarifas', resumenPrecio(par), cuerpoPrecio)}
          ${plegable('f-metas', 'Metas de evaluación', resumenMetas(par), cuerpoMetas)}
          ${plegable('f-catalogo', 'Catálogo de otros costos', resumenCatalogo(p), cuerpoCatalogo)}
          <p class="pie-param">¿Son los habituales de QUEMPIN? <button type="button" class="link-btn" data-act="save-defaults">Usarlos en los proyectos nuevos</button></p>
        </div>
      </div>
    </div>`;
  }
  function refreshFicha() {
    const p = state.project;
    const a = $('#res-f-precio'), b = $('#res-f-metas'), c = $('#res-f-catalogo');
    if (a) a.textContent = resumenPrecio(p.parametros);
    if (b) b.textContent = resumenMetas(p.parametros);
    if (c) c.textContent = resumenCatalogo(p);
  }

  function updateCodigoHint() {
    const el = $('#codigo-hint');
    if (!el) return;
    const p = state.project;
    const dup = S.all().find((x) => x.uid !== p.uid && x.codigo === p.codigo && String(x.version) === String(p.version));
    el.textContent = dup ? `⚠ Ya existe otro proyecto ${p.codigo} v${p.version} («${String(dup.titulo || '').slice(0, 40)}»).`
      : enSP() ? 'N° de la oferta en la planilla de ingreso.' : 'Correlativo automático; puedes editarlo.';
    el.style.color = dup ? 'var(--status-bad)' : '';
  }

  // ---- Paso 2: partidas -----------------------------------------------------------
  function viewPartidas() {
    const p = state.project;
    const rows = p.partidas.map((it, i) => {
      const code = 'P' + (i + 1);
      const uLabel = it.utilidadTipo === 'monto' ? 'monto fijo' : `recargo ${nf(num(it.utilidadValor))} %`;
      return `<tr data-row="${it.uid}">
        <td class="code">${code}</td>
        <td data-label="Descripción">${rowInput('partidas', it, 'descripcion', `Descripción de ${code}`, 'desc', false, 'placeholder="Ej.: Instalación de medidor de 2&quot;"')}</td>
        <td data-label="Cantidad">${rowInput('partidas', it, 'cantidad', `Cantidad de ${code}`, 'w-sm', true)}</td>
        <td data-label="Unidad">${rowUnit('partidas', it, `unidad de ${code}`)}</td>
        <td class="num calc" data-label="Costo directo" data-c="P:${it.uid}:cd" data-fmt="clp"></td>
        <td class="num calc" data-label="Utilidad"><span data-c="P:${it.uid}:utilidad" data-fmt="clp"></span><div class="small muted">${esc(uLabel)}</div></td>
        <td class="num calc strong" data-label="Precio neto" data-c="P:${it.uid}:precio" data-fmt="clp"></td>
        <td class="num calc" data-label="Precio unitario" data-c="P:${it.uid}:pu" data-fmt="clp"></td>
        <td class="cell-actions">${btnFila('partidas', it.uid, code)}</td>
      </tr>`;
    }).join('');
    const ayuda = `<p>La <b>cantidad</b> es cuántas unidades tiene la partida (3 medidores, 120 m de cañería…). En el paso 3 cada costo se ingresa para <b>una</b> unidad y se multiplica por esta cantidad.</p>
      <p>Las columnas sombreadas se calculan solas. <b>Precio neto</b> = costo directo + utilidad (la utilidad se define en el paso 4). <b>Precio unitario</b> = precio neto ÷ cantidad.</p>`;
    return `${pasoHead('partidas', ayuda)}
      <div class="tbl-toolbar">
        <div class="left"><button type="button" class="btn btn-primario btn-sm" data-act="add-row" data-list="partidas">${ICON.plus}Agregar partida</button></div>
      </div>
      <div class="tabla-contenedor">
        <table class="tbl tbl-apilable" style="min-width:900px">
          <thead><tr>
            <th>ID</th><th>Descripción</th><th class="num">Cantidad</th><th>Unidad</th>
            <th class="num">Costo directo</th><th class="num">Utilidad</th><th class="num">Precio neto</th><th class="num">Precio unitario</th><th><span class="visualmente-oculto">Acciones</span></th>
          </tr></thead>
          <tbody>${rows || `<tr class="empty-row"><td colspan="9">Aún no hay partidas. <button type="button" class="link-btn" data-act="add-row" data-list="partidas">Agregar la primera</button></td></tr>`}</tbody>
          <tfoot><tr>
            <td></td><td colspan="3">Total (${plural(p.partidas.length, 'partida')})</td>
            <td class="num" data-label="Costo directo" data-c="T:cd" data-fmt="clp"></td>
            <td class="num" data-label="Utilidad" data-c="T:utilidad" data-fmt="clp"></td>
            <td class="num" data-label="Precio neto" data-c="T:precioNeto" data-fmt="clp"></td>
            <td></td><td></td>
          </tr></tfoot>
        </table>
      </div>`;
  }

  // ---- Paso 3: costos (materiales, equipos, otros) ----------------------------------
  function partidaPicker(list, it) {
    const pt = state.partIdx.get(it.partida);
    const tieneDatos = String(it.descripcion || '').trim() || num(it.costoUnitario) > 0 || num(it.n1p) + num(it.n2p) + num(it.n3p) > 0;
    const full = pt ? `${pt.code} · ${pt.descripcion || 'Sin descripción'}` : 'Sin partida';
    return `<button type="button" class="picker ${!pt && tieneDatos ? 'error' : ''}" data-picker="partida" data-list="${list}" data-uid="${it.uid}" aria-haspopup="listbox" aria-expanded="false" aria-label="Partida asociada: ${esc(full)}" title="${esc(full)}">
      ${pt ? `<span class="pcode">${pt.code}</span><span class="txt">${esc(pt.descripcion || 'Sin descripción')}</span>` : `<span class="pcode none">—</span><span class="txt muted">${tieneDatos ? 'Elegir partida' : 'Sin partida'}</span>`}${ICON.chev}</button>`;
  }
  function filtroBar(key) {
    const p = state.project;
    const cfg = DETALLE[key];
    const f = state.filtro[key];
    return `<div class="tbl-toolbar">
      <div class="left">
        <button type="button" class="btn btn-primario btn-sm" data-act="add-row" data-list="${key}">${ICON.plus}Agregar ${cfg.singular}</button>
        ${key === 'otros' ? `<button type="button" class="btn btn-sm" data-menu="catalogo" data-align="left" aria-haspopup="menu" aria-expanded="false">Agregar desde catálogo${ICON.caret}</button>` : ''}
      </div>
      ${p.partidas.length > 1 ? `<div class="right">
        <div class="filtro"><label for="filtro-${key}">Mostrar</label>
          <select id="filtro-${key}" data-filtro="${key}" class="${f ? 'is-set' : ''}">
            <option value="">Todas las partidas</option>
            ${p.partidas.map((pt, i) => `<option value="${pt.uid}" ${f === pt.uid ? 'selected' : ''}>P${i + 1} · ${esc(pt.descripcion || 'Sin descripción')}</option>`).join('')}
            <option value="__none__" ${f === '__none__' ? 'selected' : ''}>Sin partida asociada</option>
          </select></div>
      </div>` : ''}
    </div>`;
  }
  function filtered(key) {
    const f = state.filtro[key];
    return state.project[key].filter((it) => !f || (f === '__none__' ? !state.partIdx.has(it.partida) : it.partida === f));
  }
  function sinPartidasNote() {
    return state.project.partidas.length ? '' :
      `<div class="nota"><span>Primero crea las partidas: cada costo se asocia a una partida para sumarse al precio.</span><button type="button" class="btn btn-sm" data-act="tab" data-tab="partidas">Ir a Partidas →</button></div>`;
  }
  function ayudaCostos(key) {
    const ej = key === 'otros'
      ? 'si la partida son 3 medidores y cada uno requiere 2 almuerzos de $10.000, ingresa 2: el subtotal es 2 × $10.000 × 3 = $60.000.'
      : 'si la partida son 3 medidores y cada uno lleva 2 flanges de $14.580, ingresa 2: el subtotal es 2 × $14.580 × 3 = $87.480.';
    return `<p><b>Subtotal</b> = cantidad por unidad × costo unitario × cantidad de la partida.</p>
      <p>Ejemplo: ${ej}</p>
      <p>Pasa el cursor sobre un subtotal para ver su cálculo. Un costo sin partida no se suma al precio.${key === 'otros' ? ' El catálogo se edita en el paso 1, Datos del proyecto.' : ''}</p>`;
  }
  /* Cálculo de una línea de costo, para la ayuda emergente de su subtotal */
  function formulaLinea(ref) {
    const [list, uid] = ref.split(':');
    const it = findItem(list, uid);
    const l = state.lineIdx.get(uid);
    if (!it || !l) return '';
    if (!l.partidaUid) return '<b>Sin partida</b>Elige la partida para que este costo se sume al precio.';
    if (list === 'manoObra') {
      const par = state.project.parametros;
      const niv = [1, 2, 3].filter((n) => num(it[`n${n}p`]) * num(it[`n${n}d`]) > 0)
        .map((n) => `${nf(num(it[`n${n}p`]))} × ${nf(num(it[`n${n}d`]))} × ${clp(num(par['tarifaN' + n]))}`);
      return `<b>${esc(l.code)} · ${clp(l.subtotal)}</b>(${niv.join(' + ') || '0'}) × ${nf(l.qtyPartida)} unidades de la partida`;
    }
    return `<b>${esc(l.code)} · ${clp(l.subtotal)}</b>${nf(num(it.cantidad))} ${esc(it.unidad || '')} × ${clp(num(it.costoUnitario))} × ${nf(l.qtyPartida)} unidades de la partida`;
  }

  function viewDetalle(key) {
    const cfg = DETALLE[key];
    const items = filtered(key);
    const rows = items.map((it) => {
      const ln = state.lineIdx.get(it.uid);
      const code = ln ? ln.code : '';
      return `<tr data-row="${it.uid}">
        <td class="code">${code}</td>
        <td data-label="Descripción">${rowInput(key, it, 'descripcion', `Descripción de ${code}`, 'desc', false, `placeholder="Descripción del ${cfg.singular}"`)}</td>
        <td data-label="Partida">${partidaPicker(key, it)}</td>
        <td class="tercio" data-label="Cantidad">${rowInput(key, it, 'cantidad', `Cantidad por unidad de partida de ${code}`, 'w-sm', true)}</td>
        <td class="tercio" data-label="Unidad">${rowUnit(key, it, `unidad de ${code}`)}</td>
        <td class="tercio" data-label="Costo unitario">${rowInput(key, it, 'costoUnitario', `Costo unitario de ${code}`, 'w-md', true)}</td>
        <td class="num calc veces tercio" data-label="× Partida"><span>× <span data-c="L:${key}:${it.uid}:qtyPartida" data-fmt="num"></span></span></td>
        <td class="num calc strong dos-tercios" data-label="Subtotal" data-formula="${key}:${it.uid}" data-c="L:${key}:${it.uid}:subtotal" data-fmt="clp"></td>
        <td class="cell-actions">${btnFila(key, it.uid, code)}</td>
      </tr>`;
    }).join('');
    return `${pasoHead(key, ayudaCostos(key))}${costosSubnav()}${sinPartidasNote()}
      ${filtroBar(key)}
      <div class="tabla-contenedor">
        <table class="tbl tbl-apilable" style="min-width:980px">
          <thead><tr>
            <th>ID</th><th>Descripción</th><th>Partida</th>
            <th class="num">Cantidad<span class="th-sub">por unidad de partida</span></th><th>Unidad</th><th class="num">Costo unitario</th>
            <th class="num">× Partida<span class="th-sub">su cantidad</span></th><th class="num">Subtotal</th><th><span class="visualmente-oculto">Acciones</span></th>
          </tr></thead>
          <tbody>${rows || `<tr class="empty-row"><td colspan="9">${state.filtro[key] ? 'No hay ítems con este filtro.' : `Sin ${cfg.titulo.toLowerCase()} todavía. <button type="button" class="link-btn" data-act="add-row" data-list="${key}">Agregar el primero</button>`}</td></tr>`}</tbody>
          <tfoot><tr><td></td><td colspan="6"><span class="swatch ${cfg.cat}" style="vertical-align:-1px;margin-right:8px"></span>Total ${cfg.titulo.toLowerCase()} del proyecto</td><td class="num" data-label="Total" data-c="T:${cfg.total}" data-fmt="clp"></td><td></td></tr></tfoot>
        </table>
      </div>`;
  }

  // ---- Paso 3: mano de obra ------------------------------------------------------
  function viewManoObra() {
    const key = 'manoObra';
    const par = state.project.parametros;
    const items = filtered(key);
    const rows = items.map((it) => {
      const ln = state.lineIdx.get(it.uid);
      const code = ln ? ln.code : '';
      const lv = (n) => `<td class="lvl" data-label="Nivel ${n} · personas × días"><div class="pxd">${rowInput(key, it, `n${n}p`, `Personas del nivel ${n} en ${code}`, 'w-xxs', true)}<span class="por" aria-hidden="true">×</span>${rowInput(key, it, `n${n}d`, `Días del nivel ${n} en ${code}`, 'w-xxs', true)}</div></td>`;
      return `<tr data-row="${it.uid}">
        <td class="code">${code}</td>
        <td data-label="Tarea">${rowInput(key, it, 'descripcion', `Tarea ${code}`, 'desc', false, 'placeholder="Descripción de la tarea"')}</td>
        <td data-label="Partida">${partidaPicker(key, it)}</td>
        ${lv(1)}${lv(2)}${lv(3)}
        <td class="num calc" data-label="Días-hombre"><span data-c="L:${key}:${it.uid}:dh" data-fmt="num"></span><div class="small muted"><span data-c="L:${key}:${it.uid}:dhPorUnidadPartida" data-fmt="num"></span> por unidad</div></td>
        <td class="num calc strong" data-label="Subtotal" data-formula="${key}:${it.uid}" data-c="L:${key}:${it.uid}:subtotal" data-fmt="clp"></td>
        <td class="cell-actions">${btnFila(key, it.uid, code)}</td>
      </tr>`;
    }).join('');
    const nivel = (n, t) => `<th class="lvl-th">Nivel ${n}<span class="th-sub">${clp(num(t))} por día</span><span class="th-sub">personas × días</span></th>`;
    const ayuda = `<p><b>Días-hombre</b> = personas × días de cada nivel, sumados, × cantidad de la partida. Es el esfuerzo total, no el plazo.</p>
      <p><b>Subtotal</b> = personas × días × tarifa del nivel, sumando los tres niveles, × cantidad de la partida.</p>
      <p>Tarifas por día-hombre: nivel 1 ${clp(num(par.tarifaN1))} · nivel 2 ${clp(num(par.tarifaN2))} · nivel 3 ${clp(num(par.tarifaN3))}.
        <button type="button" class="link-btn" data-act="tab" data-tab="ficha" data-focus="tarifas">Cambiar las tarifas</button></p>`;
    return `${pasoHead(key, ayuda)}${costosSubnav()}${sinPartidasNote()}
      ${filtroBar(key)}
      <div class="tabla-contenedor">
        <table class="tbl mo tbl-apilable" style="min-width:1000px">
          <thead><tr><th>ID</th><th>Tarea</th><th>Partida</th>${nivel(1, par.tarifaN1)}${nivel(2, par.tarifaN2)}${nivel(3, par.tarifaN3)}
            <th class="num">Días-hombre</th><th class="num">Subtotal</th><th><span class="visualmente-oculto">Acciones</span></th></tr></thead>
          <tbody>${rows || `<tr class="empty-row"><td colspan="9">${state.filtro[key] ? 'No hay tareas con este filtro.' : 'Sin tareas de mano de obra todavía. <button type="button" class="link-btn" data-act="add-row" data-list="manoObra">Agregar la primera</button>'}</td></tr>`}</tbody>
          <tfoot><tr><td></td><td colspan="5"><span class="swatch cat-mo" style="vertical-align:-1px;margin-right:8px"></span>Total mano de obra · costo promedio por día-hombre: <span data-c="K:costoMODH" data-fmt="clp"></span></td>
            <td class="num" data-label="Días-hombre" data-c="T:dh" data-fmt="num"></td><td class="num" data-label="Total" data-c="T:mo" data-fmt="clp"></td><td></td></tr></tfoot>
        </table>
      </div>`;
  }

  // ---- Semáforos compartidos --------------------------------------------------------
  const CHIP_TXT = {
    margen: { ok: 'Sobre objetivo', warn: 'Bajo objetivo', bad: 'Bajo el mínimo' },
    markup: { ok: 'Sobre objetivo', warn: 'Bajo objetivo', bad: 'Bajo el mínimo' },
    rentDH: { ok: 'Cumple la meta', warn: 'Cerca de la meta', bad: 'Bajo la meta', info: 'Sin meta' },
    competitividad: { ok: 'Con holgura', warn: 'Ajustada', bad: 'Excede presupuesto', na: 'Sin presupuesto' },
    sensibilidad: { ok: 'Resiste', warn: 'Margen bajo el mínimo', bad: 'Genera pérdida' }
  };
  const ICO = { ok: '✔', warn: '▲', bad: '✖', info: '•', na: '•' };
  function chip(status, key) {
    const t = (CHIP_TXT[key] && CHIP_TXT[key][status]) || (status === 'na' ? 'Sin datos' : 'Referencial');
    return `<span class="chip ${status}">${ICO[status] || '•'} ${t}</span>`;
  }

  function medidor(o) {
    const max = o.max > 0 ? o.max : 1;
    const w = Math.max(0, Math.min(1, (o.v || 0) / max)) * 100;
    const ticks = (o.ticks || []).filter((t) => t.at > 0 && t.at <= max);
    return `<div class="medidor" role="img" aria-label="${esc(o.label || '')}">
        <div class="fill ${o.fill || ''}" style="width:${w}%"></div>
        ${ticks.map((t) => `<span class="tick ${t.dash ? 'dash' : ''}" style="left:${(t.at / max) * 100}%" data-tip="${esc(t.tip || '')}"></span>`).join('')}
      </div>
      <div class="medidor-escala"><span style="left:0">${esc(o.fmt(0))}</span>${ticks.filter((t) => t.show).map((t) => `<span style="left:${(t.at / max) * 100}%">${esc(o.fmt(t.at))}</span>`).join('')}<span class="end" style="left:100%">${esc(o.fmt(max))}</span></div>`;
  }

  // ---- Paso 4: utilidad y precio --------------------------------------------------
  function viewResumen() {
    const p = state.project;
    const mObj = num(p.parametros.margenObjetivo);
    const utilRows = p.partidas.map((it, i) => {
      const code = 'P' + (i + 1);
      const isPct = it.utilidadTipo !== 'monto';
      return `<tr data-row="${it.uid}">
        <td><div class="pnom"><span class="pcode">${code}</span><div style="min-width:0"><div class="t">${esc(it.descripcion || 'Partida sin descripción')}</div>
          <div class="s">${esc(nf(num(it.cantidad)))} ${esc(it.unidad || '')} · costo directo <span data-c="P:${it.uid}:cd" data-fmt="clp"></span></div></div></div></td>
        <td data-label="Utilidad"><div class="util-edit">
          ${seg(`ut-${it.uid}`, [{ v: 'pct', l: '%', checked: isPct }, { v: 'monto', l: '$', checked: !isPct }], { label: `Tipo de utilidad de ${code}`, data: `data-list="partidas" data-uid="${it.uid}" data-k="utilidadTipo" data-rerender` }, 'sm')}
          ${rowInput('partidas', it, 'utilidadValor', `Utilidad de ${code} ${isPct ? 'en % de recargo' : 'en pesos'}`, 'num', true, `placeholder="${isPct ? '%' : '$'}"`)}
        </div></td>
        <td class="num calc" data-label="Utilidad en $" data-c="P:${it.uid}:utilidad" data-fmt="clp"></td>
        <td class="num calc" data-label="Margen"><span class="dot na" data-sem-p="${it.uid}" aria-hidden="true"></span><span data-c="P:${it.uid}:margen" data-fmt="pct"></span></td>
      </tr>`;
    }).join('');
    const ayuda = `<p>La utilidad de cada partida es un <b>% de recargo sobre su costo</b> o un <b>monto fijo en $</b>. Un recargo de 100 % equivale a un margen de 50 % sobre la venta.
        Al cambiar entre % y $ se conserva el monto.</p>
      <p><b>Llevar al margen objetivo</b> calcula el recargo que deja el margen justo en la meta del proyecto; <b>Deshacer</b> vuelve a los valores que ingresaste a mano.</p>
      <p>Los valores por partida se redondean al peso (precio unitario × cantidad) para que la cotización cuadre.</p>`;
    return `
      <div class="print-only print-head">
        <img src="assets/logo-quempin.png" alt="QUEMPIN Soluciones Energéticas">
        <div style="text-align:right"><b>${esc(p.codigo)} · v${esc(p.version)}</b><br>${esc(p.titulo)}<br>${esc([p.cliente, p.responsable, fechaCorta(p.fecha)].filter(Boolean).join(' · '))}</div>
      </div>
      ${state.imprimir ? '' : pasoHead('resumen', ayuda)}
      <div id="res-aviso"></div>
      <div class="eq" id="res-top" aria-label="Cómo se forma el precio"></div>

      <section class="section" id="utilidad">
        <div class="calc-layout">
          <div class="calc-entradas">
            <div class="tabla-contenedor">
              <div class="util-quick no-print">
                <span class="lbl">Recargo para todas</span>
                <div class="input-affix"><input class="input" id="util-all" type="number" step="any" placeholder="100" aria-label="Recargo en % a aplicar a todas las partidas"><span class="affix">%</span></div>
                <button type="button" class="btn btn-sm" data-act="apply-util" ${p.partidas.length ? '' : 'disabled'}>Aplicar</button>
                <span class="grupo-btn">
                  <button type="button" class="btn btn-sm" data-act="util-objetivo" ${p.partidas.length ? '' : 'disabled'} data-tip="Calcula el recargo que deja el margen sobre venta justo en el objetivo del proyecto y lo aplica a todas las partidas.">${ICON.target}Llevar al margen objetivo (${esc(nf(mObj))} %)</button>
                  <button type="button" class="btn btn-sm" id="util-undo" data-act="util-deshacer" aria-disabled="true">${ICON.restore}Deshacer</button>
                </span>
              </div>
              <table class="tbl util-tbl tbl-apilable">
                <thead><tr><th>Partida</th><th>Utilidad<span class="th-sub">% de recargo sobre su costo o $ fijo</span></th><th class="num">Utilidad en $</th><th class="num">Margen</th></tr></thead>
                <tbody>${utilRows || '<tr class="empty-row"><td colspan="4">Aún no hay partidas. <button type="button" class="link-btn" data-act="tab" data-tab="partidas">Crear la primera partida</button></td></tr>'}</tbody>
                <tfoot><tr><td>Total</td><td class="small muted" style="font-weight:400">Recargo promedio <span data-c="K:markup" data-fmt="pct"></span></td>
                  <td class="num" data-label="Utilidad en $" data-c="T:utilidad" data-fmt="clp"></td>
                  <td class="num" data-label="Margen"><span class="dot na" data-sem-total aria-hidden="true"></span><span data-c="K:margen" data-fmt="pct"></span><div class="meta-margen" id="meta-margen"></div></td></tr></tfoot>
              </table>
            </div>
            <div class="eval" id="res-eval"></div>
          </div>
          <aside class="calc-resultados" id="res-precio" aria-label="Valores por partida para la cotización"></aside>
        </div>
      </section>`;
  }

  // ---- Paso 5: evaluación ------------------------------------------------------------
  function viewEvaluacion() {
    const p = state.project;
    const s = p.parametros.sensibilidad;
    const sensRow = (k, label, cls) => `<div class="sens-row">
        <label for="sens-${k}"><span class="swatch ${cls}"></span>${label}</label>
        <input type="range" min="-20" max="50" step="1" data-f="parametros.sensibilidad.${k}" data-t="num" data-sync="sens-${k}" value="${esc(num(s[k]))}" aria-label="Variación de ${label}">
        <div class="input-affix"><input class="input" id="sens-${k}" type="number" step="any" data-f="parametros.sensibilidad.${k}" data-t="num" data-sync="sens-${k}" value="${esc(num(s[k]))}"><span class="affix">%</span></div>
      </div>`;
    const ayuda = `<p>Cada respuesta del veredicto se basa en los indicadores de abajo y en las metas del proyecto (paso 1 → Metas de evaluación).
        Abre «Qué mide y cómo aporta» en cada indicador, o revisa la <a href="#/guia">Guía de uso</a>.</p>
      <p>Verde, ámbar y rojo indican el estado de cada indicador frente a su meta; gris, que es referencial.</p>`;
    const kApu = 'apu-sec';
    return `${state.imprimir ? '<div class="print-salto"></div>' : pasoHead('evaluacion', ayuda, 'Cómo leerla')}
      <section class="section section-first" id="veredicto"><div id="res-veredicto"></div></section>

      <section class="section" id="indicadores">
        <div class="section-head"><h4 class="seccion-titulo">Rentabilidad y presupuesto</h4></div>
        <div id="res-kpis" class="kpi-grid"></div>
      </section>

      <section class="section" id="sensibilidad">
        <div class="section-head"><h4 class="seccion-titulo">Riesgo: ¿cuánto sobrecosto resiste la oferta?</h4><p>Simula alzas de costo manteniendo el precio ofertado.</p></div>
        <div id="res-kpis-riesgo" class="kpi-grid"></div>
        <div class="calc-layout parejo" style="margin-top:12px">
          <div class="panel">
            ${sensRow('mat', 'Materiales', 'cat-mat')}${sensRow('eq', 'Equipos', 'cat-eq')}${sensRow('mo', 'Mano de obra', 'cat-mo')}${sensRow('otros', 'Otros', 'cat-otros')}
            <button type="button" class="btn btn-sm no-print" data-act="sens-reset">Restablecer (mano de obra +10 %)</button>
          </div>
          <div id="res-sens"></div>
        </div>
      </section>

      <section class="section" id="detalle">
        <details class="plegable-sec" data-open-key="${kApu}" ${state.abiertos.has(kApu) || state.imprimir ? 'open' : ''}>
          <summary><span class="seccion-titulo">Composición del precio y detalle por partida</span><span class="pl-res">con el análisis de precio unitario</span></summary>
          <div class="grid-2 iguales" style="margin-top:12px">
            <div class="panel"><h5 class="panel-t">Proyecto completo</h5><div id="res-comp"></div></div>
            <div class="panel"><h5 class="panel-t">Por partida</h5><div id="res-pbar"></div></div>
          </div>
          <div id="res-partidas" style="margin-top:12px"></div>
        </details>
      </section>`;
  }

  /* Valores para la cotización: precio unitario redondeado a pesos y total de la
     línea = cantidad × precio unitario, para que la cotización cuadre al peso.
     El IVA se calcula sobre la suma de las líneas, como en una factura. */
  function cotizacion() {
    const r = state.result;
    const ivaPct = num(state.project.parametros.iva) / 100;
    const lineas = r.partidas.map((pt) => {
      const pu = pt.cantidad > 0 && ok(pt.pu) ? Math.round(pt.pu) : null;
      const total = pu !== null ? Math.round(pu * pt.cantidad) : Math.round(pt.precio);
      return { pt, pu, total };
    });
    const neto = lineas.reduce((a, l) => a + l.total, 0);
    const iva = Math.round(neto * ivaPct);
    return { lineas, neto, iva, bruto: neto + iva, dif: neto - Math.round(r.totals.precioNeto) };
  }

  /* Tabla separada por tabulaciones: al pegarla en Excel o Word queda en columnas */
  function tablaCotizacion() {
    const c = cotizacion();
    const limpio = (x) => String(x || '').replace(/[\t\r\n]+/g, ' ').trim();
    const filas = [['Ítem', 'Partida', 'Cantidad', 'Unidad', 'Precio unitario neto', 'Total neto']];
    c.lineas.forEach(({ pt, pu, total }) => filas.push([pt.code, limpio(pt.descripcion), String(pt.cantidad).replace('.', ','), limpio(pt.unidad), pu === null ? '' : String(pu), String(total)]));
    filas.push(['', '', '', '', 'Total neto', String(c.neto)]);
    filas.push(['', '', '', '', `IVA ${nf(num(state.project.parametros.iva))} %`, String(c.iva)]);
    filas.push(['', '', '', '', 'Total con IVA', String(c.bruto)]);
    return filas.map((f) => f.join('\t')).join('\r\n');
  }

  const btnCopiar = (v, lbl) => `<button type="button" class="icon-btn copiar no-print" data-act="copiar" data-v="${Math.round(v || 0)}" data-lbl="${esc(lbl)}" aria-label="Copiar ${esc(lbl)}" data-tip="<b>Copiar ${esc(lbl)}</b>Se copia como número sin formato: ${Math.round(v || 0)}">${ICON.copy}</button>`;

  // ---- Deshacer la utilidad aplicada a todas las partidas ------------------------
  const fmtUtil = (x) => (x.utilidadTipo === 'monto' ? clp(num(x.utilidadValor)) : `${nf(num(x.utilidadValor))} %`);
  function undoVigente() {
    const u = state.utilUndo;
    return u && state.project && u.puid === state.project.uid && u.antes.size ? u : null;
  }
  /* Guarda la utilidad ingresada a mano antes de una acción masiva. Si ya había un
     respaldo (dos acciones seguidas), se conserva: lo manual es lo de antes de la primera. */
  function guardarUndo(accion) {
    const p = state.project;
    let u = undoVigente();
    if (!u) { u = { puid: p.uid, antes: new Map() }; state.utilUndo = u; }
    p.partidas.forEach((pt) => { if (!u.antes.has(pt.uid)) u.antes.set(pt.uid, { utilidadTipo: pt.utilidadTipo, utilidadValor: pt.utilidadValor }); });
    u.accion = accion;
  }
  function pintarDeshacer() {
    const b = $('#util-undo');
    if (!b) return;
    const u = undoVigente();
    b.setAttribute('aria-disabled', u ? 'false' : 'true');
    if (!u) { b.dataset.tip = '<b>Nada que deshacer</b>Se activa después de usar «Aplicar» o «Llevar al margen objetivo».'; return; }
    const lista = state.project.partidas.map((pt, i) => (u.antes.has(pt.uid) ? `P${i + 1}: ${fmtUtil(u.antes.get(pt.uid))}` : null)).filter(Boolean);
    const txt = lista.slice(0, 6).join(' · ') + (lista.length > 6 ? ` y ${lista.length - 6} más` : '');
    b.dataset.tip = `<b>Volver a la utilidad ingresada a mano</b>Deshace «${esc(u.accion)}»: ${esc(txt)}`;
  }

  /* Pinta los resultados de los pasos 4 y 5: solo los contenedores que existen en la vista */
  function refreshResumen() {
    if (!$('#res-top') && !$('#res-kpis')) return;
    const r = state.result;
    const t = r.totals, k = r.kpis, st = r.status;
    const par = state.project.parametros;
    const hasGG = t.gg > 0 || t.imp > 0 || num(par.gastosGenerales) > 0 || num(par.imprevistos) > 0;
    const mObj = num(par.margenObjetivo) / 100, mMin = num(par.margenMinimo) / 100;
    const meta = num(par.metaUtilidadDH);
    const pctShort = (x) => pct(x).replace(',0 ', ' ');
    const semMargen = (m) => (!ok(m) ? 'na' : m >= mObj ? 'ok' : m >= mMin ? 'warn' : 'bad');
    const ws = r.warnings;
    const nErr = ws.filter((w) => w.level === 'error').length;
    const nWarn = ws.filter((w) => w.level === 'warn').length;
    const put = (id, html) => { const el = $('#' + id); if (el) el.innerHTML = html; return !!el; };
    const medMargen = () => medidor({ v: Math.max(0, k.margen), max: Math.max(0.6, Math.ceil((k.margen + 0.05) * 10) / 10), fill: st.margen, fmt: pctShort, label: 'Margen frente a las metas',
      ticks: [{ at: mMin, dash: true, show: true, tip: `Mínimo ${pct(mMin)}` }, { at: mObj, show: true, tip: `Objetivo ${pct(mObj)}` }] });
    const um = num(par.umbralAjustado || 95) / 100;
    const medComp = () => medidor({ v: k.competitividad, max: Math.max(1.2, Math.ceil(k.competitividad * 10) / 10), fill: st.competitividad, fmt: pctShort, label: 'Competitividad frente al presupuesto',
      ticks: [{ at: um, dash: true, tip: `Ajustada desde ${pct(um)}` }, { at: 1, show: true, tip: '100 % del presupuesto' }] });
    const linkDatos = (txt) => `<button type="button" class="link-btn" data-act="tab" data-tab="ficha">${txt}</button>`;

    // Aviso arriba cuando hay alertas
    put('res-aviso', nErr || nWarn ? `<div class="aviso ${nErr ? 'bad' : 'warn'} no-print">
        <span class="ico" aria-hidden="true">${nErr ? '✖' : '▲'}</span>
        <span class="motivo">${nErr
          ? `<b>${plural(nErr, 'error', 'errores')}:</b> hay costos que no se están sumando al precio${nWarn ? ` (y ${plural(nWarn, 'aviso')})` : ''}.`
          : `<b>${plural(nWarn, 'aviso')}</b> por revisar.`} Revísalos antes de copiar los valores a la cotización.</span>
        <button type="button" class="ir" data-menu="alertas" aria-haspopup="menu" aria-expanded="false">Ver y corregir →</button>
      </div>` : '');

    // Precio de la oferta: costo + utilidad = precio neto (el IVA está en los valores por partida)
    const eqCard = (cls, label, value, sub, tipText) => `<div class="eq-card ${cls}">
        <div class="l">${label}${tipText ? info(tipText) : ''}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    const op = (c) => `<span class="eq-op" aria-hidden="true">${c}</span>`;
    put('res-top', [
      eqCard('', 'Costo directo', clp(t.cd), 'Materiales, equipos, mano de obra y otros', KP.byKey.cd.queMide),
      hasGG ? op('+') + eqCard('', 'Gastos generales e imprevistos', clp(t.gg + t.imp), `${nf(num(par.gastosGenerales))} % + ${nf(num(par.imprevistos))} % del costo directo`, KP.byKey.costoTotal.queMide) : '',
      op('+'), eqCard('util', 'Utilidad', clp(t.utilidad), `Recargo de ${pct(k.markup)} sobre el costo${hasGG ? ' total' : ''}`, KP.byKey.utilidad.queMide),
      op('='), eqCard('hero', 'Precio de venta neto', clp(t.precioNeto), 'Sin IVA: el monto a ofertar', KP.byKey.precioNeto.queMide)
    ].join(''));

    // Semáforo de margen por partida (contra las metas del proyecto)
    $$('[data-sem-p]', app).forEach((el) => {
      const pt = state.partIdx.get(el.dataset.semP);
      el.className = 'dot ' + semMargen(pt && pt.precio ? pt.utilidad / pt.precio : null);
    });
    pintarDeshacer();

    // Efecto inmediato de la utilidad: semáforo del margen total y, si hay presupuesto, competitividad
    $$('[data-sem-total]', app).forEach((el) => { el.className = 'dot ' + st.margen; });
    put('meta-margen', `${CHIP_TXT.margen[st.margen] || 'Sin datos'} · objetivo ${pctShort(mObj)}, mínimo ${pctShort(mMin)}`);
    put('res-eval', k.competitividad === null
      ? `<p class="hint-linea">Sin presupuesto del mandante: ${linkDatos('agrégalo en Datos del proyecto')} para saber si la oferta cabe.</p>`
      : `<div class="eval-item s-${st.competitividad}"><div class="eval-top"><span class="eval-n">Frente al presupuesto del mandante</span>${chip(st.competitividad, 'competitividad')}</div>
          <div class="eval-v">${pct(k.competitividad)}<span class="eval-sub">de ${clp(k.presupuesto)}${par.presupuestoIncluyeIva ? ' (con IVA)' : ''}</span></div>${medComp()}</div>`);

    // Valores por partida, antes de IVA, con botón para copiar cada monto
    if ($('#res-precio')) {
      const cot = cotizacion();
      const filasCot = cot.lineas.map(({ pt, pu, total }) => `<li>
          <span class="pcode">${pt.code}</span>
          <div class="cotiz-nom"><div class="t ${pt.descripcion ? '' : 'muted'}">${esc(pt.descripcion || 'Partida sin descripción')}</div>
            <div class="s">${esc(nf(pt.cantidad))} ${esc(pt.unidad)}${pu !== null && pt.cantidad !== 1
              ? ` × <button type="button" class="copiar-txt" data-act="copiar" data-v="${pu}" data-lbl="${pt.code} · precio unitario" aria-label="Copiar precio unitario de ${pt.code}" data-tip="<b>Copiar precio unitario de ${pt.code}</b>Se copia como número sin formato: ${pu}">${clp(pu)}</button> cada una` : ''}</div></div>
          <div class="cotiz-v">${clp(total)}</div>
          ${btnCopiar(total, `${pt.code} · total neto`)}
        </li>`).join('');
      put('res-precio', `<div class="panel cotiz">
          <div class="cotiz-head">
            <div><h4 class="seccion-titulo">Valores para la cotización</h4><p class="cotiz-sub">Por partida, netos (antes de IVA)</p></div>
            <button type="button" class="btn btn-sm no-print" data-act="copiar-tabla" ${cot.lineas.length ? '' : 'disabled'} data-tip="<b>Copiar la tabla completa</b>Partidas, cantidades, precios unitarios y totales, lista para pegar en Excel o Word.">${ICON.copy}Copiar tabla</button>
          </div>
          ${cot.lineas.length ? `<ul class="cotiz-list">${filasCot}</ul>` : '<p class="small muted" style="margin:10px 0">Aún no hay partidas.</p>'}
          <div class="cotiz-tot">
            <div class="fila principal"><span>Total neto</span><span class="v">${clp(cot.neto)}</span>${btnCopiar(cot.neto, 'total neto')}</div>
            <div class="fila"><span>IVA ${nf(num(par.iva))} %</span><span class="v">${clp(cot.iva)}</span>${btnCopiar(cot.iva, 'IVA')}</div>
            <div class="fila"><span>Total con IVA <span class="tn">(lo que paga el cliente)</span></span><span class="v">${clp(cot.bruto)}</span>${btnCopiar(cot.bruto, 'total con IVA')}</div>
          </div>
          ${cot.dif ? `<p class="cotiz-nota">Montos redondeados a pesos por partida (cantidad × precio unitario), por eso difieren en ${clp(Math.abs(cot.dif))} del precio calculado.</p>` : ''}
        </div>`);
    }

    if (!$('#res-kpis')) return;

    // ---- Evaluación: veredicto en cuatro preguntas ----
    const sv = par.sensibilidad || {};
    const SENS_N = { mat: 'materiales', eq: 'equipos', mo: 'mano de obra', otros: 'otros' };
    const escenario = Object.keys(SENS_N).filter((x) => num(sv[x]) !== 0).map((x) => `${SENS_N[x]} ${num(sv[x]) > 0 ? '+' : ''}${nf(num(sv[x]))} %`);
    const errPrimero = ws.find((w) => w.level === 'error') || ws.find((w) => w.level === 'warn');
    const estNum = nErr ? 'bad' : nWarn ? 'warn' : ok(k.margen) ? 'ok' : 'na';
    const preguntas = [
      { q: '¿Es rentable?', s: st.margen, to: 'indicadores',
        a: { ok: 'Sí: el margen supera el objetivo del proyecto.', warn: 'A medias: el margen está entre el mínimo y el objetivo.', bad: 'No: el margen está bajo el mínimo aceptable. Revisa la utilidad (paso 4).', na: 'Aún no hay precio: completa los costos y la utilidad.' }[st.margen] },
      { q: '¿Resiste sobrecostos?', s: escenario.length ? st.sensibilidad : 'na', to: 'sensibilidad',
        a: !escenario.length ? 'No hay alzas de costo simuladas.' : { ok: `Sí: con ${escenario.join(', ')} el margen se mantiene sobre el mínimo.`, warn: `Con ${escenario.join(', ')} el margen cae bajo el mínimo.`, bad: `No: con ${escenario.join(', ')} el proyecto pierde dinero.`, na: 'Aún no hay precio para simular.' }[st.sensibilidad] },
      { q: '¿Cabe en el presupuesto del mandante?', s: st.competitividad, to: 'indicadores',
        a: k.competitividad === null ? `Sin presupuesto informado. ${linkDatos('Agrégalo en Datos del proyecto')}.` : { ok: 'Sí, con holgura.', warn: 'Sí, pero ajustada: está cerca del máximo.', bad: 'No: la oferta excede el presupuesto.' }[st.competitividad] },
      { q: '¿Los números están completos?', s: estNum, to: 'alertas',
        a: nErr ? `No: ${nErr === 1 ? 'un costo no se suma' : `${nErr} costos no se suman`} al precio.${nWarn ? ` Además, ${plural(nWarn, 'aviso')}.` : ''}` : nWarn ? `${plural(nWarn, 'aviso')} por revisar.` : estNum === 'ok' ? 'Sí: todos los costos se suman y cada partida tiene utilidad.' : 'Aún no hay costos.' }
    ];
    const peor = preguntas.some((x) => x.s === 'bad') ? 'bad' : preguntas.some((x) => x.s === 'warn') ? 'warn' : preguntas.every((x) => x.s === 'ok' || x.s === 'na') && ok(k.margen) ? 'ok' : 'na';
    const titular = { ok: 'La oferta está lista para enviarse.', warn: 'La oferta se puede enviar, pero revisa los puntos en ámbar.', bad: 'Revisa los puntos en rojo antes de enviar la oferta.', na: 'Completa los costos y la utilidad para evaluar la oferta.' }[peor];
    const EST_T = { ok: 'Bien', warn: 'Revisar', bad: 'Problema', na: 'Sin datos', info: 'Referencial' };
    put('res-veredicto', `<div class="veredicto s-${peor}">
        <div class="ver-titular"><span class="ver-ico" aria-hidden="true">${ICO[peor]}</span>${titular}</div>
        <ul class="ver-lista">${preguntas.map((x) => `<li class="s-${x.s}">
            <span class="chip ${x.s}">${ICO[x.s] || '•'} ${EST_T[x.s]}</span>
            <span class="ver-q">${x.q}</span>
            <span class="ver-a">${x.a}${x.to === 'alertas' ? '' : ` <button type="button" class="ir no-print" data-act="scroll" data-to="${x.to}">Ver detalle</button>`}</span></li>`).join('')}</ul>
        ${ws.length ? `<ul class="lista-atencion en-veredicto" id="alertas">${ws.map((w) => `
          <li><span class="marca ${w.level}" aria-hidden="true"></span><span class="motivo"><span class="visualmente-oculto">${w.level === 'error' ? 'Error: ' : 'Aviso: '}</span>${esc(w.msg)}</span>
          ${w.tab ? `<button type="button" class="ir no-print" data-act="ir" data-tab="${w.tab}" data-uid="${w.uid || ''}">Corregir en ${esc(tabInfo(w.tab).label)} →</button>` : ''}</li>`).join('')}</ul>` : ''}
      </div>`);

    // Indicadores, agrupados por la pregunta que responden
    const kpiCard = (key, value, unit, statusKey, reading, extra) => {
      const d = KP.byKey[key];
      const s = st[statusKey || key] || 'info';
      return `<article class="kpi s-${s}">
        <div class="kpi-top"><div class="kpi-name">${d.nombre}${info(`${d.queMide} Fórmula: ${d.formula}.${d.lectura ? ' ' + d.lectura : ''}`)}</div>${chip(s, statusKey || key)}</div>
        <div class="kpi-value">${value}${unit ? `<span class="unit">${unit}</span>` : ''}</div>
        ${extra || ''}
        <div class="kpi-read">${reading}</div>
      </article>`;
    };
    const compRead = k.competitividad === null
      ? `Ingresa el presupuesto máximo del mandante en ${linkDatos('Datos del proyecto')} para evaluar la oferta.`
      : `La oferta ${par.presupuestoIncluyeIva ? 'con IVA' : 'neta'} (${clp(k.precioComparable)}) equivale al ${pct(k.competitividad)} del presupuesto de ${clp(k.presupuesto)}.`;
    put('res-kpis', [
      kpiCard('margen', pct(k.margen), '', 'margen',
        ok(k.margen) ? `De cada $100 vendidos quedan $${fNum.format(Math.round(k.margen * 1000) / 10)} de utilidad: un recargo de ${pct(k.markup)} sobre el costo.` : 'Sin ventas aún.',
        ok(k.margen) ? medMargen() : ''),
      kpiCard('rentDH', clp(k.rentDH), 'por día-hombre', 'rentDH',
        ok(k.rentDH) ? `${nf(k.dh)} días-hombre en total; venta por día-hombre ${clp(k.ventaDH)}.${meta > 0 ? ` Meta: ${clp(meta)}.` : ` Define una meta en ${linkDatos('Datos del proyecto')} para activar el semáforo.`}` : 'No hay días-hombre registrados.',
        ok(k.rentDH) && meta > 0 ? medidor({ v: k.rentDH, max: Math.max(meta * 1.5, k.rentDH * 1.1), fill: st.rentDH, fmt: (x) => clp(x), label: 'Utilidad por día-hombre frente a la meta',
          ticks: [{ at: meta * 0.8, dash: true, tip: `80 % de la meta: ${clp(meta * 0.8)}` }, { at: meta, show: true, tip: `Meta ${clp(meta)}` }] }) : ''),
      kpiCard('competitividad', k.competitividad === null ? '—' : pct(k.competitividad), k.competitividad === null ? '' : 'del presupuesto', 'competitividad', compRead,
        k.competitividad === null ? '' : medComp())
    ].join(''));
    put('res-kpis-riesgo', [
      kpiCard('holguraMO', pct(k.holguraMO), '', 'holguraMO',
        ok(k.holguraMO) ? `Si la mano de obra cuesta más de ${pct(k.holguraMO)} sobre lo presupuestado, el proyecto pierde dinero.` : 'No hay costo de mano de obra.'),
      kpiCard('incidenciaMO', pct(k.incidenciaMO), 'del precio', 'incidenciaMO',
        ok(k.incidenciaMO) ? `La mano de obra es ${pct(k.incidenciaMO)} del precio y ${pct(t.cd ? t.mo / t.cd : null)} del costo directo: un atraso pesa en la utilidad.` : '—',
        ok(k.incidenciaMO) ? `<div class="stack barra-kpi" role="img" aria-label="Peso de la mano de obra en el precio">${k.incidenciaMO > 0 ? `<div class="seg cat-mo" style="flex:${k.incidenciaMO} 1 0"></div>` : ''}<div class="seg resto" style="flex:${Math.max(0, 1 - k.incidenciaMO)} 1 0"></div></div>` : '')
    ].join(''));

    // Sensibilidad: oferta actual frente al escenario simulado (el precio se mantiene)
    const sd = KP.byKey.sensibilidad;
    const signo = (v, f) => (!ok(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${f(Math.abs(v))}`);
    const dMargen = ok(k.sensMargen) && ok(k.margen) ? Math.round((k.sensMargen - k.margen) * 1000) / 10 : null;
    put('res-sens', `<div class="panel">
        <table class="comp-tbl">
          <thead><tr><th></th><th class="num">Oferta actual</th><th class="num">Con el escenario</th><th class="num">Diferencia</th></tr></thead>
          <tbody>
            <tr><td>Costo total</td><td class="num">${clp(t.costoTotal)}</td><td class="num">${clp(t.costoTotal + k.sensDeltaCosto)}</td><td class="num">${signo(k.sensDeltaCosto, clp)}</td></tr>
            <tr><td>Utilidad</td><td class="num">${clp(t.utilidad)}</td><td class="num">${clp(k.sensUtilidad)}</td><td class="num">${signo(k.sensVarUtilidad, pct)}</td></tr>
            <tr class="clave"><td>Margen sobre venta</td><td class="num">${pct(k.margen)}</td><td class="num tone-${st.sensibilidad}">${pct(k.sensMargen)}</td><td class="num">${dMargen === null ? '—' : signo(dMargen, (x) => `${nf(x)} puntos`)}</td></tr>
          </tbody>
        </table>
        <p class="sens-lectura"><span class="sens-chip" tabindex="0" data-tip="${esc(sd.lectura)}" aria-label="${esc(sd.lectura)}">${chip(st.sensibilidad, 'sensibilidad')}</span>
          <span>${escenario.length && ok(k.sensVarUtilidad) ? `La utilidad cae ${pct(Math.abs(k.sensVarUtilidad))}.` : 'Mueve los controles para simular un alza.'}</span></p>
      </div>`);

    // Composición del precio: proyecto completo
    const segs = [
      { ...CATS[0], v: t.mat }, { ...CATS[1], v: t.eq }, { ...CATS[2], v: t.mo }, { ...CATS[3], v: t.otros },
      { ...CATS[4], v: t.gg + t.imp }, { ...CATS[5], v: t.utilidad }
    ].filter((sg) => sg.k !== 'gg' || hasGG);
    const base = segs.reduce((a, sg) => a + Math.max(0, sg.v), 0);
    const bar = base > 0 ? `<div class="stack lg" role="img" aria-label="Composición del precio neto">${segs.filter((sg) => sg.v > 0).map((sg) =>
      `<div class="seg ${sg.cls}" style="flex:${sg.v} 1 0" data-tip="<b>${esc(sg.n)}</b>${esc(clp(sg.v))} · ${esc(pct(t.precioNeto ? sg.v / t.precioNeto : null))} del precio neto"></div>`).join('')}</div>` : '';
    put('res-comp', base > 0 ? `${bar}
      <ul class="leyenda-comp">${segs.filter((sg) => sg.v).map((sg) => `<li><span class="swatch ${sg.cls}" aria-hidden="true"></span><span class="n">${sg.n}</span><span class="v">${clp(sg.v)}</span><span class="p">${pct(t.precioNeto ? sg.v / t.precioNeto : null)}</span></li>`).join('')}</ul>
      ${t.utilidad < 0 ? '<p class="small tone-bad" style="margin:8px 0 0;font-weight:700">La utilidad es negativa: el precio no cubre los costos.</p>' : ''}`
      : '<p class="small muted" style="margin:0">Agrega partidas y costos para ver la composición del precio.</p>');

    // Composición del precio: por partida, con la misma paleta
    const maxP = r.partidas.reduce((a, pt) => Math.max(a, pt.precio), 0);
    put('res-pbar', r.partidas.length && maxP > 0 ? r.partidas.map((pt) => {
      const vals = [
        { ...CATS[0], v: pt.mat }, { ...CATS[1], v: pt.eq }, { ...CATS[2], v: pt.mo }, { ...CATS[3], v: pt.otros },
        { ...CATS[4], v: pt.ggimp }, { ...CATS[5], v: pt.utilidad }
      ].filter((x) => x.v > 0);
      const tot = vals.reduce((a, x) => a + x.v, 0);
      return `<div class="pbar">
        <div class="nom" title="${esc(pt.descripcion)}"><span class="pcode">${pt.code}</span><span>${esc(pt.descripcion || 'Sin descripción')}</span></div>
        <div class="pista"><div class="stack" style="width:${tot > 0 ? Math.max(2, (tot / maxP) * 100) : 0}%">${vals.map((x) =>
          `<div class="seg ${x.cls}" style="flex:${x.v} 1 0" data-tip="<b>${esc(pt.code)} · ${esc(x.n)}</b>${esc(clp(x.v))} · ${esc(pct(pt.precio ? x.v / pt.precio : null))} de la partida"></div>`).join('')}</div></div>
        <div class="val">${clp(pt.precio)}</div>
      </div>`;
    }).join('') : '<p class="small muted" style="margin:0">Agrega partidas con costos para comparar su precio.</p>');

    // Detalle por partida (con análisis de precio unitario)
    const rowsP = r.partidas.map((pt) => {
      const open = state.apuOpen.has(pt.uid) || state.imprimir;
      const apu = open ? `<tr class="apu-row"><td colspan="13"><div class="apu-panel">${apuTable(pt)}</div></td></tr>` : '';
      return `<tr>
        <td><button type="button" class="apu-toggle" data-act="apu" data-uid="${pt.uid}" aria-expanded="${open}" aria-label="Ver el análisis de precio unitario de ${pt.code}">${ICON.chevR}</button></td>
        <td class="code">${pt.code}</td><td>${esc(pt.descripcion || '—')}</td><td class="num">${nf(pt.cantidad)} ${esc(pt.unidad)}</td>
        <td class="num">${clp(pt.mat)}</td><td class="num">${clp(pt.eq)}</td><td class="num">${clp(pt.mo)}</td><td class="num">${clp(pt.otros)}</td>
        <td class="num"><b>${clp(pt.cd)}</b></td><td class="num">${clp(pt.utilidad)}</td><td class="num"><b>${clp(pt.precio)}</b></td>
        <td class="num">${clp(pt.pu)}</td><td class="num">${pct(pt.pctPrecio)}</td>
      </tr>${apu}`;
    }).join('');
    const th = (c, l) => `<th class="num"><span class="swatch ${c}" style="width:9px;height:9px;margin-right:5px;vertical-align:0"></span>${l}</th>`;
    put('res-partidas', `<div class="tabla-contenedor"><table class="tbl" style="min-width:1060px">
      <thead><tr><th><span class="visualmente-oculto">Desplegar</span></th><th>ID</th><th>Partida</th><th class="num">Cantidad</th>${th('cat-mat', 'Materiales')}${th('cat-eq', 'Equipos')}${th('cat-mo', 'Mano de obra')}${th('cat-otros', 'Otros')}
        <th class="num">Costo directo</th>${th('cat-util', 'Utilidad')}<th class="num">Precio neto</th><th class="num">Precio unitario</th><th class="num">% del precio</th></tr></thead>
      <tbody>${rowsP || '<tr class="empty-row"><td colspan="13">Sin partidas.</td></tr>'}</tbody>
      <tfoot><tr><td></td><td></td><td colspan="2">Total</td><td class="num">${clp(t.mat)}</td><td class="num">${clp(t.eq)}</td><td class="num">${clp(t.mo)}</td><td class="num">${clp(t.otros)}</td>
        <td class="num">${clp(t.cd)}</td><td class="num">${clp(t.utilidad)}</td><td class="num">${clp(t.precioNeto)}</td><td></td><td class="num">${t.precioNeto ? '100,0 %' : '—'}</td></tr></tfoot>
    </table></div>`);

  }

  function apuTable(pt) {
    const cats = [['materiales', 'Materiales', 'cat-mat'], ['equipos', 'Equipos', 'cat-eq'], ['manoObra', 'Mano de obra', 'cat-mo'], ['otros', 'Otros', 'cat-otros']];
    const p = state.project;
    const byUid = new Map();
    cats.forEach(([k]) => p[k].forEach((it) => byUid.set(it.uid, it)));
    const body = cats.map(([k, label, cls]) => {
      const lines = pt.items[k];
      if (!lines.length) return '';
      return `<tr class="apu-cat"><td colspan="4"><span class="nombre"><span class="swatch ${cls}"></span>${label}</span></td><td class="num">${clp(lines.reduce((a, l) => a + l.subtotal, 0))}</td></tr>` + lines.map((l) => {
        const it = byUid.get(l.uid) || {};
        const det = k === 'manoObra'
          ? `${nf(l.dhPorUnidadPartida)} días-hombre por unidad`
          : `${nf(num(it.cantidad))} ${esc(it.unidad || '')} × ${clp(num(it.costoUnitario))}`;
        return `<tr><td class="code">${l.code}</td><td>${esc(l.descripcion || '—')}</td><td>${det}</td><td class="num">${clp(l.costoPorUnidadPartida)} por unidad</td><td class="num">${clp(l.subtotal)}</td></tr>`;
      }).join('');
    }).join('');
    return body ? `<table class="apu-table"><thead><tr><th>ID</th><th>Ítem</th><th>Cantidad por unidad de partida</th><th class="num">Costo por unidad</th><th class="num">Subtotal</th></tr></thead><tbody>${body}</tbody></table>`
      : '<p class="small muted" style="margin:8px 0">Esta partida no tiene costos asociados.</p>';
  }

  // ---------------------------------------------------------------------------
  //  GUÍA DE KPIs
  // ---------------------------------------------------------------------------
  function renderGuide() {
    document.title = 'Guía de uso — Formulación QUEMPIN';
    const paso = (n, titulo, hace, consejo) => `<li class="guia-paso"><span class="gp-n" aria-hidden="true">${n}</span>
      <div><h4>${titulo}</h4><p>${hace}</p>${consejo ? `<p class="gp-tip"><b>Consejo:</b> ${consejo}</p>` : ''}</div></li>`;
    const ref = (d) => `<details class="kpi-ref">
      <summary><span class="kr-n">${d.nombre}</span></summary>
      <dl>
        <dt>Qué mide</dt><dd>${esc(d.queMide)}</dd>
        <dt>Fórmula</dt><dd><span class="formula">${esc(d.formula)}</span></dd>
        <dt>Cómo aporta a la decisión</dt><dd>${esc(d.aporte)}</dd>
        ${d.lectura ? `<dt>Semáforo</dt><dd>${esc(d.lectura)}</dd>` : ''}
        <dt>Origen</dt><dd>${d.origen === 'Nuevo' ? 'Indicador nuevo: no existía en el Excel original.' : `Excel original, ${esc(d.origen)}.`}</dd>
      </dl>
    </details>`;
    app.innerHTML = `<div class="viz-container page">
      <div class="page-head"><div>
        <h2>Guía de uso</h2>
        <p>Cómo formular un proyecto paso a paso y cómo leer su evaluación antes de enviar la oferta.</p>
      </div></div>
      <section>
        <div class="section-head"><h3 class="seccion-titulo">Paso a paso</h3><p>Los mismos pasos que ves arriba al abrir un proyecto.</p></div>
        <ol class="guia-pasos">
          ${paso(1, 'Datos del proyecto', 'Escribe el título, el cliente y el responsable. Si conoces el presupuesto del mandante, ingrésalo: la evaluación dirá si la oferta cabe.', 'los parámetros (IVA, tarifas, metas) ya vienen con los valores habituales; ábrelos solo si este proyecto es distinto.')}
          ${paso(2, 'Partidas', 'Divide el trabajo en partidas con su unidad y cantidad, por ejemplo «3 medidores de 2"».', 'una partida por cada ítem que irá en la cotización.')}
          ${paso(3, 'Costos', 'En Materiales, Equipos, Mano de obra y Otros ingresa lo que necesita <b>una</b> unidad de la partida y elige a qué partida pertenece. La herramienta multiplica por la cantidad.', 'un costo sin partida no se suma al precio: la herramienta lo marca en rojo.')}
          ${paso(4, 'Utilidad y precio', 'Define la utilidad de cada partida (% de recargo o monto fijo) y copia los valores netos para la cotización.', '«Llevar al margen objetivo» calcula el recargo que deja el margen justo en la meta.')}
          ${paso(5, 'Evaluación', 'Responde cuatro preguntas: ¿es rentable?, ¿resiste sobrecostos?, ¿cabe en el presupuesto?, ¿los números están completos?', 'si todo está en verde, exporta el Excel y cambia el estado a «Enviada».')}
        </ol>
      </section>
      <section class="section">
        <div class="section-head"><h3 class="seccion-titulo">Cómo leer la evaluación</h3></div>
        <div class="panel">
          <ul class="guia-lectura">
            <li><strong>¿Es rentable?</strong> Margen frente a las metas; utilidad por día-hombre si las cuadrillas son el recurso escaso.</li>
            <li><strong>¿Resiste sobrecostos?</strong> Simula alzas: si la mano de obra pesa mucho y su holgura es baja, un atraso se come la utilidad.</li>
            <li><strong>¿Cabe en el presupuesto?</strong> Sobre 100 % hay que revisar alcance o utilidad; muy por debajo, quizás se puede subir el precio.</li>
            <li><strong>¿Los números están completos?</strong> Un costo sin partida no suma: corrige las alertas antes de exportar.</li>
          </ul>
          <p class="small muted" style="margin:12px 0 0">Verde, ámbar y rojo indican el estado frente a la meta; gris, que el indicador es referencial.</p>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3 class="seccion-titulo">Indicadores</h3><p>Abre cada uno para ver su fórmula y cómo aporta a la decisión.</p></div>
        <div class="guia-ref">
          <div><h4 class="panel-t">Resultado económico</h4>${KP.KPIS.filter((d) => d.grupo === 'economico').map(ref).join('')}</div>
          <div><h4 class="panel-t">Indicadores de evaluación</h4>${KP.KPIS.filter((d) => d.grupo === 'indicador').map(ref).join('')}</div>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3 class="seccion-titulo">Colores de los gráficos</h3></div>
        <div class="leyenda-inline" style="margin:0;font-size:13px">${CATS.map((c) => `<span><span class="swatch ${c.cls}" style="width:14px;height:14px"></span>${c.n}</span>`).join('')}</div>
      </section>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  //  Edición de datos
  // ---------------------------------------------------------------------------
  function getPath(o, path) { return path.split('.').reduce((a, k) => (a === null || a === undefined ? undefined : a[k]), o); }
  function setPath(o, path, v) {
    const ks = path.split('.');
    let cur = o;
    for (let i = 0; i < ks.length - 1; i++) { if (typeof cur[ks[i]] !== 'object' || cur[ks[i]] === null) cur[ks[i]] = {}; cur = cur[ks[i]]; }
    cur[ks[ks.length - 1]] = v;
  }
  function readVal(el) {
    if (el.dataset.t === 'bool') return el.checked;
    if (el.dataset.t === 'bool01') return el.value === '1';
    if (el.dataset.t === 'num') { const n = parseFloat(el.value); return Number.isFinite(n) ? n : ''; }
    return el.value;
  }
  function findItem(list, uid) { return state.project[list].find((x) => x.uid === uid); }
  function focusKeyOf(el) {
    if (!el || !el.dataset) return null;
    if (el.dataset.list && el.dataset.uid) return `[data-list="${el.dataset.list}"][data-uid="${el.dataset.uid}"][data-k="${el.dataset.k}"]${el.type === 'radio' ? ':checked' : ''}`;
    if (el.dataset.f) return `[data-f="${el.dataset.f}"]`;
    return null;
  }

  function onEdit(e) {
    const el = e.target;
    if (!state.project) {
      const L = state.list;
      if (el.id === 'list-search') L.q = el.value;
      else if (el.id === 'list-estado') L.estado = el.value;
      else if (el.id === 'list-resp') L.resp = el.value;
      else return;
      el.classList.toggle('is-set', !!el.value);
      refreshList();
      return;
    }
    if (el.type === 'radio' && e.type === 'input') return; // los radios se procesan en 'change'
    let touched = false;
    if (el.dataset.f) {
      const v = readVal(el);
      if (getPath(state.project, el.dataset.f) === v) return;
      setPath(state.project, el.dataset.f, v);
      touched = true;
      if (el.dataset.sync) $$(`[data-sync="${el.dataset.sync}"]`).forEach((o) => { if (o !== el) o.value = el.value; });
      if (el.dataset.f === 'codigo' || el.dataset.f === 'version') updateCodigoHint();
    } else if (el.dataset.list && el.dataset.uid && el.dataset.k) {
      const it = findItem(el.dataset.list, el.dataset.uid);
      if (!it) return;
      const v = readVal(el);
      if (el.dataset.k === 'utilidadTipo' && it.utilidadTipo !== v) {
        // Al cambiar entre % y $ se conserva el monto de utilidad de la partida
        const pt = state.partIdx.get(it.uid);
        if (pt) {
          if (v === 'monto') it.utilidadValor = Math.round(pt.utilidad);
          else it.utilidadValor = pt.cd ? Math.round((pt.utilidad / pt.cd) * 1e6) / 1e4 : 0;
        }
      }
      const same = it[el.dataset.k] === v;
      if (!same) it[el.dataset.k] = v;
      // Una partida editada a mano ya no se toca al "Deshacer" una acción masiva
      if (!same && el.dataset.list === 'partidas' && /^utilidad(Tipo|Valor)$/.test(el.dataset.k) && undoVigente()) state.utilUndo.antes.delete(it.uid);
      if (e.type === 'change' && el.hasAttribute('data-rerender')) { recalc(); renderTab(focusKeyOf(el)); scheduleSave(); return; }
      if (same) return;
      touched = true;
    } else if (el.dataset.cat !== undefined && el.dataset.k) {
      const c = state.project.catalogoOtros[+el.dataset.cat];
      if (!c) return;
      c[el.dataset.k] = readVal(el);
      touched = true;
    } else if (el.dataset.filtro && e.type === 'change') {
      state.filtro[el.dataset.filtro] = el.value;
      renderTab(`#filtro-${el.dataset.filtro}`);
      return;
    }
    if (touched) {
      recalc();
      updateCalc();
      scheduleSave();
    }
  }
  app.addEventListener('input', onEdit);
  app.addEventListener('change', onEdit);

  // Recuerda qué explicaciones y secciones plegables están abiertas
  app.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.dataset) return;
    const set = d.dataset.kpi ? state.kpiOpen : d.dataset.openKey ? state.abiertos : null;
    const key = d.dataset.kpi || d.dataset.openKey;
    if (!set) return;
    if (d.open) set.add(key); else set.delete(key);
  }, true);

  app.addEventListener('keydown', (e) => {
    const el = e.target;
    // Abrir la lista de unidades con ↓ o Alt+↓
    if (e.key === 'ArrowDown' && el.dataset && el.dataset.k === 'unidad') {
      const b = el.parentElement && el.parentElement.querySelector('[data-picker="unidad"]');
      if (b) { e.preventDefault(); openPicker(b); return; }
    }
    // Filas del listado: Enter abre el proyecto
    if (e.key === 'Enter' && el.matches && el.matches('tr[data-open]')) { location.hash = `#/p/${el.dataset.open}/ficha`; return; }
    if ((e.key === 'Enter' || e.key === ' ') && el.matches && el.matches('th[data-sort]')) { e.preventDefault(); sortBy(el.dataset.sort); return; }
    // Enter: baja a la fila siguiente; en la última fila agrega una nueva (excepto en Resumen)
    if (e.key !== 'Enter' || !el.dataset || !el.dataset.list || el.tagName !== 'INPUT' || el.type === 'radio') return;
    e.preventDefault();
    const rows = $$('tr[data-row]', $('#tab-body')).filter((tr) => $(`[data-k="${el.dataset.k}"]`, tr));
    const idx = rows.indexOf(el.closest('tr'));
    if (idx >= 0 && idx < rows.length - 1) {
      const next = $(`[data-k="${el.dataset.k}"]`, rows[idx + 1]);
      if (next) { next.focus(); if (next.select) next.select(); }
    } else if (state.tab !== 'resumen') {
      addRow(el.dataset.list, el.dataset.k);
    } else {
      el.blur();
    }
  });

  // "/" enfoca el buscador del listado (como en el Centro de Costos)
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const s = $('#list-search');
    if (s) { e.preventDefault(); s.focus(); }
  });

  function flashRow(uid, inmediato) {
    const tr = $(`tr[data-row="${uid}"]`);
    if (!tr) return;
    tr.scrollIntoView({ block: 'center', behavior: inmediato ? 'auto' : 'smooth' });
    tr.classList.remove('flash'); void tr.offsetWidth; tr.classList.add('flash');
  }

  function addRow(list, focusField) {
    const p = state.project;
    let it;
    if (list === 'partidas') {
      it = S.newPartida();
      const last = p.partidas[p.partidas.length - 1];
      if (last) { it.utilidadTipo = last.utilidadTipo; it.utilidadValor = last.utilidadTipo === 'pct' ? last.utilidadValor : 0; }
    } else {
      const f = state.filtro[list];
      it = DETALLE[list].factory(f && f !== '__none__' ? f : (p.partidas.length === 1 ? p.partidas[0].uid : ''));
    }
    p[list].push(it);
    recalc();
    renderTab(`[data-list="${list}"][data-uid="${it.uid}"][data-k="${focusField || 'descripcion'}"]`);
    flashRow(it.uid);
    scheduleSave();
  }

  function addFromCatalog(i) {
    const c = state.project.catalogoOtros[i];
    if (!c) return;
    const f = state.filtro.otros;
    const p = state.project;
    const it = S.newOtro(f && f !== '__none__' ? f : (p.partidas.length === 1 ? p.partidas[0].uid : ''));
    Object.assign(it, { descripcion: c.descripcion, unidad: c.unidad || 'Un.', costoUnitario: num(c.costoUnitario) });
    p.otros.push(it);
    recalc();
    renderTab(it.partida ? `[data-list="otros"][data-uid="${it.uid}"][data-k="cantidad"]` : `[data-picker="partida"][data-uid="${it.uid}"]`);
    flashRow(it.uid);
    scheduleSave();
    toast(`«${c.descripcion}» agregado${it.partida ? '' : ': elige su partida'}`);
  }

  function sortBy(k) {
    const s = state.list.sort;
    if (s.k === k) s.dir = -s.dir; else { s.k = k; s.dir = ['precio', 'margen', 'rentDH', 'fecha'].includes(k) ? -1 : 1; }
    refreshList();
  }

  function goTab(tab, focus) {
    // Secciones plegables que deben quedar abiertas al llegar
    const abrir = { catalogo: 'f-catalogo', tarifas: 'f-precio', metas: 'f-metas' }[focus];
    if (abrir) state.abiertos.add(abrir);
    state.tab = tab;
    renderTab();
    const mn = $('#modnav-proj');
    if (mn) mn.href = `#/p/${state.project.uid}/${tab}`;
    window.scrollTo({ top: 0 });
    if (abrir || focus === 'veredicto') {
      setTimeout(() => { const c = $('#' + (focus === 'catalogo' ? 'f-catalogo' : focus)); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
    } else if (focus === 'util') {
      setTimeout(() => {
        const sec = $('#utilidad');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const inp = $('#utilidad [data-k="utilidadValor"]');
        if (inp) inp.focus({ preventScroll: true });
      }, 30);
    }
  }

  // ---------------------------------------------------------------------------
  //  Acciones (botones con data-act y opciones de los menús)
  // ---------------------------------------------------------------------------
  document.addEventListener('click', async (e) => {
    const pi = e.target.closest('.pop-item');
    if (pi && P) {
      const it = P.items[+pi.dataset.pi];
      const cb = P.onPick;
      const listbox = P.kind !== 'menu';
      closePop(listbox);
      if (it && !it.disabled) cb(it);
      return;
    }
    if (P && !pop.contains(e.target)) {
      const same = e.target.closest('[data-menu], [data-picker]') === P.anchor;
      closePop();
      if (same) return; // segundo clic en el mismo botón: solo cierra
    }
    const mb = e.target.closest('[data-menu]');
    if (mb) { openMenu(mb); return; }
    const pk = e.target.closest('[data-picker]');
    if (pk) { openPicker(pk); return; }
    const th = e.target.closest('th[data-sort]');
    if (th) { sortBy(th.dataset.sort); return; }
    const btn = e.target.closest('[data-act]');
    if (btn && !btn.disabled) { doAct(btn.dataset.act, btn.dataset, btn); return; }
    const tr = e.target.closest('tr[data-open]');
    if (tr && !e.target.closest('a, button, input, select')) location.hash = `#/p/${tr.dataset.open}/ficha`;
  });

  async function doAct(act, d, btn) {
    const id = d.id;
    const p = state.project;
    try {
      switch (act) {
        case 'nuevo': {
          if (enSP()) { await nuevoEnSharePoint(); break; }
          const np = S.newProject();
          S.upsert(np);
          goProject(np, 'ficha');
          setTimeout(() => { const t = $('[data-f="titulo"]'); if (t) t.focus(); }, 60);
          break;
        }
        case 'ejemplo': {
          const ex = S.exampleProject();
          S.upsert(ex);
          toast('Proyecto de ejemplo cargado');
          goProject(ex, 'resumen');
          break;
        }
        case 'importar': $('#file-import').click(); break;
        case 'abrir': goProject(S.get(id), 'ficha'); break;
        case 'exp-xlsx': {
          if (saveTimer) saveNow();
          toast('Generando Excel…');
          await X.exportProject(S.get(id) || p);
          toast('Excel exportado');
          break;
        }
        case 'exp-json': {
          if (saveTimer) saveNow();
          const pj = S.get(id) || p;
          X.downloadJSON(pj, X.fileBase(pj) + '.json');
          toast('JSON exportado');
          break;
        }
        case 'exportar-cartera': toast('Generando Excel de cartera…'); await X.exportPortfolio(S.all()); toast('Cartera exportada'); break;
        case 'respaldar': {
          X.downloadJSON({ schema: S.SCHEMA, tipo: 'respaldo', exportado: new Date().toISOString(), proyectos: S.all() },
            `Respaldo-proyectos-QUEMPIN_${S.hoy()}.json`);
          toast('Respaldo descargado');
          break;
        }
        case 'duplicar': {
          if (saveTimer) saveNow();
          const src = S.get(id);
          if (enSP()) {
            const sel = await elegirCarpeta({
              titulo: 'Duplicar en otra oferta',
              texto: `Se crea una copia de <b>${esc(src.codigo)} v${esc(src.version)}</b> en la carpeta de la oferta que elijas.`,
              crear: true, planilla: true, actual: window.QCloud.carpetaDe(src.uid)
            });
            if (!sel) break;
            const c = S.cloneProject(src, { estado: 'Borrador', fecha: S.hoy() });
            enCarpeta(c, sel, { datosOferta: true });
            S.upsert(c);
            toast(`Proyecto duplicado en ${sel.carpeta.nombre}`);
            goProject(c, 'ficha');
            break;
          }
          const cfg = S.getConfig();
          const c = S.cloneProject(src, { codigo: S.nextCodigo(cfg.prefijo, new Date().getFullYear()), version: 1, titulo: (src.titulo || 'Proyecto') + ' (copia)', estado: 'Borrador', fecha: S.hoy() });
          S.upsert(c);
          toast(`Proyecto duplicado como ${c.codigo}`);
          goProject(c, 'ficha');
          break;
        }
        case 'version': {
          if (saveTimer) saveNow();
          const src = S.get(id);
          const maxV = S.all().filter((x) => x.codigo === src.codigo).reduce((a, x) => Math.max(a, parseInt(x.version, 10) || 1), 1);
          const carpeta = enSP() ? window.QCloud.carpetaDe(src.uid) : null;
          const c = S.cloneProject(src, { version: carpeta ? siguienteVersion(carpeta) : maxV + 1, estado: 'Borrador', fecha: S.hoy() });
          if (carpeta) window.QCloud.asignarCarpeta(c.uid, carpeta);
          S.upsert(c);
          toast(`Versión ${c.version} de ${c.codigo} creada`);
          goProject(c, (p && state.tab) || 'ficha');
          break;
        }
        case 'eliminar': {
          const target = S.get(id);
          const v = await ask({
            title: 'Eliminar proyecto',
            body: `<p>¿Enviar <b>${esc(target.codigo)} v${esc(target.version)}</b> «${esc(target.titulo || 'Sin título')}» a la papelera?</p>
              <p>${enSP() ? 'Deja de aparecer para todo el equipo; su archivo sigue en la carpeta de la oferta.' : 'Deja de aparecer en la lista.'} Se puede restaurar desde <b>Más → Papelera</b>.</p>`,
            buttons: [{ label: 'Cancelar', left: true }, { label: 'Exportar y eliminar', value: 'exp' }, { label: 'Enviar a la papelera', value: 'del', danger: true }]
          });
          if (!v) break;
          if (saveTimer && state.project && state.project.uid === id) saveNow();
          if (v === 'exp') await X.exportProject(target);
          S.remove(id);
          if (state.project && state.project.uid === id) { state.project = null; location.hash = '#/'; } else renderList();
          toast('Proyecto enviado a la papelera');
          break;
        }
        case 'papelera': location.hash = '#/papelera'; break;
        case 'restaurar': {
          S.restore(id);
          toast('Proyecto restaurado');
          renderPapelera();
          break;
        }
        case 'purgar': case 'vaciar': {
          const ids = act === 'vaciar' ? S.trash().map((x) => x.uid) : [id];
          if (!ids.length) break;
          const t = act === 'purgar' ? S.get(id) : null;
          const v = await ask({
            title: act === 'vaciar' ? 'Vaciar la papelera' : 'Eliminar definitivamente',
            body: `<p>${t ? `¿Eliminar definitivamente <b>${esc(t.codigo)} v${esc(t.version)}</b> «${esc(t.titulo || 'Sin título')}»?` : `¿Eliminar definitivamente ${ids.length === 1 ? 'el proyecto' : `los ${ids.length} proyectos`} de la papelera?`}
              Esta acción <b>no se puede deshacer</b>${S.getMode() === 'nube' ? ' y afecta a todo el equipo' : ''}.</p>`,
            buttons: [{ label: 'Cancelar', left: true }, { label: 'Eliminar definitivamente', value: 'si', danger: true }]
          });
          if (v !== 'si') break;
          ids.forEach((x) => S.purge(x));
          toast(ids.length === 1 ? 'Proyecto eliminado definitivamente' : `${ids.length} proyectos eliminados definitivamente`);
          renderPapelera();
          break;
        }
        case 'login-ms': {
          nubeMensaje('Abriendo el ingreso de Microsoft…');
          try { await window.QCloud.entrar(); } catch (err) { nubeMensaje(err.message || String(err), true); }
          break;
        }
        case 'salir': {
          if (saveTimer) saveNow();
          try { await window.QCloud.salir(); } catch (err) { toast(err.message, true); break; }
          location.hash = '#/';
          break;
        }
        case 'recargar': location.reload(); break;
        case 'subir-locales': await ofrecerSubida(true); break;
        case 'abrir-carpeta': {
          const u = window.QCloud.ubicacion(id);
          if (u && u.webUrl) window.open(u.webUrl, '_blank', 'noopener');
          break;
        }
        case 'abrir-biblioteca': {
          const u = window.QCloud.info().sitioUrl;
          if (u) window.open(u, '_blank', 'noopener');
          break;
        }
        case 'excel-carpeta': {
          if (saveTimer) saveNow();
          const pj = S.get(id) || p;
          toast('Generando el Excel y guardándolo en SharePoint…');
          const datos = await X.exportProject(pj, { soloDatos: true });
          const r = await window.QCloud.guardarExcel(pj.uid, datos);
          toast(`Guardado en la carpeta de la oferta: ${r.nombre}`);
          break;
        }
        case 'config': await openConfig(); break;
        case 'tema': toggleTheme(); break;

        // ---- Listado
        case 'filtro-estado': {
          const L = state.list;
          L.estado = L.estado === d.e ? '' : d.e;
          const sel = $('#list-estado');
          if (sel) { sel.value = L.estado; sel.classList.toggle('is-set', !!L.estado); }
          refreshList();
          break;
        }
        case 'quitar-filtro': {
          const L = state.list;
          const map = { q: ['q', '#list-search'], estado: ['estado', '#list-estado'], resp: ['resp', '#list-resp'] };
          const [k, sel] = map[d.k];
          L[k] = '';
          const el = $(sel);
          if (el) { el.value = ''; el.classList.remove('is-set'); }
          refreshList();
          break;
        }
        case 'limpiar-filtros': {
          state.list.q = ''; state.list.estado = ''; state.list.resp = '';
          ['#list-search', '#list-estado', '#list-resp'].forEach((s) => { const el = $(s); if (el) { el.value = ''; el.classList.remove('is-set'); } });
          refreshList();
          break;
        }

        // ---- Editor
        case 'tab': if (p) goTab(d.tab, d.focus); break;
        case 'ir': {
          // Lleva a la fila con el problema; si le falta la partida, abre el selector
          if (DETALLE[d.tab]) state.filtro[d.tab] = '';
          if (state.tab !== d.tab) goTab(d.tab);
          if (d.uid) {
            setTimeout(() => {
              flashRow(d.uid, true);
              const pk = $(`[data-picker="partida"][data-uid="${d.uid}"].error`);
              if (pk) setTimeout(() => openPicker(pk), 120);
            }, 40);
          }
          break;
        }
        case 'add-row': addRow(d.list); break;
        case 'ver-costos': state.filtro[state.costoTab] = d.uid; goTab(state.costoTab); break;
        case 'dup-row': {
          const list = d.list;
          const i = p[list].findIndex((x) => x.uid === d.uid);
          if (i < 0) break;
          const c = Object.assign({}, p[list][i], { uid: S.uid() });
          p[list].splice(i + 1, 0, c);
          recalc(); renderTab(`[data-list="${list}"][data-uid="${c.uid}"][data-k="descripcion"]`); flashRow(c.uid); scheduleSave();
          toast(`${DETALLE[list] ? 'Fila duplicada' : 'Duplicado'}: edita la copia`);
          break;
        }
        case 'del-row': {
          const list = d.list;
          const uid = d.uid;
          if (list === 'partidas') {
            const n = ['materiales', 'equipos', 'manoObra', 'otros'].reduce((a, k) => a + p[k].filter((x) => x.partida === uid).length, 0);
            if (n > 0) {
              const pt = state.partIdx.get(uid);
              const v = await ask({
                title: `Eliminar ${pt.code}`,
                body: `<p>La partida <b>${esc(pt.code)}</b> tiene <b>${n}</b> ítem(s) de costo asociados. ¿Qué hacemos con ellos?</p>`,
                buttons: [{ label: 'Cancelar', left: true }, { label: 'Dejarlos sin partida', value: 'keep' }, { label: 'Eliminarlos también', value: 'all', danger: true }]
              });
              if (!v) break;
              ['materiales', 'equipos', 'manoObra', 'otros'].forEach((k) => {
                if (v === 'all') p[k] = p[k].filter((x) => x.partida !== uid);
                else p[k].forEach((x) => { if (x.partida === uid) x.partida = ''; });
              });
            }
            state.apuOpen.delete(uid);
          }
          p[list] = p[list].filter((x) => x.uid !== uid);
          recalc(); renderTab(); scheduleSave();
          break;
        }
        case 'mover': {
          const arr = p[d.list];
          const i = arr.findIndex((x) => x.uid === d.uid);
          const j = i + parseInt(d.dir, 10);
          if (i < 0 || j < 0 || j >= arr.length) break;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          recalc(); renderTab(`[data-menu="fila"][data-uid="${d.uid}"]`); flashRow(d.uid); scheduleSave();
          break;
        }
        case 'apply-util': {
          const v = parseFloat($('#util-all').value);
          if (!Number.isFinite(v)) { toast('Ingresa el % de recargo a aplicar.', true); $('#util-all').focus(); break; }
          guardarUndo(`Recargo de ${nf(v)} % para todas`);
          p.partidas.forEach((pt) => { pt.utilidadTipo = 'pct'; pt.utilidadValor = v; });
          recalc(); renderTab('[data-act="apply-util"]'); scheduleSave();
          toast(`Recargo de ${nf(v)} % aplicado a ${plural(p.partidas.length, 'partida')}. «Deshacer» vuelve a tus valores.`);
          break;
        }
        case 'util-objetivo': {
          const par = p.parametros;
          const m = num(par.margenObjetivo) / 100;
          if (!(m > 0 && m < 1)) { toast('Define un margen objetivo entre 0 y 100 % en Datos del proyecto → Metas de evaluación.', true); break; }
          // margen = r / (1 + gg + imp + r)  →  r = m (1 + gg + imp) / (1 − m)
          const g = (num(par.gastosGenerales) + num(par.imprevistos)) / 100;
          const rec = Math.round((m * (1 + g) / (1 - m)) * 10000) / 100;
          guardarUndo(`Llevar al margen objetivo (${nf(num(par.margenObjetivo))} %)`);
          p.partidas.forEach((pt) => { pt.utilidadTipo = 'pct'; pt.utilidadValor = rec; });
          recalc(); renderTab('[data-act="util-objetivo"]'); scheduleSave();
          toast(`Recargo de ${nf(rec)} % aplicado: margen ${pct(state.result.kpis.margen)}. «Deshacer» vuelve a tus valores.`);
          break;
        }
        case 'util-deshacer': {
          const u = undoVigente();
          if (!u) { toast('No hay cambios automáticos de utilidad que deshacer.'); break; }
          let n = 0;
          p.partidas.forEach((pt) => {
            const a = u.antes.get(pt.uid);
            if (a) { pt.utilidadTipo = a.utilidadTipo; pt.utilidadValor = a.utilidadValor; n++; }
          });
          state.utilUndo = null;
          recalc(); renderTab('#util-undo'); scheduleSave();
          toast(`Utilidad ingresada a mano restaurada en ${plural(n, 'partida')}: margen ${pct(state.result.kpis.margen)}`);
          break;
        }
        case 'copiar': {
          if (!(await copiarTexto(d.v))) { toast('No se pudo copiar. Selecciona el valor y usa Ctrl+C.', true); break; }
          marcarCopiado(btn);
          toast(`Copiado: ${d.v} (${d.lbl})`);
          break;
        }
        case 'copiar-tabla': {
          if (!(await copiarTexto(tablaCotizacion()))) { toast('No se pudo copiar la tabla.', true); break; }
          marcarCopiado(btn);
          toast(`Tabla de ${plural(p.partidas.length, 'partida')} copiada: pégala en Excel o Word`);
          break;
        }
        case 'scroll': {
          const el = $('#' + d.to);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
        case 'add-cat': p.catalogoOtros.push({ descripcion: '', unidad: 'Un.', costoUnitario: 0 }); renderTab(`[data-cat="${p.catalogoOtros.length - 1}"][data-k="descripcion"]`); scheduleSave(); break;
        case 'del-cat': p.catalogoOtros.splice(+d.i, 1); renderTab(); scheduleSave(); break;
        case 'save-defaults': {
          const cfg = S.getConfig();
          cfg.parametros = S.clone(p.parametros);
          cfg.parametros.presupuestoMaximo = null;
          cfg.catalogoOtros = S.clone(p.catalogoOtros);
          S.setConfig(cfg);
          toast('Parámetros guardados como predeterminados');
          break;
        }
        case 'sens-reset':
          p.parametros.sensibilidad = { mat: 0, eq: 0, mo: 10, otros: 0 };
          recalc(); renderTab(); scheduleSave();
          break;
        case 'apu': {
          const uid = d.uid;
          if (state.apuOpen.has(uid)) state.apuOpen.delete(uid); else state.apuOpen.add(uid);
          refreshResumen();
          const b = $(`[data-act="apu"][data-uid="${uid}"]`);
          if (b) b.focus();
          break;
        }
        case 'imprimir': {
          // Utilidad, precio y evaluación en una sola página; al terminar se vuelve a la vista normal
          state.imprimir = true;
          renderTab();
          const fin = () => { window.removeEventListener('afterprint', fin); state.imprimir = false; renderTab(); };
          window.addEventListener('afterprint', fin);
          setTimeout(() => window.print(), 200);
          break;
        }
        default: break;
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'Ocurrió un error.', true);
    }
  }

  // ---- Importación ----------------------------------------------------------------
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      toast('Leyendo archivo…');
      const res = await X.importFile(file);
      let destino = null;
      if (enSP()) {
        const n = res.proyectos.length;
        destino = await elegirCarpeta({
          titulo: 'Importar: ¿de qué oferta?',
          texto: `${n === 1 ? 'El proyecto importado se guarda' : `Los ${n} proyectos importados se guardan`} en la carpeta de la oferta que elijas.`,
          crear: true
        });
        if (!destino) return;
      }
      const nuevos = [];
      for (const p of res.proyectos) {
        const existing = S.get(p.uid);
        if (existing) {
          const v = await ask({
            title: 'El proyecto ya existe',
            body: `<p><b>${esc(p.codigo)} v${esc(p.version)}</b> «${esc(p.titulo)}» ya existe${existing.eliminado ? ' (en la papelera)' : ''} (modificado el ${esc(new Date(existing.modificado).toLocaleString('es-CL'))}).</p>`,
            buttons: [{ label: 'Omitir', left: true }, { label: 'Importar como copia', value: 'copy' }, { label: 'Reemplazar', value: 'replace', primary: true }]
          });
          if (!v) continue;
          const item = v === 'copy' ? S.cloneProject(p) : p;
          if (destino && v === 'copy') enCarpeta(item, destino);
          S.upsert(item); nuevos.push(item);
        } else {
          if (destino) enCarpeta(p, destino);
          S.upsert(p); nuevos.push(p);
        }
      }
      const go = await ask({
        title: nuevos.length ? 'Importación completada' : 'No se importaron proyectos',
        body: `<ul>${res.informe.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
        buttons: [{ label: 'Cerrar' }, nuevos.length === 1 ? { label: 'Abrir proyecto', value: 'open', primary: true } : null]
      });
      if (go === 'open') goProject(nuevos[0], 'resumen');
      else if (!state.project) renderList();
    } catch (err) {
      console.error(err);
      toast('No se pudo importar: ' + (err.message || err), true);
    }
  });

  // ---- Configuración ---------------------------------------------------------------
  async function openConfig() {
    const cfg = S.getConfig();
    const par = cfg.parametros;
    const enNube = S.getMode() === 'nube';
    const puede = true; // en SharePoint, los permisos de la carpeta deciden quién puede cambiarlos
    const dis = puede ? '' : 'disabled';
    const campo = (id, label, v, pre, suf) => `<div class="campo"><label for="cfg-${id}">${label}</label>
      <div class="input-affix ${pre ? 'pre' : ''}"><input class="input" id="cfg-${id}" type="number" step="any" inputmode="decimal" value="${esc(num(v))}" ${dis}><span class="affix">${pre || suf}</span></div></div>`;
    const v = await ask({
      title: 'Configuración',
      wide: true,
      body: `<p>Valores con que parten los proyectos nuevos${enNube ? ' de todo el equipo' : ' de este navegador'}. Los proyectos existentes conservan los suyos.${enNube ? ` Quedan en SharePoint, en «${esc((window.QPN_M365 || {}).carpetaConfig || 'la biblioteca')}».` : ''}</p>
        <div class="fila-campos">
          ${enNube ? '' : `<div class="campo"><label for="cfg-prefijo">Prefijo del código</label><input class="input" id="cfg-prefijo" value="${esc(cfg.prefijo)}" ${dis}><span class="hint">Ej.: ${esc(cfg.prefijo)}-${new Date().getFullYear()}-001</span></div>`}
          <div class="campo"><label for="cfg-resp">Responsable por defecto</label><input class="input" id="cfg-resp" value="${esc(cfg.responsable)}">${enNube ? '<span class="hint">Solo para ti.</span>' : ''}</div>
        </div>
        <h3 class="sub-t">Precio y tarifas</h3>
        <div class="fila-campos cfg-grid">
          ${campo('iva', 'IVA', par.iva, '', '%')}${campo('gg', 'Gastos generales', par.gastosGenerales, '', '%')}${campo('imp', 'Imprevistos', par.imprevistos, '', '%')}
          ${campo('n1', 'Día-hombre nivel 1', par.tarifaN1, '$')}${campo('n2', 'Día-hombre nivel 2', par.tarifaN2, '$')}${campo('n3', 'Día-hombre nivel 3', par.tarifaN3, '$')}
        </div>
        <h3 class="sub-t">Metas de evaluación</h3>
        <div class="fila-campos cfg-grid">
          ${campo('mobj', 'Margen objetivo', par.margenObjetivo, '', '%')}${campo('mmin', 'Margen mínimo', par.margenMinimo, '', '%')}${campo('meta', 'Meta por día-hombre', par.metaUtilidadDH, '$')}
        </div>`,
      buttons: [puede ? { label: 'Restablecer valores de fábrica', value: 'reset', danger: true, left: true } : null, { label: 'Cancelar' }, { label: 'Guardar', value: 'save', primary: true }]
    });
    if (v === 'save') {
      if ($('#cfg-prefijo')) cfg.prefijo = ($('#cfg-prefijo').value || 'QPN').trim().toUpperCase();
      cfg.responsable = $('#cfg-resp').value.trim();
      if (puede) {
        const leer = (id) => { const n = parseFloat($('#cfg-' + id).value); return Number.isFinite(n) ? n : 0; };
        Object.assign(cfg.parametros, {
          iva: leer('iva'), gastosGenerales: leer('gg'), imprevistos: leer('imp'),
          tarifaN1: leer('n1'), tarifaN2: leer('n2'), tarifaN3: leer('n3'),
          margenObjetivo: leer('mobj'), margenMinimo: leer('mmin'), metaUtilidadDH: leer('meta')
        });
      }
      S.setConfig(cfg);
      toast('Configuración guardada: se usará en los proyectos nuevos');
    } else if (v === 'reset') {
      S.setConfig({ prefijo: cfg.prefijo, responsable: cfg.responsable });
      toast('Valores de fábrica restablecidos');
    }
    if (!state.project && !location.hash.startsWith('#/guia')) renderList();
  }

  // ---------------------------------------------------------------------------
  //  SHAREPOINT: ingreso, cuenta, papelera y cambios de otros usuarios
  // ---------------------------------------------------------------------------
  function textoDonde() {
    return S.getMode() === 'nube'
      ? 'Los proyectos se guardan en SharePoint, en la carpeta de cada oferta, y los ve todo el equipo. Para archivar una copia aparte usa Más → Respaldar todos los proyectos.'
      : 'Los proyectos se guardan en este navegador. Para respaldarlos o compartirlos, expórtalos a Excel o JSON; ambos formatos se pueden volver a importar.';
  }

  /* Pantalla mientras no hay sesión: conectando, ingreso, sin acceso o error. */
  function renderNube() {
    const c = window.QCloud.info();
    renderModnav('ingreso');
    document.title = 'Ingreso — Formulación QUEMPIN';
    $('#hdr-sub').textContent = 'Proyectos compartidos del equipo QUEMPIN';
    let cuerpo;
    if (c.estado === 'cargando' || c.estado === 'sincronizando') {
      cuerpo = `<h3>Conectando…</h3><p class="desc">${esc(c.estado === 'sincronizando' ? (c.detalle || 'Cargando los proyectos del equipo.') : 'Verificando tu sesión.')}</p>`;
    } else if (c.estado === 'sin-sesion') {
      cuerpo = `<h3>Ingresa con tu cuenta de QUEMPIN</h3>
        <p class="desc">Los proyectos se guardan en SharePoint, en la carpeta de cada oferta de la biblioteca «Formulación de proyectos». Entra con la misma cuenta Microsoft que usas para OneDrive y Outlook.</p>
        <button class="btn btn-primario login-ms" type="button" data-act="login-ms">${ICON.login}Entrar con Microsoft</button>`;
    } else if (c.estado === 'no-autorizado') {
      cuerpo = `<h3>Tu cuenta no tiene acceso</h3>
        <p class="desc">${esc(c.detalle || 'Tu cuenta no tiene acceso a la biblioteca de SharePoint.')} Pide al administrador del sitio que te agregue como miembro y vuelve a intentarlo.</p>
        <div class="actions"><button class="btn btn-primario" type="button" data-act="recargar">Reintentar</button><button class="btn" type="button" data-act="salir">Usar otra cuenta</button></div>`;
    } else {
      cuerpo = `<h3>No se pudo conectar con SharePoint</h3>
        <p class="desc">${esc(c.detalle || 'Error desconocido.')}</p>
        <div class="actions"><button class="btn btn-primario" type="button" data-act="recargar">Reintentar</button></div>`;
    }
    const aviso = '';
    app.innerHTML = `<div class="viz-container page"><div class="login-wrap">
      <article class="hub-card login-card">
        <div class="hub-card-cabecera"><div class="icon" aria-hidden="true">${ICON.user}</div><div><h2>Formulación de proyectos</h2><div class="hub-normas">QUEMPIN · acceso del equipo</div></div></div>
        ${cuerpo}
        <p id="login-msg" class="login-msg ${aviso ? 'err' : ''}" role="status" aria-live="polite">${esc(aviso)}</p>
      </article></div></div>`;
    const b = $('[data-act="login-ms"]');
    if (b) b.focus();
  }
  function nubeMensaje(texto, esError) {
    const el = $('#login-msg');
    if (el) { el.textContent = texto; el.className = 'login-msg ' + (esError ? 'err' : ''); } else if (esError) toast(texto, true);
  }
  // Enter en un campo con data-enter = su acción
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key === 'Enter' && t && t.dataset && t.dataset.enter) { e.preventDefault(); doAct(t.dataset.enter, {}); }
  });

  /* Botón de cuenta del encabezado: nombre y punto de sincronización. */
  function pintarCuenta(c) {
    const b = $('#cuentaBtn');
    if (!b) return;
    const u = S.getUser();
    b.hidden = !(nube.activa && u && c.estado === 'listo');
    if (b.hidden) return;
    const cls = c.pendientes > 0 || !c.enLinea ? 'pendiente' : 'ok';
    const nombre = (u.nombre || u.email).split(/[\s@]/)[0];
    b.innerHTML = `<span class="cuenta-dot ${cls}" aria-hidden="true"></span>${esc(nombre)}`;
    b.title = `${u.email} · ${textoGuardado()[0]}`;
    b.setAttribute('aria-label', `Cuenta de ${u.email}. ${textoGuardado()[0]}`);
  }

  function onCloudEstado(c) {
    pintarCuenta(c);
    if (c.estado === 'listo') {
      $('#footer-datos').textContent = textoDonde();
      if (!nube.lista) {
        nube.lista = true;
        nube.ultimo = '';
        route();
        setTimeout(() => ofrecerSubida(false), 400);
      }
      showSyncState();
      return;
    }
    if (c.estado === 'error' && nube.lista) { toast(c.detalle, true); return; }
    if (c.estado === 'sin-sesion' || c.estado === 'no-autorizado') nube.lista = false;
    if (nube.lista) return;
    const k = c.estado + '|' + c.detalle;
    if (k === nube.ultimo) return;
    nube.ultimo = k;
    if (saveTimer) saveNow();
    state.project = null;
    if (!location.hash.startsWith('#/guia')) renderNube();
  }

  /* Cambios que llegan de otros usuarios (o de otra ventana del mismo usuario). */
  S.on((ev) => {
    if (ev.type === 'error') { toast(ev.mensaje, true); if (state.project) setSaveState(ev.mensaje, 'err'); return; }
    if (ev.type === 'sync') { showSyncState(); if (nube.activa) pintarCuenta(window.QCloud.info()); return; }
    if (ev.type === 'remote' && ev.conflicto) { alConflicto(ev); return; }
    if (ev.type === 'carpetas') { // una carpeta de oferta se movió o cambió de nombre en SharePoint
      if (!nube.lista) return;
      if (state.project) updateHeader();
      else if ($('#list-body')) refreshList();
      return;
    }
    if (!nube.lista || (ev.type !== 'remote' && ev.type !== 'config')) return;
    const h = location.hash;
    if (state.project) {
      if (ev.type !== 'remote' || !ev.ids.includes(state.project.uid)) return;
      const cur = S.get(state.project.uid);
      if (cur === state.project || saveTimer || state.conflicto) return; // con cambios sin guardar: se resuelve al guardar
      const quien = ev.autores.length ? ev.autores.join(', ') : 'otra ventana';
      if (!cur || cur.eliminado) {
        toast(`${quien} envió este proyecto a la papelera`, true);
        state.project = null;
        location.hash = '#/';
        return;
      }
      recargarProyecto(cur);
      toast(`Actualizado con cambios de ${quien}`);
    } else if (h.startsWith('#/papelera')) renderPapelera();
    else if (!h.startsWith('#/guia')) {
      if ($('#list-body') && S.all().length) refreshList(); else renderList();
    }
  });

  // ---- Papelera ---------------------------------------------------------------------
  function renderPapelera() {
    const list = S.trash().sort((a, b) => String(b.eliminadoEn || '').localeCompare(String(a.eliminadoEn || '')));
    const puedePurgar = !enSP(); // en SharePoint el archivo nunca se borra desde la herramienta
    document.title = 'Papelera — Formulación QUEMPIN';
    app.innerHTML = `<div class="viz-container page">
      <div class="page-head">
        <div>
          <a class="back" href="#/">← Proyectos</a>
          <h2>Papelera</h2>
          <p>Los proyectos eliminados quedan aquí y se pueden restaurar. ${puedePurgar ? 'Eliminarlos definitivamente no se puede deshacer.' : 'Sus archivos siguen en la carpeta de cada oferta en SharePoint; para borrarlos del todo, hazlo allí.'}</p>
        </div>
        ${puedePurgar && list.length ? `<div class="actions"><button class="btn btn-danger" data-act="vaciar">${ICON.trash}Vaciar papelera</button></div>` : ''}
      </div>
      ${list.length ? `<div class="tabla-contenedor"><table class="tbl" style="min-width:760px">
        <thead><tr><th>Código</th><th>Proyecto</th><th>Eliminado</th><th></th></tr></thead>
        <tbody>${list.map((p) => `<tr>
          <td class="nowrap"><span class="code-badge">${esc(p.codigo || '—')}</span><span class="ver">v${esc(p.version)}</span></td>
          <td style="min-width:220px"><div class="proj-title">${esc(p.titulo || 'Sin título')}</div><div class="proj-sub">${esc([p.cliente, p.estado].filter(Boolean).join(' · '))}</div></td>
          <td class="nowrap">${p.eliminadoEn ? esc(new Date(p.eliminadoEn).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })) : '—'}${p.eliminadoPor ? `<div class="proj-sub">${esc(p.eliminadoPor)}</div>` : ''}</td>
          <td class="cell-actions nowrap">
            <button type="button" class="btn" data-act="restaurar" data-id="${p.uid}">${ICON.restore}Restaurar</button>
            ${puedePurgar ? `<button type="button" class="btn btn-danger" data-act="purgar" data-id="${p.uid}">Eliminar definitivamente</button>` : ''}
          </td></tr>`).join('')}</tbody></table></div>`
        : '<div class="panel"><p class="muted" style="margin:0">La papelera está vacía.</p></div>'}
    </div>`;
  }

  // ---- Proyectos guardados en el navegador antes de usar SharePoint ------------------
  async function ofrecerSubida(manual) {
    if (!enSP() || !nube.lista) return;
    const pend = window.QCloud.proyectosLocalesPendientes();
    const KEY = 'qpn.formulacion.subidaOmitida';
    if (!pend.length) { if (manual) toast('No quedan proyectos de este navegador por guardar en SharePoint'); return; }
    if (!manual) { try { if (localStorage.getItem(KEY) === String(pend.length)) return; } catch (e) { /* sin almacenamiento */ } }
    const v = await ask({
      title: 'Proyectos guardados solo en este navegador',
      wide: true,
      body: `<p>Este navegador tiene ${plural(pend.length, 'proyecto')} de antes de usar SharePoint. Guarda cada uno en la carpeta de su oferta para que lo vea el equipo. La copia de este navegador no se borra.</p>
        <div class="loc-lista">${pend.map((p) => `<div class="loc-fila">
          <span class="nowrap"><span class="code-badge">${esc(p.codigo || '—')}</span><span class="ver">v${esc(p.version)}</span></span>
          <span class="loc-t">${esc(p.titulo || 'Sin título')}</span>
          <button type="submit" class="btn btn-sm" value="l:${esc(p.uid)}">${ICON.folder}Guardar en una oferta…</button></div>`).join('')}</div>`,
      buttons: [{ label: 'Ahora no', value: 'no', primary: true }]
    });
    if (typeof v === 'string' && v.startsWith('l:')) {
      const p = pend.find((x) => x.uid === v.slice(2));
      const sel = p && await elegirCarpeta({
        titulo: `Guardar ${p.codigo} v${p.version} en SharePoint`,
        texto: `«${esc(p.titulo || 'Sin título')}» se guarda en la carpeta de la oferta que elijas.`,
        crear: true
      });
      if (sel) {
        enCarpeta(p, sel);
        S.upsert(p);
        toast(`Guardado en ${sel.carpeta.nombre}`);
        if (!state.project) route();
      }
      if (window.QCloud.proyectosLocalesPendientes().length) return ofrecerSubida(true);
      return undefined;
    }
    if (!manual) { try { localStorage.setItem(KEY, String(pend.length)); } catch (e) { /* sin almacenamiento */ } }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  //  SHAREPOINT: carpeta de la oferta de cada proyecto
  // ---------------------------------------------------------------------------
  /* Palabras que no sirven para comparar el nombre de la carpeta con el de la planilla. */
  const COMUNES = new Set(('mantencion mantenimiento mantenciones preventiva preventivo correctiva correctivo servicio servicios ' +
    'sistema sistemas instalacion instalaciones equipo equipos adquisicion reparacion suministro anual ' +
    'para del las los por con una uno sin que').split(' '));
  /* Palabras propias de un título (incluye siglas de tres letras). */
  function palabras(t) { return norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !COMUNES.has(w)); }
  /* true si el título de la planilla parece ser la misma oferta que la carpeta: comparten una palabra
     propia o una abreviatura (Admin ~ Administrativo). Con los datos reales marca 3 de 32 carpetas. */
  function coincidePlanilla(tituloCarpeta, tituloPlanilla) {
    const a = palabras(tituloCarpeta);
    if (!a.length) return true;
    const b = palabras(tituloPlanilla);
    return a.some((x) => b.some((y) => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)))));
  }
  function fechaUTC(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const z = (n) => String(n).padStart(2, '0');
    return `${z(d.getUTCDate())}-${z(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  }
  function siguienteVersion(carpetaId) {
    return S.all().concat(S.trash())
      .filter((x) => window.QCloud.carpetaDe(x.uid) === carpetaId)
      .reduce((a, x) => Math.max(a, parseInt(x.version, 10) || 1), 0) + 1;
  }

  /* Deja el proyecto en la carpeta elegida: código = N° de la oferta y versión libre en esa carpeta.
     Con datosOferta, además título, ubicación, referencia y presupuesto desde la planilla de ingreso. */
  function enCarpeta(p, sel, opts) {
    const c = sel.carpeta, r = sel.req;
    const ok = !!r; // elegirCarpeta solo entrega la fila de la planilla si corresponde a la carpeta
    if (c.numero) p.codigo = c.numero;
    const ocupada = S.all().concat(S.trash()).some((x) => x.uid !== p.uid && window.QCloud.carpetaDe(x.uid) === c.id && String(x.version) === String(p.version));
    if (ocupada) p.version = siguienteVersion(c.id);
    if (opts && opts.datosOferta) {
      p.titulo = (ok && r.titulo) || c.titulo || p.titulo;
      if (ok && r.ubicacion) p.ubicacion = r.ubicacion;
      p.parametros.presupuestoMaximo = ok && r.presupuesto ? r.presupuesto : null;
      p.parametros.presupuestoIncluyeIva = true;
    }
    window.QCloud.asignarCarpeta(p.uid, c.id);
    return p;
  }

  async function nuevoEnSharePoint() {
    const sel = await elegirCarpeta({
      titulo: 'Nuevo proyecto: ¿de qué oferta?',
      texto: 'La formulación se guarda en la carpeta de la oferta, junto a sus antecedentes. Busca por el número de la planilla de ingreso o por el nombre.',
      crear: true, planilla: true
    });
    if (!sel) return;
    const todos = S.all().filter((x) => window.QCloud.carpetaDe(x.uid) === sel.carpeta.id)
      .sort((a, b) => (parseInt(b.version, 10) || 1) - (parseInt(a.version, 10) || 1));
    if (todos.length) {
      const ult = todos[0];
      const v = await ask({
        title: 'Esta oferta ya tiene formulación',
        body: `<p>En <b>${esc(sel.carpeta.nombre)}</b> ya está <b>${esc(ult.codigo)} v${esc(ult.version)}</b> «${esc(ult.titulo || 'Sin título')}»${todos.length > 1 ? ` y ${plural(todos.length - 1, 'versión anterior', 'versiones anteriores')}` : ''}.</p>
          <p>Para revisar el precio o el alcance, ábrela y usa <b>⋯ → Crear nueva versión</b>: así se conserva lo que ya se ofertó.</p>`,
        buttons: [{ label: 'Cancelar', left: true }, { label: 'Crear otra desde cero', value: 'nuevo' }, { label: `Abrir ${ult.codigo} v${ult.version}`, value: 'abrir', primary: true }]
      });
      if (v === 'abrir') { goProject(ult, 'ficha'); return; }
      if (v !== 'nuevo') return;
    }
    const r = sel.req;
    const ok = !!r;
    const extra = {};
    if (ok) {
      const partes = [r.referencia ? `Referencia ${r.referencia}` : '', r.cierre ? `cierre ${fechaUTC(r.cierre)}` : ''].filter(Boolean);
      if (partes.length) extra.descripcion = partes.join(' · ') + '.';
    }
    const np = enCarpeta(S.newProject(extra), sel, { datosOferta: true });
    S.upsert(np);
    goProject(np, 'ficha');
    setTimeout(() => { const t = $('[data-f="titulo"]'); if (t) t.focus(); }, 60);
  }

  /* Copia de cambios que chocaron con los de otra persona: nueva versión en la misma oferta. */
  function copiaDeCambios(p, sufijo) {
    if (enSP()) {
      const carpeta = window.QCloud.carpetaDe(p.uid);
      const c = S.cloneProject(p, { version: siguienteVersion(carpeta), titulo: (p.titulo || 'Proyecto') + sufijo });
      window.QCloud.asignarCarpeta(c.uid, carpeta);
      S.upsert(c);
      return c;
    }
    const cfg = S.getConfig();
    const c = S.cloneProject(p, { codigo: S.nextCodigo(cfg.prefijo, new Date().getFullYear()), version: 1, titulo: (p.titulo || 'Proyecto') + sufijo });
    S.upsert(c);
    return c;
  }

  /* Llegó la versión de otra persona mientras aquí había cambios sin subir. */
  function alConflicto(ev) {
    const uid = ev.ids[0];
    const cur = S.get(uid);
    if (!cur) return;
    if (state.project && state.project.uid === uid) { resolverConflicto(cur); return; }
    if (!ev.local) return;
    const c = copiaDeCambios(ev.local, ' (cambios sin subir)');
    const quien = ev.autores.length ? ev.autores.join(', ') : 'Otra persona';
    toast(`${quien} modificó ${cur.codigo} v${cur.version} al mismo tiempo. Tus cambios quedaron en la versión ${c.version}.`, true);
    if (!state.project && !location.hash.startsWith('#/guia')) route();
  }

  /* Selector de la carpeta de oferta. Devuelve { carpeta, req } (req: fila de la planilla) o null. */
  async function elegirCarpeta(opts) {
    const lista = window.QCloud.carpetas();
    const orden = (g) => (g === 'En curso' ? 0 : g === 'Presentada' ? 1 : g === 'Adjudicada' ? 2 : 3);
    lista.sort((a, b) => orden(a.grupo) - orden(b.grupo) || String(b.grupo).localeCompare(String(a.grupo)) ||
      (parseInt(b.numero, 10) || 0) - (parseInt(a.numero, 10) || 0) || a.nombre.localeCompare(b.nombre, 'es'));
    let pl = null;
    const cargaPlanilla = window.QCloud.planilla().catch((err) => { console.warn('Planilla de ingreso no disponible:', err); return null; });
    const filas = () => {
      let g = null;
      return lista.map((c) => {
        const r = pl && c.numero ? pl.get(c.numero) : null;
        const aviso = r && !coincidePlanilla(c.titulo, r.titulo);
        const head = c.grupo !== g ? `<div class="cp-grupo" data-g="${esc(c.grupo)}">${esc(c.grupo)}</div>` : '';
        g = c.grupo;
        const sub = r ? (aviso ? `Revisa: en la planilla, el N° ${esc(c.numero)} es «${esc(r.titulo)}»` : `Planilla: ${esc(r.estado || 'sin estado')}`) : '';
        return `${head}<button type="submit" class="cp-fila${c.id === opts.actual ? ' actual' : ''}" value="c:${esc(c.id)}" data-g="${esc(c.grupo)}"
            data-q="${esc(norm([c.numero, c.titulo, r ? r.titulo : ''].join(' ')))}">
          <span class="code-badge">${esc(c.numero || 's/n')}</span>
          <span class="cp-t"><b>${esc(c.titulo)}</b>${sub ? `<span class="cp-sub ${aviso ? 'cp-aviso' : ''}">${aviso ? '▲ ' : ''}${sub}</span>` : ''}</span>
          ${c.id === opts.actual ? '<span class="chip">Actual</span>' : ''}
        </button>`;
      }).join('');
    };
    const prom = ask({
      title: opts.titulo,
      wide: true,
      body: `<p>${opts.texto}</p>
        <div class="campo"><label for="cp-buscar">Buscar oferta</label>
          <input class="input" id="cp-buscar" type="search" placeholder="Número o nombre, p. ej. 298 o calderas" autocomplete="off"></div>
        <div class="cp-lista" id="cp-lista">${filas()}</div>
        <p class="muted cp-vacio" id="cp-vacio" ${lista.length ? 'hidden' : ''}>${lista.length ? 'Ninguna carpeta coincide con la búsqueda.' : 'No hay carpetas de oferta en la biblioteca.'}</p>
        ${opts.crear ? `<details class="cp-nueva" id="cp-nueva"><summary>¿La oferta aún no tiene carpeta? Crearla</summary>
          <div class="fila-campos">
            <div class="campo"><label for="cp-num">N° en la planilla</label><input class="input" id="cp-num" inputmode="numeric" autocomplete="off"></div>
            <div class="campo ancho"><label for="cp-tit">Título de la carpeta</label><input class="input" id="cp-tit" autocomplete="off"></div>
          </div>
          <p class="hint">Se crea «N°. Título» junto a las demás ofertas en curso. No se modifica nada más.</p>
          <button type="button" class="btn" id="cp-crear">${ICON.folder}Crear la carpeta y usarla</button>
          <p class="login-msg" id="cp-msg" role="status" aria-live="polite"></p>
        </details>` : ''}`,
      buttons: [{ label: 'Cancelar' }]
    });
    const dlg = $('#modal');
    const inp = $('#cp-buscar');
    const filtrar = () => {
      const q = norm(inp.value.trim());
      const vis = new Set();
      dlg.querySelectorAll('.cp-fila').forEach((b) => {
        b.hidden = !!q && !b.dataset.q.includes(q);
        if (!b.hidden) vis.add(b.dataset.g);
      });
      dlg.querySelectorAll('.cp-grupo').forEach((h) => { h.hidden = !vis.has(h.dataset.g); });
      $('#cp-vacio').hidden = vis.size > 0 || !lista.length;
    };
    inp.addEventListener('input', filtrar);
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const vis = Array.from(dlg.querySelectorAll('.cp-fila')).filter((b) => !b.hidden);
      if (vis.length === 1) dlg.close(vis[0].value);
    });
    cargaPlanilla.then((m) => {
      pl = m;
      const el = $('#cp-lista');
      if (m && dlg.open && el) { el.innerHTML = filas(); filtrar(); }
    });
    if (opts.crear) {
      const num = $('#cp-num'), tit = $('#cp-tit'), msg = $('#cp-msg');
      let autoTit = '';
      num.addEventListener('input', () => {
        const r = pl && pl.get(String(parseInt(num.value, 10)));
        if (r && (!tit.value || tit.value === autoTit)) { autoTit = r.titulo.slice(0, 120); tit.value = autoTit; }
      });
      const crear = async () => {
        msg.textContent = 'Creando la carpeta…'; msg.className = 'login-msg';
        try {
          const c = await window.QCloud.crearCarpeta(num.value, tit.value);
          lista.push(c);
          dlg.close('c:' + c.id);
        } catch (err) { msg.textContent = err.message || String(err); msg.className = 'login-msg err'; }
      };
      $('#cp-crear').addEventListener('click', crear);
      [num, tit].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); crear(); } }));
    }
    const v = await prom;
    if (typeof v !== 'string' || !v.startsWith('c:')) return null;
    const carpeta = lista.find((c) => c.id === v.slice(2));
    if (!carpeta) return null;
    pl = pl || await cargaPlanilla;
    let req = pl && carpeta.numero ? pl.get(carpeta.numero) || null : null;
    if (req && opts.planilla && !coincidePlanilla(carpeta.titulo, req.titulo)) {
      const usar = await ask({
        title: '¿Es la misma oferta?',
        body: `<p>La carpeta es <b>${esc(carpeta.nombre)}</b>, pero en la planilla de ingreso el N° ${esc(carpeta.numero)} es <b>«${esc(req.titulo)}»</b>.</p>
          <p>Si es la misma oferta, se usan los datos de la planilla (título, ubicación y presupuesto). Si no, solo el nombre de la carpeta.</p>`,
        buttons: [{ label: 'Cancelar', left: true }, { label: 'No, solo la carpeta', value: 'no' }, { label: 'Sí, usar la planilla', value: 'si', primary: true }]
      });
      if (!usar) return null;
      if (usar === 'no') req = null;
    }
    return { carpeta, req: opts.planilla ? req : null };
  }

  /* Carpeta del proyecto en la lista y en el encabezado. */
  function carpetaCorta(p) {
    const u = enSP() ? window.QCloud.ubicacion(p.uid) : null;
    return u ? `<div class="proj-carpeta">${ICON.folder}<span>${esc(u.grupo)} · ${esc(u.carpeta)}</span></div>` : '';
  }

  // ---- Tema claro / oscuro (botón igual al de las demás herramientas QUEMPIN) ------------
  const themeBtn = $('#themeToggle');
  function isDarkNow() {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || (t !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function syncThemeBtn() {
    const t = isDarkNow() ? 'Modo claro' : 'Modo oscuro';
    themeBtn.innerHTML = `${isDarkNow() ? ICON.sol : ICON.luna}<span class="hb-t">${t}</span>`;
    themeBtn.setAttribute('aria-label', t);
  }
  function toggleTheme() {
    const next = isDarkNow() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('quempin_fp_theme', next); } catch (e) { /* sin almacenamiento */ }
    syncThemeBtn();
  }
  syncThemeBtn();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', syncThemeBtn);
  }

  // Arranque: con SharePoint configurado se espera la sesión; si no, modo local de siempre.
  if (window.QCloud && window.QCloud.configurado) {
    nube.activa = true;
    $('#footer-datos').textContent = 'Los proyectos se guardan en SharePoint, en la carpeta de cada oferta, y los ve todo el equipo.';
    window.QCloud.onEstado(onCloudEstado);
    window.QCloud.iniciar();
    if (location.hash.startsWith('#/guia')) route();
  } else {
    route();
  }
})();
