/*
 * oportunidad.js — Una oportunidad de Mercado Público que llega desde el tablero «Oportunidades»
 * (pedido del usuario, 2026-10-16: «que desde la sección de oportunidades se pueda exportar el proyecto
 * al formulador, de manera que la información básica, como nombre, id, monto, etc, se agregue de manera
 * automática»).
 *
 * El botón «Llevar al Formulador» del tablero abre  #/oportunidad/<datos>,  con los datos públicos de la
 * licitación o compra ágil en JSON y base64url (sin «/», «+» ni «%»: pasan por el Portal y por el # sin
 * cambiar). El enlace puede venir de cualquier lado: todo se valida y se acota aquí, y app.js lo escribe
 * escapado.
 *
 * Solo interpreta y arma los campos: app.js crea el proyecto y lo pinta.
 *   leer(texto)               → la oportunidad validada, o null
 *   codificar(datos)          → el texto para el enlace (lo mismo que hace el tablero)
 *   campos(op)                → { titulo, cliente, idLicitacion, ubicacion, presupuesto, descripcion }
 *   aplicar(p, op, moneda)    → llena los campos vacíos del proyecto; devuelve qué llenó
 *   nombreCarpeta(op)         → el nombre con que se propone «Nueva carpeta» (hasta 100 caracteres)
 *   esDe(p, codigo)           → si el proyecto es de esa licitación (por su ID de licitación)
 */
