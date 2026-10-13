/*
 * pdf.js — PDF vectorial mínimo, sin librerías (2026-10-13).
 *
 * Lo usa la Carta Gantt (js/gantt.js) para descargar un PDF de verdad, no un diálogo de impresión:
 * rectángulos, líneas, polígonos, texto en Helvetica (con tildes y ñ, WinAnsiEncoding) y una imagen
 * JPEG (el logo). Coordenadas en puntos, con el origen arriba a la izquierda como en pantalla; el
 * cambio al sistema del PDF (origen abajo) se hace aquí.
 *
 *   const d = QPdf.documento({ ancho: 842, alto: 595 });   // A4 horizontal
 *   d.pagina();
 *   d.rect(40, 40, 100, 20, { fill: '#ff5100' });
 *   d.texto(40, 80, 'Carta Gantt', { size: 16, bold: true });
 *   const bytes = d.bytes();                                 // Uint8Array del archivo
 */
(function (root) {
  'use strict';

  // Anchos de Helvetica y Helvetica-Bold (AFM estándar, milésimas del cuerpo), ASCII 32–126.
  const ANCHO_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
    278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
    334, 260, 334, 584];
  const ANCHO_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
    722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
    333, 278, 333, 584, 556, 333,
    556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
    389, 280, 389, 584];
  // Fuera de ASCII: los que no son una letra con tilde (esas miden lo que su letra base).
  const ANCHO_OTROS = { '°': 400, '·': 278, '«': 556, '»': 556, '–': 556, '—': 1000, '‘': 222, '’': 222, '“': 333, '”': 333,
    '€': 556, '¿': 611, '¡': 333, '•': 350, '…': 1000, 'º': 365, 'ª': 370, '×': 584, '±': 584, '½': 834 };
  // Caracteres de WinAnsiEncoding fuera de Latin-1 (0x80–0x9F)
  const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };

  function anchoCaracter(c, bold) {
    const tabla = bold ? ANCHO_BOLD : ANCHO_REG;
    const k = c.charCodeAt(0);
    if (k >= 32 && k <= 126) return tabla[k - 32];
    if (ANCHO_OTROS[c]) return ANCHO_OTROS[c];
    const base = c.normalize('NFD').charAt(0);
    const kb = base.charCodeAt(0);
    return kb >= 32 && kb <= 126 ? tabla[kb - 32] : 556;
  }
  /* Ancho de un texto en puntos */
  function ancho(texto, size, bold) {
    let total = 0;
    for (const c of String(texto)) total += anchoCaracter(c, bold);
    return (total * (size || 10)) / 1000;
  }
  /* El texto recortado con «…» para que quepa en maxW puntos */
  function recortar(texto, size, bold, maxW) {
    const s = String(texto == null ? '' : texto);
    if (!(maxW > 0) || ancho(s, size, bold) <= maxW) return s;
    const punto = ancho('…', size, bold);
    let out = '';
    for (const c of s) {
      if (ancho(out + c, size, bold) + punto > maxW) break;
      out += c;
    }
    return out.replace(/\s+$/, '') + '…';
  }

  /* Bytes WinAnsi de un texto, escritos dentro de (…) con escapes octales: el archivo queda ASCII */
  function cadena(texto) {
    let out = '(';
    for (const c of String(texto)) {
      let k = c.charCodeAt(0);
      if (WIN[c]) k = WIN[c];
      else if (k > 255 || (k >= 0x80 && k < 0xA0)) {
        const base = c.normalize('NFD').charAt(0).charCodeAt(0);
        k = base < 128 ? base : 63; // «?»
      }
      if (c === '(' || c === ')' || c === '\\') out += '\\' + c;
      else if (k < 32 || k > 126) out += '\\' + k.toString(8).padStart(3, '0');
      else out += String.fromCharCode(k);
    }
    return out + ')';
  }

  function color(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return '0 0 0';
    return [m[1], m[2], m[3]].map((h) => (parseInt(h, 16) / 255).toFixed(3)).join(' ');
  }
  const n = (v) => (Math.round(v * 100) / 100).toString();

  function documento(opts) {
    const o = opts || {};
    const W = o.ancho || 842, H = o.alto || 595;
    const paginas = [];
    const imagenes = [];
    let actual = null;
    const Y = (y) => H - y;

    function pagina() {
      actual = [];
      paginas.push(actual);
      return api;
    }
    function trazo(st) {
      const s = st || {};
      const ops = [];
      if (s.fill) ops.push(`${color(s.fill)} rg`);
      if (s.stroke) ops.push(`${color(s.stroke)} RG ${n(s.lw || 0.5)} w`);
      ops.push(s.dash ? `[${s.dash.map(n).join(' ')}] 0 d` : '[] 0 d');
      return ops;
    }
    const pintura = (s) => (s && s.fill && s.stroke ? 'B' : s && s.fill ? 'f' : 'S');
    function rect(x, y, w, h, st) {
      actual.push(...trazo(st), `${n(x)} ${n(Y(y + h))} ${n(w)} ${n(h)} re ${pintura(st)}`);
      return api;
    }
    function linea(x1, y1, x2, y2, st) {
      actual.push(...trazo(Object.assign({ stroke: '#000000' }, st, { fill: null })), `${n(x1)} ${n(Y(y1))} m ${n(x2)} ${n(Y(y2))} l S`);
      return api;
    }
    function poligono(puntos, st) {
      if (!puntos.length) return api;
      const [p0, ...resto] = puntos;
      actual.push(...trazo(st), `${n(p0[0])} ${n(Y(p0[1]))} m ${resto.map((p) => `${n(p[0])} ${n(Y(p[1]))} l`).join(' ')} h ${pintura(st)}`);
      return api;
    }
    /* y es la línea base del texto. align: left | center | right (respecto de x). maxW recorta con «…». */
    function texto(x, y, s, st) {
      const t = st || {};
      const size = t.size || 9;
      const txt = t.maxW ? recortar(s, size, t.bold, t.maxW) : String(s == null ? '' : s);
      const w = ancho(txt, size, t.bold);
      const x0 = t.align === 'center' ? x - w / 2 : t.align === 'right' ? x - w : x;
      actual.push(`${color(t.color || '#000000')} rg BT /${t.bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(x0)} ${n(Y(y))} Td ${cadena(txt)} Tj ET`);
      return api;
    }
    /* JPEG (bytes del archivo) dibujado en el rectángulo x, y, w, h */
    function imagen(jpeg, px, py, x, y, w, h) {
      let i = imagenes.findIndex((im) => im.datos === jpeg);
      if (i < 0) { imagenes.push({ datos: jpeg, px, py }); i = imagenes.length - 1; }
      actual.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(Y(y + h))} cm /Im${i + 1} Do Q`);
      return api;
    }

    /* El archivo: objetos numerados, tabla xref con los desplazamientos en bytes y trailer */
    function bytes() {
      if (!paginas.length) pagina();
      const partes = [];
      const offsets = [];
      let largo = 0;
      const enc = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
      const poner = (b) => { partes.push(b); largo += b.length; };
      const objeto = (num, cuerpo) => { offsets[num] = largo; poner(enc(`${num} 0 obj\n${cuerpo}\nendobj\n`)); };
      poner(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
      // 1 catálogo, 2 páginas, 3 y 4 fuentes, 5.. imágenes, después cada página y su contenido
      const nImg = imagenes.length;
      const primeraPag = 5 + nImg;
      const kids = paginas.map((_, i) => `${primeraPag + i * 2} 0 R`).join(' ');
      objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
      objeto(2, `<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`);
      objeto(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      objeto(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      imagenes.forEach((im, i) => {
        const num = 5 + i;
        offsets[num] = largo;
        poner(enc(`${num} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.px} /Height ${im.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.datos.length} >>\nstream\n`));
        poner(im.datos);
        poner(enc('\nendstream\nendobj\n'));
      });
      const xobj = nImg ? ` /XObject << ${imagenes.map((_, i) => `/Im${i + 1} ${5 + i} 0 R`).join(' ')} >>` : '';
      paginas.forEach((ops, i) => {
        const np = primeraPag + i * 2;
        objeto(np, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> /Contents ${np + 1} 0 R >>`);
        const flujo = ops.join('\n');
        objeto(np + 1, `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
      });
      const total = primeraPag + paginas.length * 2;
      const inicioXref = largo;
      let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
      for (let i = 1; i < total; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
      poner(enc(`${xref}trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`));
      const out = new Uint8Array(largo);
      let k = 0;
      partes.forEach((b) => { out.set(b, k); k += b.length; });
      return out;
    }

    const api = { ancho: W, alto: H, pagina, rect, linea, poligono, texto, imagen, bytes, paginas: () => paginas.length };
    return api;
  }

  const api = { documento, ancho, recortar, _cadena: cadena };
  root.QPdf = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
