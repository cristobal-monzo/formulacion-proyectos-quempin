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
  /* Mes en que el proyecto se ingresó al Formulador («2026-06»), en hora local. Sale de
     p.creado (una importación lo conserva; una copia o versión nueva lo renueva). */
  const mesIngreso = (p) => {
    const d = new Date(p.creado || '');
    if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = /^(\d{4})-(\d{2})/.exec(String(p.fecha || ''));
    return m ? `${m[1]}-${m[2]}` : '';
  };
  /* «2026-06» → «Junio 2026» */
  const nombreMes = (ym) => {
    const [a, m] = ym.split('-').map(Number);
    const s = new Date(a, m - 1, 1).toLocaleDateString('es-CL', { month: 'long' });
    return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${a}`;
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
    restore: svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>'),
    enviar: svg('<path d="M21 3L3 10.5l7 3 3 7.5z"/><path d="M21 3L10 13.5"/>')
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
    list: { q: '', estado: '', resp: '', mes: '', sort: { k: 'mod', dir: -1 } },
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
        { icon: ICON.folder, title: 'Respaldar por mes de ingreso', desc: 'Un JSON por mes en la carpeta que elijas, ordenados por año', act: 'respaldar-meses', disabled: !n },
        { icon: ICON.trash, title: `Papelera (${S.trash().length})`, desc: enSP() || compartiendo() ? 'Proyectos eliminados: restaurar' : 'Proyectos eliminados: restaurar o eliminar definitivamente', act: 'papelera' },
        enSP() ? null : { sep: true },
        enSP() ? null : { icon: ICON.sparkle, title: 'Cargar proyecto de ejemplo', desc: 'Mismos datos del Excel original, para comparar resultados', act: 'ejemplo' }
      ].filter(Boolean);
    } else if (key === 'proj' || key === 'editor-more') {
      const enEditor = key === 'editor-more';
      const ub = enSP() ? window.QCloud.ubicacion(id) : null;
      const vo = !enSP() && ofertaActiva() ? QO().vinculo(S.get(id)) : undefined;
      items = [
        enEditor ? { icon: ICON.print, title: 'Imprimir resumen', desc: 'Utilidad, precio y evaluación en una página', act: 'imprimir' } : null,
        enEditor ? { sep: true } : null,
        enEditor ? null : { icon: ICON.open, title: 'Abrir', act: 'abrir', id },
        ub && ub.webUrl ? { icon: ICON.folder, title: 'Abrir la carpeta en SharePoint', desc: ub.ruta, act: 'abrir-carpeta', id } : null,
        ub ? { icon: ICON.sheet, title: 'Guardar Excel en la carpeta', desc: 'Copia para ver o imprimir desde SharePoint', act: 'excel-carpeta', id } : null,
        vo ? { icon: ICON.sheet, title: 'Guardar Excel en la carpeta de la oferta', desc: vo.nombre, act: 'oferta-guardar', id } : null,
        vo === null ? { icon: ICON.folder, title: 'Elegir la carpeta de la oferta', desc: 'Para dejar ahí una copia en Excel, al día', act: 'oferta-elegir', id } : null,
        enEditor ? null : { icon: ICON.download, title: 'Exportar a Excel', desc: 'Planilla con fórmulas vivas y ficha de KPI', act: 'exp-xlsx', id },
        { icon: ICON.file, title: 'Exportar a JSON', desc: 'Para respaldar o compartir y volver a importar', act: 'exp-json', id },
        { icon: ICON.enviar, title: 'Enviar costos al Análisis Financiero', desc: 'Como costos proyectados del proyecto adjudicado', act: 'enviar-af', id },
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
    // Otra persona (SharePoint o carpeta compartida) u otra pestaña guardó este proyecto
    // mientras se editaba: preguntar antes de sobrescribir.
    const cur = S.get(state.project.uid);
    if (cur && cur !== state.project) { resolverConflicto(cur); return; }
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
    if (S.getMode() !== 'nube') {
      if (!compartiendo()) return ['Guardado en este navegador', ''];
      const i = QC().info();
      if (i.sinPermiso || i.sinCarpeta) return ['Guardado solo en este navegador', 'saving'];
      if (i.error) return ['Guardado en este navegador; no se pudo copiar a la carpeta compartida', 'err'];
      if (i.pendientes > 0) return ['Guardado en este navegador · copiando a la carpeta compartida…', 'saving'];
      return ['Guardado en este navegador y en la carpeta compartida', ''];
    }
    const c = window.QCloud.info();
    if (c.pendientes > 0) return c.enLinea ? ['Cambios por subir a SharePoint…', 'saving'] : ['Sin conexión: se subirá al reconectar', 'saving'];
    return c.enLinea ? ['Guardado en SharePoint', ''] : ['Sin conexión: guardado en este equipo', 'saving'];
  }
  function showSyncState() {
    if (saveTimer || state.conflicto) return;
    const [t, cls] = textoGuardado();
    setSaveState(t, cls);
    pintarEditorCompartida();
  }

  async function resolverConflicto(cur) {
    if (state.conflicto) return;
    state.conflicto = true;
    setSaveState('Cambios sin guardar: otra persona modificó este proyecto', 'err');
    const mio = state.project;
    const quien = cur.modificadoPor && cur.modificadoPor !== (S.getUser() || {}).email ? cur.modificadoPor
      : enSP() ? 'Tú, desde otra ventana,' : 'Alguien, en otro equipo o en otra pestaña,';
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
    // Al salir de un presupuesto, su Excel de la carpeta de la oferta se pone al día de inmediato
    if (state.project && ofertaActiva()) QO().guardarPendientes();
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
    const meses = Array.from(new Set(all.map(mesIngreso).filter(Boolean))).sort().reverse();
    if (L.mes && !meses.includes(L.mes)) L.mes = '';
    app.innerHTML = `<div class="viz-container page">
      <div class="page-head">
        <div>
          <h2>Proyectos formulados</h2>
          <p>Abre un proyecto para seguir formulándolo o crea uno nuevo.</p>
          <p class="compartida-linea" id="compartida-linea" hidden></p>
        </div>
        ${all.length ? `<div class="actions">
          <button class="btn btn-primario" data-act="nuevo">${ICON.plus}Nuevo proyecto</button>
          <button class="btn" data-act="importar">${ICON.upload}Importar</button>
          <button class="btn" data-menu="list-more" aria-haspopup="menu" aria-expanded="false" aria-label="Más acciones">${ICON.more}Más${ICON.caret}</button>
        </div>` : ''}
      </div>
      <div id="compartida"></div>
      ${all.length ? `
        <div class="kpis" id="list-kpis"></div>
        <div class="viz-filterbar">
          <div class="viz-filtergrid">
            <div class="viz-field span-6"><label for="list-search">Buscar</label>
              <input type="search" id="list-search" class="${L.q ? 'is-set' : ''}" placeholder="${enSP() ? 'N° de oferta, título, cliente, carpeta o responsable' : 'Código, título, cliente, ubicación o responsable'}" value="${esc(L.q)}" autocomplete="off"></div>
            <div class="viz-field span-3"><label for="list-mes">Ingresados en</label>
              <select id="list-mes" class="${L.mes ? 'is-set' : ''}">
                <option value="">Todos los meses</option>
                ${meses.map((m) => `<option value="${m}" ${L.mes === m ? 'selected' : ''}>${esc(nombreMes(m))}</option>`).join('')}
              </select></div>
            <div class="viz-field span-3"><label for="list-resp">Responsable</label>
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
    pintarCompartida();
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
      .filter((p) => !L.mes || mesIngreso(p) === L.mes)
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
    if (L.mes) chips.push(['mes', 'Ingresados en', nombreMes(L.mes)]);
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
    const aqui = soloAqui(sorted);
    body.innerHTML = sorted.map((p) => {
      const r = rs.get(p.uid);
      const nAlert = r.warnings.filter((w) => w.level !== 'info').length;
      const nErr = r.warnings.filter((w) => w.level === 'error').length;
      return `<tr class="clickable" data-open="${p.uid}" tabindex="0" aria-label="Abrir ${esc(p.codigo)} ${esc(p.titulo || 'Sin título')}">
        <td class="nowrap code"><span class="code-badge">${esc(p.codigo || '—')}</span><span class="ver">v${esc(p.version)}</span></td>
        <td class="col-titulo" style="min-width:240px"><div class="proj-title">${esc(p.titulo || 'Sin título')}</div><div class="proj-sub">${esc([p.cliente, p.ubicacion].filter(Boolean).join(' · ') || '—')}</div>${carpetaCorta(p)}${aqui.has(p.uid) ? '<span class="chip warn solo-aqui" title="No está en la carpeta del equipo">Solo en este navegador</span>' : ''}</td>
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
        <div id="ed-compartida"></div>
        <div id="ed-oferta"></div>
      </div>
      <div class="barra-pestanas">
        <div class="viz-container barra-pestanas-interior">
          <nav class="pasos-bar" aria-label="Pasos para formular el proyecto" id="tabs"></nav>
          <div class="lectura" id="lectura"></div>
        </div>
      </div>
      <div class="viz-container page" id="tab-body"></div>`;
    renderTab();
    pintarEditorCompartida();
    pintarEditorOferta();
  }

  function metaCarpeta(p, sep) {
    if (!enSP()) {
      // Modo local: carpeta de la oferta donde queda el Excel, con el estado de la copia
      const v = ofertaActiva() ? QO().vinculo(p) : null;
      if (!v) return '';
      const i = QO().info(p);
      const dot = { guardado: 'ok', guardando: 'warn', pendiente: 'warn', error: 'bad' }[i.estado] || '';
      const tip = textoEstadoOferta(i);
      return `${sep}<button type="button" class="meta-carpeta" data-act="oferta-info" title="${esc(tip)}" aria-label="Carpeta de la oferta: ${esc(v.nombre)}. ${esc(tip)}">${ICON.folder}<span>${esc(v.nombre)}</span>${dot ? `<span class="dot ${dot}" aria-hidden="true"></span>` : ''}</button>`;
    }
    const u = window.QCloud.ubicacion(p.uid);
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
    if (tab === 'ficha') { updateCodigoHint(); pintarRequerimiento(); }
    if (tab === 'evaluacion' && !state.imprimir) { pintarPanelAF(); actualizarEstadoAF(state.project, false); pintarSesgo(); pintarHerramientas(); }
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
            ${campoRequerimiento(p)}
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
        <td class="tercio" data-label="Costo unitario"><div class="costo-ref">${rowInput(key, it, 'costoUnitario', `Costo unitario de ${code}`, 'w-md', true)}${botonPrecioRef(key, it, code)}</div></td>
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
            <div class="sens-sesgo no-print" id="sens-sesgo"></div>
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
      </section>

      <section class="section no-print" id="analisis-financiero">
        <div class="section-head"><h4 class="seccion-titulo">Análisis Financiero</h4><p>Después de adjudicar: estos costos como costos proyectados del proyecto en ejecución.</p></div>
        <div class="panel af-panel" id="af-panel"></div>
      </section>

      <section class="section no-print" id="otras-herramientas">
        <div class="section-head"><h4 class="seccion-titulo">Otras herramientas QUEMPIN</h4><p>La cotización en Sistema QUEMPIN, la venta, la Planilla de Ingreso y el Control de Documentos, sin copiar a mano.</p></div>
        <div class="panel herr-panel" id="herr-panel"><p class="af-linea">Revisando la carpeta del equipo…</p></div>
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
      else if (el.id === 'list-mes') L.mes = el.value;
      else return;
      el.classList.toggle('is-set', !!el.value);
      refreshList();
      return;
    }
    if (el.type === 'radio' && e.type === 'input') return; // los radios se procesan en 'change'
    if (el.id === 'f-req') {
      if (e.type === 'change') fijarRequerimiento(el.value);
      else { const dl = $('#dl-req'); if (dl) dl.innerHTML = opcionesRequerimiento(el.value); }
      return;
    }
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
          if (!(await exigirCarpeta())) break;
          // Con la biblioteca conectada: ¿de qué oferta? (ahí queda la copia en Excel)
          const sel = await elegirOfertaLocal({
            titulo: 'Nuevo presupuesto: ¿de qué oferta?',
            texto: 'Elige la carpeta de la oferta en la biblioteca. Busca por el número de la planilla de ingreso o por el nombre.'
          });
          if (!sel) break;
          const np = S.newProject();
          if (sel.carpeta) enOfertaLocal(np, sel, { datosOferta: true });
          S.upsert(np);
          if (sel.carpeta) guardarExcelOferta(np.uid, true);
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
        case 'importar': if (await exigirCarpeta()) $('#file-import').click(); break;
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
        case 'respaldar-meses': await respaldarPorMes(); break;
        case 'duplicar': {
          if (saveTimer) saveNow();
          if (!(await exigirCarpeta())) break;
          const src = S.get(id);
          if (enSP()) {
            const sel = await elegirCarpeta({
              titulo: 'Duplicar en otra oferta',
              texto: `Se crea una copia de <b>${esc(src.codigo)} v${esc(src.version)}</b> en la carpeta de la oferta que elijas.`,
              crear: true, planilla: true, actual: window.QCloud.carpetaDe(src.uid)
            });
            if (!sel) break;
            const c = S.cloneProject(src, { estado: 'Borrador', fecha: S.hoy() });
            delete c.vinculos; // otra oferta: el envío al Análisis Financiero era de la original
            enCarpeta(c, sel, { datosOferta: true });
            S.upsert(c);
            toast(`Proyecto duplicado en ${sel.carpeta.nombre}`);
            goProject(c, 'ficha');
            break;
          }
          const cfg = S.getConfig();
          const c = S.cloneProject(src, { codigo: S.nextCodigo(cfg.prefijo, new Date().getFullYear()), version: 1, titulo: (src.titulo || 'Proyecto') + ' (copia)', estado: 'Borrador', fecha: S.hoy() });
          delete c.vinculos; // otra oferta: el envío al Análisis Financiero era de la original
          const sel = await elegirOfertaLocal({
            titulo: 'Duplicar: ¿de qué oferta es la copia?',
            texto: `Se crea una copia de <b>${esc(src.codigo)} v${esc(src.version)}</b>. Elige la carpeta de la oferta de la copia.`
          });
          if (!sel) break;
          if (sel.carpeta) enOfertaLocal(c, sel, {});
          S.upsert(c);
          if (sel.carpeta) guardarExcelOferta(c.uid, true);
          toast(`Proyecto duplicado como ${c.codigo}`);
          goProject(c, 'ficha');
          break;
        }
        case 'version': {
          if (saveTimer) saveNow();
          if (!(await exigirCarpeta())) break;
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
        case 'enviar-af': await enviarAF(id); break;
        case 'af-estado': await actualizarEstadoAF(p, true); toast('Estado del envío actualizado'); break;
        case 'req-completar': await completarDesdePlanilla(); break;
        case 'precio-ref': await abrirPrecios(d.list, d.uid); break;
        case 'sens-sesgo': simularSesgo(); break;
        case 'herr-actualizar': if (await asegurarCarpeta()) { QH().olvidar(); await pintarHerramientas(); pintarSesgo(); } break;
        case 'herr-cotizacion': await prepararCotizacion(); break;
        case 'herr-venta': await enviarVenta(); break;
        case 'herr-planilla': await avisarPlanilla(); break;
        case 'herr-registro': await registrarEvaluacion(); break;
        case 'af-carpeta': {
          try { await QI().conectar(); } catch (e) { if (!e || e.name !== 'AbortError') toast((e && e.message) || 'No se pudo abrir la carpeta.', true); }
          await pintarCfgAF();
          break;
        }
        case 'af-olvidar': await QI().desconectar(); await pintarCfgAF(); break;
        case 'compartir': {
          const antes = S.all().length;
          try { await QC().activar(); } catch (e) {
            if (!e || e.name !== 'AbortError') toast((e && e.message) || 'No se pudo abrir la carpeta.', true);
            await pintarCompartida();
            break;
          }
          const i = QC().info();
          if (i.error) toast('No se pudo sincronizar con la carpeta compartida: ' + i.error, true);
          else {
            const llegaron = S.all().length - antes;
            toast(llegaron > 0 ? `Proyectos compartidos con el equipo · llegaron ${plural(llegaron, 'proyecto')} de la carpeta` : 'Proyectos compartidos con el equipo');
          }
          await pintarCompartida();
          pintarEditorCompartida();
          if ($('#cfg-af')) await pintarCfgAF();
          break;
        }
        case 'compartir-ya': await QC().sincronizar(); break;
        // Excel en la carpeta de la oferta (modo local)
        case 'oferta-info': await dialogoOferta(id || (p && p.uid)); break;
        case 'oferta-elegir': await elegirOfertaPara(id || (p && p.uid)); break;
        case 'oferta-usar': {
          const uid = id || (p && p.uid);
          const c = ((await QO().carpetas()) || []).find((x) => x.id === d.ruta);
          if (!c) { toast('Esa carpeta ya no está en la biblioteca: elige otra.', true); await elegirOfertaPara(uid); break; }
          const pl = await planillaPublicada().catch(() => null);
          const r = pl && c.numero ? pl.get(c.numero) || null : null;
          await vincularOferta(uid, { carpeta: c, req: r && coincidePlanilla(c.titulo, r.titulo) ? r : null });
          break;
        }
        case 'oferta-omitir': if (p) { ofertaOmitida.add(p.uid); pintarEditorOferta(); } break;
        case 'oferta-guardar': {
          const uid = id || (p && p.uid);
          if (p && p.uid === uid && saveTimer) saveNow();
          if (await asegurarBiblioteca()) await guardarExcelOferta(uid);
          break;
        }
        // Sin carpeta: el presupuesto se descarga para dejarlo en el buzón del equipo
        case 'entregar': {
          if (saveTimer) saveNow();
          const pj = S.get(id) || p;
          if (!pj) break;
          toast(`Descargado ${QC().descargar(pj)}: déjalo en ${BUZON_EQUIPO}`);
          pintarEditorCompartida();
          await pintarCompartida();
          break;
        }
        case 'entregar-pendientes': {
          const pend = QC().sinSubir(S.all());
          // De a uno y separados: el navegador pide una vez permitir varias descargas
          for (const x of pend) { QC().descargar(x); await new Promise((r) => setTimeout(r, 400)); }
          toast(`${plural(pend.length, 'presupuesto')} descargados: déjalos en ${BUZON_EQUIPO}`);
          refreshList();
          await pintarCompartida();
          break;
        }
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
          const map = { q: ['q', '#list-search'], estado: ['estado', '#list-estado'], resp: ['resp', '#list-resp'], mes: ['mes', '#list-mes'] };
          const [k, sel] = map[d.k];
          L[k] = '';
          const el = $(sel);
          if (el) { el.value = ''; el.classList.remove('is-set'); }
          refreshList();
          break;
        }
        case 'limpiar-filtros': {
          state.list.q = ''; state.list.estado = ''; state.list.resp = ''; state.list.mes = '';
          ['#list-search', '#list-estado', '#list-resp', '#list-mes'].forEach((s) => { const el = $(s); if (el) { el.value = ''; el.classList.remove('is-set'); } });
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

  // ---- Respaldo por mes de ingreso -------------------------------------------------
  /* En la carpeta que se elija deja «Respaldos Formulador/<año>/<año>-<mes> Proyectos ingresados -
     <Mes> <año>.json»: un archivo por mes con los proyectos ingresados ese mes (sin la papelera),
     que se vuelve a importar como cualquier respaldo. Cada vez reescribe los meses con lo que hay
     hoy. Si se elige la carpeta «Respaldos Formulador» misma, no se anida otra adentro. */
  const CARPETA_RESPALDOS = 'Respaldos Formulador';
  async function respaldarPorMes() {
    if (typeof window.showDirectoryPicker !== 'function') throw new Error('Para guardar en una carpeta usa Chrome o Edge de escritorio.');
    const grupos = new Map();
    S.all().forEach((p) => {
      const ym = mesIngreso(p);
      if (!grupos.has(ym)) grupos.set(ym, []);
      grupos.get(ym).push(p);
    });
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'quempin-respaldos', mode: 'readwrite' }); } catch (e) {
      if (e && e.name === 'AbortError') return;
      throw e;
    }
    const mismo = dir.name.normalize('NFC').toLowerCase() === CARPETA_RESPALDOS.toLowerCase();
    const raiz = mismo ? dir : await dir.getDirectoryHandle(CARPETA_RESPALDOS, { create: true });
    const exportado = new Date().toISOString();
    const escritos = [];
    for (const [ym, ps] of Array.from(grupos).sort((a, b) => a[0].localeCompare(b[0]))) {
      const destino = ym ? await raiz.getDirectoryHandle(ym.slice(0, 4), { create: true }) : raiz;
      const nombre = ym ? `${ym} Proyectos ingresados - ${nombreMes(ym)}.json` : 'Proyectos sin fecha de ingreso.json';
      ps.sort((a, b) => String(a.creado || '').localeCompare(String(b.creado || '')));
      const datos = { schema: S.SCHEMA, tipo: 'respaldo', periodo: ym || null, criterio: 'mes de ingreso al Formulador', exportado, proyectos: ps };
      const w = await (await destino.getFileHandle(nombre, { create: true })).createWritable();
      await w.write(JSON.stringify(datos, null, 2) + '\n');
      await w.close();
      escritos.push(`${ym ? ym.slice(0, 4) + ' › ' : ''}${nombre} (${plural(ps.length, 'proyecto')})`);
    }
    await ask({
      title: 'Respaldo por mes listo',
      body: `<p>Quedó en «${esc(mismo ? dir.name : `${dir.name} › ${CARPETA_RESPALDOS}`)}»:</p>
        <ul>${escritos.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <p class="muted">Para restaurar un mes, usa <b>Importar</b> y elige su archivo.</p>`,
      buttons: [{ label: 'Cerrar', primary: true }]
    });
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
    const promesaCfg = ask({
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
        </div>
        <h3 class="sub-t">Carpeta compartida (OneDrive)</h3>
        <div id="cfg-af"></div>`,
      buttons: [puede ? { label: 'Restablecer valores de fábrica', value: 'reset', danger: true, left: true } : null, { label: 'Cancelar' }, { label: 'Guardar', value: 'save', primary: true }]
    });
    pintarCfgAF();
    const v = await promesaCfg;
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
    if (ev.type === 'oferta') { // el Excel de la carpeta de la oferta: pendiente, guardando, guardado o error
      if (state.project && ev.ids.includes(state.project.uid)) { updateHeader(); pintarEditorOferta(); }
      return;
    }
    if (ev.type === 'sync') { showSyncState(); if (nube.activa) pintarCuenta(window.QCloud.info()); else { pintarCompartida(); if (state.project) pintarEditorOferta(); } return; }
    if (ev.type === 'remote' && ev.conflicto) { alConflicto(ev); return; }
    if (ev.type === 'carpetas') { // una carpeta de oferta se movió o cambió de nombre en SharePoint
      if (!nube.lista) return;
      if (state.project) updateHeader();
      else if ($('#list-body')) refreshList();
      return;
    }
    // En modo local también llegan cambios: de la carpeta compartida o de otra pestaña.
    if ((nube.activa && !nube.lista) || (ev.type !== 'remote' && ev.type !== 'config')) return;
    const h = location.hash;
    if (state.project) {
      if (ev.type !== 'remote' || !ev.ids.includes(state.project.uid)) return;
      const cur = S.get(state.project.uid);
      if (cur === state.project || saveTimer || state.conflicto) return; // con cambios sin guardar: se resuelve al guardar
      const quien = ev.autores.length ? ev.autores.join(', ') : ev.origen === 'carpeta' ? 'otro equipo' : 'otra ventana';
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
    // En SharePoint y en la carpeta compartida el archivo nunca se borra desde la herramienta
    const puedePurgar = !enSP() && !compartiendo();
    document.title = 'Papelera — Formulación QUEMPIN';
    app.innerHTML = `<div class="viz-container page">
      <div class="page-head">
        <div>
          <a class="back" href="#/">← Proyectos</a>
          <h2>Papelera</h2>
          <p>Los proyectos eliminados quedan aquí y se pueden restaurar. ${puedePurgar ? 'Eliminarlos definitivamente no se puede deshacer.'
            : enSP() ? 'Sus archivos siguen en la carpeta de cada oferta en SharePoint; para borrarlos del todo, hazlo allí.'
            : 'Se comparten con el equipo: sus archivos siguen en la carpeta compartida (Formulación de proyectos › .Herramientas formulación › Intercambio).'}</p>
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
    // La copia no deja su propio Excel en la carpeta de la oferta hasta que alguien lo decida
    if (c.vinculos && c.vinculos.carpetaOferta) { c.vinculos = Object.assign({}, c.vinculos); delete c.vinculos.carpetaOferta; }
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
    const quien = ev.autores.length ? ev.autores.join(', ') : ev.origen === 'carpeta' ? 'Otro equipo' : 'Otra persona';
    toast(`${quien} modificó ${cur.codigo} v${cur.version} al mismo tiempo. Tus cambios quedaron en ${c.codigo} v${c.version}.`, true);
    if (!state.project && !location.hash.startsWith('#/guia')) route();
  }

  /* Selector de la carpeta de oferta. Devuelve { carpeta, req } (req: fila de la planilla), o null.
     En modo local se le pasan las carpetas de la biblioteca de OneDrive (opts.lista) y la planilla
     publicada (opts.leerPlanilla); con opts.sinCarpeta ofrece seguir sin carpeta ({ ninguna: true }). */
  async function elegirCarpeta(opts) {
    const lista = (opts.lista || window.QCloud.carpetas()).slice();
    const orden = (g) => (g === 'En curso' ? 0 : g === 'Presentada' ? 1 : g === 'Adjudicada' ? 2 : 3);
    lista.sort((a, b) => orden(a.grupo) - orden(b.grupo) || String(b.grupo).localeCompare(String(a.grupo)) ||
      (parseInt(b.numero, 10) || 0) - (parseInt(a.numero, 10) || 0) || a.nombre.localeCompare(b.nombre, 'es'));
    let pl = null;
    const cargaPlanilla = (opts.leerPlanilla ? opts.leerPlanilla() : window.QCloud.planilla()).catch((err) => { console.warn('Planilla de ingreso no disponible:', err); return null; });
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
          <input class="input" id="cp-buscar" type="search" placeholder="Número o nombre, p. ej. 298 o calderas" autocomplete="off" value="${esc(opts.buscar || '')}"></div>
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
        </details>` : ''}${opts.pie ? `<p class="hint cp-pie">${opts.pie}</p>` : ''}`,
      buttons: [opts.sinCarpeta ? { label: opts.sinCarpeta, value: 'ninguna', left: true } : null, { label: 'Cancelar' }].filter(Boolean)
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
    if (inp.value) filtrar();
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
    if (v === 'ninguna') return { ninguna: true };
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

  // ---------------------------------------------------------------------------
  //  ANÁLISIS FINANCIERO: enviar los costos del proyecto como costos proyectados,
  //  por la carpeta de intercambio de las herramientas de QUEMPIN (js/intercambio.js).
  //  No depende del modo SharePoint ni lo cambia.
  // ---------------------------------------------------------------------------
  const QI = () => window.QIntercambio;
  const vinculoAF = (p) => (p && p.vinculos && p.vinculos.analisisFinanciero) || null;
  const fechaHora = (iso) => {
    const d = new Date(iso);
    const z = (n) => String(n).padStart(2, '0');
    return isNaN(d) ? '' : `${z(d.getDate())}-${z(d.getMonth() + 1)}-${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
  };
  const ESTADO_ENVIO = {
    'en-buzon': { cls: 'warn', t: 'En espera', d: 'Se aplica en la próxima actualización del Análisis Financiero.' },
    pendiente: { cls: 'bad', t: 'Requiere decisión', d: 'Allá hay valores escritos a mano que no se veían al enviar: revísalos y vuelve a enviar, o que lo confirmen en el Análisis Financiero.' },
    aplicado: { cls: 'ok', t: 'Aplicado', d: '' },
    'sin-cambios': { cls: 'ok', t: 'Aplicado', d: 'El Análisis Financiero ya tenía esos valores.' },
    reemplazado: { cls: 'na', t: 'Reemplazado', d: 'Llegó un envío más reciente para el mismo proyecto.' },
    rechazado: { cls: 'bad', t: 'Rechazado', d: '' },
    descartado: { cls: 'na', t: 'Descartado', d: 'Se descartó en el Análisis Financiero: su planilla quedó como estaba.' }
  };
  const PATRON_TAG = /^[A-Z0-9]{2,10}$/;

  function costosCambiaron(p, r) {
    const u = (vinculoAF(p) || {}).ultimoEnvio;
    if (!u || !u.costos || !QI()) return false;
    const ahora = QI().costosAF(r.totals);
    return Object.keys(ahora).some((k) => ahora[k] !== u.costos[k]);
  }

  /* Paso Evaluación: a qué proyecto se enviaron los costos y en qué quedó el envío */
  function pintarPanelAF() {
    const el = $('#af-panel');
    if (!el || !state.project) return;
    const p = state.project;
    const v = vinculoAF(p);
    const u = v && v.ultimoEnvio;
    let texto;
    if (!u) {
      texto = '<p class="af-linea">Cuando la oferta se adjudique, envía sus costos: pasan a ser los costos proyectados del proyecto en ejecución, para comparar después con el gasto real del Centro de Costos.</p>';
    } else {
      const e = ESTADO_ENVIO[u.estado] || ESTADO_ENVIO['en-buzon'];
      const detalle = u.estado === 'aplicado' && u.aplicado ? `Aplicado el ${fechaHora(u.aplicado)}.` : (u.detalle || e.d);
      texto = `<p class="af-linea"><span class="code-badge">${esc(v.tag)}</span> ${v.nombre && v.nombre !== v.tag ? esc(v.nombre) : ''}</p>
        <p class="af-linea"><span class="chip ${e.cls}">${e.t}</span> Versión ${esc(u.version)} enviada el ${esc(fechaHora(u.fecha))}. ${esc(detalle)}</p>
        ${costosCambiaron(p, state.result) ? '<p class="af-linea af-aviso">Los costos cambiaron desde ese envío: vuelve a enviarlos para actualizar el Análisis Financiero.</p>' : ''}`;
    }
    el.innerHTML = `<div class="af-texto" id="af-estado">${texto}</div>
      <div class="actions">
        ${u ? '<button type="button" class="btn" data-act="af-estado">Actualizar estado</button>' : ''}
        <button type="button" class="btn ${p.estado === 'Adjudicada' ? 'btn-primario' : ''}" data-act="enviar-af">${ICON.enviar}${u ? 'Volver a enviar…' : 'Enviar costos…'}</button>
      </div>`;
  }

  /* Lee en la carpeta en qué quedó el último envío. Sin permiso vigente solo lo hace si
     viene de un clic (interactivo): el navegador pide el permiso una vez por sesión. */
  async function actualizarEstadoAF(p, interactivo) {
    const v = vinculoAF(p);
    const X = QI();
    if (!v || !v.ultimoEnvio || !X || !X.disponible()) return;
    const est = await X.estado();
    if (!est.conectada) return;
    if (est.permiso !== 'granted' && !(interactivo && await X.permitir())) return;
    const id = v.ultimoEnvio.id;
    const cat = await X.leerCatalogoAF();
    const r = cat && cat.mensajes ? cat.mensajes[id] : null;
    let nuevo;
    if (await X.enBuzon(id)) {
      nuevo = r && r.estado === 'pendiente'
        ? { estado: 'pendiente', detalle: (r.detalle || []).filter((x) => !/driver\.py/.test(x)).join(' ') }
        : { estado: 'en-buzon', detalle: '' };
    } else if (r) {
      nuevo = { estado: r.estado, detalle: r.estado === 'rechazado' ? (r.detalle || []).join(' ') : '', aplicado: r.fecha || '' };
    } else return;
    const u = v.ultimoEnvio;
    if (nuevo.estado !== u.estado || (nuevo.detalle || '') !== (u.detalle || '')) {
      Object.assign(u, nuevo);
      if (state.project === p) scheduleSave(); else S.upsert(p);
    }
    if (state.project === p) pintarPanelAF();
  }

  /* Proyecto del Análisis Financiero más parecido (título y cliente), si hay uno claro */
  function sugerirTag(p, proyectos) {
    const mias = new Set(palabras(`${p.titulo} ${p.cliente}`));
    if (!mias.size) return '';
    const puntajes = proyectos.map((q) => ({ tag: q.tag, n: palabras(`${q.nombre} ${q.cliente}`).filter((w) => mias.has(w)).length }))
      .sort((a, b) => b.n - a.n);
    return puntajes[0] && puntajes[0].n > 0 && (!puntajes[1] || puntajes[0].n > puntajes[1].n) ? puntajes[0].tag : '';
  }

  function tablaComparacionAF(q, costos, r) {
    const cats = QI().CATEGORIAS_AF.map((c) => c.k);
    const hoy = (q && q.proyectados) || {};
    const origen = (q && q.origen) || {};
    let pisa = [];
    const filas = cats.map((c) => {
      const a = hoy[c];
      const n = costos[c];
      const tiene = a !== null && a !== undefined && a !== '';
      const manual = tiene && !origen[c];
      const cambia = !tiene || Math.round(Number(a)) !== n;
      if (manual && cambia) pisa.push(c);
      const nota = !q ? '' : !tiene ? '<span class="af-origen">vacío</span>'
        : origen[c] ? `<span class="af-origen">del formulador: ${esc(String(origen[c].fuente || '').split(' · ')[0].replace(/^Formulación /, ''))}</span>` : '<span class="af-origen">escrito a mano</span>';
      return `<tr class="${cambia ? 'cambia' : ''} ${manual && cambia ? 'pisa' : ''}">
          <td>${esc(c)}</td>
          ${q ? `<td class="num hoy">${tiene ? clp(Number(a)) : '—'}${nota}</td>` : ''}
          <td class="num nuevo">${clp(n)}</td></tr>`;
    }).join('');
    const suma = (o) => cats.reduce((s, c) => s + (Number(o[c]) || 0), 0);
    const reales = q && q.reales ? suma(q.reales) : null;
    const t = r.totals;
    return `<div class="tabla-contenedor"><table class="tbl af-tabla">
        <thead><tr><th>Categoría</th>${q ? '<th class="num">Hoy en el Análisis Financiero</th>' : ''}<th class="num">Se enviará</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><td>Costo directo</td>${q ? `<td class="num">${clp(suma(hoy))}</td>` : ''}<td class="num">${clp(suma(costos))}</td></tr></tfoot>
      </table></div>
      ${pisa.length ? `<p class="af-linea af-aviso">Reemplazará valores escritos a mano en el Análisis Financiero: ${esc(pisa.join(', '))}.</p>` : ''}
      ${q && reales !== null ? `<p class="af-nota">Costo real a la fecha según Centro de Costos: ${clp(reales)}${ok(Number(q.avance)) ? ` · avance ${pct(Number(q.avance))}` : ''}.</p>` : ''}
      ${(t.gg || 0) + (t.imp || 0) > 0 ? `<p class="af-nota">Gastos generales (${clp(t.gg)}) e imprevistos (${clp(t.imp)}) no se envían: el Análisis Financiero compara costos directos.</p>` : ''}`;
  }

  /* Envía los costos del proyecto (abierto o elegido en la lista) al Análisis Financiero */
  async function enviarAF(id) {
    const p = (id && S.get(id)) || state.project;
    const X = QI();
    if (!p || !X) return;
    if (saveTimer && state.project === p) saveNow();
    const r = p === state.project ? state.result : computeProject(p);
    if (!(r.totals.cd > 0)) { toast('El proyecto todavía no tiene costos que enviar.', true); return; }
    if (!X.disponible()) { await enviarAFDescarga(p, r); return; }

    let est = await X.estado();
    if (!est.conectada) {
      const v = await ask({
        title: 'Conectar con el Análisis Financiero',
        body: `<p>El formulador y el Análisis Financiero se comunican por una carpeta de la biblioteca <b>Formulación de proyectos - Documentos</b> (sincronizada en tu OneDrive).
          Elige la biblioteca una vez y este navegador la recordará.</p>
          <p class="small muted">El navegador pedirá permiso para ver y guardar archivos en esa carpeta. Solo se usan los archivos del intercambio; nada sale de tu equipo ni de OneDrive.</p>`,
        buttons: [{ label: 'Cancelar' }, { label: 'Elegir la carpeta', value: 'elegir', primary: true }]
      });
      if (v !== 'elegir') return;
      try { est = await X.conectar(); } catch (e) {
        if (!e || e.name !== 'AbortError') toast((e && e.message) || 'No se pudo abrir la carpeta.', true);
        return;
      }
    } else if (est.permiso !== 'granted' && !(await X.permitir())) {
      toast('Sin permiso para usar la carpeta de intercambio.', true);
      return;
    }

    const cat = await X.leerCatalogoAF();
    const proyectos = ((cat && cat.proyectos) || []).slice().sort((a, b) => String(a.tag).localeCompare(String(b.tag)));
    const v0 = vinculoAF(p);
    const sugerido = v0 ? v0.tag : sugerirTag(p, proyectos);
    const costos = X.costosAF(r.totals);
    const opciones = proyectos.map((q) => `<option value="${esc(q.tag)}" ${q.tag === sugerido ? 'selected' : ''}>${esc(q.tag)} · ${esc(q.nombre || '')}${q.cliente && q.cliente !== q.nombre ? ` (${esc(q.cliente)})` : ''}</option>`).join('');
    const enLista = proyectos.some((q) => q.tag === sugerido);
    const promesa = ask({
      title: 'Enviar costos al Análisis Financiero',
      wide: true,
      body: `<p>Los costos de <b>${esc(p.codigo || 'este proyecto')} v${esc(p.version)}</b> pasan a ser los <b>costos proyectados</b> del proyecto que elijas.
          Se aplican en la próxima actualización del Análisis Financiero, con respaldo, y nunca reemplazan un valor escrito a mano que no se vea acá.</p>
        ${cat ? '' : '<p class="af-linea af-aviso">La carpeta todavía no tiene la lista de proyectos del Análisis Financiero (se publica en su próxima actualización). Puedes enviar escribiendo el TAG.</p>'}
        <div class="fila-campos">
          <div class="campo ancho"><label for="af-tag">Proyecto en el Análisis Financiero</label>
            <select class="input" id="af-tag">
              <option value="">Elige un proyecto…</option>${opciones}
              <option value="__otro__" ${sugerido && !enLista ? 'selected' : ''}>Otro: escribir el TAG (proyecto nuevo o que aún no aparece)</option>
            </select>
            ${cat && cat.generado ? `<span class="hint">Lista del ${esc(fechaHora(cat.generado))}.</span>` : ''}</div>
        </div>
        <div class="fila-campos" id="af-otro" hidden>
          <div class="campo"><label for="af-otro-tag">TAG</label><input class="input" id="af-otro-tag" maxlength="10" autocomplete="off" placeholder="Ej.: OBRA" value="${sugerido && !enLista ? esc(sugerido) : ''}">
            <span class="hint">El prefijo del N° de referencia en Centro de Costos.</span></div>
          <div class="campo"><label for="af-otro-nombre">Nombre, si es un proyecto nuevo</label><input class="input" id="af-otro-nombre" value="${esc(p.titulo || '')}">
            <span class="hint">Si el TAG no existe, el Análisis Financiero crea el proyecto con este nombre.</span></div>
        </div>
        <div id="af-comparacion"></div>`,
      buttons: [{ label: 'Cancelar' }, { label: 'Enviar al Análisis Financiero', value: 'enviar', primary: true }]
    });

    const sel = $('#af-tag'), otroTag = $('#af-otro-tag'), otroNombre = $('#af-otro-nombre');
    const boton = $('#modal .modal-foot .btn-primario');
    const elegido = () => {
      if (sel.value !== '__otro__') return sel.value ? { tag: sel.value, q: proyectos.find((q) => q.tag === sel.value) } : null;
      const tag = otroTag.value.trim().toUpperCase();
      if (!PATRON_TAG.test(tag)) return null;
      const q = proyectos.find((x) => x.tag === tag);
      if (!q && !otroNombre.value.trim()) return null;
      return { tag, q, nuevo: !q };
    };
    const pintar = () => {
      $('#af-otro').hidden = sel.value !== '__otro__';
      const d = elegido();
      boton.disabled = !d;
      $('#af-comparacion').innerHTML = d ? tablaComparacionAF(d.q, costos, r)
        + (d.nuevo ? `<p class="af-nota">${esc(d.tag)} no está en la lista del Análisis Financiero: si allá no existe, se crea «${esc(otroNombre.value.trim())}».</p>` : '')
        : '<p class="af-nota">Elige el proyecto para ver qué cambiará.</p>';
    };
    sel.addEventListener('change', pintar);
    otroTag.addEventListener('input', pintar);
    otroNombre.addEventListener('input', pintar);
    pintar();
    if (await promesa !== 'enviar') return;

    const d = elegido();
    if (!d) return;
    const destino = d.nuevo ? { tag: d.tag, nombre: otroNombre.value.trim(), crear: true } : { tag: d.tag };
    const visto = d.q ? d.q.proyectados : null;
    const u = S.getUser();
    const m = X.mensajePresupuesto(p, r.totals, destino, visto, (u && u.email) || p.responsable || S.getConfig().responsable || '');
    try { await X.enviar(m); } catch (e) {
      toast('No se pudo dejar el envío en la carpeta: ' + ((e && e.message) || e), true);
      return;
    }
    registrarEnvioAF(p, d.tag, d.q ? d.q.nombre : destino.nombre, m);
    toast(`Enviado al Análisis Financiero (${d.tag}): se aplica en su próxima actualización`);
  }

  function registrarEnvioAF(p, tag, nombre, m) {
    p.vinculos = Object.assign({}, p.vinculos, {
      analisisFinanciero: {
        tag, nombre: nombre || '',
        ultimoEnvio: { id: m.id, fecha: m.origen.enviado, version: p.version, costos: m.costos, estado: 'en-buzon' }
      }
    });
    if (state.project === p) { scheduleSave(); pintarPanelAF(); } else S.upsert(p);
  }

  /* Navegadores sin acceso a carpetas (Firefox, Safari, celulares): descargar el envío para
     dejarlo a mano en «.Herramientas formulación › Intercambio › buzon». */
  async function enviarAFDescarga(p, r) {
    const X = QI();
    const v0 = vinculoAF(p);
    const v = await ask({
      title: 'Enviar costos al Análisis Financiero',
      body: `<p>Este navegador no puede abrir carpetas: se descarga el envío y lo dejas en <b>Formulación de proyectos › .Herramientas formulación › Intercambio › buzon</b>. Con Chrome o Edge de escritorio se hace solo.</p>
        <div class="fila-campos">
          <div class="campo"><label for="afd-tag">TAG del proyecto</label><input class="input" id="afd-tag" maxlength="10" autocomplete="off" value="${esc(v0 ? v0.tag : '')}"><span class="hint">El prefijo del N° de referencia en Centro de Costos.</span></div>
          <div class="campo"><label for="afd-nombre">Nombre, si es un proyecto nuevo</label><input class="input" id="afd-nombre" value="${esc(p.titulo || '')}"></div>
        </div>
        <label class="check-l"><input type="checkbox" id="afd-crear"> Es un proyecto nuevo: crearlo si el TAG no existe</label>
        ${tablaComparacionAF(null, X.costosAF(r.totals), r)}`,
      buttons: [{ label: 'Cancelar' }, { label: 'Descargar el envío', value: 'bajar', primary: true }]
    });
    if (v !== 'bajar') return;
    const tag = $('#afd-tag').value.trim().toUpperCase();
    if (!PATRON_TAG.test(tag)) { toast('El TAG debe tener 2 a 10 letras o números.', true); return; }
    const crear = $('#afd-crear').checked;
    const nombre = $('#afd-nombre').value.trim();
    const u = S.getUser();
    const m = X.mensajePresupuesto(p, r.totals, crear ? { tag, nombre, crear: true } : { tag }, null, (u && u.email) || p.responsable || '');
    X.descargar(m);
    registrarEnvioAF(p, tag, crear ? nombre : '', m);
    toast('Envío descargado: déjalo en Formulación de proyectos › .Herramientas formulación › Intercambio › buzon');
  }

  /* Configuración: carpeta de intercambio conectada en este navegador */
  async function pintarCfgAF() {
    const el = $('#cfg-af');
    const X = QI();
    if (!el || !X) return;
    if (!X.disponible()) {
      el.innerHTML = `<p class="af-linea">${nube.activa
        ? 'Este navegador no puede abrir carpetas: los envíos se descargan para dejarlos a mano en la carpeta de intercambio.'
        : `Este navegador no puede abrir carpetas (usa Chrome o Edge de escritorio). Cada presupuesto se descarga para dejarlo en <b>${esc(BUZON_EQUIPO)}</b>; los envíos al Análisis Financiero, también.`}</p>`;
      return;
    }
    const est = await X.estado();
    // En modo local la carpeta es obligatoria: no se ofrece «Olvidar» (solo cambiarla).
    el.innerHTML = `<p class="af-linea">${est.conectada ? `Carpeta conectada en este navegador: <b>${esc(est.nombre)}</b>.` : est.movida ? 'La carpeta que estaba conectada cambió de lugar.' : 'Sin conectar.'}
        ${nube.activa ? 'Se usa para enviar costos al Análisis Financiero.' : 'Todos los presupuestos se guardan ahí para el equipo («.Herramientas formulación › Intercambio › publicado › formulador»), y desde ahí se envían costos al Análisis Financiero. Elige la biblioteca <b>Formulación de proyectos - Documentos</b> sincronizada en tu OneDrive.'}</p>
      ${!nube.activa && est.conectada ? `<p class="af-linea">${est.biblioteca
        ? 'El Excel de cada presupuesto se guarda además en la carpeta de su oferta, que se elige una vez por presupuesto.'
        : 'Para guardar también el Excel de cada presupuesto en la carpeta de su oferta, conecta la biblioteca <b>Formulación de proyectos - Documentos</b> completa (ahora está conectada solo una carpeta de adentro).'}</p>` : ''}
      <div class="actions"><button type="button" class="btn btn-sm" data-act="af-carpeta">${ICON.folder}${est.conectada ? 'Cambiar carpeta' : 'Conectar carpeta'}</button>
      ${est.conectada && nube.activa ? '<button type="button" class="btn btn-sm" data-act="af-olvidar">Olvidar</button>' : ''}</div>
      <p class="af-nota" id="cfg-pulso"></p>`;
    if (est.conectada && est.permiso === 'granted' && QH()) {
      const l = QH().lecturaEstado(await QH().publicacion('estado', true));
      const pulso = $('#cfg-pulso');
      if (pulso && l) pulso.innerHTML = `<span class="dot ${l.nivel}" aria-hidden="true"></span> ${esc(l.texto)}`;
    }
  }

  // ---------------------------------------------------------------------------
  //  OTRAS HERRAMIENTAS QUEMPIN (plan de integración, 2026-10-01): N° de requerimiento de la
  //  Planilla de Ingreso, precios de referencia del Cotizador Histórico, sesgo real del
  //  presupuesto, cotización en Sistema QUEMPIN, venta, sugerencias a la Planilla y registro en
  //  el Control de Documentos. La lógica (mensajes, lecturas, búsqueda) vive en js/herramientas.js.
  // ---------------------------------------------------------------------------
  const QH = () => window.QHerramientas;
  const usuarioActual = (p) => { const u = S.getUser(); return (u && u.email) || (p && p.responsable) || S.getConfig().responsable || ''; };
  const CLAVE_INICIALES = 'qpn.formulacion.iniciales';
  const leerIniciales = () => { try { return localStorage.getItem(CLAVE_INICIALES) || ''; } catch (e) { return ''; } };
  const guardarIniciales = (v) => { try { localStorage.setItem(CLAVE_INICIALES, v); } catch (e) { /* solo esta vez */ } };

  /* ¿Se puede leer la carpeta sin pedir nada? (los pintores no pueden abrir diálogos) */
  async function carpetaLista() {
    const X = QI();
    if (!X || !QH() || !X.disponible()) return false;
    const est = await X.estado();
    return est.conectada && est.permiso === 'granted';
  }
  /* Desde un clic: conecta la carpeta o pide el permiso de la sesión. true = lista. */
  async function asegurarCarpeta() {
    const X = QI();
    if (!X || !QH()) return false;
    if (!X.disponible()) { toast('Este navegador no puede abrir la carpeta del equipo: usa Chrome o Edge de escritorio.', true); return false; }
    const est = await X.estado();
    if (est.conectada) {
      if (est.permiso === 'granted' || await X.permitir()) return true;
      toast('Sin permiso para usar la carpeta de intercambio.', true);
      return false;
    }
    const v = await ask({
      title: 'Conectar la carpeta del equipo',
      body: `<p>Las herramientas de QUEMPIN se comunican por una carpeta de la biblioteca <b>Formulación de proyectos - Documentos</b> (sincronizada en tu OneDrive). Elige la biblioteca una vez y este navegador la recordará.</p>`,
      buttons: [{ label: 'Cancelar' }, { label: 'Elegir la carpeta', value: 'elegir', primary: true }]
    });
    if (v !== 'elegir') return false;
    try { await X.conectar(); QH().olvidar(); return true; } catch (e) {
      if (!e || e.name !== 'AbortError') toast((e && e.message) || 'No se pudo abrir la carpeta.', true);
      return false;
    }
  }

  // ---- N° de requerimiento (paso 1) ------------------------------------------------
  const REQ_RECIENTES = 20;
  let reqLista = [];   // la planilla completa, del N° más alto (el último ingresado) al más bajo
  const enLaPlanilla = (datos) => (datos && datos.origen === 'planilla' ? 'la planilla de ingreso' : 'la planilla de ingreso publicada');
  /* Opciones del N°: los 20 últimos ingresados (el N° es correlativo), del más nuevo al más antiguo.
     Con texto escrito se suman, detrás, los anteriores que empiezan con ese N° o lo tienen en el
     título (hasta 20 más); el navegador muestra de todas las que calzan con lo escrito. */
  function opcionesRequerimiento(texto) {
    const q = norm(String(texto || '').trim());
    const anteriores = q ? reqLista.slice(REQ_RECIENTES).filter((r) => String(r.numero).startsWith(q) || norm(r.titulo).includes(q)) : [];
    return reqLista.slice(0, REQ_RECIENTES).concat(anteriores.slice(0, REQ_RECIENTES))
      .map((r) => `<option value="${r.numero}">${esc(r.titulo || '')}${r.estado ? ` (${esc(r.estado)})` : ''}</option>`).join('');
  }
  function campoRequerimiento(p) {
    const v = (p.vinculos && p.vinculos.requerimiento) || null;
    const enCodigo = enSP() && QH() && !v ? QH().reqDe(p) : null;
    const planillaWeb = (window.QPN_M365 || {}).planillaWeb;
    return `<div class="campo ancho"><label for="f-req">N° de requerimiento <span class="opc">(Planilla de Ingreso)</span></label>
        <div class="req-fila"><input class="input" id="f-req" list="dl-req" inputmode="numeric" autocomplete="off" value="${esc(v && v.numero ? v.numero : '')}" placeholder="${enCodigo ? `${esc(enCodigo)} (el código)` : 'Ej.: 280'}">
          <button type="button" class="btn btn-sm" data-act="req-completar" data-tip="<b>Completar desde la planilla</b>Trae el título, la ubicación y el presupuesto del requerimiento a los campos que estén vacíos.">Completar desde la planilla</button>
          ${planillaWeb ? `<a class="link-btn req-abrir" href="${esc(planillaWeb)}" target="_blank" rel="noopener" data-tip="<b>Abrir la planilla de ingreso</b>Se abre en Excel para la web, en otra pestaña, para buscar o verificar el N°.">${ICON.open}Abrir la planilla</a>` : ''}</div>
        <datalist id="dl-req"></datalist>
        <span class="hint" id="req-hint">El N° con que se registró el requerimiento: une este presupuesto con su cotización, el Análisis Financiero y el Flujo de Caja. La lista muestra los ${REQ_RECIENTES} últimos ingresados; para uno anterior, escribe su N° o parte del título.</span></div>`;
  }
  async function pintarRequerimiento() {
    const dl = $('#dl-req'), hint = $('#req-hint');
    const p = state.project;
    if (!dl || !p || !(await carpetaLista())) return;
    const datos = await QH().requerimientos();
    if (state.project !== p || !$('#dl-req')) return;
    reqLista = ((datos && datos.requerimientos) || []).slice().sort((a, b) => b.numero - a.numero);
    const input = $('#f-req');
    dl.innerHTML = opcionesRequerimiento(input ? input.value : '');
    const req = QH().reqDe(p);
    const r = req && reqLista.find((x) => String(x.numero) === req);
    if (hint && r) {
      hint.textContent = `${r.titulo || 'Sin título'} · ${r.estado || 'sin estado'}${ok(r.presupuesto) ? ` · presupuesto ${clp(r.presupuesto)} con IVA` : ''}${r.cierre ? ` · cierre ${fechaCorta(String(r.cierre).slice(0, 10))}` : ''}`;
    } else if (hint && req && reqLista.length) {
      hint.textContent = `El N° ${req} no está en ${enLaPlanilla(datos)}.`;
    }
  }
  function fijarRequerimiento(valor) {
    const p = state.project;
    const n = String(valor || '').trim().replace(/\D/g, '');
    const vinculos = Object.assign({}, p.vinculos);
    if (!n) delete vinculos.requerimiento;
    else vinculos.requerimiento = { numero: n };
    p.vinculos = vinculos;
    scheduleSave();
    pintarRequerimiento();
  }
  async function completarDesdePlanilla() {
    const p = state.project;
    const req = QH() && QH().reqDe(p);
    if (!req) { toast('Primero escribe el N° de requerimiento.', true); return; }
    if (!(await asegurarCarpeta())) return;
    const datos = await QH().requerimientos(true);
    const r = ((datos && datos.requerimientos) || []).find((x) => String(x.numero) === req);
    if (!r) { toast(`El N° ${req} no está en ${enLaPlanilla(datos)}.`, true); return; }
    const hechos = [];
    if (!String(p.titulo || '').trim() && r.titulo) { p.titulo = r.titulo; hechos.push('título'); }
    if (!String(p.ubicacion || '').trim() && r.ubicacion) { p.ubicacion = r.ubicacion; hechos.push('ubicación'); }
    if (!(num(p.parametros.presupuestoMaximo) > 0) && ok(r.presupuesto) && r.presupuesto > 0) {
      p.parametros.presupuestoMaximo = r.presupuesto;
      p.parametros.presupuestoIncluyeIva = true;
      hechos.push('presupuesto (con IVA)');
    }
    p.vinculos = Object.assign({}, p.vinculos, { requerimiento: { numero: req, titulo: r.titulo || '' } });
    recalc();
    renderTab('#f-req');
    updateHeader();
    scheduleSave();
    toast(hechos.length ? `Desde la planilla: ${hechos.join(', ')}.` : 'Los campos ya tenían datos: no se cambió nada.');
  }

  // ---- Precios de referencia (paso 3) -------------------------------------------------
  function botonPrecioRef(key, it, code) {
    if (key !== 'materiales' && key !== 'equipos') return '';
    const ref = it.precioRef && num(it.costoUnitario) === ref_valor(it) ? it.precioRef : null;
    return `<button type="button" class="icon-btn precio-ref ${ref ? 'usado' : ''}" data-act="precio-ref" data-list="${key}" data-uid="${it.uid}" aria-label="Precios de compra de referencia de ${esc(code)}"
      data-tip="${ref ? `<b>Precio de referencia</b>${esc(ref.tipo === 'ultimo' ? 'Última compra' : 'Promedio')} de «${esc(ref.nombre)}», reajustado por UF.` : '<b>Precios de compra de referencia</b>Lo que QUEMPIN pagó por productos parecidos, reajustado por UF (Cotizador Histórico).'}">$</button>`;
  }
  const ref_valor = (it) => (it.precioRef ? num(it.precioRef.valor) : NaN);

  async function abrirPrecios(list, uid) {
    const it = findItem(list, uid);
    if (!it || !(await asegurarCarpeta())) return;
    const datos = await QH().preciosReferencia(true);
    if (!datos || !Array.isArray(datos.hojas)) {
      toast('La carpeta todavía no tiene los precios del Cotizador Histórico: se publican en su próxima actualización.', true);
      return;
    }
    let resultados = [];
    const fila = (h, i) => `<tr>
        <td><b>${esc(h.nombre)}</b><div class="small muted">${esc([h.categoria, h.material, h.medida].filter(Boolean).join(' · '))}</div></td>
        <td class="num">${h.n}</td>
        <td class="num">${clp(h.precio.promedio)}<div class="small muted">${clp(h.precio.minimo)} a ${clp(h.precio.maximo)}</div></td>
        <td class="num">${clp(h.precio.ultimo)}<div class="small muted">${esc(fechaCorta(h.ultimaCompra))}</div></td>
        <td class="pr-usar"><button class="btn btn-sm" value="p:${i}">Usar promedio</button><button class="btn btn-sm" value="u:${i}">Usar última</button></td></tr>`;
    const promesa = ask({
      title: 'Precios de compra de referencia',
      wide: true,
      body: `<p>Lo que QUEMPIN pagó en compras reales (Centro de Costos), <b>sin IVA</b> y reajustado por UF al ${esc(fechaCorta(String(datos.uf.fecha).slice(0, 10)))}. Cada fila es un mismo producto, material y medida.</p>
        <div class="fila-campos"><div class="campo ancho"><label for="pr-q">Buscar</label><input class="input" id="pr-q" autocomplete="off" value="${esc(it.descripcion || '')}" placeholder="Ej.: válvula de bola bronce 2&quot;"></div></div>
        <div id="pr-res"></div>`,
      buttons: [{ label: 'Cerrar' }]
    });
    const q = $('#pr-q'), caja = $('#pr-res');
    let t = null;
    const pintar = async () => {
      const r = await QH().buscarPrecios(q.value, 8);
      resultados = r.resultados;
      caja.innerHTML = resultados.length
        ? `<div class="tabla-contenedor"><table class="tbl pr-tabla"><thead><tr><th>Producto</th><th class="num">Compras</th><th class="num">Promedio<span class="th-sub">rango</span></th><th class="num">Última<span class="th-sub">fecha</span></th><th><span class="visualmente-oculto">Usar</span></th></tr></thead>
            <tbody>${resultados.map(fila).join('')}</tbody></table></div>`
        : `<p class="af-nota">${q.value.trim() ? 'No hay compras parecidas. Prueba con otra palabra o con la medida («codo cobre 3/4»).' : 'Escribe qué buscas.'}</p>`;
    };
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(pintar, 180); });
    await pintar();
    const v = await promesa;
    if (!v || !/^[pu]:\d+$/.test(v)) return;
    const [tipo, i] = v.split(':');
    const h = resultados[+i];
    if (!h) return;
    const valor = tipo === 'p' ? h.precio.promedio : h.precio.ultimo;
    it.costoUnitario = valor;
    it.precioRef = { clave: h.clave, nombre: h.nombre, tipo: tipo === 'p' ? 'promedio' : 'ultimo', valor, compras: h.n, uf: datos.uf.fecha };
    recalc();
    renderTab(`[data-list="${list}"][data-uid="${uid}"][data-k="costoUnitario"]`);
    flashRow(uid);
    scheduleSave();
    toast(`Costo unitario ${clp(valor)}: ${tipo === 'p' ? 'promedio' : 'última compra'} de «${h.nombre}»`);
  }

  // ---- Sesgo real del presupuesto (paso 5) ----------------------------------------------
  const SENS_ETIQ = [['mat', 'materiales'], ['eq', 'equipos'], ['mo', 'mano de obra'], ['otros', 'otros']];
  let sesgoVigente = null;
  async function pintarSesgo() {
    const el = $('#sens-sesgo');
    const p = state.project;
    if (!el || !p) return;
    sesgoVigente = null;
    if (!(await carpetaLista())) { el.innerHTML = ''; return; }
    const cat = await QH().publicacion('analisis-financiero');
    const sens = QH().sensibilidadDesdeSesgo(cat && cat.sesgo);
    if (!sens) { el.innerHTML = ''; return; }
    sesgoVigente = { sens, n: cat.sesgo.proyectosTerminados, calculado: cat.sesgo.calculado || cat.generado || '' };
    const s = p.parametros.sensibilidad;
    const igual = SENS_ETIQ.every(([k]) => num(s[k]) === sens[k]);
    const txt = SENS_ETIQ.map(([k, l]) => `${l} ${sens[k] > 0 ? '+' : ''}${nf(sens[k])} %`).join(' · ');
    el.innerHTML = `<p class="sens-nota">En ${plural(sesgoVigente.n, 'proyecto terminado', 'proyectos terminados')} del Análisis Financiero, el gasto real se desvió del presupuesto: ${esc(txt)}.</p>
      ${igual ? '<p class="sens-nota"><span class="chip ok">✓ Simulando el sesgo real</span></p>' : '<button type="button" class="btn btn-sm" data-act="sens-sesgo">Simular con el sesgo real</button>'}`;
  }
  function simularSesgo() {
    const p = state.project;
    if (!p || !sesgoVigente) return;
    Object.assign(p.parametros.sensibilidad, sesgoVigente.sens);
    p.parametros.sensibilidadOrigen = { fuente: 'analisis-financiero', proyectos: sesgoVigente.n, calculado: sesgoVigente.calculado };
    recalc();
    renderTab();
    scheduleSave();
    toast('Simulación con el sesgo real de la cartera terminada');
  }

  // ---- Panel «Otras herramientas QUEMPIN» (paso 5) -------------------------------------
  const ESTADO_SISTEMA = {
    pendiente: { cls: 'warn', t: 'En espera' }, aplicado: { cls: 'ok', t: 'Listo' }, 'sin-cambios': { cls: 'ok', t: 'Listo' },
    descartado: { cls: 'na', t: 'Descartado' }, rechazado: { cls: 'bad', t: 'Rechazado' }, reemplazado: { cls: 'na', t: 'Reemplazado' }
  };
  const bloque = (titulo, cuerpo, acciones) => `<div class="herr-bloque"><h5 class="panel-t">${titulo}</h5><div class="herr-cuerpo">${cuerpo}</div>${acciones ? `<div class="actions">${acciones}</div>` : ''}</div>`;
  const linea = (html) => `<p class="af-linea">${html}</p>`;
  const chipEstado = (e) => { const x = ESTADO_SISTEMA[e] || ESTADO_SISTEMA.pendiente; return `<span class="chip ${x.cls}">${x.t}</span>`; };

  function montoVenta(p, cots) {
    const c = cots.find((d) => d.moneda === 'CLP' && ok(d.neto) && d.neto > 0);
    if (c) return { monto: c.neto, desde: { herramienta: 'sistema-quempin', folio: c.folio, pais: c.pais, fecha: c.fecha }, texto: `de la cotización ${c.folio} del ${fechaCorta(c.fecha)}` };
    return { monto: cotizacion().neto, desde: { herramienta: 'formulador' }, texto: 'del precio neto del paso 4 (no hay una cotización emitida en pesos)' };
  }
  function valorConIva(p, cots) {
    const c = cots.find((d) => d.moneda === 'CLP' && ok(d.total) && d.total > 0);
    return c ? { valor: c.total, texto: `total con IVA de la cotización ${c.folio}` } : { valor: cotizacion().bruto, texto: 'total con IVA del paso 4' };
  }

  async function pintarHerramientas() {
    const el = $('#herr-panel');
    const p = state.project;
    if (!el || !p) return;
    if (!QI() || !QH() || !QI().disponible()) {
      el.innerHTML = linea('Este navegador no puede abrir la carpeta del equipo: usa Chrome o Edge de escritorio para enviar a las demás herramientas.');
      return;
    }
    if (!(await carpetaLista())) {
      el.innerHTML = linea('Conecta la carpeta del equipo (o da el permiso de esta sesión) para preparar la cotización en Sistema QUEMPIN, enviar la venta y registrar la evaluación.')
        + `<div class="actions"><button type="button" class="btn" data-act="herr-actualizar">${ICON.folder}Conectar o dar permiso</button></div>`;
      return;
    }
    const [docs, af, folios, reqs, estado] = await Promise.all(['documentos-comerciales', 'analisis-financiero', 'folios', 'requerimientos', 'estado']
      .map((n) => (n === 'requerimientos' ? QH().requerimientos() : QH().publicacion(n))));
    if (state.project !== p || !$('#herr-panel')) return;
    const v = p.vinculos || {};
    const cots = QH().cotizacionesDe(p, docs);
    const partes = [];

    // 1. Cotización en Sistema QUEMPIN
    const borr = (v.sistemaQuempin || {}).ultimoBorrador;
    const eb = borr ? QH().estadoEnSistema(docs, borr.id) : null;
    let tCot = linea('Prepara la cotización con los valores por partida del paso 4: llega a <b>Borradores del Formulador</b> en Sistema QUEMPIN, donde se revisa y se emite con su número.');
    if (borr) {
      const det = eb && eb.estado === 'aplicado' && eb.folio ? `Emitida como cotización <b>${esc(eb.folio)}</b>.`
        : eb && eb.estado === 'rechazado' ? esc((eb.detalle || []).join(' '))
          : eb && eb.estado === 'descartado' ? 'Se descartó en Sistema QUEMPIN.' : 'Espera en Sistema QUEMPIN a que alguien la revise y la emita.';
      tCot = linea(`${chipEstado(eb ? eb.estado : 'pendiente')} Versión ${esc(borr.version)} enviada el ${esc(fechaHora(borr.fecha))}. ${det}`);
    }
    if (cots.length) tCot += linea('Emitidas: ' + cots.slice(0, 4).map((c) => `<span class="code-badge">${esc(c.folio)}</span> ${esc(fechaCorta(c.fecha))} · neto ${c.moneda === 'CLP' ? clp(c.neto) : `${nf(c.neto)} ${esc(c.moneda)}`}`).join(' · '));
    partes.push(bloque('Cotización en Sistema QUEMPIN', tCot,
      `<button type="button" class="btn ${p.estado === 'En revisión' || p.estado === 'Enviada' ? 'btn-primario' : ''}" data-act="herr-cotizacion" ${state.result.partidas.length ? '' : 'disabled'}>${ICON.enviar}${borr ? 'Preparar de nuevo…' : 'Preparar cotización…'}</button>`));

    // 2. Venta al Análisis Financiero
    const vAF = vinculoAF(p);
    let tVenta, bVenta = '';
    if (p.estado !== 'Adjudicada') tVenta = linea('Cuando la oferta se adjudique, envía el monto de venta al Análisis Financiero: así el proyecto entra completo a sus indicadores.');
    else if (!vAF) tVenta = linea('Primero envía los costos al Análisis Financiero (arriba): ahí se elige a qué proyecto corresponde.');
    else {
      const mv = montoVenta(p, cots);
      const q = ((af && af.proyectos) || []).find((x) => x.tag === vAF.tag);
      const ven = q && q.venta;
      const ult = (v.ventaAF || {}).ultimoEnvio;
      const ev = ult && af && af.mensajes ? af.mensajes[ult.id] : null;
      tVenta = linea(`<span class="code-badge">${esc(vAF.tag)}</span> Se enviaría ${clp(mv.monto)} sin IVA, ${esc(mv.texto)}.`)
        + (ven ? linea(ven.cargada ? (ven.origen ? 'El Análisis Financiero ya tiene una venta enviada desde aquí.' : '<span class="af-aviso">El Análisis Financiero tiene un monto escrito a mano: el envío quedará esperando que lo confirmen allá.</span>') : 'El Análisis Financiero todavía no tiene el monto de venta.') : '')
        + (ult ? linea(`${chipEstado(ev ? ev.estado : 'pendiente')} Enviada el ${esc(fechaHora(ult.fecha))} (${clp(ult.monto)}).`) : '');
      bVenta = `<button type="button" class="btn ${ult ? '' : 'btn-primario'}" data-act="herr-venta">${ICON.enviar}${ult ? 'Volver a enviar la venta' : 'Enviar la venta'}</button>`;
    }
    partes.push(bloque('Venta al Análisis Financiero', tVenta, bVenta));

    // 3. Planilla de Ingreso
    const req = QH().reqDe(p);
    let tPla, bPla = '';
    if (!req) tPla = linea('Escribe el N° de requerimiento en <button type="button" class="link-btn" data-act="tab" data-tab="ficha">Datos del proyecto</button> para avisar a la Planilla de Ingreso cuando la oferta se envíe o se adjudique.');
    else {
      const r = ((reqs && reqs.requerimientos) || []).find((x) => String(x.numero) === req);
      const vi = valorConIva(p, cots);
      const cambios = QH().cambiosParaPlanilla(p, vi.valor);
      const enPlanilla = r ? `La planilla dice: ${esc(r.estado || 'sin estado')}${ok(r.valorOfertado) ? ` · ofertado ${clp(r.valorOfertado)}` : ''}${ok(r.valorAdjudicado) ? ` · adjudicado ${clp(r.valorAdjudicado)}` : ''}.` : `El N° ${esc(req)} no está en ${enLaPlanilla(reqs)}.`;
      const ult = (v.planilla || {}).ultimaSugerencia;
      const yaEsta = r && cambios && Object.keys(cambios).every((k) => (k === 'estado' ? String(r.estado || '').toLowerCase() === cambios.estado.toLowerCase() : Math.abs(num(r[k]) - cambios[k]) < 1));
      tPla = linea(`<span class="code-badge">N° ${esc(req)}</span> ${enPlanilla}`)
        + (!cambios ? linea('Cuando la oferta pase a <b>Enviada</b> o <b>Adjudicada</b>, avisa el estado y el valor a la planilla.')
          : yaEsta ? linea('<span class="chip ok">Al día</span> La planilla ya muestra el estado y el valor de esta oferta.')
            : linea(`Se sugeriría: <b>${esc(cambios.estado)}</b> con ${clp(cambios.valorOfertado || cambios.valorAdjudicado)} (${esc(vi.texto)}).`)
              + (ult ? linea(`${chipEstado('pendiente')} Aviso enviado el ${esc(fechaHora(ult.fecha))}: espera que alguien lo pase a la planilla.`) : ''));
      if (cambios && !yaEsta) bPla = `<button type="button" class="btn" data-act="herr-planilla">${ICON.enviar}Avisar a la Planilla de Ingreso</button>`;
    }
    partes.push(bloque('Planilla de Ingreso de Requerimientos', tPla, bPla));

    // 4. Control de Documentos (evaluación de costos, tipo 81)
    const reg = v.controlDocumentos;
    const er = reg ? QH().estadoEnSistema(docs, reg.id) : null;
    if (reg && er && er.estado === 'aplicado' && er.folio && er.folio !== reg.folio) {
      // Sistema QUEMPIN asignó otro número (el propuesto ya estaba usado): el proyecto y el
      // nombre del Excel exportado se quedan con el definitivo.
      reg.folioPropuesto = reg.folio;
      reg.nombreArchivo = String(reg.nombreArchivo || '').replace(reg.folio, er.folio);
      reg.folio = er.folio;
      scheduleSave();
    }
    const sig = QH().siguienteFolio(folios, '81', (reg && reg.pais) || 'Chile');
    let tReg = linea(`Registra esta evaluación de costos con su número en el Control de Documentos${sig && sig.siguiente ? ` (el siguiente es el <b>${esc(sig.siguiente)}</b>)` : ''}. El Excel exportado lleva ese número en el nombre.`);
    if (reg) {
      const folio = er && er.folio ? er.folio : reg.folio;
      tReg = linea(`${chipEstado(er ? er.estado : 'pendiente')} <span class="code-badge">${esc(folio)}</span> ${er && er.estado === 'aplicado'
        ? (er.reasignado ? `El ${esc(reg.folioPropuesto || reg.folio)} ya estaba usado: quedó como ${esc(folio)}.` : 'Registrada en el Control de Documentos.')
        : er && er.estado === 'rechazado' ? esc((er.detalle || []).join(' ')) : 'Se registra cuando Sistema QUEMPIN revise la carpeta.'}`);
    }
    partes.push(bloque('Control de Documentos', tReg,
      `<button type="button" class="btn" data-act="herr-registro">${ICON.enviar}${reg ? 'Registrar otra versión…' : 'Registrar evaluación…'}</button>`));

    const l = QH().lecturaEstado(estado);
    el.innerHTML = partes.join('') + (l ? `<p class="af-nota herr-pulso"><span class="dot ${l.nivel}" aria-hidden="true"></span> ${esc(l.texto)} <button type="button" class="link-btn" data-act="herr-actualizar">Actualizar</button></p>` : '');
  }

  // ---- Acciones del panel -----------------------------------------------------------------
  async function prepararCotizacion() {
    const p = state.project;
    if (!p || !(await asegurarCarpeta())) return;
    if (saveTimer) saveNow();
    const cot = cotizacion();
    if (!cot.lineas.length) { toast('El proyecto no tiene partidas.', true); return; }
    const contrapartes = await QH().publicacion('contrapartes', true);
    const clientes = ((contrapartes && contrapartes.clientes) || []).filter((c) => c.razon_social);
    const nErr = state.result.warnings.filter((w) => w.level === 'error').length;
    const promesa = ask({
      title: 'Preparar la cotización en Sistema QUEMPIN',
      wide: true,
      body: `<p>Llega a <b>Borradores del Formulador</b> en Sistema QUEMPIN. Ahí alguien la revisa, completa los términos y la emite con su número; este proyecto verá el número.</p>
        ${nErr ? `<p class="af-linea af-aviso">Hay ${plural(nErr, 'error')} en los costos: revísalos antes de cotizar.</p>` : ''}
        <div class="fila-campos">
          <div class="campo ancho"><label for="cq-cli">Cliente (razón social)</label><input class="input" id="cq-cli" list="dl-cli" autocomplete="off" value="${esc(p.cliente || '')}">
            <datalist id="dl-cli">${clientes.map((c) => `<option value="${esc(c.razon_social)}">${esc(c.rut || '')}</option>`).join('')}</datalist>
            <span class="hint">Si el cliente ya cotizó antes, Sistema QUEMPIN usa su ficha completa.</span></div>
          <div class="campo"><label for="cq-rut">RUT <span class="opc">(opcional)</span></label><input class="input" id="cq-rut" autocomplete="off"></div>
          <div class="campo"><label for="cq-pais">País</label><select class="input" id="cq-pais"><option value="Chile">Chile</option><option value="Peru">Perú</option></select></div>
          <div class="campo ancho"><label for="cq-ref">Referencia</label><input class="input" id="cq-ref" value="${esc(p.titulo || '')}"><span class="hint">Con ella Sistema QUEMPIN arma el nombre del PDF.</span></div>
          <div class="campo"><label for="cq-plazo">Plazo de entrega <span class="opc">(opcional)</span></label><input class="input" id="cq-plazo" placeholder="Ej.: 30 días"></div>
        </div>
        <div class="tabla-contenedor"><table class="tbl af-tabla"><thead><tr><th>Partida</th><th class="num">Cantidad</th><th class="num">Precio unitario neto</th><th class="num">Total neto</th></tr></thead>
          <tbody>${cot.lineas.map(({ pt, pu, total }) => `<tr><td>${esc(pt.code)} · ${esc(pt.descripcion || 'Sin descripción')}</td><td class="num">${nf(pt.cantidad)} ${esc(pt.unidad || '')}</td><td class="num">${pu === null ? '—' : clp(pu)}</td><td class="num">${clp(total)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3">Total neto (en pesos)</td><td class="num">${clp(cot.neto)}</td></tr></tfoot></table></div>`,
      buttons: [{ label: 'Cancelar' }, { label: 'Enviar a Sistema QUEMPIN', value: 'enviar', primary: true }]
    });
    const cli = $('#cq-cli'), rut = $('#cq-rut');
    const llenarRut = () => { const c = clientes.find((x) => x.razon_social === cli.value); if (c && c.rut && !rut.value) rut.value = c.rut; };
    cli.addEventListener('change', llenarRut);
    llenarRut();
    const datos = () => ({
      pais: $('#cq-pais').value, moneda: 'CLP', referencia: $('#cq-ref').value, plazoEntrega: $('#cq-plazo').value.trim(),
      cliente: { razon_social: cli.value, rut: rut.value }
    });
    const btn = $('#modal .modal-foot .btn-primario');
    const validar = () => { const d = datos(); btn.disabled = !d.cliente.razon_social.trim() || !d.referencia.trim(); };
    ['#cq-cli', '#cq-ref'].forEach((sel) => $(sel).addEventListener('input', validar));
    validar();
    if (await promesa !== 'enviar') return;
    const m = QH().mensajeBorrador(p, cot, datos(), usuarioActual(p));
    try { await QH().enviar(m); } catch (e) { toast('No se pudo enviar a Sistema QUEMPIN: ' + ((e && e.message) || e), true); return; }
    p.vinculos = Object.assign({}, p.vinculos, { sistemaQuempin: { ultimoBorrador: { id: m.id, fecha: m.origen.enviado, version: p.version, neto: cot.neto } } });
    scheduleSave();
    QH().olvidar();
    pintarHerramientas();
    toast('Cotización enviada a Sistema QUEMPIN: aparece en «Borradores del Formulador»');
  }

  async function enviarVenta() {
    const p = state.project;
    const vAF = vinculoAF(p);
    if (!p || !vAF || !(await asegurarCarpeta())) return;
    const [docs, af] = await Promise.all([QH().publicacion('documentos-comerciales', true), QH().publicacion('analisis-financiero', true)]);
    const mv = montoVenta(p, QH().cotizacionesDe(p, docs));
    if (!(mv.monto > 0)) { toast('No hay un monto de venta que enviar.', true); return; }
    const q = ((af && af.proyectos) || []).find((x) => x.tag === vAF.tag);
    const ven = q && q.venta;
    const manual = ven && ven.cargada && !ven.origen;
    const v = await ask({
      title: 'Enviar la venta al Análisis Financiero',
      body: `<p>Monto de venta <b>${clp(mv.monto)} sin IVA</b> para <span class="code-badge">${esc(vAF.tag)}</span>, ${esc(mv.texto)}.</p>
        ${manual ? '<p class="af-linea af-aviso">El Análisis Financiero ya tiene un monto escrito a mano: el envío quedará esperando que lo confirmen allá.</p>' : ''}
        <p class="af-nota">Se aplica en su próxima actualización, con respaldo. Nunca reemplaza un valor escrito a mano sin que lo confirmen.</p>`,
      buttons: [{ label: 'Cancelar' }, { label: 'Enviar', value: 'enviar', primary: true }]
    });
    if (v !== 'enviar') return;
    // If-Match: si allá está vacío, se autoriza solo sobre vacío; con un valor (de aquí o a mano),
    // decide el registro de procedencia del Análisis Financiero.
    const visto = ven && !ven.cargada ? null : undefined;
    const m = QH().mensajeVenta(p, mv.monto, mv.desde, vAF.tag, visto, usuarioActual(p));
    try { await QH().enviar(m); } catch (e) { toast('No se pudo dejar el envío: ' + ((e && e.message) || e), true); return; }
    p.vinculos = Object.assign({}, p.vinculos, { ventaAF: { ultimoEnvio: { id: m.id, fecha: m.origen.enviado, monto: m.venta.montoSinIva, folio: mv.desde.folio || '' } } });
    scheduleSave();
    QH().olvidar();
    pintarHerramientas();
    toast(`Venta enviada al Análisis Financiero (${vAF.tag})`);
  }

  async function avisarPlanilla() {
    const p = state.project;
    const req = QH() && QH().reqDe(p);
    if (!p || !req || !(await asegurarCarpeta())) return;
    const [docs, reqs] = await Promise.all([QH().publicacion('documentos-comerciales', true), QH().requerimientos(true)]);
    const vi = valorConIva(p, QH().cotizacionesDe(p, docs));
    const cambios = QH().cambiosParaPlanilla(p, vi.valor);
    if (!cambios) { toast('Solo se avisa cuando la oferta está Enviada o Adjudicada.', true); return; }
    const r = ((reqs && reqs.requerimientos) || []).find((x) => String(x.numero) === req);
    const reemplaza = {};
    Object.keys(cambios).forEach((k) => { reemplaza[k] = r ? (r[k] === undefined ? null : r[k]) : null; });
    const m = QH().mensajeSugerencia(p, req, cambios, reemplaza, usuarioActual(p));
    try { await QH().enviar(m); } catch (e) { toast('No se pudo dejar el aviso: ' + ((e && e.message) || e), true); return; }
    p.vinculos = Object.assign({}, p.vinculos, { planilla: { ultimaSugerencia: { id: m.id, fecha: m.origen.enviado, cambios } } });
    scheduleSave();
    QH().olvidar();
    pintarHerramientas();
    toast('Aviso enviado: quien lleva la planilla lo verá con /Sugerencias_Requerimientos');
  }

  const nombreSeguro = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 _.-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  async function registrarEvaluacion() {
    const p = state.project;
    if (!p || !(await asegurarCarpeta())) return;
    const folios = await QH().publicacion('folios', true);
    const sigDe = (pais) => (QH().siguienteFolio(folios, '81', pais) || {}).siguiente || '';
    const nombre = (folio) => `${folio}_${nombreSeguro(`${p.codigo || ''} v${p.version} ${p.titulo || ''}`)}`;
    const promesa = ask({
      title: 'Registrar la evaluación de costos',
      body: `<p>Queda en el Control de Documentos como <b>Evaluación de costos</b> (tipo 81). Si el número ya se usó cuando Sistema QUEMPIN lo registre, toma el siguiente y lo verás aquí.</p>
        <div class="fila-campos">
          <div class="campo"><label for="rg-pais">País</label><select class="input" id="rg-pais"><option value="Chile">Chile</option><option value="Peru">Perú</option></select></div>
          <div class="campo"><label for="rg-folio">N° de documento</label><input class="input" id="rg-folio" inputmode="numeric" value="${esc(sigDe('Chile'))}"><span class="hint" id="rg-hint">${folios ? 'El siguiente según el Control de Documentos.' : 'La carpeta todavía no tiene los números del Control de Documentos: escríbelo.'}</span></div>
          <div class="campo"><label for="rg-ini">Tus iniciales</label><input class="input" id="rg-ini" maxlength="4" value="${esc(leerIniciales())}"></div>
          <div class="campo ancho"><label for="rg-ref">Referencia o cliente</label><input class="input" id="rg-ref" value="${esc(p.cliente || p.titulo || '')}"></div>
        </div>
        <p class="af-nota" id="rg-nombre"></p>`,
      buttons: [{ label: 'Cancelar' }, { label: 'Registrar', value: 'registrar', primary: true }]
    });
    const folio = $('#rg-folio'), pais = $('#rg-pais'), ini = $('#rg-ini'), ref = $('#rg-ref'), btn = $('#modal .modal-foot .btn-primario');
    const capt = {};
    const pintar = () => {
      capt.folio = folio.value.trim(); capt.pais = pais.value; capt.autor = ini.value.trim().toUpperCase(); capt.referencia = ref.value.trim();
      $('#rg-nombre').textContent = /^81\d{4,}$/.test(capt.folio) ? `Nombre del archivo: ${nombre(capt.folio)}` : 'El número debe empezar con 81 (ej.: 812602).';
      btn.disabled = !/^81\d{4,}$/.test(capt.folio) || !capt.autor || !capt.referencia;
    };
    pais.addEventListener('change', () => { folio.value = sigDe(pais.value) || folio.value; pintar(); });
    [folio, ini, ref].forEach((x) => x.addEventListener('input', pintar));
    pintar();
    if (await promesa !== 'registrar') return;
    guardarIniciales(capt.autor);
    const hoyIso = X_hoy();
    const m = QH().mensajeRegistro(p, { folio: capt.folio, pais: capt.pais, fecha: hoyIso, autor: capt.autor, referencia: capt.referencia, nombreArchivo: nombre(capt.folio) }, usuarioActual(p));
    try { await QH().enviar(m); } catch (e) { toast('No se pudo dejar el registro: ' + ((e && e.message) || e), true); return; }
    p.vinculos = Object.assign({}, p.vinculos, { controlDocumentos: { id: m.id, folio: capt.folio, pais: capt.pais, fecha: m.origen.enviado, nombreArchivo: nombre(capt.folio) } });
    scheduleSave();
    QH().olvidar();
    pintarHerramientas();
    toast(`Registro ${capt.folio} enviado al Control de Documentos`);
  }
  const X_hoy = () => { const d = new Date(); const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

  // ---------------------------------------------------------------------------
  //  CARPETA COMPARTIDA: proyectos del equipo por OneDrive (modo local, js/compartida.js)
  // ---------------------------------------------------------------------------
  const QC = () => window.QCompartida;
  function compartiendo() { return !nube.activa && !!QC() && QC().activa(); }
  const BUZON_EQUIPO = 'Formulación de proyectos › .Herramientas formulación › Intercambio › buzon';
  const notaCompartida = (texto, botones) => `<div class="nota compartida-nota" role="region" aria-label="Carpeta del equipo">
      <span>${texto}</span><span class="actions">${botones}</span></div>`;
  const BTN_DESCARGAR = (id) => `<button type="button" class="btn btn-sm" data-act="${id ? 'entregar' : 'entregar-pendientes'}"${id ? ` data-id="${esc(id)}"` : ''}>${ICON.download}Descargar para el equipo</button>`;

  /* Por qué un presupuesto quedaría solo en este navegador, según la última sincronización (sin
     leer la carpeta): 'sin-api', 'sin-carpeta', 'sin-permiso', 'error'; '' si está al día; null
     mientras no se sabe. Compartir es obligatorio (pedido del usuario, 2026-09-30). */
  function problemaCompartida() {
    if (nube.activa || !QC() || !QI()) return '';
    if (!QI().disponible()) return 'sin-api';
    const i = QC().info();
    if (i.sinCarpeta) return 'sin-carpeta';
    if (i.sinPermiso) return 'sin-permiso';
    if (i.error) return 'error';
    return i.ultima ? '' : null;
  }
  let problemaPintado;   // para refrescar las marcas de la lista solo cuando cambia
  /* Proyectos que solo están en este navegador, mientras haya un problema con la carpeta. */
  function soloAqui(list) {
    return problemaCompartida() ? new Set(QC().sinSubir(list).map((p) => p.uid)) : new Set();
  }

  /* Lista de proyectos: aviso para conectar la carpeta del equipo, o una línea con su estado. */
  async function pintarCompartida() {
    if (nube.activa || !QC() || !QI()) return;
    const e = await QC().estado();
    const caja = $('#compartida'), linea = $('#compartida-linea');
    const pie = $('#footer-datos');
    if (pie) pie.textContent = compartiendo()
      ? 'Los presupuestos se guardan en este navegador y en la carpeta del equipo, en la biblioteca «Formulación de proyectos» de OneDrive.'
      : 'Los presupuestos se guardan en este navegador: descárgalos para el equipo o respáldalos con «Exportar Excel».';
    const prob = problemaCompartida();
    if (prob !== problemaPintado) { problemaPintado = prob; if (!state.project && $('#list-body')) refreshList(); }
    if (!caja || !linea) return;
    const pend = QC().sinSubir(S.all()).length;
    const cuantos = pend ? ` ${pend === 1 ? 'Un presupuesto está' : `${pend} presupuestos están`} solo en este navegador.` : '';
    let html = '', txt = '';
    if (!e.disponible) {
      html = pend ? notaCompartida(`<strong>Este navegador no puede abrir la carpeta del equipo</strong> (usa Chrome o Edge de escritorio).${cuantos} Descárgalos y déjalos en <strong>${esc(BUZON_EQUIPO)}</strong>.`, BTN_DESCARGAR()) : '';
    } else if (!e.conectada) {
      html = notaCompartida(e.movida
        ? `<strong>La carpeta del equipo cambió de lugar.</strong> Vuelve a conectarla eligiendo la biblioteca <strong>Formulación de proyectos - Documentos</strong> de tu OneDrive.${cuantos}`
        : `<strong>Los presupuestos se guardan en la carpeta del equipo.</strong> Conecta la biblioteca <strong>Formulación de proyectos - Documentos</strong> de tu OneDrive: ahí quedan los tuyos y aparecen los de tus colegas.${cuantos}`,
        `<button type="button" class="btn btn-primario btn-sm" data-act="compartir">${ICON.folder}Conectar carpeta</button>${pend ? BTN_DESCARGAR() : ''}`);
    } else if (e.permiso !== 'granted') {
      html = notaCompartida(`<strong>Presupuestos sin guardar en la carpeta del equipo.</strong> El navegador pide permiso una vez por sesión para usar la carpeta «${esc(e.nombre)}».${cuantos}`,
        `<button type="button" class="btn btn-primario btn-sm" data-act="compartir">${ICON.folder}Dar permiso y sincronizar</button>`);
    } else {
      const i = QC().info();
      txt = i.error ? `<span class="dot bad" aria-hidden="true"></span>No se pudo sincronizar con la carpeta del equipo: ${esc(i.error)} <button type="button" class="link-btn" data-act="compartir-ya">Reintentar</button>`
        : `<span class="dot ${i.pendientes ? 'warn' : 'ok'}" aria-hidden="true"></span>Guardados en la carpeta del equipo «${esc(e.nombre)}»${i.ultima ? ` · revisada a las ${esc(new Date(i.ultima).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))}` : ' · sincronizando…'}`;
    }
    if (caja.innerHTML !== html) caja.innerHTML = html;
    linea.hidden = !txt;
    if (linea.innerHTML !== txt) linea.innerHTML = txt;
  }

  /* Editor: aviso si el presupuesto abierto está solo en este navegador. */
  function pintarEditorCompartida() {
    const el = $('#ed-compartida');
    const p = state.project;
    if (!el || !p) return;
    const prob = problemaCompartida();
    let html = '';
    if (prob && !QC().enRepositorio(p)) {
      if (QC().entregado(p)) {
        html = notaCompartida(`<strong>Descargado para el equipo.</strong> Déjalo en <strong>${esc(BUZON_EQUIPO)}</strong>. Si lo vuelves a cambiar, descárgalo de nuevo.`, '');
      } else if (prob === 'sin-api') {
        html = notaCompartida(`<strong>Este presupuesto está solo en este navegador.</strong> Este navegador no puede abrir la carpeta del equipo: descárgalo y déjalo en <strong>${esc(BUZON_EQUIPO)}</strong>.`, BTN_DESCARGAR(p.uid));
      } else if (prob === 'error') {
        html = notaCompartida(`<strong>No se pudo guardar en la carpeta del equipo:</strong> ${esc(QC().info().error)}`,
          `<button type="button" class="btn btn-sm" data-act="compartir-ya">Reintentar</button>${BTN_DESCARGAR(p.uid)}`);
      } else {
        html = notaCompartida(`<strong>Este presupuesto está solo en este navegador.</strong> ${prob === 'sin-permiso' ? 'Da permiso a la carpeta del equipo para guardarlo ahí.' : 'Conecta la carpeta del equipo para guardarlo ahí.'}`,
          `<button type="button" class="btn btn-primario btn-sm" data-act="compartir">${ICON.folder}${prob === 'sin-permiso' ? 'Dar permiso' : 'Conectar carpeta'}</button>${BTN_DESCARGAR(p.uid)}`);
      }
    }
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /* Antes de crear un presupuesto (nuevo, importado, duplicado o versión): exigir la carpeta del
     equipo. Sin la API o sin la biblioteca en el computador, se sigue y se entrega por archivo.
     true = seguir. Debe llamarse desde un clic (el permiso y el selector lo necesitan). */
  async function exigirCarpeta() {
    if (nube.activa || !QC() || !QI() || !QI().disponible()) return true;
    const e = await QI().estado();
    if (e.conectada && e.permiso === 'granted') return true;
    if (e.conectada && await QI().permitir()) { QC().sincronizar(); return true; }
    const v = await ask({
      title: 'Los presupuestos se guardan en la carpeta del equipo',
      body: `<p>Antes de crear un presupuesto, ${e.movida ? 'vuelve a conectar' : 'conecta'} la biblioteca <b>Formulación de proyectos - Documentos</b> de tu OneDrive. Ahí queda guardado para todo el equipo.</p>
        <p class="small muted">¿No tienes esa biblioteca en este computador? Puedes trabajar sin ella y descargar el presupuesto para dejarlo en «${esc(BUZON_EQUIPO)}».</p>`,
      buttons: [{ label: 'Trabajar sin la carpeta', value: 'sin', left: true }, { label: 'Cancelar' }, { label: 'Conectar la biblioteca', value: 'conectar', primary: true }]
    });
    if (v === 'sin') return true;
    if (v !== 'conectar') return false;
    try { await QC().activar(); return true; } catch (err) {
      if (!err || err.name !== 'AbortError') toast((err && err.message) || 'No se pudo abrir la carpeta.', true);
      return false;
    }
  }

  /* Carpeta del proyecto en la lista y en el encabezado. */
  function carpetaCorta(p) {
    if (!enSP()) {
      const v = QO() && QO().vinculo(p);
      return v ? `<div class="proj-carpeta" title="Excel en la carpeta de la oferta: ${esc(v.ruta.join(' › '))}">${ICON.folder}<span>${esc(QO().grupoDeRuta(v.ruta))} · ${esc(v.nombre)}</span></div>` : '';
    }
    const u = window.QCloud.ubicacion(p.uid);
    return u ? `<div class="proj-carpeta">${ICON.folder}<span>${esc(u.grupo)} · ${esc(u.carpeta)}</span></div>` : '';
  }

  // ---------------------------------------------------------------------------
  //  CARPETA DE LA OFERTA: copia en Excel del presupuesto junto a los antecedentes de su oferta
  //  (modo local, js/oferta.js). El presupuesto completo sigue en el repositorio del equipo.
  // ---------------------------------------------------------------------------
  const QO = () => window.QOferta;
  function ofertaActiva() { return !nube.activa && !!QO() && QO().activa(); }
  const ofertaOmitida = new Set();   // presupuestos en que se eligió «Ahora no» (solo esta sesión)

  /* La planilla de ingreso (leída en la biblioteca, o la copia publicada), como la lee el modo SharePoint:
     N° → { titulo, estado, ubicacion, referencia, cierre, presupuesto }. */
  async function planillaPublicada() {
    const datos = QH() ? await QH().requerimientos() : null;
    const m = new Map();
    ((datos && datos.requerimientos) || []).forEach((r) => {
      const cierre = r.cierre ? new Date(r.cierre) : null;
      m.set(String(r.numero), {
        numero: String(r.numero), estado: r.estado || '', titulo: r.titulo || '', ubicacion: r.ubicacion || '',
        referencia: r.referencia || '', cierre: cierre && !isNaN(cierre) ? cierre : null,
        presupuesto: typeof r.presupuesto === 'number' && r.presupuesto > 0 ? r.presupuesto : null
      });
    });
    return m;
  }

  /* Elegir la carpeta de la oferta en la biblioteca de OneDrive. null = canceló;
     { ninguna: true } = sigue sin carpeta (o no hay biblioteca con permiso); { carpeta, req } = elegida. */
  async function elegirOfertaLocal(opts) {
    if (!ofertaActiva()) return { ninguna: true };
    let lista = null;
    try { lista = await QO().carpetas(true); } catch (err) { console.warn('Carpetas de oferta:', err); lista = null; }
    if (!lista || !lista.length) return { ninguna: true };
    return elegirCarpeta(Object.assign({
      lista, leerPlanilla: planillaPublicada, planilla: true, sinCarpeta: 'Sin carpeta por ahora',
      pie: 'Ahí queda una copia en Excel del presupuesto, al día con cada cambio. El presupuesto completo queda en el repositorio del equipo.'
    }, opts));
  }

  /* Deja el presupuesto unido a la carpeta elegida. Con datosOferta (presupuesto nuevo), trae
     además de la planilla el título, la ubicación y el presupuesto si están vacíos. */
  function enOfertaLocal(p, sel, opts) {
    const c = sel.carpeta, r = sel.req;
    const v = Object.assign({}, p.vinculos, { carpetaOferta: QO().nuevoVinculo(c) });
    // La planilla confirma que es la misma oferta: su N° pasa a ser el N° de requerimiento
    if (r && !(v.requerimiento && v.requerimiento.numero)) v.requerimiento = { numero: r.numero, titulo: r.titulo || '' };
    p.vinculos = v;
    if (opts && opts.datosOferta) {
      if (!String(p.titulo || '').trim()) p.titulo = (r && r.titulo) || c.titulo || '';
      if (r && r.ubicacion && !String(p.ubicacion || '').trim()) p.ubicacion = r.ubicacion;
      if (r && r.presupuesto && !(num(p.parametros.presupuestoMaximo) > 0)) {
        p.parametros.presupuestoMaximo = r.presupuesto;
        p.parametros.presupuestoIncluyeIva = true;
      }
      if (r && !String(p.descripcion || '').trim()) {
        const partes = [r.referencia ? `Referencia ${r.referencia}` : '', r.cierre ? `cierre ${fechaUTC(r.cierre)}` : ''].filter(Boolean);
        if (partes.length) p.descripcion = partes.join(' · ') + '.';
      }
    }
    return p;
  }

  function textoEstadoOferta(i) {
    const hora = i.hora ? new Date(i.hora).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
    switch (i.estado) {
      case 'guardado': return `Excel al día en la carpeta de la oferta${hora ? ` (guardado a las ${hora})` : ''}.`;
      case 'guardando': return 'Guardando el Excel en la carpeta de la oferta…';
      case 'pendiente': return 'El Excel de la carpeta de la oferta se actualiza en unos segundos.';
      case 'error': return `No se pudo guardar el Excel: ${i.error}`;
      default: return 'El Excel de la carpeta de la oferta se actualiza cada vez que se cambia el presupuesto.';
    }
  }

  /* Guarda ya el Excel del presupuesto y lo avisa. */
  async function guardarExcelOferta(uid, silencio) {
    try {
      const w = await QO().guardar(uid);
      if (!silencio) toast(`Excel guardado en la carpeta de la oferta: ${w.archivo}`);
      return true;
    } catch (err) {
      toast(`No se pudo guardar el Excel en la carpeta de la oferta: ${(err && err.message) || err}`, true);
      return false;
    }
  }

  /* Une el presupuesto (abierto o de la lista) con una carpeta y escribe su Excel. */
  async function vincularOferta(uid, sel) {
    const abierto = state.project && state.project.uid === uid;
    if (abierto && saveTimer) saveNow();
    const p = abierto ? state.project : S.get(uid);
    if (!p) return;
    enOfertaLocal(p, sel, {});
    ofertaOmitida.delete(uid);
    if (abierto) { saveNow(); updateHeader(); if (state.tab === 'ficha') renderTab(); } else { S.upsert(p); refreshList(); }
    const ok = await guardarExcelOferta(uid, true);
    if (ok) toast(`Listo: el Excel de ${p.codigo} v${p.version} queda en «${sel.carpeta.nombre}» y se actualiza solo.`);
    pintarEditorOferta();
  }

  async function elegirOfertaPara(uid) {
    const p = (state.project && state.project.uid === uid) ? state.project : S.get(uid);
    if (!p) return;
    if (!(await asegurarBiblioteca())) return;
    const v = QO().vinculo(p);
    const req = QH() && QH().reqDe(p);
    const sel = await elegirOfertaLocal({
      titulo: 'Carpeta de la oferta',
      texto: `Elige la carpeta de la oferta de <b>${esc(p.codigo)} v${esc(p.version)}</b> en la biblioteca <b>Formulación de proyectos - Documentos</b>.`,
      actual: v ? v.ruta.join('/') : '', buscar: v ? '' : req || '', sinCarpeta: ''
    });
    if (!sel || !sel.carpeta) return;
    await vincularOferta(uid, sel);
  }

  /* Para llegar a la carpeta de cada oferta hace falta la biblioteca completa, con permiso. Desde
     un clic: la pide si falta (o pide de nuevo el permiso de la sesión). true = lista. */
  async function asegurarBiblioteca() {
    if (!ofertaActiva()) { toast('Este navegador no puede abrir carpetas: usa Chrome o Edge de escritorio.', true); return false; }
    let e = await QI().estadoBiblioteca();
    if (e.recordada && e.permiso !== 'granted') {
      await QI().permitir();
      e = await QI().estadoBiblioteca();
    }
    if (e.recordada && e.permiso === 'granted') return true;
    const v = await ask({
      title: 'Conectar la biblioteca completa',
      body: `<p>Para guardar el Excel en la carpeta de la oferta, elige la biblioteca <b>Formulación de proyectos - Documentos</b> de tu OneDrive${e.conectada ? ' (ahora está conectada solo la carpeta de herramientas)' : ''}.</p>
        <p class="small muted">El Formulador solo escribe su propio Excel («Formulación … .xlsx») en la carpeta de oferta que elijas; no toca nada más.</p>`,
      buttons: [{ label: 'Cancelar' }, { label: 'Elegir la biblioteca', value: 'elegir', primary: true }]
    });
    if (v !== 'elegir') return false;
    try { await QI().conectar(); } catch (err) {
      if (!err || err.name !== 'AbortError') toast((err && err.message) || 'No se pudo abrir la carpeta.', true);
      return false;
    }
    QH().olvidar();
    if (QC()) QC().sincronizar();
    e = await QI().estadoBiblioteca();
    if (!e.recordada) { toast('Elige la biblioteca completa «Formulación de proyectos - Documentos», no una carpeta de adentro.', true); return false; }
    return e.permiso === 'granted';
  }

  const notaOferta = (texto, botones) => `<div class="nota compartida-nota" role="region" aria-label="Carpeta de la oferta">
      <span>${texto}</span><span class="actions">${botones}</span></div>`;

  /* Editor: aviso para elegir la carpeta de la oferta, o el error del último guardado del Excel. */
  async function pintarEditorOferta() {
    const el = $('#ed-oferta');
    const p = state.project;
    if (!el || !p) return;
    let html = '';
    if (ofertaActiva()) {
      const v = QO().vinculo(p);
      const eb = await QI().estadoBiblioteca();
      if (state.project !== p) return;
      if (!v && eb.conectada && !ofertaOmitida.has(p.uid)) {
        const omitir = `<button type="button" class="btn btn-ghost btn-sm" data-act="oferta-omitir">Ahora no</button>`;
        if (!eb.recordada) {
          html = notaOferta('<strong>Guarda el Excel en la carpeta de la oferta.</strong> Para llegar a las carpetas de las ofertas, conecta la biblioteca <strong>Formulación de proyectos - Documentos</strong> completa.',
            `<button type="button" class="btn btn-primario btn-sm" data-act="oferta-elegir">${ICON.folder}Conectar la biblioteca</button>${omitir}`);
        } else if (eb.permiso === 'granted') {
          const sug = await QO().sugerencias(p).catch(() => []);
          if (state.project !== p) return;
          const una = sug.length === 1 ? sug[0] : null;
          html = notaOferta(una
            ? `<strong>¿La carpeta de esta oferta es «${esc(una.nombre)}»?</strong> Ahí queda una copia en Excel del presupuesto, al día con cada cambio.`
            : '<strong>Guarda el Excel en la carpeta de la oferta.</strong> El presupuesto ya queda en el repositorio del equipo; elige la carpeta de su oferta y ahí quedará una copia en Excel, al día con cada cambio.',
          (una ? `<button type="button" class="btn btn-primario btn-sm" data-act="oferta-usar" data-ruta="${esc(una.id)}">${ICON.folder}Usar esa carpeta</button><button type="button" class="btn btn-sm" data-act="oferta-elegir">Elegir otra</button>`
            : `<button type="button" class="btn btn-primario btn-sm" data-act="oferta-elegir">${ICON.folder}Elegir carpeta</button>`) + omitir);
        }
      } else if (v) {
        const i = QO().info(p);
        if (i.estado === 'error') {
          html = notaOferta(`<strong>No se pudo guardar el Excel en «${esc(v.nombre)}»:</strong> ${esc(i.error)}`,
            `<button type="button" class="btn btn-sm" data-act="oferta-guardar">Reintentar</button><button type="button" class="btn btn-sm" data-act="oferta-elegir">Cambiar carpeta</button>`);
        } else if (eb.conectada && !eb.recordada) {
          html = notaOferta(`<strong>El Excel de este presupuesto va en «${esc(v.nombre)}».</strong> Para guardarlo ahí desde este navegador, conecta la biblioteca <strong>Formulación de proyectos - Documentos</strong> completa.`,
            `<button type="button" class="btn btn-sm" data-act="oferta-elegir">${ICON.folder}Conectar la biblioteca</button>`);
        }
      }
    }
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /* Detalle del Excel de la carpeta de la oferta (botón de la carpeta en el encabezado). */
  async function dialogoOferta(uid) {
    const p = (state.project && state.project.uid === uid) ? state.project : S.get(uid);
    const v = p && QO().vinculo(p);
    if (!v) { await elegirOfertaPara(uid); return; }
    const i = QO().info(p);
    const eb = await QI().estadoBiblioteca();
    const falta = !eb.recordada ? 'Para guardarlo desde este navegador, conecta la biblioteca completa («Guardar ahora» la pide).'
      : eb.permiso !== 'granted' ? 'Falta el permiso de esta sesión para la biblioteca: se guarda al darlo («Guardar ahora» lo pide).' : '';
    const r = await ask({
      title: 'Excel en la carpeta de la oferta',
      body: `<p>Una copia en Excel de este presupuesto queda en la carpeta de su oferta, junto a sus antecedentes, y se actualiza sola cada vez que se cambia.</p>
        <dl class="oferta-dl">
          <dt>Carpeta</dt><dd>Formulación de proyectos › ${esc(i.ruta.join(' › '))}</dd>
          <dt>Archivo</dt><dd>${esc(i.archivo)}</dd>
          <dt>Estado</dt><dd>${esc(falta || textoEstadoOferta(i))}</dd>
        </dl>
        <p class="small muted">El Excel es para consultar o imprimir: lo que se cambie en él se reemplaza en la siguiente actualización. El presupuesto completo, el que se vuelve a abrir aquí, queda en el repositorio del equipo (.Herramientas formulación › Intercambio › publicado › formulador).</p>`,
      buttons: [{ label: 'Dejar de guardarlo aquí', value: 'quitar', left: true }, { label: 'Cambiar carpeta', value: 'cambiar' }, { label: 'Guardar ahora', value: 'guardar', primary: true }]
    });
    if (r === 'guardar') { if (await asegurarBiblioteca()) await guardarExcelOferta(uid); }
    else if (r === 'cambiar') await elegirOfertaPara(uid);
    else if (r === 'quitar') {
      const abierto = state.project && state.project.uid === uid;
      const x = abierto ? state.project : S.get(uid);
      const vin = Object.assign({}, x.vinculos);
      delete vin.carpetaOferta;
      x.vinculos = vin;
      ofertaOmitida.add(uid);
      if (abierto) { saveNow(); updateHeader(); } else S.upsert(x);
      toast('El Excel ya no se actualiza en esa carpeta. El que ya estaba ahí se queda.');
      pintarEditorOferta();
    }
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
    // Modo local: los proyectos se comparten por la carpeta de OneDrive si este navegador lo activó,
    // y el Excel de cada uno se mantiene al día en la carpeta de su oferta.
    if (QC()) QC().iniciar();
    if (QO()) QO().iniciar();
    route();
  }
})();
