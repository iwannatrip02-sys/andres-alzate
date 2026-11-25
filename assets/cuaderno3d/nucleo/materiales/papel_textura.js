// papel_textura.js · el papel de cada hoja, horneado en la GPU: relieve (mapa de normales) y tono (grano, fibras, motas, tinta).
//
// Adaptado de «Paper Texture» de Paper Shaders (https://github.com/paper-design/shaders, © Paper / Lost Coast Labs,
// licencia Apache 2.0; ver vendor/paper-shaders/LICENSE y NOTICE).
// Cambios respecto del original:
//  · en vez del color final con una luz 2D fija, hornea mapas para un material 3D. El relieve (arrugas, facetas y dobleces)
//    pasa a ser una pendiente de superficie → mapa de normales iluminado por las luces reales de la escena;
//  · el grano, las fibras, las motas, la tinta de los dobleces y la profundidad (para la distorsión del dibujo) van al mapa de tono;
//  · se quitaron los términos que dependían del ángulo de la luz 2D, el marco de imagen, el recorte y el fondo;
//  · la textura de ruido es propia (generada con semilla), no la del paquete;
//  · las coordenadas son las de la página (alto = 1); semilla por hoja.
import * as THREE from 'three';

// ── ajustes: los mismos controles del original, más los del 3D ──
export const AJUSTES_PAPEL = [
  { clave: 'roughness', nombre: 'Grano', min: 0, max: 1 },
  { clave: 'roughnessSize', nombre: 'Tamaño del grano', min: 0, max: 1 },
  { clave: 'roughnessRows', nombre: 'Verjurado (filas)', min: 0, max: 1 },
  { clave: 'fiber', nombre: 'Fibras', min: 0, max: 1 },
  { clave: 'fiberSize', nombre: 'Tamaño de fibras', min: 0, max: 1 },
  { clave: 'wrinkles', nombre: 'Arrugas finas', min: 0, max: 1 },
  { clave: 'wrinkleSize', nombre: 'Tamaño de arrugas', min: 0, max: 1 },
  { clave: 'crumples', nombre: 'Arrugado', min: 0, max: 1 },
  { clave: 'crumpleCount', nombre: 'Facetas', min: 2, max: 15, paso: 1 },
  { clave: 'folds', nombre: 'Dobleces', min: 0, max: 1 },
  { clave: 'foldSizeX', nombre: 'Dobleces verticales', min: 0, max: 1 },
  { clave: 'foldSizeY', nombre: 'Dobleces horizontales', min: 0, max: 1 },
  { clave: 'foldOffsetX', nombre: 'Corrimiento X', min: 0, max: 1 },
  { clave: 'foldOffsetY', nombre: 'Corrimiento Y', min: 0, max: 1 },
  { clave: 'drops', nombre: 'Motas', min: 0, max: 1 },
  { clave: 'blending', nombre: 'Dibujo sobre el papel', min: 0, max: 1 },
  { clave: 'distortion', nombre: 'El dibujo sigue el relieve', min: -1, max: 1 },
  { clave: 'relieve', nombre: 'Fuerza del relieve', min: 0, max: 2 },
  { clave: 'tono', nombre: 'Sombra del papel', min: 0, max: 1 },
];

// preajustes: los cuatro del original (Default, Creased, Spread, Flat) y los de cuaderno
const base = { colorShadow: '#cccccc', blending: 1, distortion: 0, seed: 4, roughness: 0, roughnessSize: 0.5, roughnessRows: 0, fiber: 0, fiberSize: 0.5,
  folds: 0, foldSizeX: 1, foldSizeY: 1, foldOffsetX: 0, foldOffsetY: 0, wrinkles: 0, wrinkleSize: 0.65, crumples: 0, crumpleCount: 6, drops: 0, relieve: 1, tono: 0.5 };
