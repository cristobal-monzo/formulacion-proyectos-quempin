// Corre todas las suites del Formulador, una tras otra, y resume.
//   node .prueba/correr-todo.js            (desde la raíz del repositorio)
//
// Levanta los servidores estáticos que esperan las suites (puertos 8797, 8798 y
// 8799) y las corre en serie: en paralelo, o con la máquina cargada, las de punta
// a punta fallan por tiempo (medido el 2026-10-08). Termina con código 1 si alguna
// verificación falla. Playwright: ver .prueba/LEEME.md.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Asíncrono a propósito: con spawnSync este proceso, que también es el servidor de
// las páginas, quedaría bloqueado y las suites de navegador nunca cargarían.
function correr(archivo) {
  return new Promise((listo) => {
    const hijo = spawn(process.execPath, [archivo], { cwd: RAIZ });
    let salida = '';
    const limite = setTimeout(() => hijo.kill(), 300000);
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.on('close', (codigo) => { clearTimeout(limite); listo({ codigo, salida }); });
    hijo.on('error', (e) => { clearTimeout(limite); listo({ codigo: 1, salida: String(e) }); });
  });
}

const RAIZ = path.resolve(__dirname, '..');
const PUERTOS = [8797, 8798, 8799];
const SUITES = [
  'compartida/unidad', 'fusion/unidad', 'flujo/unidad', 'oferta/unidad', 'gantt/unidad', 'gantt/datos', 'pendientes/unidad', 'pegar/unidad', 'usuario/unidad', 'oportunidad/unidad', 'carpeta/unidad', 'numeros/unidad',
  'flujo/e2e', 'integracion/e2e', 'moneda/e2e', 'oferta/e2e', 'compartida/e2e', 'planilla/e2e', 'planilla/exportar', 'deshacer/e2e', 'ux/plegado', 'partida-base/e2e', 'ux/sin-scroll', 'candado/e2e', 'gantt/e2e',
  'pendientes/e2e', 'pegar/e2e', 'pegar/portal', 'usuario/e2e', 'oportunidad/e2e', 'carpeta/e2e', 'categoria/e2e', 'observaciones/e2e', 'enlace/e2e', 'buscar-costos/e2e', 'numeros/e2e', 'seleccion/e2e', 'costos-ancho/e2e'
];
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.xlsx': 'application/octet-stream'
};

function servidor(puerto) {
  return new Promise((listo, error) => {
    const srv = http.createServer((req, res) => {
      const ruta = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!ruta.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
      let archivo = ruta;
      try { if (fs.statSync(archivo).isDirectory()) archivo = path.join(archivo, 'index.html'); } catch (e) { /* 404 abajo */ }
      fs.readFile(archivo, (err, datos) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream' });
        res.end(datos);
      });
    });
    srv.on('error', error);
    srv.listen(puerto, '127.0.0.1', () => listo(srv));
  });
}

(async () => {
  let servidores;
  try {
    servidores = await Promise.all(PUERTOS.map(servidor));
  } catch (e) {
    console.error(`No se pudo abrir un puerto (${e.message}): ¿hay otro servidor de pruebas corriendo?`);
    process.exit(1);
  }
  const resumen = [];
  let fallas = 0;
  for (const suite of SUITES) {
    const inicio = Date.now();
    const r = await correr(path.join(__dirname, ...suite.split('/')) + '.js');
    const salida = r.salida;
    const ok = (salida.match(/^OK/gm) || []).length;
    const malos = salida.split(/\r?\n/).filter((l) => /^FAIL/.test(l));
    const total = salida.match(/^(\d+)\/(\d+) OK/m);
    const n = total ? Number(total[1]) : ok;
    const error = r.codigo !== 0 && !malos.length ? `terminó con código ${r.codigo}` : '';
    fallas += malos.length + (error ? 1 : 0);
    resumen.push(`${malos.length || error ? 'FALLA' : 'ok   '} ${suite.padEnd(18)} ${String(n).padStart(3)} verificaciones  ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
    malos.slice(0, 5).forEach((l) => resumen.push('        ' + l.slice(0, 220)));
    if (error) resumen.push('        ' + error + '\n        ' + salida.trim().split(/\r?\n/).slice(-3).join('\n        '));
  }
  servidores.forEach((s) => s.close());
  console.log(resumen.join('\n'));
  console.log(fallas ? `\n${fallas} falla(s).` : '\nTodas las suites pasan.');
  process.exit(fallas ? 1 : 0);
})();
