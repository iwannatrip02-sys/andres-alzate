// procedural.js · texturas hechas por código (cero imagen generativa): grano de papel, tela de lino, cuero, cartón kraft,
// madera de la mesa. Todas repetibles (sin costura) y deterministas por semilla.
import * as THREE from 'three';

// ── ruido de gradiente periódico (Perlin) ──
function permutacion(semilla) {
  const p = new Uint8Array(512), a = new Uint8Array(256);
  let s = semilla >>> 0 || 1;
  for (let i = 0; i < 256; i++) a[i] = i;
  for (let i = 255; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  return p;
}
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y) { const g = h & 7; const u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); }
// ruido en [−1, 1] aprox., periódico con período (px, py) en celdas (≤ 256)
function perlin(p, x, y, px, py) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const u = fade(xf), v = fade(yf);
  const aa = p[p[x0 & 255] + (y0 & 255)], ab = p[p[x0 & 255] + (y1 & 255)], ba = p[p[x1 & 255] + (y0 & 255)], bb = p[p[x1 & 255] + (y1 & 255)];
  const l1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
  const l2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
  return (l1 + v * (l2 - l1)) * 0.5;
}
function fbm(p, x, y, base, oct, gan = 0.5) {
  let s = 0, a = 1, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) { s += a * perlin(p, x * f, y * f, base * f, base * f); norm += a; a *= gan; f *= 2; }
  return s / norm;
}
// celdas (Worley) periódicas: distancia al punto más cercano
function worley(semilla, n, celdas) {
  const p = permutacion(semilla), pts = new Float32Array(celdas * celdas * 2);
  for (let i = 0; i < celdas * celdas; i++) { pts[2 * i] = p[i & 511] / 255; pts[2 * i + 1] = p[(i * 7 + 3) & 511] / 255; }
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x / n * celdas, fy = y / n * celdas, cx = Math.floor(fx), cy = Math.floor(fy);
    let d1 = 9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox, gy = cy + oy, wx = ((gx % celdas) + celdas) % celdas, wy = ((gy % celdas) + celdas) % celdas;
      const k = wy * celdas + wx, dx = gx + pts[2 * k] - fx, dy = gy + pts[2 * k + 1] - fy;
      d1 = Math.min(d1, dx * dx + dy * dy);
    }
    out[y * n + x] = Math.sqrt(d1);
  }
  return out;
}

// altura → mapa de normales (tangente), repetible; en el alfa queda la altura (sirve de mottling)
function normalDeAltura(h, n, fuerza) {
  const datos = new Uint8Array(n * n * 4);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < h.length; i++) { mn = Math.min(mn, h[i]); mx = Math.max(mx, h[i]); }
  const rango = mx - mn || 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const xm = (x - 1 + n) % n, xp = (x + 1) % n, ym = (y - 1 + n) % n, yp = (y + 1) % n;
    const dx = (h[y * n + xp] - h[y * n + xm]) * fuerza, dy = (h[yp * n + x] - h[ym * n + x]) * fuerza;
    const L = Math.hypot(dx, dy, 1), k = 4 * (y * n + x);
    datos[k] = (-dx / L * 0.5 + 0.5) * 255; datos[k + 1] = (dy / L * 0.5 + 0.5) * 255; datos[k + 2] = (1 / L * 0.5 + 0.5) * 255;
    datos[k + 3] = (h[y * n + x] - mn) / rango * 255;
  }
  return datos;
}

function dataTex(datos, n, { srgb = false, repetir = true } = {}) {
  const t = new THREE.DataTexture(datos, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = repetir ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const cache = new Map();
const memo = (clave, f) => { if (!cache.has(clave)) cache.set(clave, f()); return cache.get(clave); };

// grano de papel: diente fino + fibras alargadas en la dirección de fabricación. ~1 repetición cada 4 cm.
export function granoPapel({ n = 512, semilla = 7, tipo = 'dibujo' } = {}) {
  return memo(`papel:${n}:${semilla}:${tipo}`, () => {
    const p = permutacion(semilla), q = permutacion(semilla + 11), h = new Float32Array(n * n);
    const diente = tipo === 'acuarela' ? 1.0 : tipo === 'liso' ? 0.25 : 0.55;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      const fino = fbm(p, u * 64, v * 64, 64, 3, 0.55);
      const fibra = fbm(q, u * 24, v * 96, 24, 2, 0.5);           // alargada en u
      const nube = fbm(p, u * 6, v * 6, 6, 3, 0.6);                // formación del papel (mottling)
      const acuarela = tipo === 'acuarela' ? Math.pow(Math.abs(fbm(q, u * 18, v * 18, 18, 3, 0.55)), 0.6) : 0;
      h[y * n + x] = diente * fino + 0.25 * fibra + 0.3 * nube + 0.9 * acuarela;
    }
    return dataTex(normalDeAltura(h, n, tipo === 'acuarela' ? 5 : 2.2), n);
  });
}

// tela de lino (tapas): trama y urdimbre con hilos irregulares
export function telaLino({ n = 512, semilla = 3, hilos = 96 } = {}) {
  return memo(`lino:${n}:${semilla}:${hilos}`, () => {
    const p = permutacion(semilla), h = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      const jx = fbm(p, u * 8, v * 32, 8, 2) * 0.35, jy = fbm(p, u * 32 + 5, v * 8, 32, 2) * 0.35;
      const a = (u * hilos + jx), b = (v * hilos + jy);
      const urd = Math.abs(Math.sin(Math.PI * a)), tra = Math.abs(Math.sin(Math.PI * b));
      const par = (Math.floor(a) + Math.floor(b)) & 1;            // tafetán: arriba/abajo alternado
      const grueso = 0.7 + 0.3 * fbm(p, u * 4, v * 40, 4, 2);      // nudos (slubs)
      h[y * n + x] = (par ? urd * 0.9 + tra * 0.4 : tra * 0.9 + urd * 0.4) * grueso + 0.15 * fbm(p, u * 128, v * 128, 128, 1);
    }
    return dataTex(normalDeAltura(h, n, 3.2), n);
  });
}