export const PRESETS_PAPEL = {
  nuevo:      { nombre: 'Cuaderno nuevo', ...base, roughness: 0.35, fiber: 0.3, drops: 0.04, tono: 0.35 },
  usado:      { nombre: 'Usado', ...base, roughness: 0.4, fiber: 0.4, wrinkles: 0.25, wrinkleSize: 0.7, drops: 0.15, distortion: 0.3, tono: 0.45 },
  default:    { nombre: 'Paper · Default', ...base, angle: 300, distortion: 0.75, roughness: 0.4, fiber: 0.4, folds: 0.5, wrinkles: 1, wrinkleSize: 0.65, drops: 0.4 },
  arrugado:   { nombre: 'Paper · Creased', ...base, angle: 60, colorShadow: '#b3b3b3', distortion: -0.5, seed: 49, roughness: 0.4, roughnessSize: 0.25, fiber: 0.4, foldSizeX: 0.6, foldSizeY: 0.89, foldOffsetX: 0.59, foldOffsetY: 1, crumples: 1, crumpleCount: 4 },
  doblado:    { nombre: 'Paper · Spread', ...base, angle: 236, colorShadow: '#b3b3b3', distortion: -0.3, seed: 613, roughness: 0.15, roughnessSize: 0.25, fiber: 0.5, folds: 1, foldSizeX: 0.4, foldSizeY: 0.89, crumpleCount: 9 },
  verjurado:  { nombre: 'Paper · Flat (verjurado)', ...base, angle: 0, colorShadow: '#b3b3b3', seed: 455, roughness: 1, roughnessSize: 0.5, roughnessRows: 0.6, fiber: 0.7, fiberSize: 1, foldSizeX: 0, foldSizeY: 0.44, wrinkleSize: 0, drops: 0.2 },
  liso:       { nombre: 'Liso', ...base, roughness: 0.12, fiber: 0.1, tono: 0.2 },
};

