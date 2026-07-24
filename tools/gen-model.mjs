// Dev-only (not shipped, not tested): emit an original folded-paper surface as
// a plain-text OBJ — a herringbone accordion, kin to the crease-pattern linework
// (§5), rights-clean because it is computed here (D3/D4). Run:
//   node tools/gen-model.mjs > assets/model-fold.obj
// The mesh is deterministic; regenerating gives byte-identical output. It also
// writes assets/model-fold-render.svg — the same fold seen flat, for the front.

import { writeFileSync } from 'node:fs';

const NX = 12; // creases across
const NY = 8; //  panels down
const DX = 0.16; // column pitch
const DY = 0.26; // row pitch
const AMP = 0.14; // ridge height (the fold's depth)
const SHEAR = 0.06; // herringbone: the ridge line zig-zags row to row

const V = []; // vertices, row-major (j*(NX+1)+i)
for (let j = 0; j <= NY; j++) {
  for (let i = 0; i <= NX; i++) {
    const ridge = i % 2 === 0; // every other crease stands up
    const xShift = (ridge ? 0 : SHEAR) * (j % 2 === 0 ? 1 : -1); // the herringbone
    V.push([i * DX + xShift, j * DY, ridge ? 0 : AMP]);
  }
}

// centre on the origin, scale the longest axis to ~1.6 so it fills the view
let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
for (const p of V) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
const centre = min.map((m, k) => (m + max[k]) / 2);
const span = Math.max(...max.map((m, k) => m - min[k]));
const s = 1.6 / span;
const norm = V.map((p) => p.map((c, k) => (c - centre[k]) * s));

const idx = (i, j) => j * (NX + 1) + i + 1; // OBJ is 1-based
const faces = [];
for (let j = 0; j < NY; j++) {
  for (let i = 0; i < NX; i++) {
    // two triangles per panel, wound so the normals face the reader
    faces.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1)]);
    faces.push([idx(i, j), idx(i + 1, j + 1), idx(i, j + 1)]);
  }
}

const out = [];
out.push('# the fold — a herringbone accordion, generated (tools/gen-model.mjs)');
out.push('# original, computed here; no third-party geometry (D3/D4)');
out.push('o fold');
for (const p of norm) out.push(`v ${p.map((c) => c.toFixed(5)).join(' ')}`);
for (const f of faces) out.push(`f ${f.join(' ')}`);
process.stdout.write(out.join('\n') + '\n');

// ---- the card's front: a still wireframe of the SAME mesh, so a model card's
// face is a drawing of the 3D its back turns to (the poster the viewer shows
// until a hand draws, and on the deterministic stills). Computed here, D3/D4. ----
const AY = 0.62; const AX = 0.95; // a three-quarter view that stands the ridges up
const project = ([x, y, z]) => {
  const x1 = x * Math.cos(AY) + z * Math.sin(AY);
  const z1 = -x * Math.sin(AY) + z * Math.cos(AY);
  const y1 = y * Math.cos(AX) - z1 * Math.sin(AX);
  return [x1, y1];
};
const pts = norm.map(project);
let mnx = Infinity; let mny = Infinity; let mxx = -Infinity; let mxy = -Infinity;
for (const [px, py] of pts) { mnx = Math.min(mnx, px); mny = Math.min(mny, py); mxx = Math.max(mxx, px); mxy = Math.max(mxy, py); }
const W = 400; const H = 300; const pad = 26;
const sc = Math.min((W - 2 * pad) / (mxx - mnx), (H - 2 * pad) / (mxy - mny));
const cx = (W - (mxx - mnx) * sc) / 2; const cy = (H - (mxy - mny) * sc) / 2;
const tx = (px) => cx + (px - mnx) * sc;
const ty = (py) => cy + (mxy - py) * sc; // flip Y for screen space
const at = (i, j) => pts[j * (NX + 1) + i];
const poly = (verts) => verts.map(([px, py], k) => `${k ? 'L' : 'M'}${tx(px).toFixed(1)} ${ty(py).toFixed(1)}`).join(' ');
const paths = [];
for (let j = 0; j <= NY; j++) { const row = []; for (let i = 0; i <= NX; i++) row.push(at(i, j)); paths.push(poly(row)); }
for (let i = 0; i <= NX; i++) { const col = []; for (let j = 0; j <= NY; j++) col.push(at(i, j)); paths.push(poly(col)); }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">\n  <g stroke="#4a4034" stroke-width="1.1" fill="none" stroke-linejoin="round" stroke-linecap="round">\n    <path d="${paths.join(' ')}"/>\n  </g>\n</svg>\n`;
writeFileSync(new URL('../assets/model-fold-render.svg', import.meta.url), svg);
