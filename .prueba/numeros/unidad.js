// Prueba de js/numeros.js en Chrome real (copia de Visualizador Web/numeros.js de Finanzas QUEMPIN). node .prueba/numeros/unidad.js
const path = require('path');
const fs = require('fs');
const PW = process.env.PW || path.join(process.env.LOCALAPPDATA, 'quempin-pruebas', 'node_modules', 'playwright-core');
const { chromium } = require(PW);
const JS = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', '..', 'js', 'numeros.js'), 'utf8');

const HTML = `<!doctype html><meta charset="utf-8"><body>
<input id="cant" type="number" step="any" value="0">
<input id="ent" type="number" min="0" step="1" value="1500">
<input id="avance" type="number" min="0" max="100" step="5" value="10">
<input id="txt" type="text" inputmode="decimal" data-num value="1234567">
<input id="oc" type="text" inputmode="numeric" value="4500123456">
<input id="calc" type="text" inputmode="decimal" value="4.5">
<input id="nombre" type="text" value="hola">
<div id="zona"></div>
<script>
window.eventos = [];
document.addEventListener('input', (e) => eventos.push(['input', e.target.id, e.target.value]));
document.addEventListener('change', (e) => eventos.push(['change', e.target.id, e.target.value]));
</script>
<script data-canonico='#calc'>${JS}</script>`;