// ── ruido propio: 128×128, cuatro canales al azar con semilla (cumple el papel de la textura «randomizer» del original) ──
function texturaRuido(semilla = 1) {
  const n = 128, d = new Uint8Array(n * n * 4);
  let s = semilla >>> 0 || 1;
  for (let i = 0; i < d.length; i++) { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; d[i] = s & 255; }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const VERT = /* glsl */`
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`;

const FUNCIONES = /* glsl */`
precision highp float;
uniform sampler2D u_noiseTexture;
uniform float u_aspect;          // ancho / alto de la página
uniform float u_seed;
uniform float u_roughness, u_roughnessSize, u_roughnessRows, u_fiber, u_fiberSize;
uniform float u_folds, u_foldSizeX, u_foldSizeY, u_foldOffsetX, u_foldOffsetY;
uniform float u_wrinkles, u_wrinkleSize, u_crumples, u_crumpleCount, u_drops;
in vec2 vUv;

#define TWO_PI 6.28318530718
#define MAX_CRUMPLES 15
float lst(float a, float b, float x) { return clamp((x - a) / (b - a), 0., 1.); }
float hash21(vec2 p) { p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1; p += dot(p, p + 19.19); return fract(p.x * p.y); }
vec2 hash22(vec2 p) { p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1; p += dot(p, p.yx + 19.19); return fract(vec2(p.x * p.y, p.x + p.y)); }

// grano (roughness): ruido de valor multiescala con fundido por nivel de detalle; las filas imitan el papel verjurado
float getRoughness(vec2 p, vec2 rowDir, vec2 seedShift, float basePixel) {
  vec2 u = p / vec2(2, 4);
  float w = 100. * basePixel, eps = 4. * w;
  float size = mix(3.2, .8, u_roughnessSize);
  float logLac = log2(2.1), level = -log2(w + 1e-8) / logLac, baseLevel = floor(level) - 2., fade = fract(level);
  vec2 px = (u.x + vec2(eps, -eps)) * .1; float py = u.y * .1;
  vec2 sum = vec2(0.); float norm = 0., amp = .5, freq = exp2(baseLevel * logLac);
  for (int i = 0; i < 4; i++) {
    float absIdx = baseLevel + float(i);
    vec2 qx = size * px * freq; float qy = size * py * freq;
    float wi = 1.; if (i == 0) wi = 1. - fade; if (i == 3) wi = fade;
    vec2 fx = fract(qx); float fy = fract(qy);
    vec2 shift = .5 + absIdx * .3 + seedShift;
    float uvY = floor(qy) / 50. + shift.y;
    vec2 s0a = textureLod(u_noiseTexture, fract(vec2(floor(qx.x) / 50. + shift.x, uvY)), 0.).rg;
    vec2 s1a = textureLod(u_noiseTexture, fract(vec2( ceil(qx.x) / 50. + shift.x, uvY)), 0.).rg;
    vec2 s0b = textureLod(u_noiseTexture, fract(vec2(floor(qx.y) / 50. + shift.x, uvY)), 0.).rg;
    vec2 s1b = textureLod(u_noiseTexture, fract(vec2( ceil(qx.y) / 50. + shift.x, uvY)), 0.).rg;
    vec2 ny0 = mix(vec2(s0a.r, s0b.r), vec2(s0a.g, s0b.g), fy), ny1 = mix(vec2(s1a.r, s1b.r), vec2(s1a.g, s1b.g), fy);
    sum += amp * wi * mix(ny0, ny1, fx); norm += amp * wi; amp *= .8; freq *= 2.1;
  }
  vec2 r = sum / norm; float dx = .5 + r.x - r.y;
  float rowBand = fract(dot(p, rowDir) * .05 * size);
  return 3. * dx * dx - .7 + .6 * u_roughnessRows * (rowBand - .5);
}

// fibras: magnitud del gradiente de un ruido girado en cada octava (hilos curvos)
float getFiber(vec2 p, vec2 seedShift, float basePixel) {
  float size = mix(4., 1., u_fiberSize), w = 50. * basePixel, level = -log2(w + 1e-8), baseLevel = floor(level) - 3., fade = fract(level);
  vec2 grad = vec2(0.); float scale = 1., amp = 1., freq = pow(1.7, baseLevel);
  for (int i = 0; i < 5; i++) {
    float absIdx = baseLevel + float(i);
    vec2 q = size * p * freq;
    float an = absIdx * .8, rc = cos(an), rs = sin(an);
    q = vec2(rc * q.x - rs * q.y, rs * q.x + rc * q.y);
    float wi = 1.; if (i == 0) wi = 1. - fade; if (i == 4) wi = fade;
    vec2 iq = floor(q), fq = fract(q);
    vec4 uv = fract(vec4(iq, iq + 1.) / 50. + .5 + absIdx * .3 + seedShift.xyxy);
    float aF = textureLod(u_noiseTexture, uv.xy, 0.).b, bF = textureLod(u_noiseTexture, uv.zy, 0.).b;
    float cF = textureLod(u_noiseTexture, uv.xw, 0.).b, dF = textureLod(u_noiseTexture, uv.zw, 0.).b;
    vec2 uu = fq * fq * (3. - 2. * fq), du = 8. * fq * (1. - fq);
    float dx = du.x * mix(bF - aF, dF - cF, uu.y), dy = du.y * mix(cF - aF, dF - bF, uu.x);
    grad += wi * amp * scale * vec2(rc * dx + rs * dy, -rs * dx + rc * dy);
    scale *= 1.7; amp *= .5; freq *= 1.7;
  }
  return clamp(.333 * length(grad), 0., 1.);
}

vec2 smoothNoise(vec2 p) {
  vec2 t = p * 50. - .5, i = floor(t), f = fract(t); f = f * f * (3. - 2. * f);
  return textureLod(u_noiseTexture, fract((i + f + .5) / vec2(50.)), 0.).rg;
}

float getDrops(vec2 uv, vec2 seedShift) {
  vec2 iD = floor(uv), fD = fract(uv); float m = 1.;
  for (int y = -1; y < 2; y++) for (int x = -1; x < 2; x++) {
    vec2 nb = vec2(float(y), float(x)), pos = nb + hash22(iD + nb + 50. * seedShift) - fD;
    m *= min(1., dot(pos, pos));
  }
  return .5 * lst(.09, .08, sqrt(sqrt(m)));
}

vec2 getCellTilt(float idx, float radius) {
  vec2 rand = hash22(vec2(idx + 31., idx * u_seed + 17.)); float an = rand.x * TWO_PI;
  return vec2(cos(an), sin(an)) * mix(.3, 1.7, rand.y * rand.y) * mix(.7, 1., radius);
}

// facetas finas: celdas con inclinación propia, quiebre nítido entre vecinas y «hombro» redondeado
vec2 getCrumpleDetail(vec2 uv, float freq, float shift, float basePixel, out float depth) {
  depth = 0.; vec2 v = uv * freq; float pixel = .9 * freq * basePixel; vec2 base = floor(v);
  float n1 = 9., n2 = 9.; vec2 s1 = vec2(0.), s2 = vec2(0.), q1 = vec2(0.), q2 = vec2(0.);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 cell = base + vec2(float(x), float(y));
    vec2 q = hash22(vec2(cell.y * 1.9 + 3.1 + shift, cell.x * 1.3 + .11 * u_seed));
    if (q.y > .8) continue;
    vec2 r = hash22(vec2(cell.x + .37 * u_seed + shift + 11.1, cell.y - .21 * u_seed + 5.7));
    vec2 s = cell + .06 + .88 * r, d = v - s; float dsq = dot(d, d);
    if (dsq < n1) { n2 = n1; s2 = s1; q2 = q1; n1 = dsq; s1 = s; q1 = q; } else if (dsq < n2) { n2 = dsq; s2 = s; q2 = q; }
  }
  if (n1 > 8.) return vec2(0.);
  float an1 = q1.x * TWO_PI, mag1 = q1.y / .8; vec2 t1 = vec2(cos(an1), sin(an1)) * mix(.3, 1.7, mag1 * mag1);
  float an2 = q2.x * TWO_PI, mag2 = q2.y / .8; vec2 t2 = vec2(cos(an2), sin(an2)) * mix(.3, 1.7, mag2 * mag2);
  vec2 span = s1 - s2; float spanLen = max(length(span), 1e-4), toEdge = (n2 - n1) / (2. * spanLen);
  float pair = hash21(s1 + s2 + 1.7 * abs(s1 - s2)), pairSoft = .05 + .1 * step(pair, .4);
  float b = clamp(toEdge / max(1.5 * pixel, .5 * pairSoft), 0., 1.); b = b * b * (3. - 2. * b);
  float d1 = max(sqrt(n1), 1e-4); depth = .2 * d1;
  float shoulderAmt = max(0., 1. - toEdge / .42) * b; vec2 shoulder = vec2(0.);
  if (shoulderAmt > 0.) { float d2 = max(sqrt(n2), 1e-4); shoulder = shoulderAmt * ((v - s2) / d2 - (v - s1) / d1); }
  vec2 mid = .5 * (t1 + t2);
  return mid + (t1 - mid) * b + .9 * shoulder;
}

// arrugado grande: pocas facetas (Voronoi) con inclinaciones mezcladas cerca de los bordes
vec4 getCrumples(vec2 uv) {
  float crumpleN = max(2., floor(u_crumpleCount + .5));
  float near = 60000., nearB = 60000., idx = 0., rad = 0.; vec2 nearP = vec2(0.), nearPb = vec2(0.);
  vec4 seeds[MAX_CRUMPLES];
  for (int i = 0; i < MAX_CRUMPLES; i++) {
    if (float(i) >= crumpleN) break;
    vec2 rand = hash22(vec2(float(i), float(i) * u_seed)); float an = rand.x * TWO_PI;
    vec2 p = vec2(cos(an), sin(an)) * rand.y; seeds[i] = vec4(p, rand);
    vec2 d = uv - p; float dsq = dot(d, d);
    if (dsq < near) { nearB = near; nearPb = nearP; near = dsq; idx = float(i); rad = rand.y; nearP = p; } else if (dsq < nearB) { nearB = dsq; nearPb = p; }
  }
  float l = sqrt(near), lb = sqrt(nearB); vec2 dir = (uv - nearP) / max(l, 1e-4);
  float edge = lst(0., .5, lb - l), shoulderLimit = l + .5;
  vec2 tilt = getCellTilt(idx, rad); float tiltSum = 1.; vec2 wide = vec2(0.); float wideSum = 0., toEdge = 9., edgeSoft = 0.;
  for (int i = 0; i < MAX_CRUMPLES; i++) {
    if (float(i) >= crumpleN) break;
    if (float(i) == idx) continue;
    vec4 seed = seeds[i]; vec2 p = seed.xy, rand = seed.zw, d = uv - p; float dsq = dot(d, d);
    if (dsq < shoulderLimit * shoulderLimit) { float di = sqrt(dsq), sh = lst(.5, 0., di - l); wide += sh * (d / max(di, 1e-4) - dir); wideSum += sh; }
    float pairSoft = .01 + .05 * step(.2, rand.x) + .3 * rand.y;
    float toBisector = (dsq - near) / (.2 * max(length(p - nearP), 1e-4));
    if (toBisector < toEdge) { toEdge = toBisector; edgeSoft = pairSoft; }
    float w = 1. - toBisector / pairSoft; if (w > 0.) { w *= w; tilt += w * getCellTilt(float(i), rand.y); tiltSum += w; }
  }
  float blend = clamp(toEdge / edgeSoft, 0., 1.);
  vec2 sharp = (1. - edge) * ((uv - nearPb) / max(lb, 1e-4) - dir);
  vec2 rounding = mix(sharp, wide / max(wideSum, 1.), min(2. * edgeSoft, 1.));
  float radial = l / max(l + toEdge, 1e-4);
  return vec4(tilt / tiltSum + rounding * blend * radial, .2 * l, edge);
}

// dobleces rectos: cresta o valle con la línea del pliegue marcada
void getFolds(vec2 coord, vec2 offset, vec2 count, vec2 noise, vec2 baseFwidth, out vec2 slope, out vec2 dark, out vec2 lift) {
  vec2 g = coord * count + .5 * offset + noise, dx = fract(g) - .5, adx = abs(dx);
  vec2 t = clamp(adx / .3, 0., 1.); dark = t * t * (3. - 2. * t); lift = (1. - t) * (1. - t);
  vec2 crease = clamp(dx / max(count * baseFwidth, 1e-5), -1., 1.);
  slope = crease * (1. - dark);
  vec2 lineWidth = .02 * count * mix(vec2(2.5), vec2(.8), dark.yx) + .1 * noise;
  slope -= 1. - smoothstep(vec2(0.), lineWidth, adx);
}
`;

const FRAG = FUNCIONES + /* glsl */`
layout(location = 0) out vec4 oRelieve;
layout(location = 1) out vec4 oTono;
void main() {
  // coordenadas de la página: alto = 1, centradas; y crece hacia el pie (como v)
  vec2 patternUV = (vUv - .5) * vec2(u_aspect, 1.);
  float basePixel = max(length(dFdx(patternUV)), length(dFdy(patternUV)));
  vec2 baseFwidth = fwidth(patternUV);
  vec2 rowDir = vec2(0., 1.);                       // filas del verjurado a lo ancho de la hoja

  vec2 relief = vec2(0.), foldSlope = vec2(0.), crumpleFlow = vec2(0.);
  float reliefAmount = 0., foldInk = 1., crumpleDepth = 0., wrinkleDepth = 0., foldDepth = 0.;
  vec2 warpNoise = vec2(0.);
  if (u_crumples > 0. || u_folds > 0. || u_wrinkles > 0.) warpNoise = smoothNoise(patternUV * .1 + .2 + .6 * fract(.017 * u_seed)) - .5;
  vec2 crumplesUV = patternUV * .9 + .012 * warpNoise;

  if (u_crumples > 0.) {
    vec4 c = getCrumples(crumplesUV);
    vec2 tilt = .5 * u_crumples * c.xy;
    relief += tilt; reliefAmount += .6 * u_crumples; crumpleFlow = c.w * tilt;
    crumpleDepth = clamp(5. * c.z, 0., 1.);
  }
  if (u_wrinkles > 0.) {
    float freq = mix(10., 1., u_wrinkleSize), amp = .2; vec2 g = vec2(0.); float dd = 0., ds = 0.;
    for (int i = 0; i < 3; i++) { float ld; g += amp * getCrumpleDetail(crumplesUV, freq, 31. * float(i), basePixel, ld); dd += amp * ld; ds += amp; amp *= (.5 + .2 * g.x); freq *= 2.1; }
    relief += 1.5 * u_wrinkles * g; reliefAmount += .6 * u_wrinkles;
    wrinkleDepth = clamp(5. * dd / max(ds, 1e-4), 0., 1.);
  }
  if (u_folds > 0.) {
    vec2 off = vec2(1. - 2. * u_foldOffsetX, 1. - 2. * u_foldOffsetY);
    vec2 count = vec2(mix(3., .5, u_foldSizeX), mix(3., .5, u_foldSizeY));
    vec2 slope, dark, lift;
    getFolds(patternUV + .03 * crumpleFlow, off, count, .005 * warpNoise * count, baseFwidth, slope, dark, lift);
    foldSlope = u_folds * slope; reliefAmount += u_folds;
    vec2 ink = mix(vec2(.96), vec2(1.), dark);
    foldInk = mix(1., ink.x * ink.y * mix(.5, .3, dark.x * dark.y), u_folds);
    foldDepth = u_folds * (lift.y - lift.x);
  }

  vec2 pUV = patternUV + .04 * crumpleFlow;
  vec2 seedShift = floor(fract(u_seed * vec2(.7548776662, .5698402909)) * 50.) / 50.;
  float rough = u_roughness > 0. ? u_roughness * getRoughness(1000. * pUV, rowDir, seedShift, basePixel) : 0.;
  float fib = u_fiber > 0. ? u_fiber * getFiber(50. * pUV, seedShift, basePixel) : 0.;
  float drops = u_drops > 0. ? u_drops * getDrops(pUV * 10., seedShift) : 0.;

  // pendiente total → normal en el espacio de la página (u hacia el borde, v hacia la cabeza)
  vec2 grad = relief + foldSlope;
  vec3 n = normalize(vec3(-grad, 1.));
  float profundidad = .15 * u_crumples * (crumpleDepth - .5) + .2 * u_wrinkles * (wrinkleDepth - .5) + .05 * foldDepth;
  oRelieve = vec4(n * .5 + .5, clamp(.5 + profundidad, 0., 1.));
  oTono = vec4(clamp(rough + fib, 0., 1.), clamp(2. * drops, 0., 1.), foldInk, clamp(reliefAmount, 0., 1.));
}`;


// ── modo plano: Paper Texture tal cual (luz 2D rasante + imagen encima), para comparar la adaptación y exportar en 2D ──
const FRAG_PLANO = FUNCIONES + /* glsl */`
uniform sampler2D u_image;
uniform float u_isImage, u_blending, u_distortion, u_angle;
uniform vec4 u_colorBack, u_colorPaper, u_colorShadow;
out vec4 fragColor;
void main() {
  vec2 patternUV = (vUv - .5) * vec2(u_aspect, 1.);
  float basePixel = max(length(dFdx(patternUV)), length(dFdy(patternUV)));
  vec2 baseFwidth = fwidth(patternUV);
  float pattern = 0., crumpleDepth = 0., wrinkleDepth = 0., foldDepth = 0., roughness = 0., fiber = 0., drops = 0.;
  float grazing = .7, lightRad = radians(u_angle);
  vec2 lightDir = vec2(sin(lightRad), -cos(lightRad));
  float foldAngleInSector = mod(u_angle, 90.);
  float foldLightRad = radians(u_angle - foldAngleInSector + mix(12., 78., foldAngleInSector / 90.));
  vec2 foldLightDir = vec2(sin(foldLightRad), -cos(foldLightRad));
  vec2 relief = vec2(0.), foldSlope = vec2(0.), crumpleFlow = vec2(0.); float reliefAmount = 0., foldInk = 1.;
  vec2 warpNoise = vec2(0.);
  if (u_crumples > 0. || u_folds > 0. || u_wrinkles > 0.) warpNoise = smoothNoise(patternUV * .1 + .2 + .6 * fract(.017 * u_seed)) - .5;
  vec2 crumplesUV = (patternUV * .9) + .012 * warpNoise;
  if (u_crumples > 0.) {
    vec4 c = getCrumples(crumplesUV);
    vec2 t = .5 * u_crumples * c.xy; t -= .1 * max(dot(t, lightDir), 0.) * lightDir;
    relief += t; reliefAmount += .6 * u_crumples; crumpleFlow = c.w * t; crumpleDepth = clamp(5. * c.z, 0., 1.);
  }
  if (u_wrinkles > 0.) {
    float freq = mix(10., 1., u_wrinkleSize), amp = .2; vec2 g = vec2(0.); float dd = 0., ds = 0.;
    for (int i = 0; i < 3; i++) { float ld; g += amp * getCrumpleDetail(crumplesUV, freq, 31. * float(i), basePixel, ld); dd += amp * ld; ds += amp; amp *= (.5 + .2 * g.x); freq *= 2.1; }
    vec2 t = 1.5 * u_wrinkles * g; t -= .65 * max(dot(t, lightDir), 0.) * lightDir;
    relief += t; reliefAmount += .6 * u_wrinkles; wrinkleDepth = clamp(5. * dd / max(ds, 1e-4), 0., 1.);
  }
  if (u_folds > 0.) {
    vec2 off = vec2(1. - 2. * u_foldOffsetX, 1. - 2. * u_foldOffsetY), count = vec2(mix(3., .5, u_foldSizeX), mix(3., .5, u_foldSizeY));
    vec2 slope, dark, lift;
    getFolds(patternUV + .03 * crumpleFlow, off, count, .005 * warpNoise * count, baseFwidth, slope, dark, lift);
    foldSlope = u_folds * slope; reliefAmount += u_folds;
    vec2 ink = mix(vec2(.96), vec2(1.), dark);
    foldInk *= mix(1., ink.x * ink.y * mix(.5, .3, dark.x * dark.y), u_folds);
    foldDepth = u_folds * (lift.y * foldLightDir.y - lift.x * foldLightDir.x);
  }
  float unlit = cos(grazing), lit = unlit;
  if (reliefAmount > 0.) {
    float lightPower = mix(.5, 1., clamp(.5 + dot(vUv - .5, lightDir), 0., 1.));
    float slope = clamp(dot(relief, lightDir) + dot(foldSlope, foldLightDir), -1.2, 1.2);
    lit = max(cos(slope + grazing), 0.);
    pattern += (clamp(reliefAmount, 0., 1.) * unlit + (lit - unlit)) * foldInk * lightPower;
  }
  patternUV += .04 * crumpleFlow;
  vec2 seedShift = floor(fract(u_seed * vec2(.7548776662, .5698402909)) * 50.) / 50.;
  if (u_roughness > 0.) { roughness = u_roughness * getRoughness(1000. * patternUV, lightDir, seedShift, basePixel); pattern += roughness; }
  if (u_fiber > 0.) { fiber = u_fiber * getFiber(50. * patternUV, seedShift, basePixel); pattern += fiber; }
  if (u_drops > 0.) drops = u_drops * getDrops(patternUV * 10., seedShift);
  pattern = clamp(pattern, 0., 1.);
  vec3 backColor = u_colorBack.rgb * u_colorBack.a, baseColor = u_colorPaper.rgb * u_colorPaper.a, shadowColor = u_colorShadow.rgb * u_colorShadow.a;
  float backOpacity = u_colorBack.a, baseOpacity = u_colorPaper.a, shadowOpacity = u_colorShadow.a;
  vec2 c0 = vUv - .5;
  float edgeDist = 2. * max(abs(c0.x), abs(c0.y));
  float wrinkleDistortion = mix(.38, .0175, smoothstep(0., 1., edgeDist));
  float scaleDistortion = .15 * u_crumples * (crumpleDepth - .5) + wrinkleDistortion * u_wrinkles * (wrinkleDepth - .5) + .05 * foldDepth;
  vec2 cUV = c0 * (1. - u_distortion * scaleDistortion) - u_distortion * .002 * lightDir * drops;
  vec2 imageUV = .5 + cUV * (1. - abs(u_distortion) * .02 * (roughness + fiber) * dot(cUV, cUV));
  vec3 color = shadowColor * pattern; float opacity = shadowOpacity * pattern;
  color += baseColor * (1. - opacity); opacity += baseOpacity * (1. - opacity);
  if (u_isImage > .5) {
    vec4 image = texture(u_image, imageUV);   // textura de three (volteada al subir): y crece hacia arriba
    float frame = image.a;
    float maxC = max(max(image.r, image.g), image.b), minC = min(min(image.r, image.g), image.b);
    float sat = maxC > 0. ? (maxC - minC) / maxC : 0.;
    float midC = image.r + image.g + image.b - maxC - minC;
    float sec = maxC > minC ? (midC - minC) / (maxC - minC) : 0.;
    float dampen = mix(0., .7, u_blending) * max(sat * (1. - .5 * sec), 1. - dot(vec3(.2126, .7152, .0722), image.rgb));
    vec3 paper = vec3(1.) - opacity + color;
    vec3 pic = image.rgb * paper * u_blending + image.rgb * (1. - u_blending);
    pic = mix(pic, vec3(1.), .6 * pow(dampen, 2. + 3. * pattern));
    color = mix(color, pic, frame); opacity = frame + opacity * (1. - frame);
  }
  color *= mix(vec3(1.), .5 * u_colorShadow.rgb, drops * shadowOpacity);
  color += backColor * (1. - opacity); opacity += backOpacity * (1. - opacity);
  fragColor = vec4(color, opacity);
}`;

const _c4 = (hex, a = 1) => { const c = new THREE.Color(hex); c.convertLinearToSRGB(); return new THREE.Vector4(c.r, c.g, c.b, a); };

// pinta el papel en 2D (como el original) sobre un lienzo propio: para comparar y para exportar imágenes planas
export class PapelPlano {
  constructor(lienzo, { ancho = 0.148, alto = 0.21 } = {}) {
    this.render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false, preserveDrawingBuffer: true, alpha: true });
    this.render.outputColorSpace = THREE.LinearSRGBColorSpace;   // el shader trabaja en sRGB directo, como el original
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG_PLANO, depthTest: false, depthWrite: false,
      uniforms: Object.fromEntries(['u_noiseTexture', 'u_aspect', 'u_seed', 'u_roughness', 'u_roughnessSize', 'u_roughnessRows', 'u_fiber', 'u_fiberSize', 'u_folds', 'u_foldSizeX', 'u_foldSizeY',
        'u_foldOffsetX', 'u_foldOffsetY', 'u_wrinkles', 'u_wrinkleSize', 'u_crumples', 'u_crumpleCount', 'u_drops', 'u_image', 'u_isImage', 'u_blending', 'u_distortion', 'u_angle',
        'u_colorBack', 'u_colorPaper', 'u_colorShadow'].map(k => [k, { value: 0 }])),
    });
    this.mat.uniforms.u_noiseTexture.value = texturaRuido(7);
    this.mat.uniforms.u_aspect.value = ancho / alto;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(g, this.mat); this.quad.frustumCulled = false;
    this.escena = new THREE.Scene(); this.escena.add(this.quad); this.camara = new THREE.Camera();
  }
  dibujar(p, { imagen = null, semilla = 0, angulo = p.angle ?? 300, colorPapel = '#ffffff', colorFondo = '#d3d2ab' } = {}) {
    const u = this.mat.uniforms;
    for (const a of AJUSTES_PAPEL) if (u['u_' + a.clave]) u['u_' + a.clave].value = p[a.clave] ?? 0;
    u.u_seed.value = (p.seed ?? 4) + semilla * 7.31; u.u_angle.value = angulo;
    u.u_image.value = imagen; u.u_isImage.value = imagen ? 1 : 0;
    u.u_colorShadow.value = _c4(p.colorShadow || '#cccccc'); u.u_colorPaper.value = _c4(colorPapel); u.u_colorBack.value = _c4(colorFondo);
    this.render.render(this.escena, this.camara);
  }
  tamano(w, h) { this.render.setSize(w, h, false); }
}