// cuero: celdas irregulares con poros
export function cuero({ n = 512, semilla = 5 } = {}) {
  return memo(`cuero:${n}:${semilla}`, () => {
    const w = worley(semilla, n, 40), p = permutacion(semilla), h = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n, k = y * n + x;
      h[k] = -Math.pow(1 - Math.min(w[k] * 1.4, 1), 2) * 0.0 + Math.min(w[k], 0.7) + 0.25 * fbm(p, u * 90, v * 90, 90, 2) + 0.4 * fbm(p, u * 5, v * 5, 5, 3);
    }
    return dataTex(normalDeAltura(h, n, 2.4), n);
  });
}

// cartón kraft / cartulina: fibras gruesas
export function kraft({ n = 512, semilla = 9 } = {}) {
  return memo(`kraft:${n}:${semilla}`, () => {
    const p = permutacion(semilla), q = permutacion(semilla + 1), h = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      h[y * n + x] = 0.6 * fbm(p, u * 48, v * 48, 48, 3) + 0.5 * Math.abs(fbm(q, u * 16, v * 64, 16, 3)) + 0.3 * fbm(p, u * 6, v * 6, 6, 2);
    }
    return dataTex(normalDeAltura(h, n, 2.6), n);
  });
}

// madera de la mesa: tablas de roble (~11 cm) con anillos finos, radios y poros. La textura cubre 0,5 m (≈0,5 mm por píxel).
export function madera({ n = 1024, semilla = 21, tono = [176, 132, 92] } = {}) {
  return memo(`madera:${n}:${semilla}:${tono}`, () => {
    const p = permutacion(semilla), q = permutacion(semilla + 4), color = new Uint8Array(n * n * 4), h = new Float32Array(n * n);
    const tablas = 4;                                     // a lo alto de la textura (v)
    const azar = (i) => { const x = Math.sin(i * 91.7 + semilla) * 43758.5453; return x - Math.floor(x); };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      const ti = Math.floor(v * tablas), vl = v * tablas - ti;            // tabla y posición dentro de ella
      const desplaz = azar(ti) * 7.3, tinte = 0.9 + 0.16 * azar(ti + 11);
      // anillos: líneas casi paralelas a lo largo (u), onduladas por ruido de baja frecuencia
      const onda = fbm(q, u * 2 + desplaz, vl * 1.5 + ti * 3, 2, 3, 0.5) * 2.2 + fbm(p, u * 8 + desplaz, vl * 4, 8, 2) * 0.25;
      const fase = (vl + onda * 0.35) * 26 + desplaz;
      const anillo = 0.5 + 0.5 * Math.cos(fase * Math.PI * 2);
      const tardio = Math.pow(anillo, 6);                                // madera tardía: líneas finas y oscuras
      const poro = Math.max(0, fbm(p, u * 256, v * 24, 256, 1)) * 0.9;    // poros alargados
      const mancha = fbm(p, u * 3 + desplaz, v * 3, 3, 3, 0.6);
      const junta = Math.min(vl, 1 - vl) < 0.004 ? 1 : 0;              // unión entre tablas
      const t = tinte * (0.86 + 0.08 * mancha - 0.16 * tardio - 0.07 * poro) * (junta ? 0.55 : 1);
      const k = y * n + x;
      color[4 * k] = Math.min(255, tono[0] * t); color[4 * k + 1] = Math.min(255, tono[1] * t * (1 - 0.03 * tardio)); color[4 * k + 2] = Math.min(255, tono[2] * t * (1 - 0.06 * tardio)); color[4 * k + 3] = 255;
      h[k] = -0.35 * tardio - 0.5 * poro - (junta ? 2.5 : 0);
    }
    return { color: dataTex(color, n, { srgb: true }), normal: dataTex(normalDeAltura(h, n, 1.1), n) };
  });
}

// fondo de estudio: papel continuo mate con un moteado muy suave
export function papelContinuo({ n = 512, semilla = 31 } = {}) {
  return memo(`fondo:${n}:${semilla}`, () => {
    const p = permutacion(semilla), h = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const u = x / n, v = y / n; h[y * n + x] = 0.6 * fbm(p, u * 32, v * 32, 32, 3) + 0.4 * fbm(p, u * 4, v * 4, 4, 3); }
    return dataTex(normalDeAltura(h, n, 0.8), n);
  });
}

// textura de pliego por defecto (papel sin dibujo): un lienzo con el tono del papel
export function lienzoLiso(color = '#f3efe6', w = 64, h = 64) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
