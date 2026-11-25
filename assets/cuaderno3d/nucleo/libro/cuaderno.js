// cuaderno.js · el cuaderno entero en 3D: tapas de cartón con cantos redondeados, lomo de tela, bloque de hojas con su canal
// y su canto, y las hojas que se pasan simuladas como papel de verdad (fisica/hoja.js). Todo cosido al mismo lomo.
//
// Marco del cuaderno = el de encuadernacion.js (x a lo ancho, y arriba, z a lo alto; metros). El grupo `raiz` se puede mover
// y girar libremente: la gravedad de las hojas se calcula en este marco, así que un cuaderno inclinado se comporta como tal.
import * as THREE from 'three';
import { Encuadernacion, MUESTRAS } from './encuadernacion.js';
import { HojaFisica, PAPELES } from '../fisica/hoja.js';
import { Cinta } from '../fisica/cinta.js';
import { materialPagina, profundidadPagina, materialCanto, materialTapa } from '../materiales/materiales.js';
import { HornoPapel, PRESETS_PAPEL } from '../materiales/papel_textura.js';
import { TIPOS_HOJA, RAYADOS } from '../materiales/tipos_hoja.js';

const NZ = 28;                 // divisiones a lo alto de las caras del bloque
const FILAS_CANTO = 6;         // filas a lo grueso del canto
const RENDER_U = 44, RENDER_V = 60;   // malla de dibujo de una hoja en vuelo (más fina que la de física)

// interpolación por largo de arco en una curva muestreada en `us`
function enCurva(c, us, u) {
  let k = 0; while (k < us.length - 2 && us[k + 1] < u) k++;
  const f = Math.min(Math.max((u - us[k]) / (us[k + 1] - us[k]), 0), 1);
  return [c.x[k] + (c.x[k + 1] - c.x[k]) * f, c.y[k] + (c.y[k + 1] - c.y[k]) * f];
}

// contorno en planta de una página con las esquinas exteriores redondeadas: [u, v] en metros, de la cabeza al pie
function contornoPlanta(W, H, r, n = 8) {
  const pts = [];
  const tramo = (a, b, pasos) => { for (let i = 0; i < pasos; i++) { const t = i / pasos; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } };
  tramo([0, 0], [W - r, 0], 12);
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI / 2; pts.push([W - r + r * Math.cos(a), r + r * Math.sin(a)]); }
  tramo([W, r], [W, H - r], 16);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI / 2; pts.push([W - r + r * Math.cos(a), H - r + r * Math.sin(a)]); }
  tramo([W - r, H], [0, H], 12);
  pts.push([0, H]);
  return pts;
}

function geomGrilla(nu, nv, invertir) {
  const g = new THREE.BufferGeometry();
  const n = (nu + 1) * (nv + 1);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
  const uv = new Float32Array(2 * n);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const k = j * (nu + 1) + i; uv[2 * k] = i / nu; uv[2 * k + 1] = j / nv; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (invertir) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  return g;
}

// tapa: cartón con esquinas exteriores redondeadas y cantos biselados en curva; la bisagra en x = 0, crece hacia +x (o −x)
function geomTapa(Wb, Hb, grosor, radio, haciaIzq) {
  const bisel = Math.min(0.0009, grosor * 0.36), r = Math.max(radio - bisel, 0.0005), ri = 0.0006;
  const x0 = bisel * 0.15, x1 = Wb - bisel, y0 = -Hb / 2 + bisel, y1 = Hb / 2 - bisel;
  // la planta se arma ya espejada si la tapa crece hacia −x (ExtrudeGeometry corrige el sentido del contorno)
  const sx = haciaIzq ? -1 : 1;
  const s = new THREE.Shape();
  s.moveTo(sx * x0, y0 + ri); s.quadraticCurveTo(sx * x0, y0, sx * (x0 + ri), y0);
  s.lineTo(sx * (x1 - r), y0);
  for (let i = 1; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI / 2; s.lineTo(sx * (x1 - r + r * Math.cos(a)), y0 + r + r * Math.sin(a)); }
  s.lineTo(sx * x1, y1 - r);
  for (let i = 1; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; s.lineTo(sx * (x1 - r + r * Math.cos(a)), y1 - r + r * Math.sin(a)); }
  s.lineTo(sx * (x0 + ri), y1); s.quadraticCurveTo(sx * x0, y1, sx * x0, y1 - ri);
  s.lineTo(sx * x0, y0 + ri);
  const g = new THREE.ExtrudeGeometry(s, { depth: grosor - 2 * bisel, bevelEnabled: true, bevelThickness: bisel, bevelSize: bisel, bevelSegments: 4, curveSegments: 6 });
  g.translate(0, 0, bisel);
  g.rotateX(-Math.PI / 2);                       // la extrusión pasa a ser el grosor (y), la planta queda en x-z
  g.computeVertexNormals();
  return g;
}

// datos de un cuaderno → medidas físicas
export function normalizarSpec(s) {
  const formatos = { a5: [0.148, 0.21], a4: [0.21, 0.297], a6: [0.105, 0.148], cuadrado: [0.17, 0.17], apaisado: [0.21, 0.148], bolsillo: [0.09, 0.14] };
  const f = s.formato && typeof s.formato === 'object' ? [s.formato.ancho, s.formato.alto] : formatos[s.formato] || formatos.a5;
  const coloresPapel = { blanco: '#f6f4ef', crema: '#f1e8d6', kraft: '#c9a77c', negro: '#2a2827', gris: '#d9d7d2' };
  const tipoHoja = TIPOS_HOJA[s.tipoHoja] || null;
  const papelBase = typeof s.papel === 'object' ? s.papel : { color: coloresPapel[s.papel] || coloresPapel.blanco, tipo: s.papel === 'kraft' ? 'kraft120' : 'dibujo150' };
  // el tipo de hoja da los valores de partida; lo que venga explícito en «papel» manda
  const papel = tipoHoja ? { tipo: tipoHoja.papel, color: tipoHoja.color, grano: tipoHoja.grano, textura: tipoHoja.textura, rayado: tipoHoja.rayado, trasluz: tipoHoja.trasluz, transmision: tipoHoja.transmision, ...(s.papelPropio || {}) } : papelBase;
  const tx = papel.textura;
  const textura = { ...PRESETS_PAPEL.nuevo, ...(typeof tx === 'string' ? PRESETS_PAPEL[tx] : tx || {}) };
  return {
    id: s.id, titulo: s.titulo || '', ancho: f[0], alto: f[1],
    hojas: s.hojas || 32,
    papel: { color: papel.color || '#f6f4ef', tipo: papel.tipo || 'dibujo150', grano: papel.grano || 'dibujo', textura,
             rayado: RAYADOS[papel.rayado] || RAYADOS.nada, trasluz: papel.trasluz ?? 0.06, transmision: papel.transmision },
    tipoHoja: s.tipoHoja || null,
    tapa: { color: s.tapa?.color || s.colorTapa || '#2b3a67', acabado: s.tapa?.acabado || 'lino', grosor: s.tapa?.grosor ?? 0.0025, ceja: s.tapa?.ceja ?? 0.003, radio: s.tapa?.radio ?? 0.006 },
    radioPagina: s.radioPagina ?? Math.max((s.tapa?.radio ?? 0.006) - 0.002, 0.0015),
    guardas: { color: s.guardas?.color || '#e9e1cf' },
    cinta: s.cinta === false ? null : { color: s.cinta?.color || '#7d1f2a' },
    cabezada: { colores: s.cabezada?.colores || ['#f1ead8', '#7d1f2a'] },
    paginas: s.paginas || [],
    base: s.base || '',
  };
}

