// A 3D model, turning where it lies (D190). The front of a model card is the
// depositor's chosen render — a still (§5); turned, the card shows the work
// itself, slowly rotating, and a hand may take hold and orbit it. The desk
// builds its own viewer rather than borrowing one (as it built its own player,
// D151): a small WebGL turntable, no dependency, nothing fetched but the model.
// A looping rotation is the one performance a back may summon (D72); the table
// itself never moves. When there is no WebGL to draw with, the poster the back
// already carries simply stays — the card still reads.

// ---- 4×4 matrices, column-major (WebGL's order) ----

const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
};
const perspective = (fovy, aspect, near, far) => {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
};
const translation = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };

// ---- OBJ → flat-shaded triangles + wireframe edges ----

function parseObj(text) {
  const verts = [];
  const tris = []; // [a,b,c] 0-based indices into verts
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const p = line.slice(2).trim().split(/\s+/).map(Number);
      if (p.length >= 3 && p.every(Number.isFinite)) verts.push(p);
    } else if (line.startsWith('f ')) {
      const ix = line.slice(2).trim().split(/\s+/).map((tok) => parseInt(tok.split('/')[0], 10) - 1);
      for (let k = 1; k + 1 < ix.length; k++) tris.push([ix[0], ix[k], ix[k + 1]]); // fan-triangulate
    }
  }
  const pos = [];
  const nrm = [];
  const edgeKeys = new Set();
  const edges = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const [a, b, c] of tris) {
    const va = verts[a]; const vb = verts[b]; const vc = verts[c];
    if (!va || !vb || !vc) continue;
    const n = cross(sub(vb, va), sub(vc, va));
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const fn = [n[0] / len, n[1] / len, n[2] / len];
    for (const v of [va, vb, vc]) { pos.push(v[0], v[1], v[2]); nrm.push(fn[0], fn[1], fn[2]); }
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push(verts[i][0], verts[i][1], verts[i][2], verts[j][0], verts[j][1], verts[j][2]);
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), edges: new Float32Array(edges) };
}

// ---- shaders ----

const FILL_VS = `attribute vec3 aPos; attribute vec3 aNormal;
uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vN;
void main(){ vN = mat3(uModel) * aNormal; gl_Position = uMVP * vec4(aPos,1.0); }`;
const FILL_FS = `precision mediump float; varying vec3 vN;
uniform vec3 uLight; uniform vec3 uInk; uniform vec3 uLit;
void main(){ float d = max(dot(normalize(vN), normalize(uLight)),0.0);
  gl_FragColor = vec4(mix(uInk,uLit,0.35+0.65*d),1.0); }`;
const LINE_VS = `attribute vec3 aPos; uniform mat4 uMVP;
void main(){ gl_Position = uMVP * vec4(aPos,1.0); }`;
const LINE_FS = `precision mediump float; uniform vec4 uColor;
void main(){ gl_FragColor = uColor; }`;

function program(gl, vs, fs) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  return p;
}

// ---- the mount: fetch, build, spin, orbit — returns a disposer ----

const SPIN = 0.007; // radians per frame at rest — furniture-slow (§4)

export function mountModel(container, src) {
  if (!container || !src) return { dispose() {} };
  const poster = container.querySelector('.back__model-poster');
  const canvas = document.createElement('canvas');
  canvas.className = 'back__model-gl';
  let gl = null;
  try { gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); } catch { /* none */ }
  if (!gl) return { dispose() {} }; // no WebGL: the poster stays, the card still reads

  container.append(canvas);
  if (poster) poster.style.visibility = 'hidden';

  let raf = 0;
  let disposed = false;
  let yaw = -0.5;
  let pitch = -0.42;
  let dragging = false;
  let last = null;
  let fill = null;
  let lineBuf = null;
  let nEdges = 0;

  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, container.clientWidth || 240);
    const h = Math.max(1, container.clientHeight || 200);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };

  const fillProg = program(gl, FILL_VS, FILL_FS);
  const lineProg = program(gl, LINE_VS, LINE_FS);
  const u = (p, name) => gl.getUniformLocation(p, name);
  const a = (p, name) => gl.getAttribLocation(p, name);

  fetch(src).then((r) => r.text()).then((text) => {
    if (disposed) return;
    const mesh = parseObj(text);
    fill = { pos: gl.createBuffer(), nrm: gl.createBuffer(), count: mesh.pos.length / 3 };
    gl.bindBuffer(gl.ARRAY_BUFFER, fill.pos); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, fill.nrm); gl.bufferData(gl.ARRAY_BUFFER, mesh.nrm, gl.STATIC_DRAW);
    lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, mesh.edges, gl.STATIC_DRAW);
    nEdges = mesh.edges.length / 3;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0); // the wireframe sits cleanly on the facets
    size();
    frame();
  }).catch(() => { /* the poster carries it */ });

  function frame() {
    if (disposed || !fill) return;
    if (!dragging) yaw += SPIN;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); // transparent: the parchment shows behind
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const model = mul(rotX(pitch), rotY(yaw));
    const view = translation(0, 0, -3.4);
    const proj = perspective(0.62, canvas.width / canvas.height, 0.1, 20);
    const mvp = mul(proj, mul(view, model));

    gl.useProgram(fillProg);
    gl.uniformMatrix4fv(u(fillProg, 'uMVP'), false, mvp);
    gl.uniformMatrix4fv(u(fillProg, 'uModel'), false, model);
    gl.uniform3f(u(fillProg, 'uLight'), 0.35, 0.6, 0.72);
    gl.uniform3f(u(fillProg, 'uInk'), 0.30, 0.26, 0.20);
    gl.uniform3f(u(fillProg, 'uLit'), 0.76, 0.67, 0.50);
    const ap = a(fillProg, 'aPos'); const an = a(fillProg, 'aNormal');
    gl.bindBuffer(gl.ARRAY_BUFFER, fill.pos); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, fill.nrm); gl.enableVertexAttribArray(an); gl.vertexAttribPointer(an, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, fill.count);

    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(u(lineProg, 'uMVP'), false, mvp);
    gl.uniform4f(u(lineProg, 'uColor'), 0.77, 0.60, 0.35, 0.85); // amber, as a thread
    const lp = a(lineProg, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, nEdges);

    raf = requestAnimationFrame(frame);
  }

  // a hand takes hold: drag turns the model, and lets go into the slow spin
  const down = (e) => { dragging = true; last = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId); };
  const move = (e) => {
    if (!dragging || !last) return;
    yaw += (e.clientX - last.x) * 0.01;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - last.y) * 0.01));
    last = { x: e.clientX, y: e.clientY };
  };
  const up = () => { dragging = false; last = null; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  const onResize = () => size();
  addEventListener('resize', onResize);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('resize', onResize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      if (poster) poster.style.visibility = '';
    },
  };
}
