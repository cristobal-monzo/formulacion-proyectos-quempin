/*
 * app.js — Interfaz de la herramienta de formulación de proyectos QUEMPIN.
 * Vistas: listado de proyectos (#/), editor de proyecto (#/p/<id>/<pestaña>) y guía de KPIs (#/guia).
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
  const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const fechaCorta = (iso) => {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso)); // fecha sin hora: evitar desfase de zona horaria
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const d = new Date(iso);
    return isNaN(d) ? String(iso) : d.toLocaleDateString('es-CL');
  };

  const ICON = {
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
    print: '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>',
    chev: '▸', chevOpen: '▾'
  };

  // ---------------------------------------------------------------------------
  //  Estado
  // ---------------------------------------------------------------------------
  const state = {
    project: null,
    result: null,
    lineIdx: new Map(),
    partIdx: new Map(),
    tab: 'ficha',
    filtro: { materiales: '', equipos: '', manoObra: '', otros: '' },
    apuOpen: new Set(),
    listSearch: '',
    listEstado: ''
  };

  const DETALLE = {
    materiales: { titulo: 'Materiales', singular: 'material', total: 'mat', factory: S.newMaterial, letra: 'M' },
    equipos: { titulo: 'Equipos', singular: 'equipo', total: 'eq', factory: S.newEquipo, letra: 'E' },
    manoObra: { titulo: 'Mano de obra', singular: 'tarea', total: 'mo', factory: S.newManoObra, letra: 'H' },
    otros: { titulo: 'Otros', singular: 'costo', total: 'otros', factory: S.newOtro, letra: 'O' }
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

  // ---------------------------------------------------------------------------
  //  Utilidades de UI: toast, diálogo, tooltip
  // ---------------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, isErr ? 5000 : 2600);
  }

  /* Diálogo modal. buttons: [{label, value, primary, danger}] → Promise(value | null) */
  function ask({ title, body, buttons, wide }) {
    const dlg = $('#modal');
    dlg.className = wide ? 'wide' : '';
    const btns = (buttons || [{ label: 'Aceptar', value: true, primary: true }]).filter(Boolean);
    dlg.innerHTML = `<form method="dialog">
      <div class="modal-body"><h2>${esc(title)}</h2>${body || ''}</div>
      <div class="modal-foot">${btns.map((b, i) => `<button class="btn ${b.primary ? 'btn-primary' : ''} ${b.danger ? 'btn-danger' : ''}" value="${i}">${esc(b.label)}</button>`).join('')}</div>
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
      const primary = dlg.querySelector('.btn-primary') || dlg.querySelector('.modal-foot .btn');
      const firstInput = dlg.querySelector('.modal-body input, .modal-body select');
      (firstInput || primary).focus();
    });
  }

  const tip = $('#tooltip');
  document.addEventListener('mousemove', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    tip.innerHTML = el.dataset.tip;
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY - h - 10;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y < 8) y = e.clientY + 18;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });

  // ---------------------------------------------------------------------------
  //  Guardado
  // ---------------------------------------------------------------------------
  let saveTimer = null;
  function setSaveState(text, isErr) {
    const el = $('#save-state');
    if (el) { el.textContent = text; el.classList.toggle('err', !!isErr); }
  }
  function scheduleSave() {
    setSaveState('Guardando…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 350);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!state.project) return;
    const okSave = S.upsert(state.project);
    setSaveState(okSave ? 'Guardado en este navegador' : 'No se pudo guardar en este navegador: exporta el proyecto', !okSave);
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
    if (t === 'P') { const p = state.partIdx.get(a); return p ? p[b] : null; }
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
    renderStrip();
    updateTabs();
    updateHeader();
    if (state.tab === 'resumen') refreshResumen();
  }

  // ---------------------------------------------------------------------------
  //  Navegación
  // ---------------------------------------------------------------------------
  function route() {
    if (saveTimer) saveNow();
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'p' && parts[1]) {
      const p = S.get(parts[1]);
      if (!p) { toast('No se encontró el proyecto.', true); location.hash = '#/'; return; }
      openProject(p, parts[2]);
    } else if (parts[0] === 'guia') {
      state.project = null;
      renderGuide();
    } else {
      state.project = null;
      renderList();
    }
    updateNav(parts[0]);
    window.scrollTo(0, 0);
  }
  function updateNav(where) {
    $$('.topnav-link').forEach((a) => a.classList.toggle('active',
      (a.dataset.nav === 'guia' && where === 'guia') || (a.dataset.nav === 'lista' && where !== 'guia')));
  }
  window.addEventListener('hashchange', route);

  function goProject(p, tab) { location.hash = `#/p/${p.uid}/${tab || 'ficha'}`; }

  // ---------------------------------------------------------------------------
  //  LISTADO DE PROYECTOS
  // ---------------------------------------------------------------------------
  function renderList() {
    const all = S.all();
    document.title = 'Proyectos · Formulación QUEMPIN';
    app.innerHTML = `<div class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">QUEMPIN · Soluciones Energéticas</div>
          <h1>Proyectos formulados</h1>
          <div class="sub">${all.length} proyecto${all.length === 1 ? '' : 's'} en este navegador</div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" data-act="nuevo">${ICON.plus}Nuevo proyecto</button>
          <button class="btn" data-act="importar">${ICON.upload}Importar</button>
          <details class="menu">
            <summary class="btn" aria-label="Más acciones">${ICON.more}Más</summary>
            <div class="menu-list">
              <button data-act="exportar-cartera" ${all.length ? '' : 'disabled'}>Exportar cartera a Excel</button>
              <button data-act="respaldar" ${all.length ? '' : 'disabled'}>Respaldar todos los proyectos (JSON)</button>
              <hr>
              <button data-act="ejemplo">Cargar proyecto de ejemplo del Excel</button>
            </div>
          </details>
        </div>
      </div>
      ${all.length ? `
        <div class="tbl-toolbar">
          <div class="left">
            <input class="input search" type="search" id="list-search" placeholder="Buscar por código, título, cliente o responsable" value="${esc(state.listSearch)}" aria-label="Buscar proyectos">
            <select class="select" id="list-estado" style="width:auto" aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              ${S.ESTADOS.map((e) => `<option ${state.listEstado === e ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="tbl-wrap">
          <table class="tbl" id="list-table">
            <thead><tr>
              <th>Código</th><th>Proyecto</th><th>Responsable</th><th>Fecha</th><th>Estado</th>
              <th class="num">Precio neto</th><th class="num">Margen</th><th class="num">Utilidad / DH</th><th class="num">Alertas</th><th></th>
            </tr></thead>
            <tbody id="list-body"></tbody>
          </table>
        </div>` : `
        <div class="card empty-state">
          <h2>Aún no hay proyectos</h2>
          <p>Crea un proyecto nuevo, carga el ejemplo con los mismos datos del Excel original, o importa un Excel de formulación antiguo (.xlsm) para migrarlo.</p>
          <div class="actions">
            <button class="btn btn-primary" data-act="nuevo">${ICON.plus}Crear proyecto</button>
            <button class="btn" data-act="ejemplo">Cargar ejemplo</button>
            <button class="btn" data-act="importar">${ICON.upload}Importar Excel o JSON</button>
          </div>
        </div>`}
      <p class="storage-note">Los proyectos se guardan en este navegador. Para respaldarlos o compartirlos, expórtalos a Excel o JSON; ambos formatos se pueden volver a importar.</p>
    </div>`;
    if (all.length) renderListBody();
  }

  function renderListBody() {
    const q = state.listSearch.trim().toLowerCase();
    const list = S.all()
      .filter((p) => !state.listEstado || p.estado === state.listEstado)
      .filter((p) => !q || [p.codigo, p.titulo, p.cliente, p.responsable, p.ubicacion].join(' ').toLowerCase().includes(q))
      .sort((a, b) => String(b.modificado).localeCompare(String(a.modificado)));
    const body = $('#list-body');
    if (!body) return;
    if (!list.length) { body.innerHTML = '<tr class="empty-row"><td colspan="10">No hay proyectos que coincidan con la búsqueda.</td></tr>'; return; }
    body.innerHTML = list.map((p) => {
      const r = computeProject(p);
      const nAlert = r.warnings.filter((w) => w.level !== 'info').length;
      const nErr = r.warnings.filter((w) => w.level === 'error').length;
      return `<tr>
        <td><span class="code-badge">${esc(p.codigo || '—')}</span><span class="ver">v${p.version}</span></td>
        <td style="min-width:240px"><a class="proj-title" href="#/p/${p.uid}/ficha">${esc(p.titulo || 'Sin título')}</a><div class="proj-sub">${esc([p.cliente, p.ubicacion].filter(Boolean).join(' · ') || '—')}</div></td>
        <td>${esc(p.responsable || '—')}</td>
        <td class="nowrap">${esc(fechaCorta(p.fecha))}</td>
        <td><span class="estado" data-e="${esc(p.estado)}">${esc(p.estado)}</span></td>
        <td class="num">${clp(r.totals.precioNeto)}</td>
        <td class="num"><span class="dot ${r.status.margen}"></span>${pct(r.kpis.margen)}</td>
        <td class="num">${clp(r.kpis.rentDH)}</td>
        <td class="num">${nAlert ? `<span class="chip ${nErr ? 'bad' : 'warn'}">${nAlert}</span>` : '<span class="muted">0</span>'}</td>
        <td class="cell-actions">
          <details class="menu">
            <summary class="row-btn" aria-label="Acciones del proyecto ${esc(p.codigo)}">${ICON.more}</summary>
            <div class="menu-list">
              <button data-act="abrir" data-id="${p.uid}">Abrir</button>
              <button data-act="exp-xlsx" data-id="${p.uid}">Exportar a Excel</button>
              <button data-act="exp-json" data-id="${p.uid}">Exportar a JSON</button>
              <hr>
              <button data-act="duplicar" data-id="${p.uid}">Duplicar como proyecto nuevo</button>
              <button data-act="version" data-id="${p.uid}">Crear nueva versión</button>
              <hr>
              <button class="danger" data-act="eliminar" data-id="${p.uid}">Eliminar</button>
            </div>
          </details>
        </td>
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
    }
    state.project = p;
    state.tab = valid ? tab : 'ficha';
    recalc();
    renderEditor();
  }

  function renderEditor() {
    const p = state.project;
    app.innerHTML = `<div class="page">
      <div class="editor-head">
        <div class="editor-title">
          <a class="back" href="#/">← Proyectos</a>
          <h1 id="ed-title"></h1>
          <div class="meta" id="ed-meta"></div>
        </div>
        <div class="actions">
          <span class="save-state" id="save-state">Guardado en este navegador</span>
          <button class="btn btn-primary" data-act="exp-xlsx" data-id="${p.uid}">${ICON.download}Exportar Excel</button>
          <button class="btn" data-act="imprimir">${ICON.print}Imprimir resumen</button>
          <details class="menu">
            <summary class="btn" aria-label="Más acciones">${ICON.more}</summary>
            <div class="menu-list">
              <button data-act="exp-json" data-id="${p.uid}">Exportar a JSON</button>
              <hr>
              <button data-act="duplicar" data-id="${p.uid}">Duplicar como proyecto nuevo</button>
              <button data-act="version" data-id="${p.uid}">Crear nueva versión</button>
              <hr>
              <button class="danger" data-act="eliminar" data-id="${p.uid}">Eliminar proyecto</button>
            </div>
          </details>
        </div>
      </div>
      <div class="strip" id="strip"></div>
      <div class="tabs" role="tablist" id="tabs"></div>
      <div id="tab-body"></div>
      <datalist id="unidades">${S.UNIDADES.map((u) => `<option value="${esc(u)}">`).join('')}</datalist>
    </div>`;
    renderTab();
  }

  function updateHeader() {
    const p = state.project;
    const t = $('#ed-title');
    if (!t) return;
    t.textContent = p.titulo || 'Proyecto sin título';
    $('#ed-meta').innerHTML = `<span class="code-badge">${esc(p.codigo || 'SIN CÓDIGO')}</span><span>versión ${esc(p.version)}</span>
      <span class="estado" data-e="${esc(p.estado)}">${esc(p.estado)}</span>
      ${p.cliente ? `<span>· ${esc(p.cliente)}</span>` : ''}${p.responsable ? `<span>· ${esc(p.responsable)}</span>` : ''}`;
    document.title = `${p.codigo || ''} ${p.titulo || 'Proyecto'} · Formulación QUEMPIN`;
  }

  function renderStrip() {
    const el = $('#strip');
    if (!el) return;
    const r = state.result;
    const nErr = r.warnings.filter((w) => w.level === 'error').length;
    const nWarn = r.warnings.filter((w) => w.level === 'warn').length;
    el.innerHTML = `
      <div class="strip-item"><div class="l">Costo directo</div><div class="v">${clp(r.totals.cd)}</div></div>
      <div class="strip-item"><div class="l">Utilidad</div><div class="v">${clp(r.totals.utilidad)}</div></div>
      <div class="strip-item"><div class="l">Precio neto</div><div class="v">${clp(r.totals.precioNeto)}</div></div>
      <div class="strip-item"><div class="l">Precio con IVA</div><div class="v">${clp(r.totals.precioBruto)}</div></div>
      <div class="strip-item"><div class="l">Margen sobre venta</div><div class="v">${pct(r.kpis.margen)} ${chip(r.status.margen, 'margen')}</div></div>
      <div class="strip-item"><div class="l">Alertas</div>
        <button class="v" data-act="ver-alertas">${nErr ? `<span class="chip bad">✖ ${nErr}</span> ` : ''}${nWarn ? `<span class="chip warn">▲ ${nWarn}</span>` : ''}${!nErr && !nWarn ? '<span class="chip ok">✔ Sin alertas</span>' : ''}</button></div>`;
  }

  function updateTabs() {
    const el = $('#tabs');
    if (!el) return;
    const p = state.project;
    const r = state.result;
    el.innerHTML = TABS.map((t) => {
      const n = t.list ? p[t.list].length : null;
      const err = r.warnings.some((w) => w.tab === t.id && w.level === 'error');
      return `<button class="tab ${state.tab === t.id ? 'active' : ''}" role="tab" aria-selected="${state.tab === t.id}" data-act="tab" data-tab="${t.id}">${t.label}${n !== null ? `<span class="count ${err ? 'err' : ''}">${n}</span>` : ''}</button>`;
    }).join('');
  }

  function renderTab(focusKey) {
    const body = $('#tab-body');
    if (!body) return;
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
      if (el) { el.focus(); if (el.select && el.type !== 'number') el.select(); }
    }
  }

  // ---- Ficha --------------------------------------------------------------------
  const fInput = (path, label, opts) => {
    const o = opts || {};
    const v = getPath(state.project, path);
    const type = o.type || 'text';
    const attrs = type === 'num' ? 'type="number" step="any" inputmode="decimal" data-t="num"' : (type === 'date' ? 'type="date"' : 'type="text"');
    const input = `<input class="input" id="f-${path}" ${attrs} data-f="${path}" value="${esc(v === null || v === undefined ? '' : v)}" ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''}>`;
    const wrapped = o.suffix ? `<div class="input-affix">${input}<span class="affix">${o.suffix}</span></div>`
      : o.prefix ? `<div class="input-affix pre">${input}<span class="affix">${o.prefix}</span></div>` : input;
    return `<div class="field ${o.cls || ''}"><label for="f-${path}">${label}</label>${wrapped}${o.hint ? `<span class="hint" ${o.hintId ? `id="${o.hintId}"` : ''}>${o.hint}</span>` : ''}</div>`;
  };

  function viewFicha() {
    const p = state.project;
    const par = p.parametros;
    return `
    <div class="cards-2">
      <section class="card">
        <div class="card-head"><h2>Identificación</h2><p>Estos datos identifican el proyecto en el listado y en el Excel exportado.</p></div>
        <div class="grid-form">
          ${fInput('codigo', 'Código del proyecto', { hint: ' ', hintId: 'codigo-hint' })}
          ${fInput('version', 'Versión', { type: 'num' })}
          <div class="field"><label for="f-estado">Estado</label>
            <select class="select" id="f-estado" data-f="estado">${S.ESTADOS.map((e) => `<option ${p.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
          ${fInput('fecha', 'Fecha de formulación', { type: 'date' })}
          ${fInput('titulo', 'Título del proyecto', { cls: 'span-2', placeholder: 'Ej.: Instalación de medidores de gas natural' })}
          ${fInput('cliente', 'Cliente / mandante')}
          ${fInput('ubicacion', 'Ubicación')}
          ${fInput('responsable', 'Responsable asignado')}
          <div class="field span-all"><label for="f-descripcion">Descripción / alcance</label>
            <textarea class="textarea" id="f-descripcion" data-f="descripcion" rows="3">${esc(p.descripcion)}</textarea></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Estructura de precio y tarifas</h2><p>Con gastos generales e imprevistos en 0 % el cálculo es idéntico al Excel original.</p></div>
        <div class="grid-form">
          ${fInput('parametros.iva', 'IVA', { type: 'num', suffix: '%' })}
          ${fInput('parametros.gastosGenerales', 'Gastos generales', { type: 'num', suffix: '%', hint: '% sobre el costo directo' })}
          ${fInput('parametros.imprevistos', 'Imprevistos', { type: 'num', suffix: '%', hint: '% sobre el costo directo' })}
        </div>
        <h3 style="margin:18px 0 10px">Tarifa por día-hombre</h3>
        <div class="grid-form">
          ${fInput('parametros.tarifaN1', 'Nivel 1', { type: 'num', prefix: '$' })}
          ${fInput('parametros.tarifaN2', 'Nivel 2', { type: 'num', prefix: '$' })}
          ${fInput('parametros.tarifaN3', 'Nivel 3', { type: 'num', prefix: '$' })}
        </div>
      </section>
    </div>
    <div class="cards-2" style="margin-top:16px">
      <section class="card">
        <div class="card-head"><h2>Evaluación de la oferta</h2><p>Metas que usan los semáforos de los KPI.</p></div>
        <div class="grid-form">
          ${fInput('parametros.presupuestoMaximo', 'Presupuesto máximo del mandante', { type: 'num', prefix: '$', hint: 'Déjalo vacío si no se conoce.' })}
          <div class="field"><span class="label">Criterio del presupuesto</span>
            <label class="check" style="height:36px"><input type="checkbox" data-f="parametros.presupuestoIncluyeIva" data-t="bool" ${par.presupuestoIncluyeIva ? 'checked' : ''}> El presupuesto incluye IVA</label></div>
          ${fInput('parametros.margenObjetivo', 'Margen objetivo', { type: 'num', suffix: '%' })}
          ${fInput('parametros.margenMinimo', 'Margen mínimo aceptable', { type: 'num', suffix: '%' })}
          ${fInput('parametros.metaUtilidadDH', 'Meta de utilidad por día-hombre', { type: 'num', prefix: '$', hint: '0 = sin meta' })}
          ${fInput('parametros.umbralAjustado', 'Oferta "ajustada" desde', { type: 'num', suffix: '%', hint: '% del presupuesto máximo' })}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Catálogo de otros costos</h2><p>Referencias para agregar rápido en la pestaña Otros.</p></div>
        <div class="tbl-wrap" style="box-shadow:none">
          <table class="tbl" style="min-width:420px">
            <thead><tr><th>Descripción</th><th>Unid.</th><th class="num">Costo unitario</th><th></th></tr></thead>
            <tbody>${(p.catalogoOtros || []).map((c, i) => `<tr>
              <td><input class="ci desc" data-cat="${i}" data-k="descripcion" value="${esc(c.descripcion)}" aria-label="Descripción"></td>
              <td><input class="ci w-xs" list="unidades" data-cat="${i}" data-k="unidad" value="${esc(c.unidad)}" aria-label="Unidad"></td>
              <td><input class="ci num w-sm" type="number" step="any" data-t="num" data-cat="${i}" data-k="costoUnitario" value="${esc(c.costoUnitario)}" aria-label="Costo unitario"></td>
              <td class="cell-actions"><button class="row-btn del" data-act="del-cat" data-i="${i}" title="Eliminar">${ICON.trash}</button></td>
            </tr>`).join('') || '<tr class="empty-row"><td colspan="4">Sin referencias.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="tbl-toolbar"><button class="btn btn-sm" data-act="add-cat">${ICON.plus}Agregar referencia</button></div>
      </section>
    </div>
    <div class="note" style="margin-top:16px">
      <span>¿Estos parámetros son los habituales de QUEMPIN? <button class="btn btn-sm" data-act="save-defaults" style="margin-left:6px">Usarlos como predeterminados para proyectos nuevos</button></span>
    </div>`;
  }

  function updateCodigoHint() {
    const el = $('#codigo-hint');
    if (!el) return;
    const p = state.project;
    const dup = S.all().find((x) => x.uid !== p.uid && x.codigo === p.codigo && String(x.version) === String(p.version));
    el.textContent = dup ? `⚠ Ya existe otro proyecto ${p.codigo} v${p.version} («${trunc(dup.titulo, 40)}»).` : 'Correlativo sugerido automáticamente; puedes editarlo.';
    el.style.color = dup ? 'var(--bad)' : '';
  }

  // ---- Partidas --------------------------------------------------------------------
  const rowInput = (list, it, k, label, cls, isNum, extra) =>
    `<input class="ci ${cls || ''} ${isNum ? 'num' : ''}" ${isNum ? 'type="number" step="any" inputmode="decimal" data-t="num"' : 'type="text"'} data-list="${list}" data-uid="${it.uid}" data-k="${k}" value="${esc(it[k] === null || it[k] === undefined ? '' : it[k])}" aria-label="${esc(label)}" ${extra || ''}>`;

  function viewPartidas() {
    const p = state.project;
    const rows = p.partidas.map((it, i) => {
      const code = 'P' + (i + 1);
      return `<tr data-row="${it.uid}">
        <td class="code">${code}</td>
        <td>${rowInput('partidas', it, 'descripcion', `Descripción ${code}`, 'desc', false, 'placeholder="Descripción de la partida"')}</td>
        <td>${rowInput('partidas', it, 'unidad', `Unidad ${code}`, 'w-xs', false, 'list="unidades"')}</td>
        <td>${rowInput('partidas', it, 'cantidad', `Cantidad ${code}`, 'w-sm', true)}</td>
        <td><div class="util-group">
          <select class="ci" data-list="partidas" data-uid="${it.uid}" data-k="utilidadTipo" data-rerender aria-label="Tipo de utilidad ${code}">
            <option value="pct" ${it.utilidadTipo !== 'monto' ? 'selected' : ''}>%</option>
            <option value="monto" ${it.utilidadTipo === 'monto' ? 'selected' : ''}>$</option>
          </select>
          ${rowInput('partidas', it, 'utilidadValor', `Utilidad ${code}`, 'w-sm', true)}
        </div></td>
        <td class="num calc" data-c="P:${it.uid}:cd" data-fmt="clp"></td>
        <td class="num calc" data-c="P:${it.uid}:utilidad" data-fmt="clp"></td>
        <td class="num calc strong" data-c="P:${it.uid}:precio" data-fmt="clp"></td>
        <td class="num calc" data-c="P:${it.uid}:pu" data-fmt="clp"></td>
        <td class="cell-actions">
          <button class="row-btn" data-act="mover" data-list="partidas" data-uid="${it.uid}" data-dir="-1" title="Subir" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button class="row-btn" data-act="mover" data-list="partidas" data-uid="${it.uid}" data-dir="1" title="Bajar" ${i === p.partidas.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
          <button class="row-btn del" data-act="del-row" data-list="partidas" data-uid="${it.uid}" title="Eliminar partida">${ICON.trash}</button>
        </td>
      </tr>`;
    }).join('');
    return `
      <div class="note"><span><strong>Partidas:</strong> cada partida agrupa costos. La utilidad se define por partida como % sobre su costo directo (recargo) o como monto fijo. Un recargo de 100 % equivale a un margen de 50 % sobre la venta. Los ítems de detalle se asocian a la partida y sus cantidades se ingresan <strong>por unidad de partida</strong>.</span></div>
      <div class="tbl-toolbar">
        <div class="left"><button class="btn btn-primary btn-sm" data-act="add-row" data-list="partidas">${ICON.plus}Agregar partida</button></div>
        <div class="right">
          <label class="small muted" for="util-all">Aplicar a todas:</label>
          <div class="input-affix" style="width:110px"><input class="input" id="util-all" type="number" step="any" placeholder="100" aria-label="Recargo a aplicar a todas las partidas"><span class="affix">%</span></div>
          <button class="btn btn-sm" data-act="apply-util">Aplicar</button>
        </div>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>ID</th><th>Descripción</th><th>Unid.</th><th class="num">Cant.</th><th>Utilidad<span class="th-sub">% recargo o $ fijo</span></th>
            <th class="num">Costo directo</th><th class="num">Utilidad $</th><th class="num">Precio neto</th><th class="num">Precio unitario</th><th></th>
          </tr></thead>
          <tbody>${rows || '<tr class="empty-row"><td colspan="10">Agrega la primera partida del proyecto.</td></tr>'}</tbody>
          <tfoot><tr>
            <td></td><td colspan="4">Total (${p.partidas.length} partidas)</td>
            <td class="num" data-c="T:cd" data-fmt="clp"></td>
            <td class="num" data-c="T:utilidad" data-fmt="clp"></td>
            <td class="num" data-c="T:precioNeto" data-fmt="clp"></td>
            <td></td><td></td>
          </tr></tfoot>
        </table>
      </div>`;
  }

  // ---- Detalle: materiales, equipos, otros ------------------------------------------
  function partidaSelect(list, it) {
    const p = state.project;
    const opts = p.partidas.map((pt, i) => `<option value="${pt.uid}" ${it.partida === pt.uid ? 'selected' : ''}>P${i + 1} · ${esc(trunc(pt.descripcion || 'Sin descripción', 34))}</option>`).join('');
    return `<select class="ci w-md" data-list="${list}" data-uid="${it.uid}" data-k="partida" aria-label="Partida asociada">
      <option value="" ${!it.partida || !state.partIdx.has(it.partida) ? 'selected' : ''}>— Sin partida —</option>${opts}</select>`;
  }
  function filtroBar(key) {
    const p = state.project;
    const cfg = DETALLE[key];
    const f = state.filtro[key];
    const catSel = key === 'otros' && (p.catalogoOtros || []).length
      ? `<select class="select" style="width:auto" data-act-change="add-from-cat" aria-label="Agregar desde catálogo">
          <option value="">+ Agregar desde catálogo…</option>
          ${p.catalogoOtros.map((c, i) => `<option value="${i}">${esc(c.descripcion)} (${clp(num(c.costoUnitario))}/${esc(c.unidad || 'un')})</option>`).join('')}
        </select>` : '';
    return `<div class="tbl-toolbar">
      <div class="left">
        <button class="btn btn-primary btn-sm" data-act="add-row" data-list="${key}">${ICON.plus}Agregar ${cfg.singular}</button>
        ${catSel}
      </div>
      <div class="right">
        <label class="small muted" for="filtro-${key}">Ver:</label>
        <select class="select" id="filtro-${key}" style="width:auto;max-width:280px" data-filtro="${key}">
          <option value="">Todas las partidas</option>
          <option value="__none__" ${f === '__none__' ? 'selected' : ''}>Sin partida asociada</option>
          ${p.partidas.map((pt, i) => `<option value="${pt.uid}" ${f === pt.uid ? 'selected' : ''}>P${i + 1} · ${esc(trunc(pt.descripcion, 40))}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }
  function filtered(key) {
    const f = state.filtro[key];
    return state.project[key].filter((it) => !f || (f === '__none__' ? !state.partIdx.has(it.partida) : it.partida === f));
  }
  function sinPartidasNote() {
    return state.project.partidas.length ? '' :
      `<div class="note"><span>Todavía no hay partidas. Los costos deben asociarse a una partida para sumarse. <button class="btn btn-sm" data-act="tab" data-tab="partidas">Ir a Partidas</button></span></div>`;
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
        <td>${partidaSelect(key, it)}</td>
        <td>${rowInput(key, it, 'unidad', `Unidad ${code}`, 'w-xs', false, 'list="unidades"')}</td>
        <td>${rowInput(key, it, 'cantidad', `Cantidad ${code}`, 'w-sm', true)}</td>
        <td>${rowInput(key, it, 'costoUnitario', `Costo unitario ${code}`, 'w-md', true)}</td>
        <td class="num calc" data-c="L:${key}:${it.uid}:qtyPartida" data-fmt="num"></td>
        <td class="num calc strong" data-c="L:${key}:${it.uid}:subtotal" data-fmt="clp"></td>
        <td class="cell-actions">
          <button class="row-btn" data-act="dup-row" data-list="${key}" data-uid="${it.uid}" title="Duplicar fila">${ICON.copy}</button>
          <button class="row-btn del" data-act="del-row" data-list="${key}" data-uid="${it.uid}" title="Eliminar">${ICON.trash}</button>
        </td>
      </tr>`;
    }).join('');
    return `${sinPartidasNote()}
      <div class="note"><span><strong>${cfg.titulo}:</strong> Subtotal = Cant. de la partida × Cantidad por unidad de partida × Costo unitario. Ejemplo: si la partida son 3 medidores y cada uno lleva 2 flanges, ingresa 2.</span></div>
      ${filtroBar(key)}
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr>
            <th>ID</th><th>Descripción</th><th>Partida</th><th>Unid.</th>
            <th class="num">Cant.<span class="th-sub">por unid. de partida</span></th><th class="num">Costo unitario</th>
            <th class="num">Cant. partida</th><th class="num">Subtotal</th><th></th>
          </tr></thead>
          <tbody>${rows || `<tr class="empty-row"><td colspan="9">${state.filtro[key] ? 'No hay ítems con este filtro.' : `Sin ${cfg.titulo.toLowerCase()} registrados.`}</td></tr>`}</tbody>
          <tfoot><tr><td></td><td colspan="6">Total ${cfg.titulo.toLowerCase()} del proyecto</td><td class="num" data-c="T:${cfg.total}" data-fmt="clp"></td><td></td></tr></tfoot>
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
        <td>${partidaSelect(key, it)}</td>
        ${lv(1)}${lv(2)}${lv(3)}
        <td class="num calc" data-c="L:${key}:${it.uid}:dhPorUnidadPartida" data-fmt="num"></td>
        <td class="num calc" data-c="L:${key}:${it.uid}:qtyPartida" data-fmt="num"></td>
        <td class="num calc" data-c="L:${key}:${it.uid}:dh" data-fmt="num"></td>
        <td class="num calc strong" data-c="L:${key}:${it.uid}:subtotal" data-fmt="clp"></td>
        <td class="cell-actions">
          <button class="row-btn" data-act="dup-row" data-list="${key}" data-uid="${it.uid}" title="Duplicar fila">${ICON.copy}</button>
          <button class="row-btn del" data-act="del-row" data-list="${key}" data-uid="${it.uid}" title="Eliminar">${ICON.trash}</button>
        </td>
      </tr>`;
    }).join('');
    const nivel = (n, t) => `<th colspan="2" class="group-th">Nivel ${n}<span class="th-sub">${clp(num(t))} / día-hombre</span></th>`;
    return `${sinPartidasNote()}
      <div class="note"><span><strong>Mano de obra:</strong> personas y días <strong>por unidad de partida</strong>. Días-Hombre = Cant. partida × Σ(personas × días). Subtotal = Cant. partida × Σ(personas × días × tarifa del nivel). Las tarifas se editan en Ficha y parámetros.</span></div>
      ${filtroBar(key)}
      <div class="tbl-wrap">
        <table class="tbl mo">
          <thead>
            <tr><th rowspan="2">ID</th><th rowspan="2">Tarea</th><th rowspan="2">Partida</th>${nivel(1, par.tarifaN1)}${nivel(2, par.tarifaN2)}${nivel(3, par.tarifaN3)}
              <th rowspan="2" class="num">DH<span class="th-sub">por unid. partida</span></th><th rowspan="2" class="num">Cant. partida</th><th rowspan="2" class="num">Días-Hombre</th><th rowspan="2" class="num">Subtotal</th><th rowspan="2"></th></tr>
            <tr><th>Pers.</th><th>Días</th><th>Pers.</th><th>Días</th><th>Pers.</th><th>Días</th></tr>
          </thead>
          <tbody>${rows || `<tr class="empty-row"><td colspan="14">${state.filtro[key] ? 'No hay tareas con este filtro.' : 'Sin tareas de mano de obra registradas.'}</td></tr>`}</tbody>
          <tfoot><tr><td></td><td colspan="10">Total mano de obra · costo promedio por DH: <span data-c="K:costoMODH" data-fmt="clp"></span></td>
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
    sensibilidad: { ok: 'Resiste', warn: 'Margen bajo mínimo', bad: 'Genera pérdida' }
  };
  const ICO = { ok: '✔', warn: '▲', bad: '✖', info: '•', na: '•' };
  function chip(status, key) {
    const t = (CHIP_TXT[key] && CHIP_TXT[key][status]) || (status === 'na' ? 'Sin datos' : 'Referencial');
    return `<span class="chip ${status}">${ICO[status] || '•'} ${t}</span>`;
  }

  function viewResumen() {
    const p = state.project;
    const s = p.parametros.sensibilidad;
    const sensRow = (k, label) => `<div class="sens-row">
        <label for="sens-${k}" class="label">${label}</label>
        <input type="range" min="-20" max="50" step="1" data-f="parametros.sensibilidad.${k}" data-t="num" data-sync="sens-${k}" value="${esc(num(s[k]))}" aria-label="Variación ${label}">
        <div class="input-affix"><input class="input" id="sens-${k}" type="number" step="any" data-f="parametros.sensibilidad.${k}" data-t="num" data-sync="sens-${k}" value="${esc(num(s[k]))}"><span class="affix">%</span></div>
      </div>`;
    return `
      <div class="print-only print-head">
        <img src="assets/logo-quempin.png" alt="QUEMPIN Soluciones Energéticas">
        <div style="text-align:right"><b>${esc(p.codigo)} · v${esc(p.version)}</b><br>${esc(p.titulo)}<br>${esc([p.cliente, p.responsable, fechaCorta(p.fecha)].filter(Boolean).join(' · '))}</div>
      </div>
      <section><div class="section-head"><h2>Resultado económico</h2><p>Montos en pesos chilenos (CLP).</p></div><div class="tiles" id="res-econ"></div></section>
      <section class="section"><div class="section-head"><h2>Composición del precio neto</h2><p>Qué parte del precio corresponde a cada tipo de costo y a la utilidad.</p></div><div class="comp" id="res-comp"></div></section>
      <section class="section"><div class="section-head"><h2>Indicadores de evaluación</h2><p>Abre "Qué mide y cómo aporta" en cada tarjeta, o revisa la <a href="#/guia">Guía de KPIs</a>.</p></div><div class="kpi-grid" id="res-kpis"></div></section>
      <section class="section">
        <div class="section-head"><h2>Sensibilidad: ¿cuánto sobrecosto resiste la oferta?</h2><p>Simula alzas de costo con el precio ya ofertado. El Excel original solo simulaba +10 % de mano de obra.</p></div>
        <div class="card sens">
          <div class="sens-controls">
            ${sensRow('mat', 'Materiales')}${sensRow('eq', 'Equipos')}${sensRow('mo', 'Mano de obra')}${sensRow('otros', 'Otros')}
            <div><button class="btn btn-sm" data-act="sens-reset">Restablecer (MO +10 %)</button></div>
          </div>
          <div class="sens-out" id="res-sens"></div>
        </div>
      </section>
      <section class="section"><div class="section-head"><h2>Resumen por partida</h2><p>Despliega una partida para ver su análisis de precio unitario.</p></div><div id="res-partidas"></div></section>
      <section class="section" id="alertas"><div class="section-head"><h2>Alertas de validación</h2><p>Revisiones automáticas que en el Excel pasaban inadvertidas.</p></div><div id="res-alerts"></div></section>`;
  }

  function refreshResumen() {
    const r = state.result;
    const t = r.totals, k = r.kpis, st = r.status;
    const par = state.project.parametros;
    const hasGG = t.gg > 0 || t.imp > 0;

    // Tiles
    const tile = (l, v, sub, hero) => `<div class="tile ${hero ? 'hero' : ''}"><div class="l">${l}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    $('#res-econ').innerHTML = [
      tile('Costo directo', clp(t.cd), 'Materiales + equipos + MO + otros'),
      hasGG ? tile('Gastos generales + imprevistos', clp(t.gg + t.imp), `${pct(num(par.gastosGenerales) / 100)} + ${pct(num(par.imprevistos) / 100)} del costo directo`) : '',
      hasGG ? tile('Costo total', clp(t.costoTotal), 'Costo directo + GG + imprevistos') : '',
      tile('Utilidad', clp(t.utilidad), `Recargo de ${pct(k.markup)} sobre el costo`),
      tile('Precio de venta neto', clp(t.precioNeto), 'Monto a ofertar sin IVA', true),
      tile(`IVA (${nf(num(par.iva))} %)`, clp(t.iva), 'No es ingreso de la empresa'),
      tile('Precio de venta bruto', clp(t.precioBruto), 'Precio con IVA')
    ].join('');

    // Composición
    const segs = [
      { n: 'Materiales', v: t.mat, c: 'var(--s1)' },
      { n: 'Equipos', v: t.eq, c: 'var(--s2)' },
      { n: 'Mano de obra', v: t.mo, c: 'var(--s3)' },
      { n: 'Otros', v: t.otros, c: 'var(--s4)' },
      { n: 'Gastos generales + imprevistos', v: t.gg + t.imp, c: 'var(--s5)' },
      { n: 'Utilidad', v: t.utilidad, c: 'var(--s6)' }
    ];
    const base = segs.reduce((a, s) => a + Math.max(0, s.v), 0);
    const bar = base > 0 ? segs.filter((s) => s.v > 0).map((s) =>
      `<div class="comp-seg" style="flex:${s.v / base} 1 0;background:${s.c}" data-tip="<b>${esc(s.n)}</b>${esc(clp(s.v))} · ${esc(pct(s.v / t.precioNeto))} del precio neto"></div>`).join('') : '';
    $('#res-comp').innerHTML = base > 0 ? `
      <div class="comp-bar" role="img" aria-label="Composición del precio neto">${bar}</div>
      <table class="comp-legend">
        <tbody>${segs.map((s) => `<tr ${s.v ? '' : 'class="muted"'}><td><span class="swatch" style="background:${s.c}"></span>${s.n}</td><td class="num">${clp(s.v)}</td><td class="num" style="width:90px">${pct(t.precioNeto ? s.v / t.precioNeto : null)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Precio de venta neto</td><td class="num">${clp(t.precioNeto)}</td><td class="num">${t.precioNeto ? '100,0 %' : '—'}</td></tr></tfoot>
      </table>
      ${t.utilidad < 0 ? '<p class="small" style="color:var(--bad);margin-top:8px">La utilidad es negativa: el precio no cubre los costos.</p>' : ''}`
      : '<p class="muted">Agrega partidas y costos para ver la composición.</p>';

    // KPIs
    const kpiCard = (key, value, unit, statusKey, reading) => {
      const d = KP.byKey[key];
      const s = st[statusKey || key] || 'info';
      return `<article class="kpi">
        <div class="kpi-top"><div><div class="kpi-name">${d.nombre}</div><div class="kpi-origin">${d.origen === 'Nuevo' ? '<span class="tag new">Nuevo</span>' : `Excel: ${esc(d.origen)}`}</div></div>${chip(s, statusKey || key)}</div>
        <div class="kpi-value">${value}${unit ? `<span class="unit">${unit}</span>` : ''}</div>
        <div class="kpi-read">${reading}</div>
        <details><summary>Qué mide y cómo aporta</summary>
          <p><span class="formula">${esc(d.formula)}</span></p>
          <p><strong>Qué mide:</strong> ${esc(d.queMide)}</p>
          <p><strong>Cómo aporta:</strong> ${esc(d.aporte)}</p>
          ${d.lectura ? `<p class="muted">${esc(d.lectura)}</p>` : ''}
        </details>
      </article>`;
    };
    const mObj = num(par.margenObjetivo) / 100, mMin = num(par.margenMinimo) / 100;
    const meta = num(par.metaUtilidadDH);
    const compRead = k.competitividad === null
      ? 'Ingresa el presupuesto máximo del mandante en Ficha y parámetros para evaluar la oferta.'
      : `La oferta ${par.presupuestoIncluyeIva ? 'con IVA' : 'neta'} (${clp(k.precioComparable)}) equivale al ${pct(k.competitividad)} del presupuesto de ${clp(k.presupuesto)}.`;
    $('#res-kpis').innerHTML = [
      kpiCard('margen', pct(k.margen), '', 'margen',
        ok(k.margen) ? `De cada $100 vendidos quedan ${fNum.format(Math.round(k.margen * 1000) / 10)} de utilidad. Objetivo ${pct(mObj)} · mínimo ${pct(mMin)}.` : 'Sin ventas aún.'),
      kpiCard('markup', pct(k.markup), '', 'markup',
        ok(k.markup) ? `Los costos pueden subir hasta ${pct(k.markup)} antes de que el proyecto pierda dinero.` : '—'),
      kpiCard('rentDH', clp(k.rentDH), '/ DH', 'rentDH',
        ok(k.rentDH) ? `Venta por día-hombre: ${clp(k.ventaDH)}.${meta > 0 ? ` Meta: ${clp(meta)}.` : ' Define una meta en Ficha y parámetros para activar el semáforo.'}` : 'No hay días-hombre registrados.'),
      kpiCard('dh', nf(k.dh), 'DH', 'dh',
        k.dh ? `Costo promedio de mano de obra: ${clp(k.costoMODH)} por día-hombre.` : 'Registra tareas en Mano de obra.'),
      kpiCard('incidenciaMO', pct(k.incidenciaMO), '', 'incidenciaMO',
        ok(k.incidenciaMO) ? `La MO es ${pct(k.incidenciaMO)} del precio y ${pct(t.cd ? t.mo / t.cd : null)} del costo directo.` : '—'),
      kpiCard('holguraMO', pct(k.holguraMO), '', 'holguraMO',
        ok(k.holguraMO) ? `Si la mano de obra cuesta más de ${pct(k.holguraMO)} sobre lo presupuestado, el proyecto pierde dinero.` : 'No hay costo de mano de obra.'),
      kpiCard('competitividad', k.competitividad === null ? '—' : pct(k.competitividad), '', 'competitividad', compRead)
    ].join('');

    // Sensibilidad
    const sd = KP.byKey.sensibilidad;
    $('#res-sens').innerHTML = `
      ${tile('Sobrecosto simulado', clp(k.sensDeltaCosto))}
      ${tile('Variación de la utilidad', pct(k.sensVarUtilidad), `Excel: ${esc(sd.origen)}`)}
      ${tile('Utilidad en el escenario', clp(k.sensUtilidad))}
      ${tile('Margen en el escenario', pct(k.sensMargen))}
      <div style="grid-column:1/-1">${chip(st.sensibilidad, 'sensibilidad')} <span class="small muted">${esc(sd.lectura)}</span></div>`;

    // Resumen por partida (con APU)
    const rowsP = r.partidas.map((pt) => {
      const open = state.apuOpen.has(pt.uid);
      const apu = open ? `<tr class="apu-row"><td colspan="13">${apuTable(pt)}</td></tr>` : '';
      return `<tr data-row="${pt.uid}">
        <td><button class="apu-toggle" data-act="apu" data-uid="${pt.uid}" aria-expanded="${open}" aria-label="Ver detalle de ${pt.code}">${open ? ICON.chevOpen : ICON.chev}</button></td>
        <td class="code">${pt.code}</td><td>${esc(pt.descripcion || '—')}</td><td class="num">${nf(pt.cantidad)} ${esc(pt.unidad)}</td>
        <td class="num">${clp(pt.mat)}</td><td class="num">${clp(pt.eq)}</td><td class="num">${clp(pt.mo)}</td><td class="num">${clp(pt.otros)}</td>
        <td class="num"><b>${clp(pt.cd)}</b></td><td class="num">${clp(pt.utilidad)}</td><td class="num"><b>${clp(pt.precio)}</b></td>
        <td class="num">${clp(pt.pu)}</td><td class="num">${pct(pt.pctPrecio)}</td>
      </tr>${apu}`;
    }).join('');
    $('#res-partidas').innerHTML = `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th></th><th>ID</th><th>Partida</th><th class="num">Cant.</th><th class="num">Materiales</th><th class="num">Equipos</th><th class="num">Mano de obra</th><th class="num">Otros</th>
        <th class="num">Costo directo</th><th class="num">Utilidad</th><th class="num">Precio neto</th><th class="num">Precio unit.</th><th class="num">% precio</th></tr></thead>
      <tbody>${rowsP || '<tr class="empty-row"><td colspan="13">Sin partidas.</td></tr>'}</tbody>
      <tfoot><tr><td></td><td></td><td colspan="2">Total</td><td class="num">${clp(t.mat)}</td><td class="num">${clp(t.eq)}</td><td class="num">${clp(t.mo)}</td><td class="num">${clp(t.otros)}</td>
        <td class="num">${clp(t.cd)}</td><td class="num">${clp(t.utilidad)}</td><td class="num">${clp(t.precioNeto)}</td><td></td><td class="num">${t.precioNeto ? '100,0 %' : '—'}</td></tr></tfoot>
    </table></div>`;

    // Alertas
    const ws = r.warnings;
    const tabLabel = (id) => (TABS.find((x) => x.id === id) || {}).label || id;
    $('#res-alerts').innerHTML = ws.length ? `<div class="alerts">${ws.map((w) => `
      <div class="alert ${w.level}"><span><span class="ico">${w.level === 'error' ? '✖' : w.level === 'warn' ? '▲' : '•'}</span>${esc(w.msg)}</span>
      ${w.tab ? `<button class="btn btn-sm btn-ghost no-print" data-act="ir" data-tab="${w.tab}" data-uid="${w.uid || ''}">Ir a ${esc(tabLabel(w.tab))}</button>` : ''}</div>`).join('')}</div>`
      : '<p class="alert-ok">✔ Sin alertas: todos los costos están asociados y tienen valores.</p>';
  }

  function apuTable(pt) {
    const cats = [['materiales', 'Materiales'], ['equipos', 'Equipos'], ['manoObra', 'Mano de obra'], ['otros', 'Otros']];
    const p = state.project;
    const byUid = new Map();
    cats.forEach(([k]) => p[k].forEach((it) => byUid.set(it.uid, it)));
    const body = cats.map(([k, label]) => {
      const lines = pt.items[k];
      if (!lines.length) return '';
      return `<tr class="apu-cat"><td colspan="4">${label}</td><td class="num">${clp(lines.reduce((a, l) => a + l.subtotal, 0))}</td></tr>` + lines.map((l) => {
        const it = byUid.get(l.uid) || {};
        const det = k === 'manoObra'
          ? `${nf(l.dhPorUnidadPartida)} DH por unidad`
          : `${nf(num(it.cantidad))} ${esc(it.unidad || '')} × ${clp(num(it.costoUnitario))}`;
        return `<tr><td class="code">${l.code}</td><td>${esc(l.descripcion || '—')}</td><td>${det}</td><td class="num">${clp(l.costoPorUnidadPartida)} / unid.</td><td class="num">${clp(l.subtotal)}</td></tr>`;
      }).join('');
    }).join('');
    return body ? `<table class="apu-table"><thead><tr><th>ID</th><th>Ítem</th><th>Cantidad por unidad de partida</th><th class="num">Costo por unidad</th><th class="num">Subtotal</th></tr></thead><tbody>${body}</tbody></table>`
      : '<p class="small muted" style="margin:8px 0 0">Esta partida no tiene costos asociados.</p>';
  }

  // ---------------------------------------------------------------------------
  //  GUÍA DE KPIs
  // ---------------------------------------------------------------------------
  function renderGuide() {
    document.title = 'Guía de KPIs · Formulación QUEMPIN';
    const card = (d) => `<article class="guide-card">
      <h3>${d.nombre}</h3>
      ${d.origen === 'Nuevo' ? '<span class="tag new">Nuevo indicador</span>' : `<span class="tag">Excel: ${esc(d.origen)}</span>`}
      <dl>
        <dt>Fórmula</dt><dd><span class="formula" style="font-family:ui-monospace,Consolas,monospace;font-size:12px">${esc(d.formula)}</span></dd>
        <dt>Qué mide</dt><dd>${esc(d.queMide)}</dd>
        <dt>Cómo aporta a la evaluación</dt><dd>${esc(d.aporte)}</dd>
        ${d.lectura ? `<dt>Semáforo</dt><dd>${esc(d.lectura)}</dd>` : ''}
      </dl>
    </article>`;
    app.innerHTML = `<div class="page">
      <div class="page-head"><div>
        <div class="eyebrow">Guía de indicadores</div>
        <h1>Cómo se evalúa un proyecto</h1>
        <div class="sub">Qué mide cada KPI, cómo se calcula y qué aporta a la decisión de ofertar.</div>
      </div></div>
      <section>
        <div class="section-head"><h2>Cómo calcula la herramienta</h2><p>Misma lógica del Excel de formulación de QUEMPIN.</p></div>
        <div class="model-steps">
          <div class="model-step"><h4>Partidas</h4><p>El proyecto se divide en partidas con unidad y cantidad (ej.: 3 medidores de 2").</p></div>
          <div class="model-step"><h4>Costos por unidad</h4><p>Materiales, equipos, mano de obra y otros se ingresan por unidad de partida y se multiplican por su cantidad.</p></div>
          <div class="model-step"><h4>Costo directo</h4><p>La suma de los cuatro tipos de costo. Opcional: gastos generales e imprevistos como % del costo directo.</p></div>
          <div class="model-step"><h4>Utilidad y precio</h4><p>Cada partida lleva su utilidad (% de recargo o monto fijo). Precio neto = costo total + utilidad.</p></div>
          <div class="model-step"><h4>IVA y evaluación</h4><p>Se agrega el IVA y se calculan los indicadores, con semáforos según las metas del proyecto.</p></div>
        </div>
      </section>
      <section class="section"><div class="section-head"><h2>Resultado económico</h2></div>
        <div class="guide-grid">${KP.KPIS.filter((d) => d.grupo === 'economico').map(card).join('')}</div></section>
      <section class="section"><div class="section-head"><h2>Indicadores de evaluación</h2></div>
        <div class="guide-grid">${KP.KPIS.filter((d) => d.grupo === 'indicador').map(card).join('')}</div></section>
      <section class="section">
        <div class="section-head"><h2>Cómo leerlos en conjunto</h2></div>
        <div class="card">
          <ul style="margin:0;padding-left:18px;color:var(--ink-2)">
            <li><strong>¿Conviene?</strong> Margen sobre venta y utilidad por día-hombre. El margen compara proyectos de distinto tamaño; la utilidad por DH compara proyectos que compiten por las mismas cuadrillas.</li>
            <li><strong>¿Es riesgoso?</strong> Holgura de MO, incidencia de MO y sensibilidad. Si la holgura es baja y la incidencia alta, un atraso pequeño se come la utilidad.</li>
            <li><strong>¿Podemos ganar?</strong> Competitividad frente al presupuesto del mandante. Sobre 100 % hay que revisar alcance o utilidad; muy por debajo, quizás se puede subir el precio.</li>
            <li><strong>¿Los números son confiables?</strong> Revisa las alertas de validación antes de exportar: un costo sin partida no suma.</li>
          </ul>
        </div>
      </section>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  //  Eventos
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
    if (el.dataset.t === 'num') { const n = parseFloat(el.value); return Number.isFinite(n) ? n : ''; }
    return el.value;
  }
  function findItem(list, uid) { return state.project[list].find((x) => x.uid === uid); }
  function focusKeyOf(el) {
    if (!el || !el.dataset) return null;
    if (el.dataset.list && el.dataset.uid) return `[data-list="${el.dataset.list}"][data-uid="${el.dataset.uid}"][data-k="${el.dataset.k}"]`;
    if (el.dataset.f) return `[data-f="${el.dataset.f}"]`;
    return null;
  }

  function onEdit(e) {
    const el = e.target;
    if (!state.project) {
      if (el.id === 'list-search') { state.listSearch = el.value; renderListBody(); }
      if (el.id === 'list-estado') { state.listEstado = el.value; renderListBody(); }
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
      if (/tarifa/.test(el.dataset.f)) { /* los encabezados de MO se actualizan al abrir esa pestaña */ }
    } else if (el.dataset.list && el.dataset.uid && el.dataset.k) {
      const it = findItem(el.dataset.list, el.dataset.uid);
      if (!it) return;
      const v = readVal(el);
      const same = it[el.dataset.k] === v;
      if (!same) it[el.dataset.k] = v;
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
      renderTab();
      return;
    } else if (el.dataset.actChange === 'add-from-cat' && e.type === 'change') {
      const c = state.project.catalogoOtros[+el.value];
      if (c) {
        const f = state.filtro.otros;
        const it = S.newOtro(f && f !== '__none__' ? f : '');
        Object.assign(it, { descripcion: c.descripcion, unidad: c.unidad || 'Un.', costoUnitario: num(c.costoUnitario) });
        state.project.otros.push(it);
        recalc(); renderTab(`[data-list="otros"][data-uid="${it.uid}"][data-k="${it.partida ? 'cantidad' : 'partida'}"]`);
        flashRow(it.uid);
        scheduleSave();
      }
      el.value = '';
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

  // Enter: baja a la fila siguiente; en la última fila agrega una nueva.
  app.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key !== 'Enter' || !el.dataset || !el.dataset.list || el.tagName !== 'INPUT') return;
    e.preventDefault();
    const rows = $$(`tr[data-row]`, $('#tab-body'));
    const tr = el.closest('tr');
    const idx = rows.indexOf(tr);
    if (idx >= 0 && idx < rows.length - 1) {
      const next = $(`[data-k="${el.dataset.k}"]`, rows[idx + 1]);
      if (next) { next.focus(); if (next.select) next.select(); }
    } else {
      addRow(el.dataset.list, el.dataset.k);
    }
  });

  function flashRow(uid) {
    const tr = $(`tr[data-row="${uid}"]`);
    if (!tr) return;
    tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    // Cierra menús desplegables abiertos al hacer clic fuera o en una opción
    $$('details.menu[open]').forEach((d) => { if (!d.contains(e.target) || (btn && d.contains(btn))) d.open = false; });
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    const p = state.project;
    try {
      switch (act) {
        case 'nuevo': {
          const np = S.newProject();
          S.upsert(np);
          goProject(np, 'ficha');
          setTimeout(() => { const t = $('[data-f="titulo"]'); if (t) t.focus(); }, 50);
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
          goProject(c, state.tab || 'ficha');
          break;
        }
        case 'eliminar': {
          const target = S.get(id);
          const v = await ask({
            title: 'Eliminar proyecto',
            body: `<p>¿Eliminar <b>${esc(target.codigo)} v${esc(target.version)}</b> «${esc(target.titulo || 'Sin título')}» de este navegador? Esta acción no se puede deshacer. Si lo necesitas después, expórtalo antes.</p>`,
            buttons: [{ label: 'Cancelar' }, { label: 'Exportar y eliminar', value: 'exp' }, { label: 'Eliminar', value: 'del', danger: true }]
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

        // ---- Editor
        case 'tab': state.tab = btn.dataset.tab; renderTab(); updateTabs(); window.scrollTo({ top: 0 }); break;
        case 'ver-alertas':
          state.tab = 'resumen'; renderTab(); updateTabs();
          setTimeout(() => { const a = $('#alertas'); if (a) a.scrollIntoView({ behavior: 'smooth' }); }, 30);
          break;
        case 'ir': {
          state.tab = btn.dataset.tab;
          if (DETALLE[state.tab]) state.filtro[state.tab] = '';
          renderTab(); updateTabs();
          if (btn.dataset.uid) setTimeout(() => flashRow(btn.dataset.uid), 30);
          break;
        }
        case 'add-row': addRow(btn.dataset.list); break;
        case 'dup-row': {
          const list = btn.dataset.list;
          const i = p[list].findIndex((x) => x.uid === btn.dataset.uid);
          if (i < 0) break;
          const c = Object.assign({}, p[list][i], { uid: S.uid() });
          p[list].splice(i + 1, 0, c);
          recalc(); renderTab(`[data-list="${list}"][data-uid="${c.uid}"][data-k="descripcion"]`); flashRow(c.uid); scheduleSave();
          break;
        }
        case 'del-row': {
          const list = btn.dataset.list;
          const uid = btn.dataset.uid;
          if (list === 'partidas') {
            const n = ['materiales', 'equipos', 'manoObra', 'otros'].reduce((a, k) => a + p[k].filter((x) => x.partida === uid).length, 0);
            if (n > 0) {
              const pt = state.partIdx.get(uid);
              const v = await ask({
                title: `Eliminar ${pt.code}`,
                body: `<p>La partida <b>${esc(pt.code)}</b> tiene <b>${n}</b> ítem(s) de costo asociados. ¿Qué hacemos con ellos?</p>`,
                buttons: [{ label: 'Cancelar' }, { label: 'Dejarlos sin partida', value: 'keep' }, { label: 'Eliminarlos también', value: 'all', danger: true }]
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
          const list = btn.dataset.list;
          const arr = p[list];
          const i = arr.findIndex((x) => x.uid === btn.dataset.uid);
          const j = i + parseInt(btn.dataset.dir, 10);
          if (i < 0 || j < 0 || j >= arr.length) break;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          recalc(); renderTab(); flashRow(btn.dataset.uid); scheduleSave();
          break;
        }
        case 'apply-util': {
          const v = parseFloat($('#util-all').value);
          if (!Number.isFinite(v)) { toast('Ingresa el % de recargo a aplicar.', true); break; }
          p.partidas.forEach((pt) => { pt.utilidadTipo = 'pct'; pt.utilidadValor = v; });
          recalc(); renderTab(); scheduleSave();
          toast(`Recargo de ${nf(v)} % aplicado a ${p.partidas.length} partidas`);
          break;
        }
        case 'add-cat': p.catalogoOtros.push({ descripcion: '', unidad: 'Un.', costoUnitario: 0 }); renderTab(`[data-cat="${p.catalogoOtros.length - 1}"][data-k="descripcion"]`); scheduleSave(); break;
        case 'del-cat': p.catalogoOtros.splice(+btn.dataset.i, 1); renderTab(); scheduleSave(); break;
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
          const uid = btn.dataset.uid;
          if (state.apuOpen.has(uid)) state.apuOpen.delete(uid); else state.apuOpen.add(uid);
          refreshResumen();
          break;
        }
        case 'imprimir':
          if (state.tab !== 'resumen') { state.tab = 'resumen'; renderTab(); updateTabs(); }
          setTimeout(() => window.print(), 150);
          break;
        default: break;
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'Ocurrió un error.', true);
    }
  });

  // Los menús se posicionan fijos para no quedar recortados por tablas con scroll
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.classList || !d.classList.contains('menu') || !d.open) return;
    $$('details.menu[open]').forEach((o) => { if (o !== d) o.open = false; });
    const list = $('.menu-list', d);
    const r = $('summary', d).getBoundingClientRect();
    list.style.position = 'fixed';
    list.style.right = 'auto';
    const w = list.offsetWidth, h = list.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const top = r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    list.style.left = left + 'px';
    list.style.top = top + 'px';
  }, true);
  const closeMenus = () => $$('details.menu[open]').forEach((d) => { d.open = false; });
  window.addEventListener('resize', closeMenus);
  document.addEventListener('scroll', (e) => { if (!(e.target.closest && e.target.closest('.menu-list'))) closeMenus(); }, true);

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
            buttons: [{ label: 'Omitir' }, { label: 'Importar como copia', value: 'copy' }, { label: 'Reemplazar', value: 'replace', primary: true }]
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
        <div class="grid-form" style="margin:14px 0">
          <div class="field"><label for="cfg-prefijo">Prefijo del código</label><input class="input" id="cfg-prefijo" value="${esc(cfg.prefijo)}"><span class="hint">Ej.: ${esc(cfg.prefijo)}-${new Date().getFullYear()}-001</span></div>
          <div class="field"><label for="cfg-resp">Responsable por defecto</label><input class="input" id="cfg-resp" value="${esc(cfg.responsable)}"></div>
        </div>
        <p class="small muted">Parámetros actuales: IVA ${nf(par.iva)} % · GG ${nf(par.gastosGenerales)} % · imprevistos ${nf(par.imprevistos)} % · tarifas ${clp(par.tarifaN1)} / ${clp(par.tarifaN2)} / ${clp(par.tarifaN3)} · margen objetivo ${nf(par.margenObjetivo)} %.
        Para cambiarlos, ajústalos en la ficha de un proyecto y usa «Usarlos como predeterminados».</p>`,
      buttons: [{ label: 'Restablecer valores de fábrica', value: 'reset', danger: true }, { label: 'Cancelar' }, { label: 'Guardar', value: 'save', primary: true }]
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
  }

  // ---- Tema ------------------------------------------------------------------------
  function toggleTheme() {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('qpn.tema', next); } catch (e) { /* sin almacenamiento */ }
  }

  route();
})();