export class Cuaderno {
  constructor(specEntrada, { cargarTextura, render = null } = {}) {
    const spec = this.spec = normalizarSpec(specEntrada);
    this.cargarTextura = cargarTextura;
    // el papel de cada hoja se hornea en la GPU la primera vez que se ve (relieve + tono, semilla propia por hoja)
    this.horno = render ? new HornoPapel(render, { ancho: spec.ancho, alto: spec.alto, resolucion: (render.capabilities.maxTextureSize >= 4096 && !/Mobi|Android/i.test(navigator.userAgent)) ? 768 : 512 }) : null;
    this._papeles = new Map();
    const papel = PAPELES[spec.papel.tipo] || PAPELES.dibujo150;
    this.papel = papel;
    this.enc = new Encuadernacion({ ancho: spec.ancho, alto: spec.alto, hojas: spec.hojas, calibre: papel.calibre, tapa: spec.tapa });
    this._encSig = new Encuadernacion({ ancho: spec.ancho, alto: spec.alto, hojas: spec.hojas, calibre: papel.calibre, tapa: spec.tapa });
    this.N = spec.hojas;
    this.raiz = new THREE.Group();            // posición y giro del cuaderno en el mundo
    this.raiz.name = 'cuaderno';

    // estado
    this.kIzq = 0;
    this.vuelos = [];                         // hojas en el aire: { indice, hoja: HojaFisica, malla, ... } ordenadas por índice
    this.psi = 0; this.psiVel = 0;            // cerrado (la tapa apoyada en el bloque)
    this.dedoPliegue = null;
    this.cola = [];
    this.alCambiar = null;
    this.gravedadMundo = new THREE.Vector3(0, -9.81, 0);

    this._crearMallas();
    this._texturas = new Map();
    this.actualizar(0);
  }

  get kDer() { return this.N - this.kIzq - this.vuelos.length; }
  get abierto() { return this.psi > Math.PI * 0.97; }

  // ── páginas: 1-based; recto de la hoja i = 2i+1, verso = 2i+2; las guardas son 0 (delantera) y 2N+1 (trasera) ──
  _texturaPagina(p) {
    if (this._texturas.has(p)) return this._texturas.get(p);
    let t = null;
    const fuente = Array.isArray(this.spec.paginas) ? this.spec.paginas[p - 1] : this.spec.paginas[p];
    const src = fuente && (typeof fuente === 'string' ? fuente : fuente.src1k || fuente.src);
    if (src && this.cargarTextura) t = this.cargarTextura(/^(blob:|data:|https?:)/.test(src) ? src : this.spec.base + src);
    // sin dibujo: las guardas llevan su color; una página vacía es transparente (se ve el papel con su textura y su rayado)
    if (!t) t = p === 0 || p === 2 * this.N + 1 ? this._lienzo(this.spec.guardas.color) : this._lienzo('rgba(0,0,0,0)');
    this._texturas.set(p, t);
    return t;
  }
  // papel horneado de la hoja i (−1 = guarda delantera, N = guarda trasera); guarda las 12 últimas
  _papelHoja(i) {
    if (!this.horno) return null;
    let h = this._papeles.get(i);
    if (h) { this._papeles.delete(i); this._papeles.set(i, h); return h; }
    h = this.horno.hornear(this.spec.papel.textura, i + 2);
    this._papeles.set(i, h);
    const enUso = new Set([this.kIzq - 1, this.kIzq + this.vuelos.length, -1, this.N, ...this.vuelos.map(v => v.indice)]);
    for (const [k, v] of this._papeles) { if (this._papeles.size <= 12) break; if (!enUso.has(k)) { v.liberar(); this._papeles.delete(k); } }
    return h;
  }
  // cambiar la textura del papel en caliente (panel): se vuelve a hornear lo visible
  ponerTexturaPapel(ajustes) {
    this.spec.papel.textura = { ...this.spec.papel.textura, ...ajustes };
    for (const v of this._papeles.values()) v.liberar();
    this._papeles.clear();
    this.actualizar();
    for (const v of this.vuelos) v.malla.material.userData.ponerPapel(this._papelHoja(v.indice), this.spec.papel.textura);
  }

  _lienzo(color) {
    const clave = 'liso:' + color;
    if (this._texturas.has(clave)) return this._texturas.get(clave);
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d'); g.clearRect(0, 0, 8, 8); g.fillStyle = color; g.fillRect(0, 0, 8, 8);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this._texturas.set(clave, t);
    return t;
  }