(function (root) {
  'use strict';

  const CODIGO = /^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/;
  const FECHA = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/;

  /* Texto de la API: sin caracteres de control, espacios repetidos fuera y acotado. Con lineas, conserva
     los saltos de línea (la descripción). */
  function texto(v, max, lineas) {
    if (typeof v !== 'string') return '';
    let s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ');
    s = lineas ? s.split('\n').map((l) => l.replace(/[\t ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
      : s.replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
  }
  const fecha = (v) => (typeof v === 'string' && FECHA.test(v) ? FECHA.exec(v)[0] : '');
  const numero = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < max ? v : null);

  function deBase64url(t) {
    const b = String(t).replace(/-/g, '+').replace(/_/g, '/');
    const bin = root.atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new root.TextDecoder().decode(bytes);
  }
  function codificar(datos) {
    const bytes = new root.TextEncoder().encode(JSON.stringify(datos));
    let bin = '';
    bytes.forEach((c) => { bin += String.fromCharCode(c); });
    return root.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function leer(t) {
    if (typeof t !== 'string' || !/^[A-Za-z0-9_-]{8,24000}$/.test(t)) return null;
    let d;
    try { d = JSON.parse(deBase64url(t)); } catch (e) { return null; }
    if (!d || typeof d !== 'object' || d.v !== 1) return null;
    const codigo = typeof d.codigo === 'string' ? d.codigo.trim().toUpperCase() : '';
    if (!CODIGO.test(codigo)) return null;
    const v = d.visita && typeof d.visita === 'object' ? d.visita : {};
    return {
      codigo,
      compraAgil: d.compraAgil === true,
      nombre: texto(d.nombre, 300),
      organismo: texto(d.organismo, 200),
      unidad: texto(d.unidad, 200),
      comuna: texto(d.comuna, 80),
      region: texto(d.region, 120),
      tipo: /^[A-Z0-9]{1,6}$/.test(String(d.tipo || '')) ? String(d.tipo) : '',
      cierre: fecha(d.cierre),
      // Solo el monto que publicó el comprador: el tablero no manda el que estima por el tipo de licitación
      monto: numero(d.monto, 1e13),
      duracionMeses: numero(d.duracionMeses, 600),
      visita: fecha(v.fecha) ? { fecha: fecha(v.fecha), obligatoria: v.obligatoria === true ? true : v.obligatoria === false ? false : null, pasada: v.pasada === true } : null,
      descripcion: texto(d.descripcion, 2000, true),
      req: /^\d{1,6}$/.test(String(d.req || '')) ? String(d.req) : ''
    };
  }

  const dos = (n) => String(n).padStart(2, '0');
  /* «2026-11-05T15:01» → «05-11-2026 15:01» (la hora de Chile, como la publica Mercado Público) */
  function fechaHora(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || '');
    return m ? `${m[3]}-${m[2]}-${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : '';
  }
  function duracion(op) {
    const d = op.duracionMeses;
    if (!d) return '';
    if (op.compraAgil) return `entrega en ${Math.round(d * 30)} días`;
    return `contrato de ${d >= 1 ? `${Math.round(d)} ${Math.round(d) === 1 ? 'mes' : 'meses'}` : `${Math.round(d * 30)} días`}`;
  }
  const ubicacion = (op) => [op.comuna, op.region].filter(Boolean).join(', ');

  /* Lo que va en «Descripción / alcance»: el texto de la licitación y una línea con los datos que el
     Formulador no tiene dónde guardar (cierre, visita, duración). */
  function descripcion(op) {
    const datos = [
      `Mercado Público ${op.codigo}${op.compraAgil ? ' (compra ágil)' : op.tipo ? ` (licitación ${op.tipo})` : ''}`,
      op.cierre ? `cierre ${fechaHora(op.cierre)}` : '',
      op.visita ? `visita a terreno ${fechaHora(op.visita.fecha)}${op.visita.obligatoria ? ' (obligatoria)' : op.visita.obligatoria === false ? ' (optativa)' : ''}${op.visita.pasada ? ', ya pasó' : ''}` : '',
      duracion(op)
    ].filter(Boolean).join(' · ') + '.';
    return op.descripcion ? `${op.descripcion}\n\n${datos}` : datos;
  }

  function campos(op) {
    return {
      titulo: op.nombre,
      cliente: op.organismo,
      idLicitacion: op.codigo,
      ubicacion: ubicacion(op),
      presupuesto: op.monto,
      descripcion: descripcion(op)
    };
  }

  const vacio = (v) => !String(v === null || v === undefined ? '' : v).trim();
  /* Llena solo lo que el proyecto tiene vacío: lo que ya trajo la Planilla de Ingreso (o la carpeta)
     manda. El presupuesto, en pesos y con IVA (como el de la planilla), solo si el proyecto es en pesos. */
  function aplicar(p, op, moneda) {
    const c = campos(op);
    const hechos = [];
    [['titulo', 'título'], ['cliente', 'cliente'], ['idLicitacion', 'ID de licitación'], ['ubicacion', 'ubicación'], ['descripcion', 'descripción']].forEach(([k, nombre]) => {
      if (c[k] && vacio(p[k])) { p[k] = c[k]; hechos.push(nombre); }
    });
    const par = p.parametros || (p.parametros = {});
    if (c.presupuesto && (moneda || 'CLP') === 'CLP' && !(Number(par.presupuestoMaximo) > 0)) {
      par.presupuestoMaximo = Math.round(c.presupuesto);
      par.presupuestoIncluyeIva = true;
      hechos.push('presupuesto (con IVA)');
    }
    return hechos;
  }

  /* La carpeta «N°. Nombre» admite hasta 100 caracteres: se corta en una palabra */
  function nombreCarpeta(op) {
    const n = String(op.nombre || op.codigo).trim();
    if (n.length <= 100) return n;
    const corte = n.slice(0, 100);
    const i = corte.lastIndexOf(' ');
    return (i > 60 ? corte.slice(0, i) : corte).replace(/[\s.,;:–-]+$/, '');
  }

  const norma = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
  const esDe = (p, codigo) => !!codigo && norma(p && p.idLicitacion) === norma(codigo);

  root.QOportunidad = { leer, codificar, campos, aplicar, nombreCarpeta, esDe, fechaHora };
})(typeof window !== 'undefined' ? window : globalThis);