let fallas = 0, total = 0;
function ok(cond, msg, extra) { total++; if (!cond) { fallas++; console.log('FAIL ' + msg, extra === undefined ? '' : JSON.stringify(extra)); } else console.log('OK   ' + msg); }

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.setContent(HTML);
  const ver = (id) => page.evaluate((id) => { const el = document.getElementById(id); return { visto: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(el), valor: el.value, tipo: el.type, num: el.valueAsNumber }; }, id);
  const sel = (id) => page.evaluate((id) => { const el = document.getElementById(id); return [el.selectionStart, el.selectionEnd, Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(el).length]; }, id);

  console.log('Al cargar');
  let v = await ver('ent');
  ok(v.tipo === 'text' && v.visto === '1.500' && v.valor === '1500' && v.num === 1500, 'type=number -> texto «1.500», .value «1500»', v);
  v = await ver('txt');
  ok(v.visto === '1.234.567' && v.valor === '1.234.567', 'data-num formatea y .value es lo que se ve', v);
  v = await ver('calc');
  ok(v.visto === '4,5' && v.valor === '4.5', 'data-canonico: «4,5» visto, «4.5» leído', v);
  v = await ver('oc');
  ok(v.visto === '4500123456', 'inputmode numeric sin data-num queda sin puntos', v);

  console.log('Clic selecciona todo');
  for (const id of ['cant', 'ent', 'txt', 'oc', 'calc']) {
    await page.click('#nombre');
    await page.click('#' + id, { position: { x: 5, y: 5 } });
    const s = await sel(id);
    ok(s[0] === 0 && s[1] === s[2] && s[2] > 0, `clic en #${id} selecciona todo`, s);
  }
  await page.click('#nombre', { position: { x: 5, y: 5 } });
  let s = await sel('nombre');
  ok(s[0] === s[1], 'una caja de texto común no se selecciona entera', s);

  console.log('Escribir reemplaza al 0 y pone miles');
  await page.click('#nombre');
  await page.evaluate(() => { eventos.length = 0; });
  await page.click('#cant');
  await page.keyboard.type('1234567');
  v = await ver('cant');
  ok(v.visto === '1.234.567' && v.valor === '1234567', 'tecleado 1234567 -> «1.234.567»', v);
  const ultimoInput = await page.evaluate(() => eventos.filter((e) => e[0] === 'input').pop());
  ok(ultimoInput && ultimoInput[2] === '1234567', 'el código de la herramienta lee «1234567» en el input', ultimoInput);
  await page.keyboard.type(',5');
  v = await ver('cant');
  ok(v.visto === '1.234.567,5' && v.valor === '1234567.5', 'coma decimal', v);
  await page.keyboard.press('Tab');
  const cambio = await page.evaluate(() => eventos.filter((e) => e[0] === 'change').pop());
  ok(cambio && cambio[1] === 'cant' && cambio[2] === '1234567.5', 'change al salir, con el número sin formato', cambio);

  console.log('Cursor en medio');
  await page.click('#nombre');
  await page.click('#cant');
  await page.keyboard.type('1000');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // después del 1
  await page.keyboard.type('2');
  v = await ver('cant');
  s = await sel('cant');
  ok(v.visto === '12.000' && s[0] === 2, 'insertar en medio deja el cursor tras la cifra', [v.visto, s]);
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  v = await ver('cant');
  ok(v.visto === '120', 'borrar reagrupa', v);

  console.log('Punto tecleado');
  const tipear = async (id, texto) => { await page.click('#nombre'); await page.click('#' + id); await page.keyboard.type(texto); await page.keyboard.press('Tab'); return ver(id); };
  v = await tipear('cant', '1.500.000');
  ok(v.visto === '1.500.000' && v.valor === '1500000', '«1.500.000» tecleado = un millón y medio', v);
  v = await tipear('cant', '2.5');
  ok(v.visto === '2,5' && v.valor === '2.5', '«2.5» tecleado = dos coma cinco', v);
  v = await tipear('cant', '12345.6');
  ok(v.visto === '12.345,6' && v.valor === '12345.6', '«12345.6» tecleado = decimal', v);
  v = await tipear('ent', '1.500');
  ok(v.visto === '1.500' && v.valor === '1500', 'entero: «1.500» = mil quinientos', v);
  v = await tipear('ent', '2,5');
  ok(v.valor === '25', 'entero: la coma no entra', v);
  v = await tipear('cant', '-3,25');
  ok(v.valor === '-3.25' && v.visto === '-3,25', 'negativos donde no hay min', v);
  v = await tipear('ent', '-7');
  ok(v.valor === '7', 'sin negativos donde min >= 0', v);

  console.log('Pegar');
  await page.evaluate(() => navigator.clipboard && 0);
  const pegar = async (id, texto) => {
    await page.click('#nombre'); await page.click('#' + id);
    await page.evaluate(([id, texto]) => { const el = document.getElementById(id); el.setRangeText(texto, el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: null })); }, [id, texto]);
    await page.keyboard.press('Tab'); return ver(id);
  };
  v = await pegar('cant', '$ 1.234.567');
  ok(v.valor === '1234567', 'pegar «$ 1.234.567»', v);
  v = await pegar('cant', '1234.56');
  ok(v.valor === '1234.56' && v.visto === '1.234,56', 'pegar «1234.56» (Copiar del Formulador)', v);
  v = await pegar('cant', '1,234.56');
  ok(v.valor === '1234.56', 'pegar «1,234.56»', v);

  console.log('Asignar desde el código');
  v = await page.evaluate(() => { const el = document.getElementById('cant'); el.value = 98765.4; return [Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(el), el.value]; });
  ok(v[0] === '98.765,4' && v[1] === '98765.4', '.value = 98765.4', v);
  v = await page.evaluate(() => { const el = document.getElementById('calc'); el.value = '4,5'; const a = el.value; el.value = 1.23e-7; return [a, el.value, Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(el)]; });
  ok(v[0] === '4.5' && v[1] === '0.000000123', 'valor guardado «4,5» y exponentes', v);
  v = await page.evaluate(() => { const el = document.getElementById('cant'); el.value = ''; return el.value; });
  ok(v === '', 'vaciar');

  console.log('Flechas');
  await page.click('#nombre'); await page.click('#avance');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  v = await ver('avance');
  ok(v.valor === '20', '↑ suma el paso (5)', v);
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowUp');
  v = await ver('avance');
  ok(v.valor === '100', 'respeta max', v);

  console.log('Cajas dibujadas después');
  await page.evaluate(() => { document.getElementById('zona').innerHTML = '<input id="nueva" type="number" step="any" value="2500000.5">'; });
  v = await ver('nueva');
  ok(v.visto === '2.500.000,5' && v.valor === '2500000.5', 'innerHTML con type=number', v);
  v = await page.evaluate(() => { document.getElementById('zona').innerHTML = '<input id="n2" type="number" value="7">'; return document.getElementById('n2').value; });
  ok(v === '7', '.value leído de inmediato tras innerHTML', v);

  console.log('Foco puesto por el código no pisa el cursor');
  v = await page.evaluate(() => new Promise((res) => { const el = document.getElementById('cant'); el.value = 1234; el.focus(); const n = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(el).length; el.setSelectionRange(n, n); setTimeout(() => res([el.selectionStart, el.selectionEnd, n]), 30); }));
  ok(v[0] === v[2] && v[1] === v[2], 'focus()+setSelectionRange se respeta', v);

  ok(errores.length === 0, 'sin errores de JavaScript', errores);
  await browser.close();
  console.log(`\n${total - fallas}/${total} verificaciones`);
  process.exit(fallas ? 1 : 0);
})();