  _crearMallas() {
    const { spec, enc } = this;
    const opPag = { papel: spec.papel.color, ancho: spec.ancho, alto: spec.alto, radio: spec.radioPagina, tipoPapel: spec.papel.grano, rayado: spec.papel.rayado, trasluz: spec.papel.trasluz };
    const M = MUESTRAS;
    // bloques (arriba = la página visible; canto = las hojas)
    this.bloques = {};
    for (const lado of ['izq', 'der']) {
      const mat = materialPagina(opPag);
      mat.userData.u.uEspejo.value = lado === 'izq' ? 1 : 0;
      mat.userData.signo = lado === 'izq' ? -1 : 1;   // el verso es el dorso de la hoja: su relieve va invertido (como en vuelo)
      const ga = geomGrilla(M, NZ, lado === 'izq');
      // u material = largo de arco real (las muestras se aprietan en el canal): el dibujo no se estira
      const uvA = ga.attributes.uv.array;
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= M; i++) uvA[2 * (j * (M + 1) + i)] = enc.us[i] / spec.ancho;
      const arriba = new THREE.Mesh(ga, mat);
      arriba.customDepthMaterial = profundidadPagina(mat);
      arriba.receiveShadow = true; arriba.castShadow = true;
      arriba.userData = { tipo: 'pagina', lado };
      const planta = contornoPlanta(spec.ancho, spec.alto, spec.radioPagina);
      const canto = new THREE.Mesh(geomGrilla(planta.length - 1, FILAS_CANTO, lado === 'der'), materialCanto({ papel: spec.papel.color }));
      canto.receiveShadow = true; canto.castShadow = true;
      canto.userData = { tipo: 'canto', lado };
      this.bloques[lado] = { arriba, canto, planta };
      this.raiz.add(arriba, canto);
    }
    // tapas
    const matTapa = this.matTapa = materialTapa({ color: spec.tapa.color, acabado: spec.tapa.acabado });
    this.tapaDer = new THREE.Mesh(geomTapa(enc.Wb, enc.Hb, enc.tb, spec.tapa.radio, false), matTapa);
    this.tapaDer.castShadow = this.tapaDer.receiveShadow = true;
    this.tapaDer.userData = { tipo: 'tapa', lado: 'der' };
    this.pivoteIzq = new THREE.Group();
    this.tapaIzq = new THREE.Mesh(geomTapa(enc.Wb, enc.Hb, enc.tb, spec.tapa.radio, true), matTapa);
    this.tapaIzq.castShadow = this.tapaIzq.receiveShadow = true;
    this.tapaIzq.userData = { tipo: 'tapa', lado: 'izq' };
    this.pivoteIzq.add(this.tapaIzq);
    this.raiz.add(this.tapaDer, this.pivoteIzq);
    // lomo de tela
    const nL = enc.lomo.x.length;
    const gl = new THREE.BufferGeometry();
    gl.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * nL * 4), 3));
    gl.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(2 * nL * 4), 2));
    const il = [];
    for (let i = 0; i < nL - 1; i++) {
      const q = (s, k) => s * nL + k;   // capas: 0 = afuera cabeza, 1 = afuera pie, 2 = adentro cabeza, 3 = adentro pie
      il.push(q(0, i), q(0, i + 1), q(1, i), q(0, i + 1), q(1, i + 1), q(1, i));          // cara de afuera (hacia la mesa abierto)
      il.push(q(2, i), q(3, i), q(2, i + 1), q(2, i + 1), q(3, i), q(3, i + 1));          // cara de adentro (hacia el bloque)
      il.push(q(0, i), q(2, i), q(0, i + 1), q(0, i + 1), q(2, i), q(2, i + 1));          // canto de la cabeza
      il.push(q(1, i), q(1, i + 1), q(3, i), q(1, i + 1), q(3, i + 1), q(3, i));          // canto del pie
    }
    gl.setIndex(il);
    this.lomo = new THREE.Mesh(gl, matTapa);
    this.lomo.castShadow = this.lomo.receiveShadow = true;
    this.lomo.userData = { tipo: 'lomo' };
    this.raiz.add(this.lomo);
    this._opPag = opPag;

    // cabezadas: el cordón tejido a rayas en las dos puntas del lomo del bloque
    const lc = document.createElement('canvas'); lc.width = 64; lc.height = 8;
    const gc = lc.getContext('2d'), [c1, c2] = spec.cabezada.colores;
    for (let i = 0; i < 8; i++) { gc.fillStyle = i % 2 ? c2 : c1; gc.fillRect(i * 8, 0, 8, 8); }
    const tc = new THREE.CanvasTexture(lc); tc.colorSpace = THREE.SRGBColorSpace; tc.wrapS = tc.wrapT = THREE.RepeatWrapping; tc.repeat.set(6, 1);
    const matCab = new THREE.MeshPhysicalMaterial({ map: tc, roughness: 0.6, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color('#ffffff') });
    this.cabezadas = [-1, 1].map(lado => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 1, 12, 1), matCab);
      m.castShadow = true; m.userData = { tipo: 'lomo', lado };
      this.raiz.add(m); return m;
    });

    // cinta marcapáginas
    if (spec.cinta) {
      this.cinta = new Cinta({ largo: spec.alto + 0.04, n: 44 });
      const nC = this.cinta.n, gcint = new THREE.BufferGeometry();
      gcint.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * nC), 3));
      const uvc = new Float32Array(4 * nC); for (let i = 0; i < nC; i++) { uvc[4 * i] = 0; uvc[4 * i + 1] = i / (nC - 1); uvc[4 * i + 2] = 1; uvc[4 * i + 3] = i / (nC - 1); }
      gcint.setAttribute('uv', new THREE.BufferAttribute(uvc, 2));
      const ic = []; for (let i = 0; i < nC - 1; i++) { const a = 2 * i; ic.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      gcint.setIndex(ic);
      const col = new THREE.Color(spec.cinta.color);
      this.mallaCinta = new THREE.Mesh(gcint, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.42, sheen: 1, sheenRoughness: 0.35, sheenColor: col.clone().lerp(new THREE.Color('#ffffff'), 0.5), side: THREE.DoubleSide }));
      this.mallaCinta.castShadow = this.mallaCinta.receiveShadow = true;
      this.mallaCinta.frustumCulled = false;
      this.mallaCinta.userData = { tipo: 'cinta' };
      this.raiz.add(this.mallaCinta);
      this._cintaCerrada = null;
    }
  }

  // la cinta: atada arriba del canal, recorre el pliego visible y cuelga por el pie
  _pasoCinta(dt, g) {
    const c = this.cinta; if (!c) return;
    const enc = this.enc, H = this.spec.alto, Hb = enc.Hb, r = enc.raiz, z0 = -H / 2 + 0.004;
    const cerrado = !this.abierto;
    c.gravedad = [g.x, g.y, g.z];
    // Dentro del cuaderno la cinta va quieta: abierto, recta por el fondo del canal del pliego visible; cerrado, entre las hojas
    // a media altura del bloque. Solo el tramo que asoma por el pie es libre (cuelga, se apoya, se arrastra).
    const xIn = cerrado ? enc.bordeTapaDer[0] + 0.035 : r.x, yIn = cerrado ? enc.tb + Math.max(enc.estado.hR * 0.3, 0.0004) : r.y + 0.0005;
    const zFin = H / 2 + 0.001;
    for (let i = 0; i < c.n; i++) c.fijos[i] = z0 + i * c.l < zFin ? 1 : 0;
    c.objetivoFijo = (i) => [xIn, yIn, z0 + i * c.l];
    const tb = enc.tb, alto = 2 * tb + enc.estado.T, caja = this.caja();
    const M = this.raiz.matrixWorld.elements, Mi = new THREE.Matrix4().copy(this.raiz.matrixWorld).invert().elements;
    const yMundo = (x, y, z) => M[1] * x + M[5] * y + M[9] * z + M[13];
    c.contacto = (x, y, z) => {
      // la mesa del mundo: si el punto queda debajo, se sube en vertical (del mundo), expresado en el marco del cuaderno
      const ym = yMundo(x, y, z);
      if (ym < 0.0006) { const d = 0.0006 - ym; return [x + Mi[4] * d, y + Mi[5] * d, z + Mi[6] * d]; }
      // el cuaderno: si el punto quedó adentro, sale por la cara más cercana (arriba o el pie), nunca por debajo
      if (x > caja.min.x && x < caja.max.x && z > -Hb / 2 && z < Hb / 2 && y < (cerrado ? alto : tb) + 0.0005 && y > 0) {
        const aArriba = (cerrado ? alto : tb) + 0.0006 - y, aPie = Hb / 2 + 0.0006 - z;
        return aArriba < aPie ? [x, y + aArriba, z] : [x, y, z + aPie];
      }
      return null;
    };
    // al abrir o cerrar se reacomoda (no se arrastra la cinta a través de las hojas)
    if (this._cintaCerrada !== cerrado) {
      this._cintaCerrada = cerrado;
      c.colocar((s) => { const z = z0 + s; return z < zFin ? [xIn, yIn, z] : [xIn, Math.max(yIn - (z - zFin) * 0.7, 0.001), zFin + (z - zFin) * 0.7]; });
    }
    c.paso(dt);
    // tira con su ancho, de lado según la marcha
    const pos = this.mallaCinta.geometry.attributes.position.array, P = c.pos, w = c.ancho / 2;
    let sx = 1, sy = 0, sz = 0;
    for (let i = 0; i < c.n; i++) {
      const a = 3 * Math.max(i - 1, 0), b = 3 * Math.min(i + 1, c.n - 1);
      let tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2]; const L = Math.hypot(tx, ty, tz) || 1; tx /= L; ty /= L; tz /= L;
      // lado = t × arriba; si la cinta cuelga vertical se conserva el lado anterior
      let qx = ty * 0 - tz * 1, qy = tz * 0 - tx * 0, qz = tx * 1 - ty * 0; const Q = Math.hypot(qx, qy, qz);
      if (Q > 0.25) { sx = qx / Q; sy = qy / Q; sz = qz / Q; }
      const k = 3 * i;
      pos[6 * i] = P[k] - sx * w; pos[6 * i + 1] = P[k + 1] - sy * w; pos[6 * i + 2] = P[k + 2] - sz * w;
      pos[6 * i + 3] = P[k] + sx * w; pos[6 * i + 4] = P[k + 1] + sy * w; pos[6 * i + 5] = P[k + 2] + sz * w;
    }
    this.mallaCinta.geometry.attributes.position.needsUpdate = true;
    this.mallaCinta.geometry.computeVertexNormals();
  }

  // la cara de arriba y el canto de una pila. Su curva es la de la encuadernación, salvo mientras una hoja se posa o se
  // funde sobre ella: entonces baja (con el peso de esa hoja) hasta quedar justo debajo de la forma final de la hoja nueva,
  // para que junto al lomo no asome la página de abajo (la pila nueva sube el canal con otra pendiente que la vieja).
  _geometriaPila(lado) {
    const { enc, spec } = this, us = enc.us, M = us.length - 1, H = spec.alto;
    const b = this.bloques[lado], c = this._curvaPilaDibujo(lado);
    // cara de arriba
    const pa = b.arriba.geometry.attributes.position.array;
    const off = this.papel.calibre * 0.5;
    for (let j = 0; j <= NZ; j++) {
      const z = -H / 2 + (j / NZ) * H;
      for (let i = 0; i <= M; i++) {
        const q = 3 * (j * (M + 1) + i);
        // un pelo hacia afuera de la curva (la hoja tiene grosor) siguiendo la normal aproximada
        const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, M);
        let tx = c.x[i1] - c.x[i0], ty = c.y[i1] - c.y[i0]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
        const s = lado === 'der' ? 1 : -1;
        pa[q] = c.x[i] - s * ty * off; pa[q + 1] = c.y[i] + s * tx * off; pa[q + 2] = z;
      }
    }
    b.arriba.geometry.attributes.position.needsUpdate = true;
    b.arriba.geometry.computeVertexNormals();
    b.arriba.geometry.computeBoundingSphere();
    // canto: el contorno en planta recorrido de arriba (s = 0) a abajo (s = 1)
    const pc = b.canto.geometry.attributes.position.array, planta = b.planta, nO = planta.length;
    for (let r = 0; r <= FILAS_CANTO; r++) {
      const s = r / FILAS_CANTO;
      for (let o = 0; o < nO; o++) {
        const [u, v] = planta[o];
        const a = enCurva(c, us, u), bb = enCurva(enc.curvas[lado === 'der' ? 'abajoDer' : 'abajoIzq'], us, u);
        const q = 3 * (r * nO + o);
        pc[q] = a[0] + (bb[0] - a[0]) * s; pc[q + 1] = a[1] + (bb[1] - a[1]) * s; pc[q + 2] = -H / 2 + v;
      }
    }
    b.canto.geometry.attributes.position.needsUpdate = true;
    b.canto.geometry.computeVertexNormals();
    b.canto.geometry.computeBoundingSphere();
  }

  _curvaPilaDibujo(lado) {
    const base = this.enc.curvas[lado === 'der' ? 'arribaDer' : 'arribaIzq'], baj = this._bajada?.[lado];
    if (!baj || baj.w <= 0) return base;
    const o = this._curvaMezcla || (this._curvaMezcla = { x: new Float64Array(base.x.length), y: new Float64Array(base.y.length) });
    for (let i = 0; i < base.x.length; i++) { o.x[i] = base.x[i] + (baj.curva.x[i] - base.x[i]) * baj.w; o.y[i] = base.y[i] + (baj.curva.y[i] - base.y[i]) * baj.w; }
    return o;
  }

  // ─────────────────────────── actualización geométrica ───────────────────────────
  actualizar() {
    const { enc, spec } = this;
    enc.poner({ kIzq: this.kIzq, kDer: this.kDer, enVuelo: this.vuelos.length, psi: this.psi });
    const us = enc.us, M = us.length - 1, H = spec.alto;
    // bloques
    for (const lado of ['izq', 'der']) {
      const b = this.bloques[lado];
      const k = lado === 'der' ? this.kDer : this.kIzq;
      this._geometriaPila(lado);
      b.canto.material.userData.u.uHojas.value = Math.max(k, 1);
      b.canto.visible = k > 0;
      // textura de la página visible
      const p = lado === 'der' ? (this.kDer > 0 ? 2 * (this.N - this.kDer) + 1 : 2 * this.N + 1) : (this.kIzq > 0 ? 2 * this.kIzq : 0);
      b.arriba.material.userData.u.uFrente.value = this._texturaPagina(p);
      // el otro lado de la misma hoja (para que se trasluzca igual que cuando la hoja está en el aire)
      const guarda = p === 0 || p === 2 * this.N + 1;
      b.arriba.material.userData.u.uConDorso.value = guarda ? 0 : 1;
      if (!guarda) b.arriba.material.userData.u.uDorso.value = this._texturaPagina(lado === 'der' ? p + 1 : p - 1);
      b.paginaVisible = p;
      const hojaVisible = lado === 'der' ? (this.kDer > 0 ? this.N - this.kDer : this.N) : (this.kIzq > 0 ? this.kIzq - 1 : -1);
      b.arriba.material.userData.ponerPapel(this._papelHoja(hojaVisible), this.spec.papel.textura);
    }
    // precarga de las páginas vecinas (dos pliegos hacia cada lado): al pasar ya están
    { const p0 = 2 * this.kIzq; for (let q = Math.max(1, p0 - 4); q <= Math.min(2 * this.N, p0 + 6); q++) this._texturaPagina(q); }
    // tapas
    this.tapaDer.position.set(enc.bordeTapaDer[0], 0, 0);
    const t = enc.tapaIzq;
    this.pivoteIzq.rotation.set(0, 0, t.ang);
    this.pivoteIzq.position.set(t.tx, t.ty, 0);
    this.tapaIzq.position.set(enc.bordeTapaIzqAbierta[0], 0, 0);
    // lomo: la curva de tela con su grosor, de la cabeza al pie
    {
      const L = enc.lomo, n = L.x.length, pos = this.lomo.geometry.attributes.position.array, uv = this.lomo.geometry.attributes.uv.array;
      const g = enc.ys, Hb = enc.Hb;
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, n - 1);
        let tx = L.x[i1] - L.x[i0], ty = L.y[i1] - L.y[i0]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        const nx = -ty, ny = tx;           // hacia dentro del cuaderno (a la izquierda de la marcha)
        if (i > 0) acc += Math.hypot(L.x[i] - L.x[i - 1], L.y[i] - L.y[i - 1]);
        const capas = [[L.x[i], L.y[i], -Hb / 2], [L.x[i], L.y[i], Hb / 2], [L.x[i] + nx * g, L.y[i] + ny * g, -Hb / 2], [L.x[i] + nx * g, L.y[i] + ny * g, Hb / 2]];
        for (let s = 0; s < 4; s++) { const q = s * n + i; pos[3 * q] = capas[s][0]; pos[3 * q + 1] = capas[s][1]; pos[3 * q + 2] = capas[s][2]; uv[2 * q] = acc; uv[2 * q + 1] = capas[s][2]; }
      }
      this.lomo.geometry.attributes.position.needsUpdate = true; this.lomo.geometry.attributes.uv.needsUpdate = true;
      this.lomo.geometry.computeVertexNormals(); this.lomo.geometry.computeBoundingSphere();
    }
    // cabezadas a lo largo del arco del bloque, asomando apenas por la cabeza y el pie
    {
      const [ax, ay] = enc.arcoA, [bx, by] = enc.arcoB, L = Math.max(Math.hypot(bx - ax, by - ay), 0.002);
      for (const m of this.cabezadas) {
        m.position.set((ax + bx) / 2, (ay + by) / 2 + 0.0004, m.userData.lado * (H / 2 + 0.0005));
        m.rotation.set(0, 0, Math.atan2(by - ay, bx - ax) - Math.PI / 2);
        m.scale.set(1, L, 1);
      }
    }
    // hojas en vuelo: misma raíz y mismo perfil de contacto
    for (const v of this.vuelos) {
      v.hoja.fijarRaiz(enc.raiz.x, enc.raiz.y, v.dirPliegue ? v.dirPliegue[0] : enc.raiz.dx, v.dirPliegue ? v.dirPliegue[1] : enc.raiz.dy);
      v.hoja.perfil = enc.perfil;
    }
  }

  // ─────────────────────────── hojas en vuelo ───────────────────────────
  _nuevaHojaFisica() {
    const s = this.spec;
    const nu = Math.max(9, Math.min(15, Math.round(s.ancho / 0.0106) + 1)), nv = Math.max(11, Math.min(21, Math.round(s.alto / 0.0106) + 1));
    return new HojaFisica({ ancho: s.ancho, alto: s.alto, nu, nv, papel: this.papel });
  }

  _mallaVuelo() {
    const mat = materialPagina(this._opPag);
    mat.userData.u.uConDorso.value = 1;
    // un papel de dibujo de 150 g deja pasar ~15 % de la luz; uno de 90 g, ~25 %
    mat.userData.u.uTransmision.value = this.spec.papel.transmision ?? Math.min(0.32, 0.024 / Math.max(this.papel.gramaje / 1000, 0.05));
    const m = new THREE.Mesh(geomGrilla(RENDER_U, RENDER_V, false), mat);
    m.customDepthMaterial = profundidadPagina(mat);
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    m.userData = { tipo: 'vuelo' };
    return m;
  }

  // levanta la hoja de arriba de una pila (lado 'der' = la siguiente; 'izq' = volver) y la deja en el aire
  levantar(lado) {
    if (!this.abierto) return null;
    if (lado === 'der' && this.kDer <= 0) return null;
    if (lado === 'izq' && this.kIzq <= 0) return null;
    const enc = this.enc, curva = enc.curvas[lado === 'der' ? 'arribaDer' : 'arribaIzq'];
    // la forma exacta de la página en la pila (la de la cara de arriba): la hoja en vuelo arranca idéntica y se funde con la física
    const desde = this._formaPila(curva, lado);
    const hoja = this._nuevaHojaFisica();
    const off = this.papel.calibre * 0.5 + 0.0002;
    hoja.colocar((u) => { const p = enCurva(curva, enc.us, u); return { x: p[0], y: p[1] + off }; });
    const indice = lado === 'der' ? this.kIzq + this.vuelos.length : this.kIzq - 1;
    if (lado === 'izq') this.kIzq--;
    const malla = this._mallaVuelo();
    const u = malla.material.userData.u;
    u.uFrente.value = this._texturaPagina(2 * indice + 1);
    u.uDorso.value = this._texturaPagina(2 * indice + 2);
    malla.material.userData.ponerPapel(this._papelHoja(indice), this.spec.papel.textura);
    malla.userData.vuelo = null;
    const v = { indice, hoja, malla, quieto: 0, agarrada: false, entrada: { t: 0, dur: 0.16, desde } };
    malla.userData.vuelo = v;
    this.vuelos.push(v);
    this.vuelos.sort((a, b) => a.indice - b.indice);
    this.raiz.add(malla);
    this.actualizar();
    this._dibujarVuelo(v);
    return v;
  }

  // posiciones de la malla de dibujo de una hoja apoyada EXACTAMENTE sobre la cara de arriba de una pila (misma curva, mismo
  // corrimiento por el grosor que usa actualizar()): al cambiar de una a otra no se mueve ni un píxel
  _formaPila(curva, lado, out = new Float32Array(3 * (RENDER_U + 1) * (RENDER_V + 1))) {
    const us = this.enc.us, M = us.length - 1, off = this.papel.calibre * 0.5, s = lado === 'der' ? 1 : -1, H = this.spec.alto, W = this.spec.ancho;
    const qx = new Float64Array(M + 1), qy = new Float64Array(M + 1);
    for (let i = 0; i <= M; i++) {
      const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, M);
      let tx = curva.x[i1] - curva.x[i0], ty = curva.y[i1] - curva.y[i0]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      qx[i] = curva.x[i] - s * ty * off; qy[i] = curva.y[i] + s * tx * off;
    }
    let k = 0;
    for (let i = 0; i <= RENDER_U; i++) {
      const u = i / RENDER_U * W;
      while (k < M - 1 && us[k + 1] < u) k++;
      const f = Math.min(Math.max((u - us[k]) / (us[k + 1] - us[k]), 0), 1), x = qx[k] + (qx[k + 1] - qx[k]) * f, y = qy[k] + (qy[k + 1] - qy[k]) * f;
      for (let j = 0; j <= RENDER_V; j++) { const q = 3 * (j * (RENDER_U + 1) + i); out[q] = x; out[q + 1] = y; out[q + 2] = -H / 2 + j / RENDER_V * H; }
    }
    return out;
  }

  // empuja hacia arriba los vértices que quedaron debajo de la cara de alguna pila (perfil del cuaderno abierto)
  _noAtravesar(pos, sep, pf = this.enc.perfil) {
    if (!pf) return;
    const xs = pf.xs, ys = pf.ys, m = xs.length;
    for (let j = 0; j <= RENDER_V; j++) for (let i = 2; i <= RENDER_U; i++) {
      const k = j * (RENDER_U + 1) + i, x = pos[3 * k]; if (x <= xs[0] || x >= xs[m - 1]) continue;
      let lo = 0, hi = m - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (xs[md] <= x) lo = md; else hi = md; }
      const F = ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo] || 1) + sep;
      if (pos[3 * k + 1] < F) pos[3 * k + 1] = F;
    }
  }

  // cuando una hoja se acuesta, se funde en ~0,25 s con la forma exacta que tendrá su pila y recién ahí entra en ella
  _empezarFusion(v) {
    const i = this.vuelos.indexOf(v), lado = this._ladoDe(v);
    if (lado === 'izq' && i !== 0) return false;
    if (lado === 'der' && i !== this.vuelos.length - 1) return false;
    const e = this._encSig;
    e.poner({ kIzq: this.kIzq + (lado === 'izq' ? 1 : 0), kDer: this.kDer + (lado === 'der' ? 1 : 0), enVuelo: this.vuelos.length - 1, psi: this.psi });
    const hasta = this._formaPila(e.curvas[lado === 'der' ? 'arribaDer' : 'arribaIzq'], lado);
    v.fusion = { t: 0, dur: 0.24, desde: Float32Array.from(v.malla.geometry.attributes.position.array), hasta, lado };
    return true;
  }

  // fusiona en su pila una hoja que ya se acostó
  _asentar(v) {
    const i = this.vuelos.indexOf(v);
    const lado = v.fusion ? v.fusion.lado : this._ladoDe(v);
    // solo puede entrar a una pila la hoja que está pegada a ella (las demás esperan)
    if (lado === 'izq' && i !== 0) return false;
    if (lado === 'der' && i !== this.vuelos.length - 1) return false;
    this.vuelos.splice(i, 1);
    if (lado === 'izq') this.kIzq++;
    this.raiz.remove(v.malla);
    v.malla.geometry.dispose(); v.malla.material.dispose(); v.malla.customDepthMaterial.dispose();
    this.actualizar();
    return true;
  }

  _ladoDe(v) {
    const h = v.hoja, nu = h.nu; let sx = 0;
    for (let j = 0; j < h.nv; j++) sx += h.pos[3 * (j * nu + nu - 1)] - h.raiz.x;
    return sx < 0 ? 'izq' : 'der';
  }

  // la franja de la hoja junto al lomo (u < 0,16) se lleva a la forma que tendrá en la pila de su lado, tanto más cuanto
  // más acostada está (nada por encima de ~54°, todo por debajo de ~11°). Solo la hoja pegada a esa pila (las demás
  // esperan su turno, como en _asentar). La forma de destino se calcula una vez por aterrizaje.
  _pegarAlCanal(v, pos, suave) {
    const a = this.anguloDe(v), d = Math.min(a, Math.PI - a);
    const p = 1 - suave(Math.min(Math.max((d - 0.06 * Math.PI) / (0.24 * Math.PI), 0), 1));
    const lado = a > Math.PI / 2 ? 'izq' : 'der', i = this.vuelos.indexOf(v);
    const pegada = (lado === 'izq' && i === 0) || (lado === 'der' && i === this.vuelos.length - 1);
    // el peso sigue al ángulo sin retraso; solo cuando la hoja queda pegada a la pila de golpe (se fundió la de al lado, o
    // cruzó al otro lado) entra en rampa de ~0,06 s, para que no salte. Una vez por cuadro aunque la hoja se dibuje dos veces.
    if (v._cuadroPeso !== this._nCuadro) {
      v._cuadroPeso = this._nCuadro;
      if (!pegada) v.rampaCanal = 0;
      else if (v.ladoCanal !== lado) v.rampaCanal = p < 0.05 ? 1 : 0;   // cruzó (a ~90° p = 0: entra sin salto) o quedó pegada de golpe
      else v.rampaCanal += (1 - v.rampaCanal) * (1 - Math.exp(-(this._dt || 1 / 60) / 0.06));
      v.ladoCanal = pegada ? lado : null;
    }
    v.pesoCanal = pegada ? p * (v.rampaCanal || 0) : 0;
    if (v.pesoCanal <= 1e-4) return;
    const pp = v.pesoCanal;
    const clave = `${lado}|${this.kIzq}|${this.kDer}|${this.vuelos.length}|${this.psi.toFixed(4)}`;
    if (!v.canal || v.canal.clave !== clave) {
      const e = this._encSig;
      e.poner({ kIzq: this.kIzq + (lado === 'izq' ? 1 : 0), kDer: this.kDer + (lado === 'der' ? 1 : 0), enVuelo: this.vuelos.length - 1, psi: this.psi });
      const cn = e.curvas[lado === 'der' ? 'arribaDer' : 'arribaIzq'], n = cn.x.length, s = lado === 'der' ? 1 : -1, tp = e.tp;
      // la cara de la pila justo debajo de la hoja nueva: su curva final, una hoja más adentro
      const bajo = { x: new Float64Array(n), y: new Float64Array(n) };
      for (let q = 0; q < n; q++) {
        const q0 = Math.max(q - 1, 0), q1 = Math.min(q + 1, n - 1);
        let tx = cn.x[q1] - cn.x[q0], ty = cn.y[q1] - cn.y[q0]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
        // una hoja más adentro; junto al lomo, tres (ahí la malla de la hoja y la de la pila no caen en los mismos puntos y se
        // cruzarían en las cuerdas: la holgura no se ve, queda bajo la hoja nueva)
        const o = tp * (1 + 2 * (1 - suave(Math.min(e.us[q] / (0.2 * this.spec.ancho), 1))));
        bajo.x[q] = cn.x[q] + s * ty * o; bajo.y[q] = cn.y[q] - s * tx * o;
      }
      v.canal = { clave, lado, curvaBajo: bajo, forma: this._formaPila(cn, lado, v.canal?.forma) };
    }
    const meta = v.canal.forma;
    for (let ii = 0; ii <= RENDER_U; ii++) {
      const w = pp * (1 - suave(Math.min(ii / RENDER_U / 0.16, 1)));
      if (w <= 0) break;
      for (let j = 0; j <= RENDER_V; j++) {
        const k = 3 * (j * (RENDER_U + 1) + ii);
        pos[k] += (meta[k] - pos[k]) * w; pos[k + 1] += (meta[k + 1] - pos[k + 1]) * w; pos[k + 2] += (meta[k + 2] - pos[k + 2]) * w;
      }
    }
  }

  // malla de dibujo: Catmull-Rom sobre la malla de física (suave en las curvas, sin facetas)
  _dibujarVuelo(v) {
    const h = v.hoja, nu = h.nu, nv = h.nv, P = h.pos;
    if (!v.pesos) {
      // pesos e índices fijos para cada vértice de dibujo
      const cr = (t) => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2]; };
      const nVert = (RENDER_U + 1) * (RENDER_V + 1);
      v.pesos = new Float32Array(nVert * 16); v.idx = new Int32Array(nVert * 16);
      for (let j = 0; j <= RENDER_V; j++) for (let i = 0; i <= RENDER_U; i++) {
        const fu = i / RENDER_U * (nu - 1), fv = j / RENDER_V * (nv - 1);
        const iu = Math.min(Math.floor(fu), nu - 2), iv = Math.min(Math.floor(fv), nv - 2);
        const wu = cr(fu - iu), wv = cr(fv - iv), k = j * (RENDER_U + 1) + i;
        let q = 0;
        for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
          const ii = Math.min(Math.max(iu - 1 + a, 0), nu - 1), jj = Math.min(Math.max(iv - 1 + b, 0), nv - 1);
          v.idx[16 * k + q] = jj * nu + ii; v.pesos[16 * k + q] = wu[a] * wv[b]; q++;
        }
      }
    }
    const pos = v.malla.geometry.attributes.position.array, nVert = pos.length / 3;
    const suave = (t) => t * t * (3 - 2 * t);
    if (v.fusion) {
      const f = suave(Math.min(v.fusion.t / v.fusion.dur, 1)), a = v.fusion.desde, b = v.fusion.hasta;
      for (let q = 0; q < pos.length; q++) pos[q] = a[q] + (b[q] - a[q]) * f;
    } else {
      for (let k = 0; k < nVert; k++) {
        let x = 0, y = 0, z = 0;
        for (let q = 0; q < 16; q++) { const w = v.pesos[16 * k + q], p = 3 * v.idx[16 * k + q]; x += w * P[p]; y += w * P[p + 1]; z += w * P[p + 2]; }
        pos[3 * k] = x; pos[3 * k + 1] = y; pos[3 * k + 2] = z;
      }
      if (v.entrada) {
        const f = suave(Math.min(v.entrada.t / v.entrada.dur, 1)), a = v.entrada.desde;
        for (let q = 0; q < pos.length; q++) pos[q] = a[q] + (pos[q] - a[q]) * f;
      }
      // junto al lomo la hoja tiene que seguir la curva del canal de la pila sobre la que baja: si no, entre su raíz y el
      // lomo queda una rendija por la que se ve la página de abajo (pasaba ~0,6 s en cada aterrizaje, en los dos lados).
      // Al acercarse a la pila (desde ~50° del plano) su franja junto al lomo se pega a la forma exacta que tendrá en ella.
      this._pegarAlCanal(v, pos, suave);
      // la malla de dibujo es más fina que la de física: entre partícula y partícula no puede meterse en la pila
      // (salvo la costura: las primeras columnas nacen en el fondo del canal, junto con las páginas de las pilas)
      this._noAtravesar(pos, this.papel.calibre * 0.5 + 0.00012, v.hoja.perfil);
    }
    v.malla.geometry.attributes.position.needsUpdate = true;
    v.malla.geometry.computeVertexNormals();
  }

  // ─────────────────────────── dedo sobre una hoja ───────────────────────────
  // cilindro alrededor del lomo que pasa por el punto tomado: arrastrar en pantalla lleva la hoja por encima del lomo
  agarrarHoja(v, u, vv, puntoLocal) {
    v.fusion = null; v.quieto = 0;
    const h = v.hoja, R = h.raiz;
    v.agarrada = true;
    v.radioDedo = Math.max(Math.hypot(puntoLocal.x - R.x, puntoLocal.y - R.y) * 0.985, 0.01);
    h.agarrar(u, vv, [puntoLocal.x, puntoLocal.y, puntoLocal.z]);
  }
  // rayo en el marco del cuaderno → objetivo sobre el cilindro
  moverHojaConRayo(v, rayoLocal) {
    const R = v.hoja.raiz, rho = v.radioDedo, o = rayoLocal.origin, d = rayoLocal.direction;
    const ox = o.x - R.x, oy = o.y - R.y;
    const a = d.x * d.x + d.y * d.y, b = 2 * (ox * d.x + oy * d.y), c = ox * ox + oy * oy - rho * rho;
    let t;
    const disc = b * b - 4 * a * c;
    if (disc >= 0 && a > 1e-9) t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t === undefined || t < 0) t = a > 1e-9 ? -b / (2 * a) : 0;     // el rayo no toca el cilindro: el punto más cercano al eje
    let px = ox + d.x * t, py = oy + d.y * t; const pz = o.z + d.z * t;
    const L = Math.hypot(px, py) || 1; px *= rho / L; py *= rho / L;
    if (py < 0) py = 0.002;
    v.hoja.moverAgarre([R.x + px, R.y + py, pz]);
  }
  soltarHoja(v) { v.agarrada = false; v.hoja.soltar(); }

  // pasar una hoja sin arrastrar (clic, tecla, video): un dedo «de mentira» toma la esquina de abajo y la lleva por encima
  // ángulo medio del borde exterior de una hoja en vuelo (0 = acostada a la derecha, π = a la izquierda)
  anguloDe(v) {
    const h = v.hoja, nu = h.nu, R = h.raiz; let a = 0;
    for (let j = 0; j < h.nv; j++) { const k = 3 * (j * nu + nu - 1); a += Math.atan2(h.pos[k + 1] - R.y, h.pos[k] - R.x); }
    a /= h.nv; return a < -Math.PI / 2 ? a + 2 * Math.PI : a;
  }

  // varias pasadas seguidas: cada hoja sale cuando la anterior ya cruzó el lomo (así no se enredan en el aire)
  pasar(direccion = 1, opciones = {}) {
    if (!this.abierto) { if (this.psi > 0.05 && this.cola.length < 6) this.cola.push({ direccion, opciones }); return null; }
    const ocupada = this.vuelos.find(v => v.direccion === direccion && (direccion > 0 ? this.anguloDe(v) < Math.PI * 0.55 : this.anguloDe(v) > Math.PI * 0.45));
    if (ocupada || this.cola.length) { if (this.cola.length < 6) this.cola.push({ direccion, opciones }); return null; }
    return this._pasarYa(direccion, opciones);
  }

  _pasarYa(direccion = 1, { duracion = 0.55 } = {}) {
    const v = this.levantar(direccion > 0 ? 'der' : 'izq');
    if (!v) return null;
    const h = v.hoja, uu = 0.97, vv = 0.9;
    const p0 = h.puntoMaterial(uu, vv), R = h.raiz;
    const rho = Math.hypot(p0[0] - R.x, p0[1] - R.y), a0 = Math.atan2(p0[1] - R.y, p0[0] - R.x);
    const a1 = direccion > 0 ? Math.PI * 0.985 : Math.PI * 0.015;
    v.guion = { t: 0, duracion, a0, a1, rho, z0: p0[2], deriva: direccion > 0 ? -0.012 : 0.012 };
    v.direccion = direccion;
    v.agarrada = true;
    h.agarrar(uu, vv, p0);
    return v;
  }

  // un dedo suave lleva la hoja desde donde está hasta acostarla (1 = a la izquierda, −1 = a la derecha)
  _acostar(v, lado) {
    const h = v.hoja, uu = 0.97, vv = 0.5, p0 = h.puntoMaterial(uu, vv), R = h.raiz;
    const rho = Math.hypot(p0[0] - R.x, p0[1] - R.y), a0 = Math.atan2(p0[1] - R.y, p0[0] - R.x);
    v.guion = { t: 0, duracion: 0.45, a0, a1: lado > 0 ? Math.PI * 0.985 : Math.PI * 0.015, rho, z0: p0[2], deriva: 0 };
    v.agarrada = true; v.quieto = 0;
    h.agarrar(uu, vv, p0);
  }

  _avanzarGuion(v, dt) {
    const g = v.guion; g.t += dt;
    const f = Math.min(g.t / g.duracion, 1), e = f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f);
    const a = g.a0 + (g.a1 - g.a0) * e, r = g.rho * (1 - 0.07 * Math.sin(Math.PI * f));
    const R = v.hoja.raiz;
    v.hoja.moverAgarre([R.x + r * Math.cos(a), R.y + r * Math.sin(a), g.z0 + g.deriva * Math.sin(Math.PI * f)]);
    if (f >= 1) { v.guion = null; this.soltarHoja(v); }
  }

  // el doblez de la costura es plástico: con el tiempo «aprende» la posición en que dejan la hoja (no la devuelve a la
  // vertical como un resorte). Sobre la mesa casi no cambia nada; con el cuaderno de pie o en la mano, la hoja se queda donde
  // la dejan, como en un cuaderno de verdad
  _pliegueCede(v, dt, tau = 0.35) {
    const h = v.hoja, nu = h.nu, P = h.pos; let tx = 0, ty = 0;
    for (let j = 0; j < h.nv; j++) { const k0 = 3 * (j * nu), k1 = 3 * (j * nu + 1); tx += P[k1] - P[k0]; ty += P[k1 + 1] - P[k0 + 1]; }
    const L = Math.hypot(tx, ty); if (L < 1e-9) return;
    tx /= L; ty /= L;
    if (!v.dirPliegue) v.dirPliegue = [h.raiz.dx, h.raiz.dy];
    const f = 1 - Math.exp(-dt / tau);
    let dx = v.dirPliegue[0] + (tx - v.dirPliegue[0]) * f, dy = v.dirPliegue[1] + (ty - v.dirPliegue[1]) * f;
    const D = Math.hypot(dx, dy) || 1; v.dirPliegue = [dx / D, dy / D];
    h.raiz.dx = v.dirPliegue[0]; h.raiz.dy = v.dirPliegue[1];
  }

  // perfil de contacto con n hojas de más encima de cada pila (las que cayeron y esperan su turno para entrar)
  _perfilCon(nIzq, nDer) {
    const p = this.enc.perfil;
    if (!p || (!nIzq && !nDer)) return p;
    const ys = Float64Array.from(p.ys), tp = this.papel.calibre, r = this.enc.raiz;
    for (let i = 0; i < ys.length; i++) { const x = p.xs[i]; if (x < r.x - 0.002) ys[i] += nIzq * tp * 1.5; else if (x > r.x + 0.002) ys[i] += nDer * tp * 1.5; }
    return { xs: p.xs, ys };
  }

  // ─────────────────────────── abrir y cerrar (pliegue) ───────────────────────────
  // el lado izquierdo (tapa + hojas) es un cuerpo rígido que gira sobre el lomo, con gravedad, roce y tope en la mesa
  _inerciaPliegue() {
    const s = this.spec, enc = this.enc;
    const mTapa = 700 * enc.Wb * enc.Hb * enc.tb, mHojas = this.kIzq * this.papel.gramaje / 1000 * s.ancho * s.alto;
    const r = enc.Wb / 2;
    return { m: mTapa + mHojas, r, I: (mTapa + mHojas) * (r * r + enc.Wb * enc.Wb / 12) };
  }
  agarrarPliegue(puntoLocal) {
    const Q = this._ejePliegue();
    // el lado izquierdo apunta (desde su eje) en el ángulo ψ: se guarda cuánto se corre el dedo de esa dirección
    const phi = Math.atan2(puntoLocal.y - Q[1], puntoLocal.x - Q[0]);
    this.dedoPliegue = { delta: phi - this.psi, objetivo: this.psi };
  }
  _ejePliegue() {
    const e = this.enc.estado;
    return [((e.hR + e.enVuelo * this.papel.calibre / 2) - (e.hL + e.enVuelo * this.papel.calibre / 2)) / 2, this.enc.tb + e.T / 2];
  }
  moverPliegueConRayo(rayoLocal, zPlano = 0) {
    if (!this.dedoPliegue) return;
    const o = rayoLocal.origin, d = rayoLocal.direction;
    if (Math.abs(d.z) < 1e-6) return;
    const t = (zPlano - o.z) / d.z, px = o.x + d.x * t, py = o.y + d.y * t;
    const Q = this._ejePliegue();
    let phi = Math.atan2(py - Q[1], px - Q[0]);
    // continuidad del ángulo
    let obj = phi - this.dedoPliegue.delta;
    while (obj - this.dedoPliegue.objetivo > Math.PI) obj -= 2 * Math.PI;
    while (obj - this.dedoPliegue.objetivo < -Math.PI) obj += 2 * Math.PI;
    this.dedoPliegue.objetivo = Math.min(Math.max(obj, 0), Math.PI);
  }
  soltarPliegue() { this.dedoPliegue = null; }
  abrir() { this.impulsoPliegue = 1; }
  cerrar() { this.impulsoPliegue = -1; }

  _pasoPliegue(dt, g) {
    if (this.vuelos.length) return;                         // no se cierra con hojas en el aire
    const { m, r, I } = this._inerciaPliegue();
    // dirección del lado izquierdo (de su eje hacia su centro de masa) y torque de la gravedad
    const ang = this.psi - Math.PI, dx = -Math.cos(ang), dy = -Math.sin(ang);
    let tau = r * m * (dx * g.y - dy * g.x);
    tau -= 0.004 * this.psiVel;                             // roce de la bisagra
    if (this.dedoPliegue) {
      const k = I * 140, c = 2 * Math.sqrt(k * I) * 0.9;
      tau += k * (this.dedoPliegue.objetivo - this.psi) - c * this.psiVel;
    } else if (this.impulsoPliegue) {
      // abrir/cerrar sin arrastrar: empuje hasta pasar la vertical; después la gravedad hace el resto si puede (sobre la mesa),
      // y si no (cuaderno de pie o en la mano) el empuje sigue suave hasta el final
      const meta = this.impulsoPliegue > 0 ? Math.PI : 0;
      const pasado = this.impulsoPliegue > 0 ? this.psi > Math.PI * 0.62 : this.psi < Math.PI * 0.38;
      const ayuda = Math.sign(meta - this.psi) * tau;            // la gravedad empuja hacia la meta
      const kk = pasado && ayuda > 0.25 * m * 9.81 * r ? 0 : (pasado ? 30 : 90);
      if (kk) { const k = I * kk, c = 2 * Math.sqrt(k * I) * 0.8; tau += k * (meta - this.psi) - c * this.psiVel; }
      if (Math.abs(meta - this.psi) < 0.002 && Math.abs(this.psiVel) < 0.05) this.impulsoPliegue = 0;
    }
    // roce de la bisagra (Coulomb): la tela y el lomo sostienen la tapa hasta que el peso vence ~30 % de su torque máximo
    const tauRoce = 0.3 * m * 9.81 * r;
    if (!this.dedoPliegue && !this.impulsoPliegue && Math.abs(this.psiVel) < 0.05 && Math.abs(tau) < tauRoce) { this.psiVel = 0; return; }
    if (Math.abs(this.psiVel) >= 0.05) tau -= Math.sign(this.psiVel) * tauRoce * 0.5;
    const sub = 4, h = dt / sub;
    for (let s = 0; s < sub; s++) {
      this.psiVel += tau / I * h;
      this.psi += this.psiVel * h;
      if (this.psi > Math.PI) { this.psi = Math.PI; this.psiVel = this.psiVel > 0 ? -this.psiVel * 0.12 : this.psiVel; }
      if (this.psi < 0) { this.psi = 0; this.psiVel = this.psiVel < 0 ? -this.psiVel * 0.12 : this.psiVel; }
    }
    if (Math.abs(this.psiVel) < 1e-3 && !this.dedoPliegue && (this.psi >= Math.PI - 1e-6 || this.psi <= 1e-6)) this.psiVel = 0;
  }

  // ─────────────────────────── paso ───────────────────────────
  paso(dt) {
    this._nCuadro = (this._nCuadro || 0) + 1; this._dt = dt;
    dt = Math.min(dt, 1 / 30);
    // gravedad en el marco del cuaderno (si lo levantan o lo inclinan, las hojas lo sienten)
    this.raiz.updateMatrixWorld();
    const q = new THREE.Quaternion(); this.raiz.getWorldQuaternion(q);
    const g = this.gravedadMundo.clone().applyQuaternion(q.invert());
    const psiAntes = this.psi;
    this._pasoPliegue(dt, g);
    this._pasoCinta(dt, g);
    let cambio = Math.abs(this.psi - psiAntes) > 1e-7;
    for (const v of this.vuelos) {
      if (v.guion) this._avanzarGuion(v, dt);
      v.hoja.gravedad = [g.x, g.y, g.z];
    }
    // la cola: la próxima hoja sale cuando la anterior cruzó el lomo
    if (this.cola.length && this.abierto) {
      const sig = this.cola[0];
      const ocupada = this.vuelos.find(v => v.direccion === sig.direccion && (sig.direccion > 0 ? this.anguloDe(v) < Math.PI * 0.55 : this.anguloDe(v) > Math.PI * 0.45));
      if (!ocupada) { this.cola.shift(); this._pasarYa(sig.direccion, sig.opciones); }
    }
    // hojas en vuelo. Cada una choca con las pilas y con las hojas que ya cayeron pero todavía no entran a su pila
    for (let i = 0; i < this.vuelos.length; i++) {
      const v = this.vuelos[i];
      let encimaIzq = 0, encimaDer = 0;
      for (let k = 0; k < i; k++) if (this.anguloDe(this.vuelos[k]) > Math.PI * 0.8) encimaIzq++;
      for (let k = i + 1; k < this.vuelos.length; k++) if (this.anguloDe(this.vuelos[k]) < Math.PI * 0.2) encimaDer++;
      v.hoja.perfil = this._perfilCon(encimaIzq, encimaDer);
      if (v.fusion) { v.fusion.t += dt; this._dibujarVuelo(v); continue; }
      this._pliegueCede(v, dt);
      v.hoja.paso(dt);
      if (v.entrada) { v.entrada.t += dt; if (v.entrada.t >= v.entrada.dur) v.entrada = null; }
      this._dibujarVuelo(v);
      if (!v.agarrada && (v.hoja.dormida || v.hoja.vmax < 0.02)) v.quieto += dt; else v.quieto = 0;
    }
    const kAntes = this.kIzq;
    for (const v of [...this.vuelos]) {
      if (v.fusion) { if (v.fusion.t >= v.fusion.dur && this._asentar(v)) cambio = true; continue; }
      const ang = this.anguloDe(v), acostada = ang < Math.PI * 0.18 || ang > Math.PI * 0.82;
      if (v.quieto > 0.18 && acostada) this._empezarFusion(v);
      // seguro: una hoja suelta que se quedó quieta a medio camino (sin gravedad que la acueste) se acuesta del lado más cercano
      else if (v.quieto > 1.2 && !acostada && !v.agarrada && !v.guion) this._acostar(v, ang > Math.PI / 2 ? 1 : -1);
    }
    // la pila sobre la que se posa una hoja baja su cara de arriba bajo ella (ver _geometriaPila)
    const baj = { izq: null, der: null };
    for (const v of this.vuelos) {
      const w = v.fusion ? 1 : (v.pesoCanal || 0);
      if (w > 0 && v.canal) baj[v.canal.lado] = { w, curva: v.canal.curvaBajo };
    }
    const bajAntes = this._bajada || {};
    this._bajada = baj;
    if (!cambio) for (const lado of ['izq', 'der']) {
      const a = bajAntes[lado], b = baj[lado];
      if ((a?.w || 0) !== (b?.w || 0) || a?.curva !== b?.curva) this._geometriaPila(lado);
    }
    if (cambio) {
      this.actualizar();
      // las hojas que siguen en el aire se vuelven a dibujar con las pilas ya cambiadas (nunca un cuadro por debajo)
      for (const v of this.vuelos) this._dibujarVuelo(v);
    }
    if (this.kIzq !== kAntes && this.alCambiar) this.alCambiar();
    this.enMovimiento = this.vuelos.length > 0 || Math.abs(this.psiVel) > 1e-4 || !!this.dedoPliegue;
  }

  // caja para encuadrar (en el marco del cuaderno)
  caja() {
    const enc = this.enc, e = enc.estado, Wb = enc.Wb;
    const cerrado = 1 - Math.min(Math.max((this.psi - 0.3) / (Math.PI - 0.6), 0), 1);
    const izq = enc.bordeTapaIzq[0] - Wb * (1 - cerrado);
    return { min: new THREE.Vector3(Math.min(izq, enc.bordeTapaDer[0]), 0, -enc.Hb / 2), max: new THREE.Vector3(enc.bordeTapaDer[0] + Wb, 2 * enc.tb + e.T, enc.Hb / 2) };
  }
}
