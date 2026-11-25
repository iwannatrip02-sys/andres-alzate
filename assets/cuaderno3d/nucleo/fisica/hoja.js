// hoja.js · una hoja de papel simulada en unidades físicas: dinámica proyectiva (Bouaziz et al. 2014) con flexión isométrica
// cuadrática (Bergou et al. 2006), contacto y dedo por proyección de posiciones.
//
// Marco del cuaderno: x a lo ancho (el lomo en x ≈ 0; la página derecha hacia +x), y hacia arriba (grosor del cuaderno),
// z a lo alto de la página (cabeza en -alto/2). Metros, kilogramos, segundos.
//
// La hoja es una malla nu × nv de partículas: i recorre el ancho (i = 0 es la columna cosida al lomo), j recorre el alto.
// Cada subpaso es Euler implícito: minimiza inercia + flexión + largo del papel + dedo, alternando
//   · paso local: cada arista apunta a donde está pero con su largo de reposo (el papel no se estira);
//   · paso global: un sistema lineal con matriz CONSTANTE (Cholesky en banda, factorizada una vez) que reparte todo.
// Flexión: para una hoja plana en reposo la energía es (D/2)∫|Δx|² dA con D = E·t³ / 12(1-ν²) (Δx = laplaciano de 5 puntos).
// Por eso la rigidez llega entera de la costura a la punta (un Gauss-Seidel solo no la propaga y todo papel sale igual de blando).
// Después: amarres al lomo (Kim et al. 2012), contacto con fricción contra el perfil de las pilas, tapas y mesa.
// Aire: arrastre normal ½·ρ·Cd·v² (la hoja cae flotando y el borde se queda atrás al pasarla).
// Determinista con paso fijo: el mismo guion da los mismos cuadros (para video).

const RHO_AIRE = 1.2;

export const PAPELES = {
  // gramaje g/m², calibre m, módulo E Pa (dirección de fibra, papel seco). D = E t³ / 12(1-ν²).
  bond90:       { nombre: 'Bond 90 g',        gramaje: 90,  calibre: 1.10e-4, modulo: 4.5e9 },
  dibujo150:    { nombre: 'Dibujo 150 g',     gramaje: 150, calibre: 1.85e-4, modulo: 4.0e9 },
  kraft120:     { nombre: 'Kraft 120 g',      gramaje: 120, calibre: 1.60e-4, modulo: 4.2e9 },
  cartulina250: { nombre: 'Cartulina 250 g',  gramaje: 250, calibre: 3.00e-4, modulo: 4.0e9 },
  acuarela300:  { nombre: 'Acuarela 300 g',   gramaje: 300, calibre: 4.20e-4, modulo: 2.6e9 },
  calco60:      { nombre: 'Calco 60 g',       gramaje: 60,  calibre: 0.65e-4, modulo: 3.5e9 },
};

export function rigidezFlexion({ calibre, modulo, poisson = 0.3 }) {
  return modulo * calibre ** 3 / (12 * (1 - poisson * poisson));
}

export class HojaFisica {
  constructor({ ancho, alto, nu = 15, nv = 21, papel = PAPELES.dibujo150, cd = 1.2, pliegue = 0.12, amortiguacion = 0.35,
                subpasos = 6, iteraciones = 2 }) {
    this.ancho = ancho; this.alto = alto; this.nu = nu; this.nv = nv;
    const n = this.n = nu * nv;
    this.hx = ancho / (nu - 1); this.hz = alto / (nv - 1);
    this.papel = papel;
    this.rhoA = papel.gramaje / 1000;                          // kg/m²
    this.D = rigidezFlexion(papel);
    this.calibre = papel.calibre;
    this.cArrastre = 0.5 * RHO_AIRE * cd / this.rhoA;          // 1/m: dv/dt = -c·|vn|·vn (no depende del área)
    this.cTangente = 0.5 * RHO_AIRE * 0.02 / this.rhoA;
    this.amortiguacion = amortiguacion;                        // 1/s, pérdidas internas del papel
    this.friccion = { estatica: 0.45, dinamica: 0.35 };        // papel sobre papel
    this.radio = papel.calibre * 0.5 + 0.00025;                // media hoja + holgura para que no parpadee contra la pila
    this.pliegue = pliegue;                                    // rigidez del pliegue en la costura, fracción de D
    this.subpasos = subpasos; this.iteraciones = iteraciones;
    this.factorLargo = 1;           // resortes del largo frente a la flexión: más alto = menos estirable pero converge lento
    this.pasadasLargo = 2;          // pasadas de proyección exacta del largo después del paso implícito

    this.pos = new Float64Array(3 * n); this.prev = new Float64Array(3 * n); this.vel = new Float64Array(3 * n);
    this.nor = new Float64Array(3 * n);
    this.invm = new Float64Array(n);
    const A = this.hx * this.hz;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const borde = (i === 0 || i === nu - 1 ? 0.5 : 1) * (j === 0 || j === nv - 1 ? 0.5 : 1);
      this.invm[j * nu + i] = i === 0 ? 0 : 1 / (this.rhoA * A * borde);
    }
    this.masa = this.rhoA * ancho * alto;