export class HornoPapel {
  constructor(render, { ancho = 0.148, alto = 0.21, resolucion = 768 } = {}) {
    this.render = render;
    this.aspecto = ancho / alto;
    const w = resolucion, h = Math.round(resolucion / this.aspecto);
    this.tam = [w, h];
    this.ruido = texturaRuido(7);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: Object.fromEntries(['u_noiseTexture', 'u_aspect', 'u_seed', 'u_roughness', 'u_roughnessSize', 'u_roughnessRows', 'u_fiber', 'u_fiberSize', 'u_folds', 'u_foldSizeX', 'u_foldSizeY',
        'u_foldOffsetX', 'u_foldOffsetY', 'u_wrinkles', 'u_wrinkleSize', 'u_crumples', 'u_crumpleCount', 'u_drops'].map(k => [k, { value: 0 }])),
      depthTest: false, depthWrite: false,
    });
    this.mat.uniforms.u_noiseTexture.value = this.ruido;
    this.mat.uniforms.u_aspect.value = this.aspecto;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(g, this.mat); this.quad.frustumCulled = false;
    this.escena = new THREE.Scene(); this.escena.add(this.quad);
    this.camara = new THREE.Camera();
  }

  // devuelve { relieve, tono, liberar } para un juego de ajustes y una semilla (cada hoja la suya)
  hornear(p, semilla) {
    const [w, h] = this.tam;
    const rt = new THREE.WebGLRenderTarget(w, h, { count: 2, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    for (const t of rt.textures) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.colorSpace = THREE.NoColorSpace; }
    const u = this.mat.uniforms;
    for (const a of AJUSTES_PAPEL) if (u['u_' + a.clave]) u['u_' + a.clave].value = p[a.clave] ?? 0;
    u.u_seed.value = (p.seed ?? 4) + semilla * 7.31;
    const r = this.render, antes = r.getRenderTarget(), auto = r.autoClear;
    r.setRenderTarget(rt); r.autoClear = true; r.render(this.escena, this.camara);
    r.setRenderTarget(antes); r.autoClear = auto;
    return { relieve: rt.textures[0], tono: rt.textures[1], liberar: () => rt.dispose() };
  }

  liberar() { this.mat.dispose(); this.quad.geometry.dispose(); this.ruido.dispose(); }
}
