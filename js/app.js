/*
 * app.js — Interfaz de la herramienta de formulación de proyectos QUEMPIN.
 * Vistas: listado de proyectos (#/), editor de proyecto (#/p/<id>/<pestaña>) y guía de KPIs (#/guia).
 * La utilidad de cada partida se ingresa en la pestaña "Resumen y KPIs", junto a los indicadores
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
    restore: svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>'),
    target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>')
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
    /* Utilidad que había antes de "Aplicar" / "Llevar al margen objetivo", para "Deshacer":
       { puid, antes: Map(uid de partida → { utilidadTipo, utilidadValor }), accion } */
    utilUndo: null,
    list: { q: '', estado: '', resp: '', sort: { k: 'mod', dir: -1 } }
  };

  const DETALLE = {
    materiales: { titulo: 'Materiales', singular: 'material', total: 'mat', factory: S.newMaterial, cat: 'cat-mat' },
    equipos: { titulo: 'Equipos', singular: 'equipo', total: 'eq', factory: S.newEquipo, cat: 'cat-eq' },
    manoObra: { titulo: 'Mano de obra', singular: 'tarea', total: 'mo', factory: S.newManoObra, cat: 'cat-mo' },
    otros: { titulo: 'Otros', singular: 'costo', total: 'otros', factory: S.newOtro, cat: 'cat-otros' }
  };
  const TABS = [
    { id: 'ficha', label: 'Ficha y parámetros' },
    { id: 'partidas', label: 'Partidas', list: 'partidas' },
    { id: 'materiales', label: 'Materiales', list: 'materiales' },
    { id: 'equipos', label: 'Equipos', list: 'equipos' },
    { id: 'manoObra', label: 'Mano de obra', list: 'manoObra' },
    { id: 'otros', label: 'Otros', list: 'otros' },
    { id: 'resumen', label: 'Resumen y KPIs' }
  ];

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
        const i = parseInt(dlg.returnValue, 10);
        resolve(Number.isInteger(i) && btns[i] ? (btns[i].value === undefined ? null : btns[i].value) : null);
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
        { icon: ICON.archive, title: 'Respaldar todos los proyectos', desc: 'Archivo JSON para restaurar o llevar a otro navegador', act: 'respaldar', disabled: !n },
        { sep: true },
        { icon: ICON.sparkle, title: 'Cargar proyecto de ejemplo', desc: 'Mismos datos del Excel original, para comparar resultados', act: 'ejemplo' }
      ];
    } else if (key === 'proj' || key === 'editor-more') {
      const enEditor = key === 'editor-more';
      items = [
        enEditor ? null : { icon: ICON.open, title: 'Abrir', act: 'abrir', id },
        enEditor ? null : { icon: ICON.sheet, title: 'Exportar a Excel', desc: 'Planilla con fórmulas vivas y ficha de KPI', act: 'exp-xlsx', id },
        { icon: ICON.file, title: 'Exportar a JSON', desc: 'Para respaldar o compartir y volver a importar', act: 'exp-json', id },
        { sep: true },
        { icon: ICON.layers, title: 'Duplicar como proyecto nuevo', desc: 'Nuevo código correlativo, versión 1', act: 'duplicar', id },
        { icon: ICON.version, title: 'Crear nueva versión', desc: 'Mismo código para una revisión de la oferta', act: 'version', id },
        { sep: true },
        { icon: ICON.trash, title: enEditor ? 'Eliminar proyecto' : 'Eliminar', act: 'eliminar', id, danger: true }
      ].filter(Boolean);
    } else if (key === 'catalogo') {
      const cat = state.project.catalogoOtros || [];
      items = cat.length ? cat.map((c, i) => ({ icon: ICON.plus, title: c.descripcion || 'Sin descripción', right: `${clp(num(c.costoUnitario))} / ${c.unidad || 'un'}`, catIdx: i }))
        : [{ title: 'El catálogo está vacío', desc: 'Agrega referencias en Ficha y parámetros', disabled: true }];
      extra = { foot: '<button type="button" class="link-btn" data-act="tab" data-tab="ficha" data-focus="catalogo">Editar el catálogo en Ficha y parámetros</button>', minWidth: 320, search: cat.length > 8 ? 'Buscar en el catálogo' : '' };
    }
    openPop(btn, Object.assign({
      kind: 'menu', align: btn.dataset.align || 'right', label: btn.getAttribute('aria-label') || btn.textContent.trim(), items,
      onPick: (it) => {
        if (it.catIdx !== undefined) addFromCatalog(it.catIdx);
        else if (it.act) doAct(it.act, { id: it.id });
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
    const okSave = S.upsert(state.project);
    setSaveState(okSave ? 'Guardado en este navegador' : 'No se pudo guardar en este navegador: exporta el proyecto', okSave ? '' : 'err');
  }
  window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });

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
    renderLectura();
    updateTabs();
    updateHeader();
    if (state.tab === 'resumen') refreshResumen();
  }

  // ---------------------------------------------------------------------------
  //  Navegación
  // ---------------------------------------------------------------------------
  function route() {
    if (saveTimer) saveNow();
    closePop();
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    let where = 'lista';
    if (parts[0] === 'p' && parts[1]) {
      const p = S.get(parts[1]);
      if (!p) { toast('No se encontró el proyecto.', true); location.hash = '#/'; return; }
      where = 'proyecto';
      openProject(p, parts[2]);
    } else if (parts[0] === 'guia') {
      where = 'guia';
      state.project = null;
      renderGuide();
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
    $('#modnav').innerHTML = `
      <a class="viz-modnav-tab ${where === 'lista' ? 'is-active' : ''}" href="#/" ${where === 'lista' ? 'aria-current="page"' : ''}>Proyectos</a>
      ${p ? `<a class="viz-modnav-tab is-active" id="modnav-proj" href="#/p/${p.uid}/${state.tab}" aria-current="page"><span></span></a>` : ''}
      <a class="viz-modnav-tab ${where === 'guia' ? 'is-active' : ''}" href="#/guia" ${where === 'guia' ? 'aria-current="page"' : ''}>Guía de KPIs</a>`;
    const sub = $('#hdr-sub');
    if (where === 'guia') sub.textContent = 'Qué mide cada indicador y cómo se calcula';
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
          <p>Formula el costo de cada proyecto por partidas, define la utilidad y evalúa la oferta con sus indicadores antes de enviarla.</p>
        </div>
        ${all.length ? `<div class="actions">
          <button class="btn btn-primario" data-act="nuevo">${ICON.plus}Nuevo proyecto</button>
          <button class="btn" data-act="importar">${ICON.upload}Importar</button>
          <button class="btn" data-menu="list-more" aria-haspopup="menu" aria-expanded="false" aria-label="Más acciones">${ICON.more}Más${ICON.caret}</button>
        </div>` : ''}
      </div>
      ${all.length ? `
        <div class="kpis" id="list-kpis"></div>
        <div class="panel" id="list-cartera" style="margin:16px 0"></div>
        <div class="viz-filterbar">
          <div class="viz-filtergrid">
            <div class="viz-field span-6"><label for="list-search">Buscar</label>
              <input type="search" id="list-search" class="${L.q ? 'is-set' : ''}" placeholder="Código, título, cliente, ubicación o responsable" value="${esc(L.q)}" autocomplete="off"></div>
            <div class="viz-field span-3"><label for="list-estado">Estado</label>
              <select id="list-estado" class="${L.estado ? 'is-set' : ''}">
                <option value="">Todos los estados</option>
                ${S.ESTADOS.map((e) => `<option value="${esc(e)}" ${L.estado === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}
              </select></div>
            <div class="viz-field span-3"><label for="list-resp">Responsable</label>
              <select id="list-resp" class="${L.resp ? 'is-set' : ''}" ${responsables.length ? '' : 'disabled'}>
                <option value="">${responsables.length ? 'Todos los responsables' : 'Sin responsables asignados'}</option>
                ${responsables.map((r) => `<option value="${esc(r)}" ${L.resp === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
              </select></div>
          </div>
          <div class="viz-filterfoot" id="list-foot"></div>
        </div>
        <div class="tabla-contenedor">
          <table class="tbl" id="list-table" style="min-width:980px">
            <thead id="list-head"></thead>
            <tbody id="list-body"></tbody>
          </table>
        </div>` : emptyHub()}
    </div>`;
    if (all.length) refreshList();
  }

  function emptyHub() {
    const card = (icon, titulo, normas, desc, btn) => `<article class="hub-card">
      <div class="hub-card-cabecera"><div class="icon" aria-hidden="true">${icon}</div><div><h3>${titulo}</h3><div class="hub-normas">${normas}</div></div></div>
      <p class="desc">${desc}</p>${btn}</article>`;
    return `<div class="hub-grid">
      ${card(ICON.plus, 'Nuevo proyecto', 'Ficha · partidas · costos', 'Parte de cero. El código correlativo se asigna solo y los parámetros (IVA, tarifas, metas) vienen con los valores habituales.', `<button class="btn btn-primario" data-act="nuevo">Crear proyecto →</button>`)}
      ${card(ICON.sparkle, 'Proyecto de ejemplo', 'Mismos datos del Excel original', 'Tres partidas de instalación de medidores de gas natural, para revisar cómo funciona y comprobar que el resultado coincide con el Excel.', `<button class="btn btn-primario" data-act="ejemplo">Cargar ejemplo →</button>`)}
      ${card(ICON.upload, 'Importar archivo', '.xlsx · .xlsm · .json', 'Trae un proyecto exportado desde esta herramienta o migra un Excel de formulación antiguo (.xlsm) para seguir trabajándolo aquí.', `<button class="btn btn-primario" data-act="importar">Importar archivo →</button>`)}
    </div>
    <p class="viz-footer" style="text-align:left;padding-top:14px">Los proyectos se guardan en este navegador. Para respaldarlos o compartirlos, expórtalos a Excel o JSON; ambos formatos se pueden volver a importar.</p>`;
  }

  function listFiltered() {
    const L = state.list;
    const q = norm(L.q.trim());
    return S.all()
      .filter((p) => !L.estado || p.estado === L.estado)
      .filter((p) => !L.resp || (p.responsable || '').trim() === L.resp)
      .filter((p) => !q || norm([p.codigo, p.titulo, p.cliente, p.responsable, p.ubicacion].join(' ')).includes(q));
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
      kpiTop('Proyectos', String(list.length), `${enCurso.length} en curso · ${plural(adj.length, 'adjudicado')}`),
      kpiTop('Ofertas en curso', clp(enCurso.reduce((a, p) => a + precio(p), 0)), `Precio neto de ${plural(enCurso.length, 'oferta')} en borrador, revisión o enviadas`, 'accent', 'Suma del precio de venta neto (sin IVA) de los proyectos en estado Borrador, En revisión o Enviada.'),
      kpiTop('Adjudicado', clp(adj.reduce((a, p) => a + precio(p), 0)), cerradas ? `Tasa de adjudicación ${pct(adj.length / cerradas)} (${adj.length} de ${cerradas} cerradas)` : 'Aún no hay ofertas adjudicadas ni perdidas', '', 'Precio neto de los proyectos adjudicados. La tasa compara adjudicadas contra adjudicadas + perdidas.'),
      kpiTop('Margen ponderado', pct(margen), `Objetivo ${pct(mObj)} · mínimo ${pct(mMin)}`, semM, 'Utilidad total ÷ precio neto total, sin contar proyectos perdidos ni descartados. Las metas son las predeterminadas de Configuración.'),
      kpiTop('Con errores', String(conErr), conErr ? 'Costos sin partida o cantidades en cero: revisa antes de exportar' : 'Todos los proyectos pasan la validación', conErr ? 'sem-bad' : 'sem-ok')
    ].join('');
  }

  function renderCartera(list, rs) {
    const el = $('#list-cartera');
    if (!el) return;
    const rows = S.ESTADOS.map((e) => {
      const ps = list.filter((p) => p.estado === e);
      return { e, n: ps.length, v: ps.reduce((a, p) => a + Math.max(0, rs.get(p.uid).totals.precioNeto), 0) };
    });
    const total = rows.reduce((a, r) => a + r.v, 0);
    const L = state.list;
    el.innerHTML = `<div class="section-head" style="margin-bottom:10px"><h3 class="seccion-titulo">Cartera por estado <span class="tn">· precio neto</span></h3><p>Haz clic en un estado para filtrar la tabla.</p></div>
      ${total > 0 ? `<div class="stack lg" role="img" aria-label="Precio neto de la cartera por estado">${rows.filter((r) => r.v > 0).map((r) =>
        `<div class="seg ${ESTADO_INFO[r.e].cls}" style="flex:${r.v} 1 0" data-tip="<b>${esc(r.e)}</b>${esc(clp(r.v))} · ${esc(pct(r.v / total))} · ${plural(r.n, 'proyecto')}"></div>`).join('')}</div>`
        : '<p class="small muted" style="margin:0">Los proyectos filtrados aún no tienen precio.</p>'}
      <div class="leyenda-inline" style="margin-top:12px">${rows.map((r) => `<button type="button" class="viz-chip" data-act="filtro-estado" data-e="${esc(r.e)}" aria-pressed="${L.estado === r.e}" style="${L.estado === r.e ? 'border-color:var(--brand-orange);box-shadow:inset 0 0 0 1px var(--brand-orange)' : ''}${r.n ? '' : ';opacity:.55'}">
          <span class="swatch ${ESTADO_INFO[r.e].cls}"></span><span class="v">${esc(r.e)}</span><span class="k">${r.n} · ${esc(clp(r.v))}</span></button>`).join('')}</div>`;
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
    { k: 'margen', l: 'Margen', num: true }, { k: 'rentDH', l: 'Utilidad / DH', num: true }, { k: null, l: 'Alertas', num: true }, { k: null, l: '' }
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
        <td class="nowrap"><span class="code-badge">${esc(p.codigo || '—')}</span><span class="ver">v${esc(p.version)}</span></td>
        <td style="min-width:240px"><div class="proj-title">${esc(p.titulo || 'Sin título')}</div><div class="proj-sub">${esc([p.cliente, p.ubicacion].filter(Boolean).join(' · ') || '—')}</div></td>
        <td>${esc(p.responsable || '—')}</td>
        <td class="nowrap">${esc(fechaCorta(p.fecha))}</td>
        <td><span class="estado" data-e="${esc(p.estado)}">${esc(p.estado)}</span></td>
        <td class="num"><b>${clp(r.totals.precioNeto)}</b></td>
        <td class="num"><span class="dot ${r.status.margen}" aria-hidden="true"></span>${pct(r.kpis.margen)}</td>
        <td class="num">${clp(r.kpis.rentDH)}</td>
        <td class="num">${nAlert ? `<span class="chip ${nErr ? 'bad' : 'warn'}">${nErr ? '✖' : '▲'} ${nAlert}</span>` : '<span class="muted">0</span>'}</td>
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
            <a class="back" href="#/">← Proyectos</a>
            <h2 id="ed-title"></h2>
            <div class="meta" id="ed-meta"></div>
          </div>
          <div class="editor-actions">
            <div class="actions">
              <button class="btn btn-primario" data-act="exp-xlsx" data-id="${p.uid}">${ICON.download}Exportar Excel</button>
              <button class="btn" data-act="imprimir">${ICON.print}Imprimir resumen</button>
              <button class="btn" data-menu="editor-more" data-id="${p.uid}" aria-haspopup="menu" aria-expanded="false" aria-label="Más acciones del proyecto">${ICON.more}</button>
            </div>
            <span class="en-vivo" id="save-state">Guardado en este navegador</span>
          </div>
        </div>
      </div>
      <div class="barra-pestanas">
        <div class="viz-container barra-pestanas-interior">
          <div class="tabs" role="tablist" aria-label="Secciones del proyecto" id="tabs"></div>
          <div class="lectura" id="lectura" aria-live="off"></div>
        </div>
      </div>
      <div class="viz-container page" id="tab-body"></div>`;
    renderTab();
  }

  function updateHeader() {
    const p = state.project;
    const t = $('#ed-title');
    if (!p || !t) return;
    t.textContent = p.titulo || 'Proyecto sin título';
    t.classList.toggle('sin-titulo', !p.titulo);
    const sep = '<span class="sep" aria-hidden="true">·</span>';
    $('#ed-meta').innerHTML = `<span class="code-badge">${esc(p.codigo || 'SIN CÓDIGO')}</span><span>versión ${esc(p.version)}</span>
      <button type="button" class="estado" data-e="${esc(p.estado)}" data-picker="estado" aria-haspopup="listbox" aria-expanded="false" title="Cambiar el estado">${esc(p.estado)}${svg('<path d="M6 9l6 6 6-6"/>')}</button>
      ${p.cliente ? `${sep}<span>${esc(p.cliente)}</span>` : ''}${p.responsable ? `${sep}<span>${esc(p.responsable)}</span>` : ''}${p.fecha ? `${sep}<span>${esc(fechaCorta(p.fecha))}</span>` : ''}`;
    document.title = `${p.codigo || ''} ${p.titulo || 'Proyecto'} — Formulación QUEMPIN`;
    const sub = $('#hdr-sub');
    if (sub) sub.innerHTML = `<strong>${esc(p.codigo || 'Sin código')} v${esc(p.version)}</strong> · ${esc(p.titulo || 'Proyecto sin título')}`;
    const mn = $('#modnav-proj');
    if (mn) {
      mn.href = `#/p/${p.uid}/${state.tab}`;
      mn.firstElementChild.textContent = `${p.codigo || 'Sin código'} v${p.version}`;
    }
  }

  function renderLectura() {
    const el = $('#lectura');
    if (!el) return;
    const r = state.result;
    const nErr = r.warnings.filter((w) => w.level === 'error').length;
    const nWarn = r.warnings.filter((w) => w.level === 'warn').length;
    el.innerHTML = `
      <div class="lectura-item"><span class="l">Precio neto</span><span class="v">${clp(r.totals.precioNeto)}</span></div>
      <div class="lectura-item"><span class="l">Margen</span><span class="v"><span class="dot ${r.status.margen}" aria-hidden="true" style="margin:0"></span>${pct(r.kpis.margen)}</span></div>
      <div class="lectura-item"><span class="l">Alertas</span><button type="button" class="v" data-act="ver-alertas" title="Ver alertas de validación">${nErr ? `<span class="chip bad">✖ ${nErr}</span>` : ''}${nWarn ? `<span class="chip warn">▲ ${nWarn}</span>` : ''}${!nErr && !nWarn ? '<span class="chip ok">✔ 0</span>' : ''}</button></div>`;
  }

  function updateTabs() {
    const el = $('#tabs');
    if (!el) return;
    const p = state.project;
    const r = state.result;
    el.innerHTML = TABS.map((t) => {
      const n = t.list ? p[t.list].length : null;
      const err = r.warnings.some((w) => w.tab === t.id && w.level === 'error');
      const on = state.tab === t.id;
      return `<button type="button" class="tab ${on ? 'active' : ''} ${t.id === 'resumen' ? 'resumen' : ''}" role="tab" aria-selected="${on}" data-act="tab" data-tab="${t.id}">${t.label}${n !== null ? `<span class="count ${err ? 'err' : ''}">${n}</span>` : ''}</button>`;
    }).join('');
    // En pantallas angostas la barra se desplaza: mantener visible la pestaña activa
    const act = $('.tab.active', el);
    if (act && el.scrollWidth > el.clientWidth) {
      const l = act.offsetLeft - el.offsetLeft, r = l + act.offsetWidth;
      if (l < el.scrollLeft) el.scrollLeft = l - 12;
      else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth + 28;
    }
  }

  function renderTab(focusKey) {
    const body = $('#tab-body');
    if (!body) return;
    closePop();
    const tab = state.tab;
    if (tab === 'ficha') body.innerHTML = viewFicha();
    else if (tab === 'partidas') body.innerHTML = viewPartidas();
    else if (tab === 'manoObra') body.innerHTML = viewManoObra();
    else if (DETALLE[tab]) body.innerHTML = viewDetalle(tab);
    else if (tab === 'resumen') body.innerHTML = viewResumen();
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
    return `<div class="campo ${o.cls || ''}"><label for="f-${path}">${label}</label>${wrapped}${o.hint ? `<span class="hint" ${o.hintId ? `id="${o.hintId}"` : ''}>${o.hint}</span>` : ''}</div>`;
  };
  const rowInput = (list, it, k, label, cls, isNum, extra) =>
    `<input class="ci ${cls || ''} ${isNum ? 'num' : ''}" ${isNum ? 'type="number" step="any" inputmode="decimal" data-t="num"' : 'type="text"'} data-list="${list}" data-uid="${it.uid}" data-k="${k}" value="${esc(it[k] === null || it[k] === undefined ? '' : it[k])}" aria-label="${esc(label)}" ${extra || ''}>`;
  const unitCombo = (inputHtml, label) => `<div class="combo">${inputHtml}<button type="button" class="combo-btn" data-picker="unidad" tabindex="-1" aria-haspopup="listbox" aria-expanded="false" aria-label="Elegir ${esc(label)}">${svg('<path d="M6 9l6 6 6-6"/>')}</button></div>`;
  const rowUnit = (list, it, label) => unitCombo(rowInput(list, it, 'unidad', label, 'w-xs', false, 'autocomplete="off"'), label);
  const seg = (name, opts, attrs, cls) => `<div class="segmentado ${cls || ''}" role="radiogroup" ${attrs.label ? `aria-label="${esc(attrs.label)}"` : ''}>${opts.map((o) =>
    `<label><input type="radio" name="${name}" value="${esc(o.v)}" ${o.checked ? 'checked' : ''} ${attrs.data || ''}><span>${o.l}</span></label>`).join('')}</div>`;

  // ---- Ficha ------------------------------------------------------------------
  function viewFicha() {
    const p = state.project;
    const par = p.parametros;
    return `
    <div class="grid-2">
      <div class="col">
        <section class="panel">
          <h3 class="seccion-titulo">Identificación</h3>
          <p class="panel-sub">Identifica el proyecto en el listado y en el Excel exportado.</p>
          <div class="fila-campos">
            ${fInput('codigo', 'Código del proyecto', { hint: ' ', hintId: 'codigo-hint' })}
            ${fInput('version', 'Versión', { type: 'num' })}
            <div class="campo"><label for="f-estado">Estado</label>
              <select class="select" id="f-estado" data-f="estado">${S.ESTADOS.map((e) => `<option value="${esc(e)}" ${p.estado === e ? 'selected' : ''}>${esc(e)} — ${esc(ESTADO_INFO[e].desc.toLowerCase())}</option>`).join('')}</select></div>
            ${fInput('fecha', 'Fecha de formulación', { type: 'date' })}
            ${fInput('titulo', 'Título del proyecto', { cls: 'ancho', placeholder: 'Ej.: Instalación de medidores de gas natural' })}
            ${fInput('cliente', 'Cliente / mandante')}
            ${fInput('ubicacion', 'Ubicación')}
            ${fInput('responsable', 'Responsable asignado', { cls: 'ancho' })}
            <div class="campo ancho"><label for="f-descripcion">Descripción / alcance</label>
              <textarea class="textarea" id="f-descripcion" data-f="descripcion" rows="3">${esc(p.descripcion)}</textarea></div>
          </div>
        </section>
        <section class="panel">
          <h3 class="seccion-titulo">Evaluación de la oferta</h3>
          <p class="panel-sub">Metas que usan los semáforos de los KPI en Resumen y KPIs.</p>
          <div class="fila-campos">
            ${fInput('parametros.presupuestoMaximo', 'Presupuesto máximo del mandante', { type: 'num', prefix: '$', hint: 'Déjalo vacío si no se conoce.' })}
            <div class="campo"><span class="label" id="lbl-iva-ppto">El presupuesto se informa</span>
              ${seg('f-ppto-iva', [{ v: '0', l: 'Neto', checked: !par.presupuestoIncluyeIva }, { v: '1', l: 'Con IVA', checked: !!par.presupuestoIncluyeIva }], { label: 'El presupuesto se informa', data: 'data-f="parametros.presupuestoIncluyeIva" data-t="bool01"' })}
              <span class="hint">Se compara con el precio neto o con IVA, según corresponda.</span></div>
            ${fInput('parametros.margenObjetivo', 'Margen objetivo', { type: 'num', suffix: '%' })}
            ${fInput('parametros.margenMinimo', 'Margen mínimo aceptable', { type: 'num', suffix: '%' })}
            ${fInput('parametros.metaUtilidadDH', 'Meta de utilidad por día-hombre', { type: 'num', prefix: '$', hint: '0 = sin meta' })}
            ${fInput('parametros.umbralAjustado', 'Oferta "ajustada" desde', { type: 'num', suffix: '%', hint: '% del presupuesto máximo' })}
          </div>
        </section>
      </div>
      <div class="col">
        <section class="panel">
          <h3 class="seccion-titulo">Estructura de precio</h3>
          <p class="panel-sub">Con gastos generales e imprevistos en 0 % el cálculo es idéntico al Excel original.</p>
          <div class="fila-campos tres">
            ${fInput('parametros.iva', 'IVA', { type: 'num', suffix: '%' })}
            ${fInput('parametros.gastosGenerales', 'Gastos generales', { type: 'num', suffix: '%', hint: '% sobre el costo directo' })}
            ${fInput('parametros.imprevistos', 'Imprevistos', { type: 'num', suffix: '%', hint: '% sobre el costo directo' })}
          </div>
          <div class="bloque">
            <h3 class="seccion-titulo" style="margin-bottom:12px">Tarifa por día-hombre</h3>
            <div class="fila-campos tres">
              ${fInput('parametros.tarifaN1', 'Nivel 1', { type: 'num', prefix: '$' })}
              ${fInput('parametros.tarifaN2', 'Nivel 2', { type: 'num', prefix: '$' })}
              ${fInput('parametros.tarifaN3', 'Nivel 3', { type: 'num', prefix: '$' })}
            </div>
          </div>
        </section>
        <section class="panel" id="catalogo">
          <h3 class="seccion-titulo">Catálogo de otros costos</h3>
          <p class="panel-sub">Referencias para agregar rápido en la pestaña Otros.</p>
          <div class="tabla-contenedor">
            <table class="tbl" style="min-width:440px">
              <thead><tr><th>Descripción</th><th>Unid.</th><th class="num">Costo unitario</th><th></th></tr></thead>
              <tbody>${(p.catalogoOtros || []).map((c, i) => `<tr>
                <td><input class="ci" style="min-width:180px" data-cat="${i}" data-k="descripcion" value="${esc(c.descripcion)}" aria-label="Descripción de la referencia ${i + 1}"></td>
                <td>${unitCombo(`<input class="ci w-xs" data-cat="${i}" data-k="unidad" value="${esc(c.unidad)}" aria-label="Unidad de la referencia ${i + 1}" autocomplete="off">`, 'unidad')}</td>
                <td><input class="ci num w-sm" type="number" step="any" data-t="num" data-cat="${i}" data-k="costoUnitario" value="${esc(c.costoUnitario)}" aria-label="Costo unitario de la referencia ${i + 1}"></td>
                <td class="cell-actions"><button type="button" class="icon-btn del" data-act="del-cat" data-i="${i}" aria-label="Eliminar referencia" title="Eliminar">${ICON.trash}</button></td>
              </tr>`).join('') || '<tr class="empty-row"><td colspan="4">Sin referencias.</td></tr>'}</tbody>
            </table>
          </div>
          <div style="margin-top:12px"><button type="button" class="btn btn-sm" data-act="add-cat">${ICON.plus}Agregar referencia</button></div>
        </section>
        <div class="nota" style="margin:0"><span>¿Estos parámetros son los habituales de QUEMPIN? Guárdalos para que los proyectos nuevos partan con ellos.</span>
          <button type="button" class="btn btn-sm" data-act="save-defaults">Usarlos como predeterminados</button></div>
      </div>
    </div>`;
  }

  function updateCodigoHint() {
    const el = $('#codigo-hint');
    if (!el) return;
    const p = state.project;
    const dup = S.all().find((x) => x.uid !== p.uid && x.codigo === p.codigo && String(x.version) === String(p.version));
    el.textContent = dup ? `⚠ Ya existe otro proyecto ${p.codigo} v${p.version} («${String(dup.titulo || '').slice(0, 40)}»).` : 'Correlativo sugerido automáticamente; puedes editarlo.';
    el.style.color = dup ? 'var(--status-bad)' : '';
  }

  // ---- Partidas -----------------------------------------------------------------
  function viewPartidas() {
    const p = state.project;
    const rows = p.partidas.map((it, i) => {
      const code = 'P' + (i + 1);
      const uLabel = it.utilidadTipo === 'monto' ? 'monto fijo' : `recargo ${nf(num(it.utilidadValor))} %`;
      return `<tr data-row="${it.uid}">
        <td class="code">${code}</td>
        <td>${rowInput('partidas', it, 'descripcion', `Descripción ${code}`, 'desc', false, 'placeholder="Descripción de la partida"')}</td>
        <td>${rowUnit('partidas', it, `unidad ${code}`)}</td>
        <td>${rowInput('partidas', it, 'cantidad', `Cantidad ${code}`, 'w-sm', true)}</td>
        <td class="num calc" data-c="P:${it.uid}:cd" data-fmt="clp"></td>
        <td class="num calc"><span data-c="P:${it.uid}:utilidad" data-fmt="clp"></span><div class="small muted">${esc(uLabel)}</div></td>
        <td class="num calc strong" data-c="P:${it.uid}:precio" data-fmt="clp"></td>
        <td class="num calc" data-c="P:${it.uid}:pu" data-fmt="clp"></td>
        <td class="cell-actions">
          <button type="button" class="icon-btn" data-act="mover" data-list="partidas" data-uid="${it.uid}" data-dir="-1" aria-label="Subir ${code}" title="Subir" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button type="button" class="icon-btn" data-act="mover" data-list="partidas" data-uid="${it.uid}" data-dir="1" aria-label="Bajar ${code}" title="Bajar" ${i === p.partidas.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
          <button type="button" class="icon-btn del" data-act="del-row" data-list="partidas" data-uid="${it.uid}" aria-label="Eliminar ${code}" title="Eliminar partida">${ICON.trash}</button>
        </td>
      </tr>`;
    }).join('');
    return `
      <div class="nota"><span><strong>Partidas:</strong> cada partida agrupa costos. Los ítems de detalle se asocian a una partida y sus cantidades se ingresan <strong>por unidad de partida</strong>. La <strong>utilidad</strong> de cada partida se define en <em>Resumen y KPIs</em>, donde ves su efecto en el margen al instante.</span>
        <button type="button" class="btn btn-sm" data-act="tab" data-tab="resumen" data-focus="util">Definir utilidad →</button></div>
      <div class="tbl-toolbar">
        <div class="left"><button type="button" class="btn btn-primario btn-sm" data-act="add-row" data-list="partidas">${ICON.plus}Agregar partida</button></div>
        <div class="right"><span class="small muted">Las columnas sombreadas se calculan solas.</span></div>
      </div>
      <div class="tabla-contenedor">
        <table class="tbl" style="min-width:900px">
          <thead><tr>
            <th>ID</th><th>Descripción</th><th>Unid.</th><th class="num">Cant.</th>
            <th class="num">Costo directo</th><th class="num">Utilidad</th><th class="num">Precio neto</th><th class="num">Precio unitario</th><th></th>
          </tr></thead>
          <tbody>${rows || '<tr class="empty-row"><td colspan="9">Agrega la primera partida del proyecto.</td></tr>'}</tbody>
          <tfoot><tr>
            <td></td><td colspan="3">Total (${plural(p.partidas.length, 'partida')})</td>
            <td class="num" data-c="T:cd" data-fmt="clp"></td>
            <td class="num" data-c="T:utilidad" data-fmt="clp"></td>
            <td class="num" data-c="T:precioNeto" data-fmt="clp"></td>
            <td></td><td></td>
          </tr></tfoot>
        </table>
      </div>`;
  }

  // ---- Detalle: materiales, equipos, otros ------------------------------------------
  function partidaPicker(list, it) {
    const pt = state.partIdx.get(it.partida);
    const tieneDatos = String(it.descripcion || '').trim() || num(it.costoUnitario) > 0 || num(it.n1p) + num(it.n2p) + num(it.n3p) > 0;
    const full = pt ? `${pt.code} · ${pt.descripcion || 'Sin descripción'}` : 'Sin partida';
    return `<button type="button" class="picker ${!pt && tieneDatos ? 'error' : ''}" data-picker="partida" data-list="${list}" data-uid="${it.uid}" aria-haspopup="listbox" aria-expanded="false" aria-label="Partida asociada: ${esc(full)}" title="${esc(full)}">
      ${pt ? `<span class="pcode">${pt.code}</span><span class="txt">${esc(pt.descripcion || 'Sin descripción')}</span>` : '<span class="pcode none">—</span><span class="txt muted">Sin partida</span>'}${ICON.chev}</button>`;
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
      <div class="right">
        <div class="filtro"><label for="filtro-${key}">Mostrar</label>
          <select id="filtro-${key}" data-filtro="${key}" class="${f ? 'is-set' : ''}">
            <option value="">Todas las partidas</option>
            ${p.partidas.map((pt, i) => `<option value="${pt.uid}" ${f === pt.uid ? 'selected' : ''}>P${i + 1} · ${esc(pt.descripcion || 'Sin descripción')}</option>`).join('')}
            <option value="__none__" ${f === '__none__' ? 'selected' : ''}>Ítems sin partida asociada</option>
          </select></div>
      </div>
    </div>`;
  }
  function filtered(key) {
    const f = state.filtro[key];
    return state.project[key].filter((it) => !f || (f === '__none__' ? !state.partIdx.has(it.partida) : it.partida === f));
  }
  function sinPartidasNote() {
    return state.project.partidas.length ? '' :
      `<div class="nota"><span>Todavía no hay partidas. Los costos deben asociarse a una partida para sumarse al proyecto.</span><button type="button" class="btn btn-sm" data-act="tab" data-tab="partidas">Ir a Partidas →</button></div>`;
  }

  function viewDetalle(key) {
    const cfg = DETALLE[key];
    const items = filtered(key);
    const rows = items.map((it) => {
      const ln = state.lineIdx.get(it.uid);
      const code = ln ? ln.code : '';
      return `<tr data-row="${it.uid}">
        <td class="code">${code}</td>
        <td>${rowInput(key, it, 'descripcion', `Descripción ${code}`, 'desc', false, `placeholder="Descripción del ${cfg.singular}"`)}</td>
        <td>${partidaPicker(key, it)}</td>
        <td>${rowUnit(key, it, `unidad ${code}`)}</td>
        <td>${rowInput(key, it, 'cantidad', `Cantidad ${code}`, 'w-sm', true)}</td>
        <td>${rowInput(key, it, 'costoUnitario', `Costo unitario ${code}`, 'w-md', true)}</td>
        <td class="num calc" data-c="L:${key}:${it.uid}:qtyPartida" data-fmt="num"></td>
        <td class="num calc strong" data-c="L:${key}:${it.uid}:subtotal" data-fmt="clp"></td>
        <td class="cell-actions">
          <button type="button" class="icon-btn" data-act="dup-row" data-list="${key}" data-uid="${it.uid}" aria-label="Duplicar ${code}" title="Duplicar fila">${ICON.copy}</button>
          <button type="button" class="icon-btn del" data-act="del-row" data-list="${key}" data-uid="${it.uid}" aria-label="Eliminar ${code}" title="Eliminar">${ICON.trash}</button>
        </td>
      </tr>`;
    }).join('');
    return `${sinPartidasNote()}
      <div class="nota"><span><strong>${cfg.titulo}:</strong> Subtotal = Cant. de la partida × Cantidad por unidad de partida × Costo unitario. Ejemplo: si la partida son 3 medidores y cada uno lleva 2 flanges, ingresa 2.</span></div>
      ${filtroBar(key)}
      <div class="tabla-contenedor">
        <table class="tbl" style="min-width:980px">
          <thead><tr>
            <th>ID</th><th>Descripción</th><th>Partida</th><th>Unid.</th>
            <th class="num">Cant.<span class="th-sub">por unid. de partida</span></th><th class="num">Costo unitario</th>
            <th class="num">Cant. partida</th><th class="num">Subtotal</th><th></th>
          </tr></thead>
          <tbody>${rows || `<tr class="empty-row"><td colspan="9">${state.filtro[key] ? 'No hay ítems con este filtro.' : `Sin ${cfg.titulo.toLowerCase()} registrados.`}</td></tr>`}</tbody>
          <tfoot><tr><td></td><td colspan="6"><span class="swatch ${cfg.cat}" style="vertical-align:-1px;margin-right:8px"></span>Total ${cfg.titulo.toLowerCase()} del proyecto</td><td class="num" data-c="T:${cfg.total}" data-fmt="clp"></td><td></td></tr></tfoot>
        </table>
      </div>`;
  }

  // ---- Mano de obra --------------------------------------------------------------
  function viewManoObra() {
    const key = 'manoObra';
    const par = state.project.parametros;
    const items = filtered(key);
    const rows = items.map((it) => {
      const ln = state.lineIdx.get(it.uid);
      const code = ln ? ln.code : '';
      const lv = (n) => `<td>${rowInput(key, it, `n${n}p`, `Personal nivel ${n} ${code}`, 'w-xxs', true)}</td><td>${rowInput(key, it, `n${n}d`, `Días nivel ${n} ${code}`, 'w-xxs', true)}</td>`;
      return `<tr data-row="${it.uid}">
        <td class="code">${code}</td>
        <td>${rowInput(key, it, 'descripcion', `Tarea ${code}`, 'desc', false, 'placeholder="Descripción de la tarea"')}</td>
        <td>${partidaPicker(key, it)}</td>
        ${lv(1)}${lv(2)}${lv(3)}
        <td class="num calc" data-c="L:${key}:${it.uid}:dhPorUnidadPartida" data-fmt="num"></td>
        <td class="num calc" data-c="L:${key}:${it.uid}:qtyPartida" data-fmt="num"></td>
        <td class="num calc" data-c="L:${key}:${it.uid}:dh" data-fmt="num"></td>
        <td class="num calc strong" data-c="L:${key}:${it.uid}:subtotal" data-fmt="clp"></td>
        <td class="cell-actions">
          <button type="button" class="icon-btn" data-act="dup-row" data-list="${key}" data-uid="${it.uid}" aria-label="Duplicar ${code}" title="Duplicar fila">${ICON.copy}</button>
          <button type="button" class="icon-btn del" data-act="del-row" data-list="${key}" data-uid="${it.uid}" aria-label="Eliminar ${code}" title="Eliminar">${ICON.trash}</button>
        </td>
      </tr>`;
    }).join('');
    const nivel = (n, t) => `<th colspan="2" class="group-th">Nivel ${n}<span class="th-sub">${clp(num(t))} / día-hombre</span></th>`;
    return `${sinPartidasNote()}
      <div class="nota"><span><strong>Mano de obra:</strong> personas y días <strong>por unidad de partida</strong>. Días-Hombre = Cant. partida × Σ(personas × días). Subtotal = Cant. partida × Σ(personas × días × tarifa del nivel).</span>
        <button type="button" class="btn btn-sm" data-act="tab" data-tab="ficha">Editar tarifas</button></div>
      ${filtroBar(key)}
      <div class="tabla-contenedor">
        <table class="tbl mo" style="min-width:1080px">
          <thead>
            <tr><th rowspan="2">ID</th><th rowspan="2">Tarea</th><th rowspan="2">Partida</th>${nivel(1, par.tarifaN1)}${nivel(2, par.tarifaN2)}${nivel(3, par.tarifaN3)}
              <th rowspan="2" class="num">DH<span class="th-sub">por unid.</span></th><th rowspan="2" class="num">Cant. partida</th><th rowspan="2" class="num">Días-Hombre</th><th rowspan="2" class="num">Subtotal</th><th rowspan="2"></th></tr>
            <tr><th>Pers.</th><th>Días</th><th>Pers.</th><th>Días</th><th>Pers.</th><th>Días</th></tr>
          </thead>
          <tbody>${rows || `<tr class="empty-row"><td colspan="14">${state.filtro[key] ? 'No hay tareas con este filtro.' : 'Sin tareas de mano de obra registradas.'}</td></tr>`}</tbody>
          <tfoot><tr><td></td><td colspan="10"><span class="swatch cat-mo" style="vertical-align:-1px;margin-right:8px"></span>Total mano de obra · costo promedio por DH: <span data-c="K:costoMODH" data-fmt="clp"></span></td>
            <td class="num" data-c="T:dh" data-fmt="num"></td><td class="num" data-c="T:mo" data-fmt="clp"></td><td></td></tr></tfoot>
        </table>
      </div>`;
  }

  // ---- Resumen y KPIs -------------------------------------------------------------
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
  const SEM = { ok: 'sem-ok', warn: 'sem-warn', bad: 'sem-bad' };
  const TILE = { ok: 'ok', warn: 'alerta', bad: 'critico' };

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

  function viewResumen() {
    const p = state.project;
    const par = p.parametros;
    const s = par.sensibilidad;
    const mObj = num(par.margenObjetivo);
    const sensRow = (k, label, cls) => `<div class="sens-row">
        <label for="sens-${k}"><span class="swatch ${cls}"></span>${label}</label>
        <input type="range" min="-20" max="50" step="1" data-f="parametros.sensibilidad.${k}" data-t="num" data-sync="sens-${k}" value="${esc(num(s[k]))}" aria-label="Variación de ${label}">
        <div class="input-affix"><input class="input" id="sens-${k}" type="number" step="any" data-f="parametros.sensibilidad.${k}" data-t="num" data-sync="sens-${k}" value="${esc(num(s[k]))}"><span class="affix">%</span></div>
      </div>`;
    const utilRows = p.partidas.map((it, i) => {
      const code = 'P' + (i + 1);
      const isPct = it.utilidadTipo !== 'monto';
      return `<tr data-row="${it.uid}">
        <td><div class="pnom"><span class="pcode">${code}</span><div style="min-width:0"><div class="t">${esc(it.descripcion || 'Partida sin descripción')}</div>
          <div class="s">${esc(nf(num(it.cantidad)))} ${esc(it.unidad || '')} · costo directo <span data-c="P:${it.uid}:cd" data-fmt="clp"></span></div></div></div></td>
        <td><div class="util-edit">
          ${seg(`ut-${it.uid}`, [{ v: 'pct', l: '%', checked: isPct }, { v: 'monto', l: '$', checked: !isPct }], { label: `Tipo de utilidad ${code}`, data: `data-list="partidas" data-uid="${it.uid}" data-k="utilidadTipo" data-rerender` }, 'sm')}
          ${rowInput('partidas', it, 'utilidadValor', `Utilidad ${code} ${isPct ? 'en % de recargo' : 'en pesos'}`, 'num', true, `placeholder="${isPct ? '%' : '$'}"`)}
        </div></td>
        <td class="num calc" data-c="P:${it.uid}:utilidad" data-fmt="clp"></td>
        <td class="num calc"><span class="dot na" data-sem-p="${it.uid}" aria-hidden="true"></span><span data-c="P:${it.uid}:margen" data-fmt="pct"></span></td>
      </tr>`;
    }).join('');
    return `
      <div class="print-only print-head">
        <img src="assets/logo-quempin.png" alt="QUEMPIN Soluciones Energéticas">
        <div style="text-align:right"><b>${esc(p.codigo)} · v${esc(p.version)}</b><br>${esc(p.titulo)}<br>${esc([p.cliente, p.responsable, fechaCorta(p.fecha)].filter(Boolean).join(' · '))}</div>
      </div>
      <div id="res-aviso"></div>

      <section class="section section-first">
        <div class="section-head"><h3 class="seccion-titulo">Precio de la oferta</h3><p>Cómo se forma, en pesos chilenos (CLP).</p></div>
        <div class="eq" id="res-top"></div>
      </section>

      <section class="section" id="utilidad">
        <div class="section-head"><h3 class="seccion-titulo">Utilidad y valores por partida</h3><span class="en-vivo">Se actualizan al escribir</span></div>
        <div class="calc-layout">
          <div class="calc-entradas">
            <div class="tabla-contenedor">
              <div class="util-quick no-print">
                <span class="lbl">Recargo para todas</span>
                <div class="input-affix"><input class="input" id="util-all" type="number" step="any" placeholder="100" aria-label="Recargo en % a aplicar a todas las partidas"><span class="affix">%</span></div>
                <button type="button" class="btn btn-sm" data-act="apply-util" ${p.partidas.length ? '' : 'disabled'}>Aplicar</button>
                <span class="grupo-btn">
                  <button type="button" class="btn btn-sm" data-act="util-objetivo" ${p.partidas.length ? '' : 'disabled'} data-tip="Calcula el recargo que deja el margen sobre venta exactamente en el objetivo definido en Ficha y parámetros, y lo aplica a todas las partidas.">${ICON.target}Llevar al margen objetivo (${esc(nf(mObj))} %)</button>
                  <button type="button" class="btn btn-sm" id="util-undo" data-act="util-deshacer" aria-disabled="true">${ICON.restore}Deshacer</button>
                </span>
              </div>
              <table class="tbl util-tbl">
                <thead><tr><th>Partida</th><th>Utilidad<span class="th-sub">% de recargo sobre su costo o $ fijo</span></th><th class="num">Utilidad $</th><th class="num">Margen</th></tr></thead>
                <tbody>${utilRows || '<tr class="empty-row"><td colspan="4">Aún no hay partidas. <button type="button" class="link-btn" data-act="tab" data-tab="partidas">Crear la primera partida</button></td></tr>'}</tbody>
                <tfoot><tr><td>Total</td><td class="small muted" style="font-weight:400">Recargo promedio <span data-c="K:markup" data-fmt="pct"></span></td>
                  <td class="num" data-c="T:utilidad" data-fmt="clp"></td><td class="num" data-c="K:margen" data-fmt="pct"></td></tr></tfoot>
              </table>
            </div>
            <div class="eval" id="res-eval"></div>
            <p class="small muted" style="margin:10px 2px 0">Un recargo de 100 % sobre el costo equivale a un margen de 50 % sobre la venta. Al cambiar entre % y $ se conserva el monto de utilidad.</p>
          </div>
          <aside class="calc-resultados" id="res-precio" aria-label="Valores por partida para la cotización"></aside>
        </div>
      </section>

      <section class="section" id="indicadores">
        <div class="section-head"><h3 class="seccion-titulo">Indicadores de evaluación</h3><p>Abre «Qué mide y cómo aporta» en cada tarjeta, o revisa la <a href="#/guia">Guía de KPIs</a>.</p></div>
        <div id="res-kpis"></div>
      </section>

      <section class="section" id="sensibilidad">
        <div class="section-head"><h3 class="seccion-titulo">Sensibilidad: ¿cuánto sobrecosto resiste la oferta?</h3><p>Simula alzas de costo manteniendo el precio ofertado.</p></div>
        <div class="calc-layout parejo">
          <div class="panel">
            ${sensRow('mat', 'Materiales', 'cat-mat')}${sensRow('eq', 'Equipos', 'cat-eq')}${sensRow('mo', 'Mano de obra', 'cat-mo')}${sensRow('otros', 'Otros', 'cat-otros')}
            <button type="button" class="btn btn-sm no-print" data-act="sens-reset">Restablecer (MO +10 %)</button>
          </div>
          <div id="res-sens"></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h3 class="seccion-titulo">Composición del precio</h3><p>Qué parte del precio neto es costo y qué parte es utilidad.</p></div>
        <div class="grid-2 iguales">
          <div class="panel"><h4 class="panel-t">Proyecto completo</h4><div id="res-comp"></div></div>
          <div class="panel"><h4 class="panel-t">Por partida</h4><div id="res-pbar"></div></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h3 class="seccion-titulo">Detalle por partida</h3><p>Despliega una partida para ver su análisis de precio unitario.</p></div>
        <div id="res-partidas"></div>
      </section>

      <section class="section" id="alertas">
        <div class="section-head"><h3 class="seccion-titulo">Alertas de validación</h3><p>Revisiones automáticas que en el Excel pasaban inadvertidas.</p></div>
        <div id="res-alerts"></div>
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

  function refreshResumen() {
    const r = state.result;
    const t = r.totals, k = r.kpis, st = r.status;
    const par = state.project.parametros;
    const hasGG = t.gg > 0 || t.imp > 0 || num(par.gastosGenerales) > 0 || num(par.imprevistos) > 0;
    const mObj = num(par.margenObjetivo) / 100, mMin = num(par.margenMinimo) / 100;
    const meta = num(par.metaUtilidadDH);
    const pctShort = (x) => pct(x).replace(',0 ', ' ');
    const semMargen = (m) => (!ok(m) ? 'na' : m >= mObj ? 'ok' : m >= mMin ? 'warn' : 'bad');
    const ws = r.warnings;

    // Aviso arriba cuando hay alertas (el detalle sigue al final)
    const nErr = ws.filter((w) => w.level === 'error').length;
    const nWarn = ws.filter((w) => w.level === 'warn').length;
    $('#res-aviso').innerHTML = nErr || nWarn ? `<div class="aviso ${nErr ? 'bad' : 'warn'} no-print">
        <span class="ico" aria-hidden="true">${nErr ? '✖' : '▲'}</span>
        <span class="motivo">${nErr
          ? `<b>${plural(nErr, 'error', 'errores')}:</b> hay costos que no se están sumando al precio${nWarn ? ` (y ${plural(nWarn, 'aviso')})` : ''}.`
          : `<b>${plural(nWarn, 'aviso')}</b> por revisar.`} Revísalos antes de copiar los valores a la cotización.</span>
        <button type="button" class="ir" data-act="scroll" data-to="alertas">Ver alertas →</button>
      </div>` : '';

    // Precio de la oferta: costo + utilidad = neto; neto + IVA = precio con IVA
    const eqCard = (cls, label, value, sub, tipText) => `<div class="eq-card ${cls}">
        <div class="l">${label}${tipText ? info(tipText) : ''}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    const op = (c) => `<span class="eq-op" aria-hidden="true">${c}</span>`;
    $('#res-top').innerHTML = [
      eqCard('', 'Costo directo', clp(t.cd), 'Materiales, equipos, MO y otros', KP.byKey.cd.queMide),
      hasGG ? op('+') + eqCard('', 'GG e imprevistos', clp(t.gg + t.imp), `${nf(num(par.gastosGenerales))} % + ${nf(num(par.imprevistos))} % del costo directo`, KP.byKey.costoTotal.queMide) : '',
      op('+'), eqCard('util', 'Utilidad', clp(t.utilidad), `Recargo de ${pct(k.markup)} sobre el costo${hasGG ? ' total' : ''}`, KP.byKey.utilidad.queMide),
      op('='), eqCard('hero', 'Precio de venta neto', clp(t.precioNeto), 'Sin IVA: el monto a ofertar', KP.byKey.precioNeto.queMide),
      op('+'), eqCard('', `IVA ${nf(num(par.iva))} %`, clp(t.iva), 'No es ingreso de la empresa', KP.byKey.iva.queMide),
      op('='), eqCard('', 'Precio con IVA', clp(t.precioBruto), 'Lo que paga el cliente', KP.byKey.precioBruto.queMide)
    ].join('');

    // Semáforo de margen por partida (contra las metas del proyecto)
    $$('[data-sem-p]', app).forEach((el) => {
      const pt = state.partIdx.get(el.dataset.semP);
      el.className = 'dot ' + semMargen(pt && pt.precio ? pt.utilidad / pt.precio : null);
    });
    pintarDeshacer();

    // Evaluación inmediata bajo la tabla de utilidad: margen y competitividad
    const medMargen = (extra) => medidor(Object.assign({ v: Math.max(0, k.margen), max: Math.max(0.6, Math.ceil((k.margen + 0.05) * 10) / 10), fill: st.margen, fmt: pctShort, label: 'Margen frente a las metas',
      ticks: [{ at: mMin, dash: true, show: true, tip: `Mínimo ${pct(mMin)}` }, { at: mObj, show: true, tip: `Objetivo ${pct(mObj)}` }] }, extra));
    const um = num(par.umbralAjustado || 95) / 100;
    const medComp = () => medidor({ v: k.competitividad, max: Math.max(1.2, Math.ceil(k.competitividad * 10) / 10), fill: st.competitividad, fmt: pctShort, label: 'Competitividad frente al presupuesto',
      ticks: [{ at: um, dash: true, tip: `Ajustada desde ${pct(um)}` }, { at: 1, show: true, tip: '100 % del presupuesto' }] });
    const compEval = k.competitividad === null
      ? `<div class="eval-item s-na"><div class="eval-top"><span class="eval-n">Competitividad</span>${chip('na', 'competitividad')}</div>
          <p class="eval-txt">Ingresa el presupuesto del mandante en <button type="button" class="link-btn" data-act="tab" data-tab="ficha">Ficha y parámetros</button> para saber si la oferta cabe.</p></div>`
      : `<div class="eval-item s-${st.competitividad}"><div class="eval-top"><span class="eval-n">Competitividad</span>${chip(st.competitividad, 'competitividad')}</div>
          <div class="eval-v">${pct(k.competitividad)}<span class="eval-sub">de ${clp(k.presupuesto)}${par.presupuestoIncluyeIva ? ' (con IVA)' : ''}</span></div>${medComp()}</div>`;
    $('#res-eval').innerHTML = `<div class="eval-item s-${st.margen}"><div class="eval-top"><span class="eval-n">Margen sobre venta</span>${chip(st.margen, 'margen')}</div>
        <div class="eval-v">${pct(k.margen)}<span class="eval-sub">objetivo ${pctShort(mObj)} · mínimo ${pctShort(mMin)}</span></div>${ok(k.margen) ? medMargen() : ''}</div>${compEval}`;

    // Valores por partida, antes de IVA, con botón para copiar cada monto
    const cot = cotizacion();
    const filasCot = cot.lineas.map(({ pt, pu, total }) => `<li>
        <span class="pcode">${pt.code}</span>
        <div class="cotiz-nom"><div class="t ${pt.descripcion ? '' : 'muted'}">${esc(pt.descripcion || 'Partida sin descripción')}</div>
          <div class="s">${esc(nf(pt.cantidad))} ${esc(pt.unidad)}${pu !== null && pt.cantidad !== 1
            ? ` × <button type="button" class="copiar-txt" data-act="copiar" data-v="${pu}" data-lbl="${pt.code} · precio unitario" aria-label="Copiar precio unitario de ${pt.code}" data-tip="<b>Copiar precio unitario de ${pt.code}</b>Se copia como número sin formato: ${pu}">${clp(pu)}</button> c/u` : ''}</div></div>
        <div class="cotiz-v">${clp(total)}</div>
        ${btnCopiar(total, `${pt.code} · total neto`)}
      </li>`).join('');
    $('#res-precio').innerHTML = `<div class="panel cotiz">
        <div class="cotiz-head">
          <div><h3 class="seccion-titulo">Valores por partida</h3><p class="cotiz-sub">Neto, antes de IVA · para la cotización</p></div>
          <button type="button" class="btn btn-sm no-print" data-act="copiar-tabla" ${cot.lineas.length ? '' : 'disabled'} data-tip="<b>Copiar la tabla completa</b>Partidas, cantidades, precios unitarios y totales, lista para pegar en Excel o Word.">${ICON.copy}Copiar tabla</button>
        </div>
        ${cot.lineas.length ? `<ul class="cotiz-list">${filasCot}</ul>` : '<p class="small muted" style="margin:10px 0">Aún no hay partidas.</p>'}
        <div class="cotiz-tot">
          <div class="fila principal"><span>Total neto</span><span class="v">${clp(cot.neto)}</span>${btnCopiar(cot.neto, 'total neto')}</div>
          <div class="fila"><span>IVA ${nf(num(par.iva))} %</span><span class="v">${clp(cot.iva)}</span>${btnCopiar(cot.iva, 'IVA')}</div>
          <div class="fila"><span>Total con IVA</span><span class="v">${clp(cot.bruto)}</span>${btnCopiar(cot.bruto, 'total con IVA')}</div>
        </div>
        ${cot.dif ? `<p class="cotiz-nota">Montos redondeados a pesos por partida (cantidad × precio unitario), por eso difieren en ${clp(Math.abs(cot.dif))} del precio calculado.</p>` : ''}
      </div>`;

    // Indicadores de evaluación, agrupados
    const kpiCard = (key, value, unit, statusKey, reading, extra) => {
      const d = KP.byKey[key];
      const s = st[statusKey || key] || 'info';
      const open = state.kpiOpen.has(key);
      const origen = d.origen === 'Nuevo' ? 'Indicador nuevo: no existía en el Excel original.' : `En el Excel original: ${esc(d.origen)}.`;
      return `<article class="kpi s-${s}">
        <div class="kpi-top"><div class="kpi-name">${d.nombre}</div>${chip(s, statusKey || key)}</div>
        <div class="kpi-value">${value}${unit ? `<span class="unit">${unit}</span>` : ''}</div>
        ${extra || ''}
        <div class="kpi-read">${reading}</div>
        <details data-kpi="${key}" ${open ? 'open' : ''}><summary>Qué mide y cómo aporta</summary>
          <p><span class="formula">${esc(d.formula)}</span></p>
          <p><strong>Qué mide:</strong> ${esc(d.queMide)}</p>
          <p><strong>Cómo aporta:</strong> ${esc(d.aporte)}</p>
          ${d.lectura ? `<p class="muted">${esc(d.lectura)}</p>` : ''}
          <p class="kpi-origin">${origen}</p>
        </details>
      </article>`;
    };
    // Metas de recargo equivalentes a las de margen: r = m / (1 − m)
    const rMin = mMin < 1 ? mMin / (1 - mMin) : null, rObj = mObj < 1 ? mObj / (1 - mObj) : null;
    const compRead = k.competitividad === null
      ? 'Ingresa el presupuesto máximo del mandante en Ficha y parámetros para evaluar la oferta.'
      : `La oferta ${par.presupuestoIncluyeIva ? 'con IVA' : 'neta'} (${clp(k.precioComparable)}) equivale al ${pct(k.competitividad)} del presupuesto de ${clp(k.presupuesto)}.`;
    const sv = par.sensibilidad || {};
    const SENS_N = { mat: 'materiales', eq: 'equipos', mo: 'MO', otros: 'otros' };
    const escenario = Object.keys(SENS_N).filter((x) => num(sv[x]) !== 0).map((x) => `${SENS_N[x]} ${num(sv[x]) > 0 ? '+' : ''}${nf(num(sv[x]))} %`);
    const grupo = (titulo, cards) => `<div class="kpi-grupo"><div class="kpi-grupo-t">${titulo}</div><div class="kpi-grid">${cards.join('')}</div></div>`;
    $('#res-kpis').innerHTML = [
      grupo('Rentabilidad', [
        kpiCard('margen', pct(k.margen), '', 'margen',
          ok(k.margen) ? `De cada $100 vendidos quedan $${fNum.format(Math.round(k.margen * 1000) / 10)} de utilidad.` : 'Sin ventas aún.',
          ok(k.margen) ? medMargen() : ''),
        kpiCard('markup', pct(k.markup), '', 'markup',
          ok(k.markup) ? `Los costos pueden subir hasta ${pct(k.markup)} antes de que el proyecto pierda dinero.` : '—',
          ok(k.markup) && rObj !== null ? medidor({ v: Math.max(0, k.markup), max: Math.max(rObj * 1.5, Math.ceil((k.markup + 0.1) * 10) / 10), fill: st.markup, fmt: pctShort, label: 'Recargo frente a las metas',
            ticks: [{ at: rMin, dash: true, show: true, tip: `Equivale al margen mínimo: ${pct(rMin)}` }, { at: rObj, show: true, tip: `Equivale al margen objetivo: ${pct(rObj)}` }] }) : ''),
        kpiCard('rentDH', clp(k.rentDH), '/ DH', 'rentDH',
          ok(k.rentDH) ? `Venta por día-hombre: ${clp(k.ventaDH)}.${meta > 0 ? ` Meta: ${clp(meta)}.` : ' Define una meta en Ficha y parámetros para activar el semáforo.'}` : 'No hay días-hombre registrados.',
          ok(k.rentDH) && meta > 0 ? medidor({ v: k.rentDH, max: Math.max(meta * 1.5, k.rentDH * 1.1), fill: st.rentDH, fmt: (x) => clp(x), label: 'Utilidad por DH frente a la meta',
            ticks: [{ at: meta * 0.8, dash: true, tip: `80 % de la meta: ${clp(meta * 0.8)}` }, { at: meta, show: true, tip: `Meta ${clp(meta)}` }] }) : '')
      ]),
      grupo('Mano de obra', [
        kpiCard('dh', nf(k.dh), 'DH', 'dh',
          k.dh ? `Costo promedio de mano de obra: ${clp(k.costoMODH)} por día-hombre.` : 'Registra tareas en Mano de obra.'),
        kpiCard('incidenciaMO', pct(k.incidenciaMO), '', 'incidenciaMO',
          ok(k.incidenciaMO) ? `La MO es ${pct(k.incidenciaMO)} del precio y ${pct(t.cd ? t.mo / t.cd : null)} del costo directo.` : '—',
          ok(k.incidenciaMO) ? `<div class="stack barra-kpi" role="img" aria-label="Peso de la mano de obra en el precio">${k.incidenciaMO > 0 ? `<div class="seg cat-mo" style="flex:${k.incidenciaMO} 1 0"></div>` : ''}<div class="seg resto" style="flex:${Math.max(0, 1 - k.incidenciaMO)} 1 0"></div></div>` : ''),
        kpiCard('holguraMO', pct(k.holguraMO), '', 'holguraMO',
          ok(k.holguraMO) ? `Si la mano de obra cuesta más de ${pct(k.holguraMO)} sobre lo presupuestado, el proyecto pierde dinero.` : 'No hay costo de mano de obra.')
      ]),
      grupo('Frente al mandante y al riesgo', [
        kpiCard('competitividad', k.competitividad === null ? '—' : pct(k.competitividad), '', 'competitividad', compRead,
          k.competitividad === null ? '' : medComp()),
        kpiCard('sensibilidad', pct(k.sensVarUtilidad), '', 'sensibilidad',
          (escenario.length && ok(k.sensVarUtilidad)
            ? `Con ${esc(escenario.join(', '))} la utilidad queda en ${clp(k.sensUtilidad)} y el margen en ${pct(k.sensMargen)}.`
            : 'No hay alzas de costo simuladas.') + ` <button type="button" class="link-btn no-print" data-act="scroll" data-to="sensibilidad">Ajustar escenario</button>`)
      ])
    ].join('');

    // Sensibilidad: oferta actual frente al escenario simulado
    const sd = KP.byKey.sensibilidad;
    const signo = (v, f) => (!ok(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${f(Math.abs(v))}`);
    const dMargen = ok(k.sensMargen) && ok(k.margen) ? Math.round((k.sensMargen - k.margen) * 1000) / 10 : null;
    $('#res-sens').innerHTML = `<div class="panel">
        <table class="comp-tbl">
          <thead><tr><th></th><th class="num">Oferta actual</th><th class="num">Con el escenario</th><th class="num">Diferencia</th></tr></thead>
          <tbody>
            <tr><td>Precio neto</td><td class="num">${clp(t.precioNeto)}</td><td class="num">${clp(t.precioNeto)}</td><td class="num muted">Se mantiene</td></tr>
            <tr><td>Costo total</td><td class="num">${clp(t.costoTotal)}</td><td class="num">${clp(t.costoTotal + k.sensDeltaCosto)}</td><td class="num">${signo(k.sensDeltaCosto, clp)}</td></tr>
            <tr><td>Utilidad</td><td class="num">${clp(t.utilidad)}</td><td class="num">${clp(k.sensUtilidad)}</td><td class="num">${signo(k.sensVarUtilidad, pct)}</td></tr>
            <tr class="clave"><td>Margen sobre venta</td><td class="num">${pct(k.margen)}</td><td class="num tone-${st.sensibilidad}">${pct(k.sensMargen)}</td><td class="num">${dMargen === null ? '—' : signo(dMargen, (x) => `${nf(x)} pts`)}</td></tr>
          </tbody>
        </table>
        <p class="sens-lectura">${chip(st.sensibilidad, 'sensibilidad')}<span>${esc(sd.lectura)}</span></p>
      </div>`;

    // Composición del precio: proyecto completo
    const segs = [
      { ...CATS[0], v: t.mat }, { ...CATS[1], v: t.eq }, { ...CATS[2], v: t.mo }, { ...CATS[3], v: t.otros },
      { ...CATS[4], v: t.gg + t.imp }, { ...CATS[5], v: t.utilidad }
    ].filter((sg) => sg.k !== 'gg' || hasGG);
    const base = segs.reduce((a, sg) => a + Math.max(0, sg.v), 0);
    const bar = base > 0 ? `<div class="stack lg" role="img" aria-label="Composición del precio neto">${segs.filter((sg) => sg.v > 0).map((sg) =>
      `<div class="seg ${sg.cls}" style="flex:${sg.v} 1 0" data-tip="<b>${esc(sg.n)}</b>${esc(clp(sg.v))} · ${esc(pct(t.precioNeto ? sg.v / t.precioNeto : null))} del precio neto"></div>`).join('')}</div>` : '';
    $('#res-comp').innerHTML = base > 0 ? `${bar}
      <table class="leyenda"><tbody>${segs.map((sg) => `<tr class="${sg.v ? '' : 'cero'}"><td><span class="nombre"><span class="swatch ${sg.cls}"></span>${sg.n}</span></td><td class="num">${clp(sg.v)}</td><td class="num" style="width:70px">${pct(t.precioNeto ? sg.v / t.precioNeto : null)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Precio de venta neto</td><td class="num">${clp(t.precioNeto)}</td><td class="num">${t.precioNeto ? '100,0 %' : '—'}</td></tr></tfoot></table>
      ${t.utilidad < 0 ? '<p class="small tone-bad" style="margin:8px 0 0;font-weight:700">La utilidad es negativa: el precio no cubre los costos.</p>' : ''}`
      : '<p class="small muted" style="margin:0">Agrega partidas y costos para ver la composición del precio.</p>';

    // Composición del precio: por partida, con la misma paleta
    const maxP = r.partidas.reduce((a, pt) => Math.max(a, pt.precio), 0);
    $('#res-pbar').innerHTML = r.partidas.length && maxP > 0 ? r.partidas.map((pt) => {
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
    }).join('') : '<p class="small muted" style="margin:0">Agrega partidas con costos para comparar su precio.</p>';

    // Detalle por partida (con APU)
    const rowsP = r.partidas.map((pt) => {
      const open = state.apuOpen.has(pt.uid);
      const apu = open ? `<tr class="apu-row"><td colspan="13"><div class="apu-panel">${apuTable(pt)}</div></td></tr>` : '';
      return `<tr>
        <td><button type="button" class="apu-toggle" data-act="apu" data-uid="${pt.uid}" aria-expanded="${open}" aria-label="Ver análisis de precio de ${pt.code}">${ICON.chevR}</button></td>
        <td class="code">${pt.code}</td><td>${esc(pt.descripcion || '—')}</td><td class="num">${nf(pt.cantidad)} ${esc(pt.unidad)}</td>
        <td class="num">${clp(pt.mat)}</td><td class="num">${clp(pt.eq)}</td><td class="num">${clp(pt.mo)}</td><td class="num">${clp(pt.otros)}</td>
        <td class="num"><b>${clp(pt.cd)}</b></td><td class="num">${clp(pt.utilidad)}</td><td class="num"><b>${clp(pt.precio)}</b></td>
        <td class="num">${clp(pt.pu)}</td><td class="num">${pct(pt.pctPrecio)}</td>
      </tr>${apu}`;
    }).join('');
    const th = (c, l) => `<th class="num"><span class="swatch ${c}" style="width:9px;height:9px;margin-right:5px;vertical-align:0"></span>${l}</th>`;
    $('#res-partidas').innerHTML = `<div class="tabla-contenedor"><table class="tbl" style="min-width:1060px">
      <thead><tr><th></th><th>ID</th><th>Partida</th><th class="num">Cant.</th>${th('cat-mat', 'Materiales')}${th('cat-eq', 'Equipos')}${th('cat-mo', 'Mano de obra')}${th('cat-otros', 'Otros')}
        <th class="num">Costo directo</th>${th('cat-util', 'Utilidad')}<th class="num">Precio neto</th><th class="num">Precio unit.</th><th class="num">% precio</th></tr></thead>
      <tbody>${rowsP || '<tr class="empty-row"><td colspan="13">Sin partidas.</td></tr>'}</tbody>
      <tfoot><tr><td></td><td></td><td colspan="2">Total</td><td class="num">${clp(t.mat)}</td><td class="num">${clp(t.eq)}</td><td class="num">${clp(t.mo)}</td><td class="num">${clp(t.otros)}</td>
        <td class="num">${clp(t.cd)}</td><td class="num">${clp(t.utilidad)}</td><td class="num">${clp(t.precioNeto)}</td><td></td><td class="num">${t.precioNeto ? '100,0 %' : '—'}</td></tr></tfoot>
    </table></div>`;

    // Alertas
    const tabLabel = (id) => (TABS.find((x) => x.id === id) || {}).label || id;
    $('#res-alerts').innerHTML = ws.length ? `<ul class="lista-atencion">${ws.map((w) => `
      <li><span class="marca ${w.level}" aria-hidden="true"></span><span class="motivo"><span class="visualmente-oculto">${w.level === 'error' ? 'Error: ' : 'Aviso: '}</span>${esc(w.msg)}</span>
      ${w.tab ? `<button type="button" class="ir no-print" data-act="ir" data-tab="${w.tab}" data-uid="${w.uid || ''}">${w.tab === 'resumen' ? 'Definir utilidad' : `Ir a ${esc(tabLabel(w.tab))}`} →</button>` : ''}</li>`).join('')}</ul>`
      : '<p class="vacio-ok">✔ Sin alertas: todos los costos están asociados a una partida y tienen valores.</p>';
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
          ? `${nf(l.dhPorUnidadPartida)} DH por unidad`
          : `${nf(num(it.cantidad))} ${esc(it.unidad || '')} × ${clp(num(it.costoUnitario))}`;
        return `<tr><td class="code">${l.code}</td><td>${esc(l.descripcion || '—')}</td><td>${det}</td><td class="num">${clp(l.costoPorUnidadPartida)} / unid.</td><td class="num">${clp(l.subtotal)}</td></tr>`;
      }).join('');
    }).join('');
    return body ? `<table class="apu-table"><thead><tr><th>ID</th><th>Ítem</th><th>Cantidad por unidad de partida</th><th class="num">Costo por unidad</th><th class="num">Subtotal</th></tr></thead><tbody>${body}</tbody></table>`
      : '<p class="small muted" style="margin:8px 0">Esta partida no tiene costos asociados.</p>';
  }

  // ---------------------------------------------------------------------------
  //  GUÍA DE KPIs
  // ---------------------------------------------------------------------------
  function renderGuide() {
    document.title = 'Guía de KPIs — Formulación QUEMPIN';
    const card = (d) => `<article class="guide-card">
      <h3>${d.nombre}</h3>
      ${d.origen === 'Nuevo' ? '<span class="tag new">Nuevo indicador</span>' : `<span class="tag">Excel: ${esc(d.origen)}</span>`}
      <dl>
        <dt>Fórmula</dt><dd><span class="formula">${esc(d.formula)}</span></dd>
        <dt>Qué mide</dt><dd>${esc(d.queMide)}</dd>
        <dt>Cómo aporta a la evaluación</dt><dd>${esc(d.aporte)}</dd>
        ${d.lectura ? `<dt>Semáforo</dt><dd>${esc(d.lectura)}</dd>` : ''}
      </dl>
    </article>`;
    app.innerHTML = `<div class="viz-container page">
      <div class="page-head"><div>
        <h2>Cómo se evalúa un proyecto</h2>
        <p>Qué mide cada KPI, cómo se calcula y qué aporta a la decisión de ofertar.</p>
      </div></div>
      <section>
        <div class="section-head"><h3 class="seccion-titulo">Cómo calcula la herramienta</h3><p>Misma lógica del Excel de formulación de QUEMPIN.</p></div>
        <div class="pasos">
          <div class="paso"><h4>Partidas</h4><p>El proyecto se divide en partidas con unidad y cantidad (ej.: 3 medidores de 2").</p></div>
          <div class="paso"><h4>Costos por unidad</h4><p>Materiales, equipos, mano de obra y otros se ingresan por unidad de partida y se multiplican por su cantidad.</p></div>
          <div class="paso"><h4>Costo directo</h4><p>La suma de los cuatro tipos de costo. Opcional: gastos generales e imprevistos como % del costo directo.</p></div>
          <div class="paso"><h4>Utilidad y precio</h4><p>En Resumen y KPIs se define la utilidad de cada partida (% de recargo o monto fijo). Precio neto = costo total + utilidad.</p></div>
          <div class="paso"><h4>IVA y evaluación</h4><p>Se agrega el IVA y se calculan los indicadores, con semáforos según las metas del proyecto.</p></div>
        </div>
      </section>
      <section class="section"><div class="section-head"><h3 class="seccion-titulo">Resultado económico</h3></div>
        <div class="guide-grid">${KP.KPIS.filter((d) => d.grupo === 'economico').map(card).join('')}</div></section>
      <section class="section"><div class="section-head"><h3 class="seccion-titulo">Indicadores de evaluación</h3></div>
        <div class="guide-grid">${KP.KPIS.filter((d) => d.grupo === 'indicador').map(card).join('')}</div></section>
      <section class="section">
        <div class="section-head"><h3 class="seccion-titulo">Cómo leerlos en conjunto</h3></div>
        <div class="panel">
          <ul style="margin:0;padding-left:18px;color:var(--text-secondary);display:grid;gap:6px">
            <li><strong>¿Conviene?</strong> Margen sobre venta y utilidad por día-hombre. El margen compara proyectos de distinto tamaño; la utilidad por DH compara proyectos que compiten por las mismas cuadrillas.</li>
            <li><strong>¿Es riesgoso?</strong> Holgura de MO, incidencia de MO y sensibilidad. Si la holgura es baja y la incidencia alta, un atraso pequeño se come la utilidad.</li>
            <li><strong>¿Podemos ganar?</strong> Competitividad frente al presupuesto del mandante. Sobre 100 % hay que revisar alcance o utilidad; muy por debajo, quizás se puede subir el precio.</li>
            <li><strong>¿Los números son confiables?</strong> Revisa las alertas de validación antes de exportar: un costo sin partida no suma.</li>
          </ul>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3 class="seccion-titulo">Colores de los gráficos</h3><p>Solo colores oficiales de QUEMPIN; cuando no alcanzan, rayas y puntos con esos mismos colores.</p></div>
        <div class="panel"><div class="leyenda-inline" style="margin:0;font-size:13px">${CATS.map((c) => `<span><span class="swatch ${c.cls}" style="width:14px;height:14px"></span>${c.n}</span>`).join('')}</div>
          <p class="small muted" style="margin:10px 0 0">Verde, ámbar y rojo se reservan para los semáforos: indican el estado de un indicador, no una categoría.</p></div>
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

  // Recuerda qué tarjetas de KPI tienen abierta su explicación
  app.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.dataset || !d.dataset.kpi) return;
    if (d.open) state.kpiOpen.add(d.dataset.kpi); else state.kpiOpen.delete(d.dataset.kpi);
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

  function flashRow(uid) {
    const tr = $(`tr[data-row="${uid}"]`);
    if (!tr) return;
    tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
    state.tab = tab;
    renderTab();
    const mn = $('#modnav-proj');
    if (mn) mn.href = `#/p/${state.project.uid}/${tab}`;
    window.scrollTo({ top: 0 });
    if (focus === 'util') {
      setTimeout(() => {
        const sec = $('#utilidad');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const inp = $('#utilidad [data-k="utilidadValor"]');
        if (inp) inp.focus({ preventScroll: true });
      }, 30);
    } else if (focus === 'catalogo') {
      setTimeout(() => { const c = $('#catalogo'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
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
          const c = S.cloneProject(src, { version: maxV + 1, estado: 'Borrador', fecha: S.hoy() });
          S.upsert(c);
          toast(`Versión ${c.version} de ${c.codigo} creada`);
          goProject(c, (p && state.tab) || 'ficha');
          break;
        }
        case 'eliminar': {
          const target = S.get(id);
          const v = await ask({
            title: 'Eliminar proyecto',
            body: `<p>¿Eliminar <b>${esc(target.codigo)} v${esc(target.version)}</b> «${esc(target.titulo || 'Sin título')}» de este navegador? Esta acción no se puede deshacer. Si lo necesitas después, expórtalo antes.</p>`,
            buttons: [{ label: 'Cancelar', left: true }, { label: 'Exportar y eliminar', value: 'exp' }, { label: 'Eliminar', value: 'del', danger: true }]
          });
          if (!v) break;
          if (v === 'exp') await X.exportProject(target);
          S.remove(id);
          if (state.project && state.project.uid === id) { state.project = null; location.hash = '#/'; } else renderList();
          toast('Proyecto eliminado');
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
        case 'ver-alertas':
          goTab('resumen');
          setTimeout(() => { const a = $('#alertas'); if (a) a.scrollIntoView({ behavior: 'smooth' }); }, 40);
          break;
        case 'ir': {
          if (DETALLE[d.tab]) state.filtro[d.tab] = '';
          if (d.tab === 'resumen' && state.tab === 'resumen') { if (d.uid) flashRow(d.uid); break; }
          goTab(d.tab);
          if (d.uid) setTimeout(() => flashRow(d.uid), 40);
          break;
        }
        case 'add-row': addRow(d.list); break;
        case 'dup-row': {
          const list = d.list;
          const i = p[list].findIndex((x) => x.uid === d.uid);
          if (i < 0) break;
          const c = Object.assign({}, p[list][i], { uid: S.uid() });
          p[list].splice(i + 1, 0, c);
          recalc(); renderTab(`[data-list="${list}"][data-uid="${c.uid}"][data-k="descripcion"]`); flashRow(c.uid); scheduleSave();
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
          recalc(); renderTab(`[data-act="mover"][data-uid="${d.uid}"][data-dir="${d.dir}"]:not([disabled])`); flashRow(d.uid); scheduleSave();
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
          if (!(m > 0 && m < 1)) { toast('Define un margen objetivo entre 0 y 100 % en Ficha y parámetros.', true); break; }
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
        case 'imprimir':
          if (state.tab !== 'resumen') goTab('resumen');
          setTimeout(() => window.print(), 200);
          break;
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
      const nuevos = [];
      for (const p of res.proyectos) {
        const existing = S.get(p.uid);
        if (existing) {
          const v = await ask({
            title: 'El proyecto ya existe',
            body: `<p><b>${esc(p.codigo)} v${esc(p.version)}</b> «${esc(p.titulo)}» ya está en este navegador (modificado el ${esc(new Date(existing.modificado).toLocaleString('es-CL'))}).</p>`,
            buttons: [{ label: 'Omitir', left: true }, { label: 'Importar como copia', value: 'copy' }, { label: 'Reemplazar', value: 'replace', primary: true }]
          });
          if (!v) continue;
          const item = v === 'copy' ? S.cloneProject(p) : p;
          S.upsert(item); nuevos.push(item);
        } else {
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
    const v = await ask({
      title: 'Configuración predeterminada',
      body: `<p>Se aplica a los proyectos nuevos creados en este navegador.</p>
        <div class="fila-campos" style="margin:14px 0 0">
          <div class="campo"><label for="cfg-prefijo">Prefijo del código</label><input class="input" id="cfg-prefijo" value="${esc(cfg.prefijo)}"><span class="hint">Ej.: ${esc(cfg.prefijo)}-${new Date().getFullYear()}-001</span></div>
          <div class="campo"><label for="cfg-resp">Responsable por defecto</label><input class="input" id="cfg-resp" value="${esc(cfg.responsable)}"></div>
        </div>
        <p class="small muted">Parámetros actuales: IVA ${nf(par.iva)} % · GG ${nf(par.gastosGenerales)} % · imprevistos ${nf(par.imprevistos)} % · tarifas ${clp(par.tarifaN1)} / ${clp(par.tarifaN2)} / ${clp(par.tarifaN3)} · margen objetivo ${nf(par.margenObjetivo)} %.
        Para cambiarlos, ajústalos en la ficha de un proyecto y usa «Usarlos como predeterminados».</p>`,
      buttons: [{ label: 'Restablecer valores de fábrica', value: 'reset', danger: true, left: true }, { label: 'Cancelar' }, { label: 'Guardar', value: 'save', primary: true }]
    });
    if (v === 'save') {
      cfg.prefijo = ($('#cfg-prefijo').value || 'QPN').trim().toUpperCase();
      cfg.responsable = $('#cfg-resp').value.trim();
      S.setConfig(cfg);
      toast('Configuración guardada');
    } else if (v === 'reset') {
      S.setConfig({ prefijo: cfg.prefijo, responsable: cfg.responsable });
      toast('Parámetros predeterminados restablecidos');
    }
    if (!state.project && !location.hash.startsWith('#/guia')) renderList();
  }

  // ---- Tema claro / oscuro (botón igual al de las demás herramientas QUEMPIN) ------------
  const themeBtn = $('#themeToggle');
  function isDarkNow() {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || (t !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function syncThemeBtn() { themeBtn.textContent = isDarkNow() ? 'Modo claro' : 'Modo oscuro'; }
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

  route();
})();