    // aristas (u, v y diagonales): el largo del papel
    const da = [], db = [], dl = [];
    const diag = Math.hypot(this.hx, this.hz);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      if (i < nu - 1) { da.push(k); db.push(k + 1); dl.push(this.hx); }
      if (j < nv - 1) { da.push(k); db.push(k + nu); dl.push(this.hz); }
      if (i < nu - 1 && j < nv - 1) { da.push(k); db.push(k + nu + 1); dl.push(diag); da.push(k + 1); db.push(k + nu); dl.push(diag); }
    }
    this.da = Int32Array.from(da); this.db = Int32Array.from(db); this.dl = Float64Array.from(dl);
    this.pe = new Float64Array(3 * da.length);                 // proyecciones locales

    // amarres: cada punto contra la costura a su misma altura y en las dos puntas del lomo
    const aq = [], az = [], al = [];
    for (let j = 0; j < nv; j++) for (let i = 1; i < nu; i++) for (const jr of new Set([j, 0, nv - 1])) {
      aq.push(j * nu + i); az.push(-alto / 2 + jr * this.hz); al.push(Math.hypot(i * this.hx, (j - jr) * this.hz));
    }
    this.amq = Int32Array.from(aq); this.amz = Float64Array.from(az); this.aml = Float64Array.from(al);

    this.raiz = { x: 0, y: 0, dx: 0, dy: 1 };
    this.gravedad = [0, -9.81, 0];
    this.perfil = null;             // { xs, ys } sólido por debajo
    this.agarre = null;
    this.dormida = false; this.quietud = 0; this.t = 0; this.vmax = 0;
    this._sist = null;
  }

  // ── sistema lineal: (M/h² + K_flexión + w·Σ DᵀD (+ dedo)) x = ... ── (se rearma solo si cambia h o el dedo)
  _armar(h) {
    const { nu, nv, hx, hz, invm } = this;
    const nf = nv * (nu - 1), b = 2 * (nu - 1) + 1, B = b + 1;
    const libre = (q) => { const i = q % nu; return i === 0 ? -1 : Math.floor(q / nu) * (nu - 1) + (i - 1); };
    const band = new Float64Array(nf * B);
    const sumar = (f, g, v) => { if (g > f) [f, g] = [g, f]; band[f * B + (f - g)] += v; };
    const fijo = [];                                         // [f, fila de raíz, coef]: parte de K que toca la raíz
    const plantilla = (nodos, pesos, k) => {
      for (let s = 0; s < nodos.length; s++) {
        const fs = libre(nodos[s]); if (fs < 0) continue;
        for (let t = 0; t < nodos.length; t++) {
          const ft = libre(nodos[t]), v = k * pesos[s] * pesos[t];
          if (ft < 0) fijo.push([fs, Math.floor(nodos[t] / nu), v]); else if (ft <= fs) sumar(fs, ft, v);
        }
      }
    };
    const A = hx * hz, wu = 1 / hx ** 2, wv = 1 / hz ** 2, wc = -2 * (wu + wv);
    // flexión interior y de bordes
    for (let j = 1; j < nv - 1; j++) for (let i = 1; i < nu - 1; i++) { const k0 = j * nu + i; plantilla([k0, k0 - 1, k0 + 1, k0 - nu, k0 + nu], [wc, wu, wu, wv, wv], this.D * A); }
    for (let i = 1; i < nu - 1; i++) for (const j of [0, nv - 1]) { const k = j * nu + i; plantilla([k - 1, k, k + 1], [wu, -2 * wu, wu], this.D * A * 0.5); }
    for (let j = 1; j < nv - 1; j++) { const k = j * nu + nu - 1; plantilla([k - nu, k, k + nu], [wv, -2 * wv, wv], this.D * A * 0.5); }
    // pliegue en la costura: el primer tramo prefiere salir en la dirección de la raíz
    const kr = this.pliegue > 0 ? this.pliegue * this.D * A * 0.5 / hx ** 4 : 0;
    if (kr) for (let j = 0; j < nv; j++) band[libre(j * nu + 1) * B] += kr;
    // largo del papel: resortes rígidos frente a la flexión y a la inercia del subpaso (casi inextensible)
    const diagM = new Float64Array(nf);
    for (let q = 0; q < this.n; q++) { const f = libre(q); if (f >= 0) { diagM[f] = 1 / invm[q] / (h * h); band[f * B] += diagM[f]; } }
    const kmax = Math.max(this.D * A * wc * wc, diagM[0] * 4);
    const ws = this.rigidezLargo = this.factorLargo * kmax;
    const aristas = [];
    for (let e = 0; e < this.da.length; e++) {
      const fa = libre(this.da[e]), fb = libre(this.db[e]);
      if (fa >= 0) band[fa * B] += ws;
      if (fb >= 0) band[fb * B] += ws;
      if (fa >= 0 && fb >= 0) sumar(fa, fb, -ws);
      aristas.push([fa, fb]);
    }
    // dedo: ½·w·|Σ wₖxₖ − objetivo|²
    let dedo = null;
    if (this.agarre) {
      const g = this.agarre, ks = this._nodosAgarre();
      const fs = ks.map(libre);
      for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) if (fs[s] >= 0 && fs[t] >= 0 && fs[t] <= fs[s]) sumar(fs[s], fs[t], g.rigidez * g.w[s] * g.w[t]);
      dedo = { fs, ks };
    }
    // Cholesky en banda
    for (let i = 0; i < nf; i++) {
      for (let k = Math.max(0, i - b); k <= i; k++) {
        let s = band[i * B + (i - k)];
        for (let p = Math.max(0, i - b, k - b); p < k; p++) s -= band[i * B + (i - p)] * band[k * B + (k - p)];
        if (k === i) band[i * B] = Math.sqrt(s); else band[i * B + (i - k)] = s / band[k * B];
      }
    }
    this._sist = { h, nf, b, B, band, diagM, fijo, kr, ws, aristas, dedo, conDedo: !!this.agarre, libre,
                   rhs: [new Float64Array(nf), new Float64Array(nf), new Float64Array(nf)], sol: new Float64Array(nf) };
  }

  _resolverBanda(rhs, out) {
    const { nf, b, B, band } = this._sist;
    for (let i = 0; i < nf; i++) {
      let s = rhs[i];
      for (let p = Math.max(0, i - b); p < i; p++) s -= band[i * B + (i - p)] * out[p];
      out[i] = s / band[i * B];
    }
    for (let i = nf - 1; i >= 0; i--) {
      let s = out[i];
      for (let p = i + 1; p <= Math.min(nf - 1, i + b); p++) s -= band[p * B + (p - i)] * out[p];
      out[i] = s / band[i * B];
    }
  }

  // ── estado ──
  colocar(curva) {
    const { nu, nv, pos, prev, vel } = this;
    for (let j = 0; j < nv; j++) {
      const z = -this.alto / 2 + j * this.hz;
      for (let i = 0; i < nu; i++) { const k = 3 * (j * nu + i), p = curva(i * this.hx); pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = z; }
    }
    prev.set(pos); vel.fill(0);
    this.despertar();
  }
  // copiar el estado de otra malla igual (para fusionar o duplicar)
  copiarDe(otra) { this.pos.set(otra.pos); this.prev.set(otra.prev); this.vel.set(otra.vel); this.despertar(); }
  fijarRaiz(x, y, dx, dy) { const L = Math.hypot(dx, dy) || 1; this.raiz = { x, y, dx: dx / L, dy: dy / L }; this.despertar(); }
  despertar() { this.dormida = false; this.quietud = 0; }

  _bilineal(u, v) {
    const fu = Math.min(Math.max(u, 0), 1) * (this.nu - 1), fv = Math.min(Math.max(v, 0), 1) * (this.nv - 1);
    const i0 = Math.min(Math.floor(fu), this.nu - 2), j0 = Math.min(Math.floor(fv), this.nv - 2);
    const a = fu - i0, b = fv - j0;
    return { i0, j0, w: [(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b] };
  }
  _nodosAgarre() { const { i0, j0 } = this.agarre, nu = this.nu; return [j0 * nu + i0, j0 * nu + i0 + 1, (j0 + 1) * nu + i0, (j0 + 1) * nu + i0 + 1]; }

  puntoMaterial(u, v, out = [0, 0, 0]) {
    const { i0, j0, w } = this._bilineal(u, v), nu = this.nu, p = this.pos;
    const ks = [j0 * nu + i0, j0 * nu + i0 + 1, (j0 + 1) * nu + i0, (j0 + 1) * nu + i0 + 1];
    out[0] = out[1] = out[2] = 0;
    for (let q = 0; q < 4; q++) { const k = 3 * ks[q]; out[0] += w[q] * p[k]; out[1] += w[q] * p[k + 1]; out[2] += w[q] * p[k + 2]; }
    return out;
  }

  // el dedo toma el punto material (u, v): un resorte firme (N/m) hacia el objetivo
  agarrar(u, v, objetivo, rigidez = 300) {
    this.agarre = { ...this._bilineal(u, v), u, v, obj: [...objetivo], rigidez };
    this._sist = null; this.despertar();
  }
  moverAgarre(o) { if (this.agarre) { this.agarre.obj[0] = o[0]; this.agarre.obj[1] = o[1]; this.agarre.obj[2] = o[2]; this.despertar(); } }
  soltar() { if (this.agarre) { this.agarre = null; this._sist = null; this.despertar(); } }

  // objetivo del dedo al alcance del papel (no se estira) y por encima del perfil (no hunde la hoja en la pila).
  // Alcanzable = dentro de la distancia sobre el papel a CADA punto de la costura: se proyecta sobre las esferas de la costura
  // a su misma altura y de las dos puntas del lomo (las que mandan), unas pocas veces.
  _objetivoDedo() {
    const g = this.agarre, R = this.raiz, o = g.obj, H = this.alto;
    const zv = -H / 2 + g.v * H, uw = g.u * this.ancho;
    let tx = o[0], ty = o[1], tz = o[2];
    for (let it = 0; it < 4; it++) for (const zr of [zv, -H / 2, H / 2]) {
      const alc = Math.max(Math.hypot(uw, zv - zr) * 0.995, 0.004);
      const dx = tx - R.x, dy = ty - R.y, dz = tz - zr, d = Math.hypot(dx, dy, dz);
      if (d > alc) { const f = alc / d; tx = R.x + dx * f; ty = R.y + dy * f; tz = zr + dz * f; }
    }
    if (this.perfil) { const F = this.alturaPerfil(tx); if (ty < F + this.radio) ty = F + this.radio; }
    return [tx, ty, tz];
  }

  // ─────────────────────────────── paso ───────────────────────────────
  paso(dt, sub = this.subpasos, otras = null) {
    if (this.dormida && !this.agarre) return;
    const h = dt / sub;
    if (!this._sist || this._sist.h !== h || this._sist.conDedo !== !!this.agarre) this._armar(h);
    for (let s = 0; s < sub; s++) this._subpaso(h, otras);
    this.t += dt;
    let vmax = 0;
    for (let k = 0; k < this.vel.length; k++) vmax = Math.max(vmax, Math.abs(this.vel[k]));
    this.vmax = vmax;
    if (!this.agarre && vmax < 0.004) { this.quietud += dt; if (this.quietud > 0.4) this.dormida = true; } else this.quietud = 0;
  }

  _normales() {
    const { nu, nv, pos, nor } = this;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      const a = 3 * (j * nu + Math.min(i + 1, nu - 1)), b = 3 * (j * nu + Math.max(i - 1, 0));
      const c = 3 * (Math.min(j + 1, nv - 1) * nu + i), d = 3 * (Math.max(j - 1, 0) * nu + i);
      const ux = pos[a] - pos[b], uy = pos[a + 1] - pos[b + 1], uz = pos[a + 2] - pos[b + 2];
      const vx = pos[c] - pos[d], vy = pos[c + 1] - pos[d + 1], vz = pos[c + 2] - pos[d + 2];
      // n = v × u: para la hoja plana sobre la pila derecha (u = +x, v = +z) apunta a +y (el frente)
      const nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux;
      const L = Math.hypot(nx, ny, nz) || 1;
      nor[3 * k] = nx / L; nor[3 * k + 1] = ny / L; nor[3 * k + 2] = nz / L;
    }
  }

  _subpaso(h, otras) {
    const { n, pos, prev, vel, invm, nor, nu, nv } = this;
    const [gx, gy, gz] = this.gravedad;
    this._normales();
    const amort = 1 / (1 + this.amortiguacion * h);
    // predicción x̃ = x + h·v + h²·g, con el aire (implícito en la normal) y las pérdidas
    for (let q = 0; q < n; q++) {
      const k = 3 * q;
      prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2];
      if (invm[q] === 0) continue;
      let vx = vel[k] + gx * h, vy = vel[k + 1] + gy * h, vz = vel[k + 2] + gz * h;
      const nx = nor[k], ny = nor[k + 1], nz = nor[k + 2];
      const vn = vx * nx + vy * ny + vz * nz, vn2 = vn / (1 + this.cArrastre * Math.abs(vn) * h);
      const tx = vx - vn * nx, ty = vy - vn * ny, tz = vz - vn * nz;
      const ft = 1 / (1 + this.cTangente * Math.hypot(tx, ty, tz) * h);
      vel[k] = (tx * ft + vn2 * nx) * amort; vel[k + 1] = (ty * ft + vn2 * ny) * amort; vel[k + 2] = (tz * ft + vn2 * nz) * amort;
      pos[k] += vel[k] * h; pos[k + 1] += vel[k + 1] * h; pos[k + 2] += vel[k + 2] * h;
    }
    const R = this.raiz;
    for (let j = 0; j < nv; j++) { const k = 3 * j * nu; pos[k] = R.x; pos[k + 1] = R.y; pos[k + 2] = -this.alto / 2 + j * this.hz; }
    // Euler implícito por dinámica proyectiva
    this._implicito();
    // largo exacto, amarres y contacto
    for (let it = 0; it < this.pasadasLargo; it++) this._estirar();
    this._amarres();
    if (otras) for (const o of otras) this._ordenar(o.hoja, o.yoArriba);
    if (this.perfil) this._contacto();
    const ih = 1 / h;
    for (let k = 0; k < 3 * n; k++) vel[k] = (pos[k] - prev[k]) * ih;
  }

  _implicito() {
    const S = this._sist, { nu, nv, pos, hx, da, db, dl, pe } = this, R = this.raiz;
    const nf = S.nf, ws = S.ws;
    // parte fija del lado derecho: inercia (M x̃ / h²), raíz y pliegue
    const base = S.rhs;
    for (let e = 0; e < 3; e++) {
      const r = base[e];
      for (let j = 0; j < nv; j++) for (let i = 1; i < nu; i++) { const f = j * (nu - 1) + i - 1; r[f] = S.diagM[f] * pos[3 * (j * nu + i) + e]; }
      for (const [f, jr, v] of S.fijo) r[f] -= v * (e === 0 ? R.x : e === 1 ? R.y : -this.alto / 2 + jr * this.hz);
      if (S.kr) for (let j = 0; j < nv; j++) r[j * (nu - 1)] += S.kr * (e === 0 ? R.x + hx * R.dx : e === 1 ? R.y + hx * R.dy : -this.alto / 2 + j * this.hz);
    }
    let objetivo = null;
    if (this.agarre) objetivo = this._objetivoDedo();
    const rhs = this._rhsIter || (this._rhsIter = new Float64Array(nf));
    for (let it = 0; it < this.iteraciones; it++) {
      // paso local: cada arista con su largo de reposo en la dirección actual
      for (let c = 0; c < da.length; c++) {
        const ka = 3 * da[c], kb = 3 * db[c];
        const dx = pos[ka] - pos[kb], dy = pos[ka + 1] - pos[kb + 1], dz = pos[ka + 2] - pos[kb + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-12, f = dl[c] / L;
        pe[3 * c] = dx * f; pe[3 * c + 1] = dy * f; pe[3 * c + 2] = dz * f;
      }
      // paso global, por componente
      for (let e = 0; e < 3; e++) {
        rhs.set(base[e]);
        for (let c = 0; c < da.length; c++) {
          const [fa, fb] = S.aristas[c], p = ws * pe[3 * c + e];
          if (fa >= 0) rhs[fa] += p + (fb < 0 ? ws * pos[3 * db[c] + e] : 0);
          if (fb >= 0) rhs[fb] += -p + (fa < 0 ? ws * pos[3 * da[c] + e] : 0);
        }
        if (objetivo) { const g = this.agarre; for (let s = 0; s < 4; s++) { const f = S.dedo.fs[s]; if (f >= 0) rhs[f] += g.rigidez * g.w[s] * objetivo[e]; } }
        this._resolverBanda(rhs, S.sol);
        for (let j = 0; j < nv; j++) for (let i = 1; i < nu; i++) pos[3 * (j * nu + i) + e] = S.sol[j * (nu - 1) + i - 1];
      }
    }
  }

  _estirar() {
    const { da, db, dl, invm, pos } = this;
    for (let c = 0; c < da.length; c++) {
      const a = da[c], b = db[c], wa = invm[a], wb = invm[b], w = wa + wb;
      if (w === 0) continue;
      const ka = 3 * a, kb = 3 * b;
      const dx = pos[ka] - pos[kb], dy = pos[ka + 1] - pos[kb + 1], dz = pos[ka + 2] - pos[kb + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-12) continue;
      const lam = -(L - dl[c]) / w / L;
      pos[ka] += wa * lam * dx; pos[ka + 1] += wa * lam * dy; pos[ka + 2] += wa * lam * dz;
      pos[kb] -= wb * lam * dx; pos[kb + 1] -= wb * lam * dy; pos[kb + 2] -= wb * lam * dz;
    }
  }

  // amarre unilateral: |x − costura(z)| ≤ distancia sobre el papel
  _amarres() {
    const { amq, amz, aml, pos } = this, R = this.raiz;
    for (let c = 0; c < amq.length; c++) {
      const k = 3 * amq[c];
      const dx = pos[k] - R.x, dy = pos[k + 1] - R.y, dz = pos[k + 2] - amz[c];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L <= aml[c]) continue;
      const f = aml[c] / L;
      pos[k] = R.x + dx * f; pos[k + 1] = R.y + dy * f; pos[k + 2] = amz[c] + dz * f;
    }
  }

  // la hoja «de arriba» (más girada hacia la izquierda) debe quedar por encima de la otra: ángulo alrededor de la raíz
  _ordenar(otra, yoArriba) {
    const nu = this.nu, nv = this.nv, A = this.pos, B = otra.pos, Ra = this.raiz, Rb = otra.raiz;
    const sep = (this.calibre + otra.calibre) * 0.5 + 0.0002;
    for (let j = 0; j < nv; j++) for (let i = 1; i < nu; i++) {
      const k = 3 * (j * nu + i);
      const ax = A[k] - Ra.x, ay = A[k + 1] - Ra.y, bx = B[k] - Rb.x, by = B[k + 1] - Rb.y;
      const ra = Math.hypot(ax, ay), rb = Math.hypot(bx, by);
      if (ra < 1e-6 || rb < 1e-6) continue;
      const ta = Math.atan2(ay, ax), tb = Math.atan2(by, bx);
      const eps = sep / Math.min(ra, rb);
      const falta = yoArriba ? tb + eps - ta : ta + eps - tb;
      if (falta <= 0) continue;
      const d = falta * 0.5 * (yoArriba ? 1 : -1);
      A[k] = Ra.x + ra * Math.cos(ta + d); A[k + 1] = Ra.y + ra * Math.sin(ta + d);
      B[k] = Rb.x + rb * Math.cos(tb - d); B[k + 1] = Rb.y + rb * Math.sin(tb - d);
    }
  }

  alturaPerfil(x) {
    const { xs, ys } = this.perfil, m = xs.length;
    if (x <= xs[0] || x >= xs[m - 1]) return -Infinity;
    let lo = 0, hi = m - 1;
    while (hi - lo > 1) { const md = (lo + hi) >> 1; if (xs[md] <= x) lo = md; else hi = md; }
    return ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  }

  // sólido por debajo de la polilínea (xs creciente): al punto más cercano del borde, con fricción de Coulomb
  _contacto() {
    const { xs, ys } = this.perfil, m = xs.length, pos = this.pos, prev = this.prev, invm = this.invm;
    const r = this.radio, { estatica, dinamica } = this.friccion;
    let ymax = -Infinity; for (let q = 0; q < m; q++) ymax = Math.max(ymax, ys[q]);
    for (let q = 0; q < this.n; q++) {
      if (invm[q] === 0) continue;
      const k = 3 * q, x = pos[k], y = pos[k + 1];
      if (y > ymax + r || x <= xs[0] || x >= xs[m - 1]) continue;
      let lo = 0, hi = m - 1;
      while (hi - lo > 1) { const md = (lo + hi) >> 1; if (xs[md] <= x) lo = md; else hi = md; }
      const F = ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
      const pen = F + r - y;
      if (pen <= 0) continue;
      let best = Infinity, qx = x, qy = F, nx = 0, ny = 1;
      let a = lo; while (a > 0 && xs[a] > x - pen) a--;
      let b = hi; while (b < m - 1 && xs[b] < x + pen) b++;
      for (let s = a; s < b; s++) {
        const x0 = xs[s], y0 = ys[s], ex = xs[s + 1] - x0, ey = ys[s + 1] - y0;
        const L2 = ex * ex + ey * ey; if (L2 < 1e-16) continue;
        const t = Math.min(Math.max(((x - x0) * ex + (y - y0) * ey) / L2, 0), 1);
        const cx = x0 + ex * t, cy = y0 + ey * t, d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 < best) { best = d2; qx = cx; qy = cy; const L = Math.sqrt(L2); nx = -ey / L; ny = ex / L; }
      }
      if (ny < 0) { nx = -nx; ny = -ny; }
      const dpen = (qx + nx * r - x) * nx + (qy + ny * r - y) * ny;
      pos[k] = x + nx * dpen; pos[k + 1] = y + ny * dpen;
      const ddx = pos[k] - prev[k], ddy = pos[k + 1] - prev[k + 1], ddz = pos[k + 2] - prev[k + 2];
      const dn = ddx * nx + ddy * ny, tx = ddx - dn * nx, ty = ddy - dn * ny, tz = ddz;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 0) {
        const fr = tl < estatica * dpen ? 1 : Math.min(1, dinamica * dpen / tl);
        pos[k] -= tx * fr; pos[k + 1] -= ty * fr; pos[k + 2] -= tz * fr;
      }
    }
  }

  // ── medidas (pruebas) ──
  estiramiento() {   // máximo alargamiento relativo de las aristas (la compresión no cuenta: el papel se ondula)
    let m = 0; const p = this.pos;
    for (let c = 0; c < this.da.length; c++) {
      const ka = 3 * this.da[c], kb = 3 * this.db[c];
      m = Math.max(m, Math.hypot(p[ka] - p[kb], p[ka + 1] - p[kb + 1], p[ka + 2] - p[kb + 2]) / this.dl[c] - 1);
    }
    return m;
  }
}
