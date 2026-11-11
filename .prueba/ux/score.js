// Índice de mejora UX: node score.js <base> <actual> [manual.json]
// Los indicadores manuales (U1, U5, U6, C1) se leen de manual.json: { base: {...}, actual: {...} }
const fs = require('fs');
const [b, a] = [process.argv[2] || 'base', process.argv[3] || 'it1'];
const mb = require(`./metrics-${b}.json`), ma = require(`./metrics-${a}.json`);
const man = JSON.parse(fs.readFileSync(__dirname + '/manual.json', 'utf8'));
const sum = (m, dev, k, filt) => Object.entries(m[dev].secciones).filter(([s]) => !filt || filt(s))
  .reduce((acc, [, arr]) => acc + arr.reduce((x, v) => x + v[k], 0), 0);
// Acciones principales sobrantes: por vista
const extraPrim = (m) => Object.values(m.desk.secciones).reduce((acc, arr) => acc + arr.reduce((x, v) => x + Math.max(0, v.primary - 1), 0), 0);
const val = (m, mm) => ({
  U1: mm.U1, U2: sum(m, 'desk', 'overflow') + sum(m, 'mob', 'overflow'), U3: sum(m, 'desk', 'small') + sum(m, 'mob', 'small'),
  U5: mm.U5, U6: mm.U6,
  S1: sum(m, 'desk', 'words'), S2: sum(m, 'desk', 'screens') + sum(m, 'mob', 'screens'),
  S3: sum(m, 'desk', 'ctrlFold') + sum(m, 'mob', 'ctrlFold'), S4: extraPrim(m),
  S5: sum(m, 'desk', 'dupPrecio', (s) => s === 'resumen') + sum(m, 'desk', 'dupMargen', (s) => s === 'resumen'),
  C1: mm.C1, C2: sum(m, 'desk', 'jargon'),
  guardNombre: sum(m, 'desk', 'unnamed') + sum(m, 'mob', 'unnamed'), guardErr: m.desk.errores.length + m.mob.errores.length
});
const B = val(mb, man.base), A = val(ma, man.actual);
const mej = (k) => (B[k] ? Math.min(1, (B[k] - A[k]) / B[k]) : 0);
const DIM = { 'Usabilidad': ['U1', 'U2', 'U3', 'U5', 'U6'], 'Sencillez': ['S1', 'S2', 'S3', 'S4', 'S5'], 'Claridad': ['C1', 'C2'] };
const r1 = (x) => Math.round(x * 100) / 100;
for (const [d, ks] of Object.entries(DIM)) {
  console.log(`\n${d}`);
  ks.forEach((k) => console.log(`  ${k.padEnd(4)} base ${String(r1(B[k])).padStart(8)}  actual ${String(r1(A[k])).padStart(8)}  mejora ${(mej(k) * 100).toFixed(1).padStart(6)} %`));
  console.log(`  => ${d}: ${(ks.reduce((x, k) => x + mej(k), 0) / ks.length * 100).toFixed(1)} %`);
}
console.log(`\nControles: sin nombre ${A.guardNombre} (base ${B.guardNombre}) · errores JS ${A.guardErr}`);
