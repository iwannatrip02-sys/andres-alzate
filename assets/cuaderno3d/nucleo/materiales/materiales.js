// materiales.js · papel (página con dibujo, grano, esquinas redondeadas exactas, sombra del canal, transparencia del dorso),
// canto del bloque (las líneas de las hojas), tela/cuero/kraft de las tapas y la mesa. Todo PBR (MeshStandard/Physical).
import * as THREE from 'three';
import { granoPapel, telaLino, cuero, kraft, madera, papelContinuo } from './procedural.js';

// ── página ──
// coordenadas materiales vMat = (u, v): u desde la costura (0) al borde exterior (1), v de la cabeza (0) al pie (1).
// Las esquinas exteriores se recortan con una distancia exacta (sin escalones de la malla). El dorso (cara de atrás) usa su
// propia textura con u espejada; el papel deja ver un poco el dibujo del otro lado (transparencia del papel).
// El papel de cada hoja viene horneado (papel_textura.js, adaptado de Paper Texture de Paper Shaders): el relieve entra como
// mapa de normales (lo iluminan las luces reales) y el tono se mezcla con el dibujo como en el original (el dibujo se asienta
// en el papel, sigue su relieve y la tinta se adelgaza donde el papel tiene grano).
const PAGINA_VERT_PARS = /* glsl */`
  varying vec2 vMat;
`;
const PAGINA_FRAG_PARS = /* glsl */`
  varying vec2 vMat;
  uniform sampler2D uFrente;
  uniform sampler2D uDorso;
  uniform float uConDorso;
  uniform float uEspejo;      // 1 = la cara visible es un verso (página izquierda): el dibujo va con u espejada
  uniform vec3 uPapel;
  uniform vec2 uTam;          // ancho y alto de la página (m)
  uniform float uRadio;       // radio de las esquinas exteriores (m)
  uniform float uCanal;       // fuerza de la sombra del canal
  uniform float uTrasluz;     // cuánto se ve el dibujo del otro lado
  uniform float uTransmision; // luz que atraviesa el papel cuando está a contraluz
  uniform sampler2D uTono;    // R grano + fibras · G motas · B tinta de los dobleces · A cantidad de relieve
  uniform sampler2D uRelieve; // normales del relieve · A profundidad (para que el dibujo siga el relieve)
  uniform vec3 uSombra;       // color de la sombra del papel (relativo al blanco)
  uniform float uFuerzaTono;  // cuánto marca el grano en el color
  uniform float uMezcla;      // dibujo multiplicado con el papel (0 = el dibujo tal cual)
  uniform float uDistorsion;  // el dibujo se deforma con el relieve
  uniform float uAbsorbe;     // la tinta se adelgaza donde el papel tiene grano
  uniform sampler2D uGrano;   // diente fino del papel (normal repetida)
  uniform vec2 uGranoRep;
  uniform float uGranoFuerza;
  uniform float uSigno;       // −1 en la pila izquierda: el verso muestra el relieve invertido, igual que el dorso en vuelo
  uniform float uRayado;      // 0 en blanco · 1 rayas · 2 cuadrícula · 3 puntos (impresos en tinta clara, debajo del dibujo)
  uniform float uPaso;        // m
  uniform vec3 uColorRayado;
  float rayado(vec2 m) {
    if (uRayado < .5) return 0.;
    vec2 p = vec2(m.x * uTam.x, m.y * uTam.y);
    vec2 aa = fwidth(p) + 1e-7;
    // trazo impreso de 0,15 mm; si mide menos que un píxel se ensancha y se aclara (misma tinta por área): de lejos queda la
    // línea tenue que se ve en un cuaderno real, nunca desaparece ni hace moiré
    float g = .0001;                                       // media línea: 0,2 mm de trazo
    if (uRayado < 1.5) {                                   // rayas horizontales, con margen arriba
      if (p.y < .02) return 0.;
      float ge = max(g, aa.y), f = abs(fract(p.y / uPaso + .5) - .5) * uPaso;
      return (1. - smoothstep(ge, ge + aa.y, f)) * clamp(1.7 * g / ge, 0., 1.);
    } else if (uRayado < 2.5) {                            // cuadrícula
      vec2 ge = max(vec2(g * .8), aa), f = abs(fract(p / uPaso + .5) - .5) * uPaso;
      vec2 l = (1. - smoothstep(ge, ge + aa, f)) * clamp(1.7 * (g * .8) / ge, 0., 1.);
      return max(l.x, l.y) * .85;
    }
    float r = .00025, re = max(r, max(aa.x, aa.y));       // puntos de 0,5 mm
    vec2 f = (fract(p / uPaso + .5) - .5) * uPaso;
    return (1. - smoothstep(re, re + max(aa.x, aa.y), length(f))) * clamp(2. * (r / re) * (r / re), 0., 1.);
  }
  vec3 transmitido = vec3(0.0);
  float distEsquina(vec2 m) {
    // solo las dos esquinas del borde exterior (u = 1) van redondeadas
    vec2 p = vec2(m.x * uTam.x, m.y * uTam.y);
    vec2 c = vec2(uTam.x - uRadio, clamp(p.y, uRadio, uTam.y - uRadio));
    if (p.x < c.x) return -1.0;
    return length(p - c) - uRadio;
  }
  // el dibujo sobre el papel (adaptado de Paper Texture): multiplicado por el patrón y con la tinta adelgazada
  vec3 dibujoEnPapel(vec4 img, vec3 papel, vec3 modPapel, float patron) {
    vec3 pic = img.rgb * modPapel * uMezcla + img.rgb * (1. - uMezcla);
    float maxC = max(max(img.r, img.g), img.b), minC = min(min(img.r, img.g), img.b);
    float sat = maxC > 0. ? (maxC - minC) / maxC : 0.;
    float midC = img.r + img.g + img.b - maxC - minC;
    float sec = maxC > minC ? (midC - minC) / (maxC - minC) : 0.;
    float oscuro = 1. - dot(vec3(.2126, .7152, .0722), img.rgb);
    float apaga = mix(0., .7, uMezcla) * max(sat * (1. - .5 * sec), oscuro) * uAbsorbe;
    pic = mix(pic, papel * modPapel, .6 * pow(apaga, 2. + 3. * patron));
    return mix(papel * modPapel, pic, img.a);
  }
`;

const _plano = (() => { const d = new Uint8Array([128, 128, 255, 128]); const t = new THREE.DataTexture(d, 1, 1); t.needsUpdate = true; return t; })();
const _tonoVacio = (() => { const d = new Uint8Array([0, 0, 255, 0]); const t = new THREE.DataTexture(d, 1, 1); t.needsUpdate = true; return t; })();

export function materialPagina({ papel = '#f4f0e8', ancho = 0.148, alto = 0.21, radio = 0.004, tipoPapel = 'dibujo', canal = 0.38, trasluz = 0.06, transmision = 0.0, textura = null, rayado = null } = {}) {
  const grano = granoPapel({ tipo: tipoPapel });
  const g = grano.clone(); g.needsUpdate = true; g.wrapS = g.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, normalMap: _plano, normalScale: new THREE.Vector2(1, 1) });
  const u = {
    uFrente: { value: null }, uDorso: { value: null }, uConDorso: { value: 0 }, uEspejo: { value: 0 },
    uPapel: { value: new THREE.Color(papel) }, uTam: { value: new THREE.Vector2(ancho, alto) }, uRadio: { value: radio },
    uCanal: { value: canal }, uTrasluz: { value: trasluz }, uTransmision: { value: transmision },
    uTono: { value: _tonoVacio }, uRelieve: { value: _plano }, uSombra: { value: new THREE.Color('#cccccc') },
    uFuerzaTono: { value: 0.4 }, uMezcla: { value: 1 }, uDistorsion: { value: 0 }, uAbsorbe: { value: 0.25 },
    uGrano: { value: g }, uGranoRep: { value: new THREE.Vector2(ancho / 0.03, alto / 0.03) }, uGranoFuerza: { value: 0.1 },
    uSigno: { value: 1 },
    uRayado: { value: 0 }, uPaso: { value: 0.005 }, uColorRayado: { value: new THREE.Color('#9db4cf') },
  };
  m.userData.u = u;
  if (rayado) { u.uRayado.value = rayado.modo || 0; u.uPaso.value = rayado.paso || 0.005; if (rayado.color) u.uColorRayado.value.set(rayado.color); }
  // el papel horneado de la hoja (relieve y tono) y sus ajustes
  m.userData.ponerPapel = (horneado, t = textura) => {
    m.normalMap = horneado ? horneado.relieve : _plano;
    u.uRelieve.value = horneado ? horneado.relieve : _plano;
    u.uTono.value = horneado ? horneado.tono : _tonoVacio;
    const sg = m.userData.signo ?? 1;
    u.uSigno.value = sg;
    if (t) {
      m.normalScale.set(sg * (t.relieve ?? 1), sg * (t.relieve ?? 1));
      u.uSombra.value.set(t.colorShadow || '#cccccc');
      u.uFuerzaTono.value = t.tono ?? 0.4; u.uMezcla.value = t.blending ?? 1; u.uDistorsion.value = t.distortion ?? 0;
      u.uAbsorbe.value = t.absorbe ?? 0.25;
    }
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + PAGINA_VERT_PARS)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMat = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PAGINA_FRAG_PARS)
      .replace('#include <map_fragment>', /* glsl */`
        if (distEsquina(vMat) > 0.0) discard;
        bool atras = !gl_FrontFacing;
        float esp = atras ? 1.0 - uEspejo : uEspejo;
        vec4 tono = texture2D(uTono, vMat), rel = texture2D(uRelieve, vMat);
        float patron = clamp(tono.r * uFuerzaTono, 0., 1.);
        vec3 modPapel = mix(vec3(1.), uSombra, patron);
        // el dibujo sigue el relieve (como el original: se acerca o se aleja del centro según la profundidad)
        vec2 uvF = vec2(esp > 0.5 ? 1.0 - vMat.x : vMat.x, 1.0 - vMat.y);
        uvF = .5 + (uvF - .5) * (1. - uDistorsion * (rel.a - .5));
        vec4 tx = (atras && uConDorso > 0.5) ? texture2D(uDorso, uvF) : texture2D(uFrente, uvF);
        vec3 papelBase = mix(uPapel, uColorRayado, .75 * rayado(vMat));
        vec3 alb = dibujoEnPapel(tx, papelBase, modPapel, patron);
        // motas del papel
        alb *= mix(vec3(1.), .5 * uSombra, tono.g * .5);
        // lo dibujado del otro lado se trasluce apenas (en espejo)
        transmitido = alb;
        if (uConDorso > 0.5) {
          vec4 otro = (atras ? texture2D(uFrente, vec2(1.0 - uvF.x, uvF.y)) : texture2D(uDorso, vec2(1.0 - uvF.x, uvF.y)));
          vec3 otroAlb = mix(uPapel, otro.rgb, otro.a);
          float tinta = 1.0 - dot(otroAlb / max(uPapel, vec3(0.05)), vec3(0.333));
          alb *= 1.0 - uTrasluz * clamp(tinta, 0.0, 1.0);
          // a contraluz, la luz cruza las dos caras: se tiñe con lo dibujado de ambos lados
          transmitido = alb * otroAlb / max(uPapel, vec3(0.05));
        }
        // sombra suave del canal (el papel se hunde hacia el lomo)
        float canal = 1.0 - smoothstep(0.0, 0.16, vMat.x);
        alb *= 1.0 - uCanal * canal * canal;
        diffuseColor.rgb *= alb;
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        #ifdef USE_NORMALMAP_TANGENTSPACE
          // diente fino del papel encima del relieve horneado
          vec3 gN = texture2D(uGrano, vMat * uGranoRep).xyz * 2. - 1.;
          normal = normalize(tbn * normalize(vec3(mapN.xy + uSigno * gN.xy * uGranoFuerza, mapN.z)));
        #endif
      `)
      .replace('#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          // contraluz: la luz principal llega por la otra cara y atraviesa el papel (difusa, sin dirección)
          float contra = max(dot(-normal, directionalLights[0].direction), 0.0);
          reflectedLight.directDiffuse += transmitido * directionalLights[0].color * contra * uTransmision;
        #endif
      `);
  };
  m.customProgramCacheKey = () => 'pagina-v6';
  return m;
}

// profundidad para sombras con el mismo recorte de esquinas
export function profundidadPagina(matPagina) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  const u = matPagina.userData.u;
  d.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTam: u.uTam, uRadio: u.uRadio });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMat;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMat = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vMat; uniform vec2 uTam; uniform float uRadio;
      float distEsquina(vec2 m) { vec2 p = vec2(m.x * uTam.x, m.y * uTam.y); vec2 c = vec2(uTam.x - uRadio, clamp(p.y, uRadio, uTam.y - uRadio)); if (p.x < c.x) return -1.0; return length(p - c) - uRadio; }`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (distEsquina(vMat) > 0.0) discard;');
  };
  d.customProgramCacheKey = () => 'pagina-prof-v1';
  return d;
}

// ── canto del bloque: las hojas una sobre otra (líneas finas, un poco irregulares) ──
export function materialCanto({ papel = '#f4f0e8' } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(papel), roughness: 0.97, metalness: 0 });
  const u = { uHojas: { value: 40 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMat;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMat = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vMat; uniform float uHojas;
      float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }`)
      .replace('#include <map_fragment>', /* glsl */`
        // media hoja de corrimiento: el borde de arriba cae en el centro de una hoja, no en una junta
        float f = vMat.y * max(uHojas, 1.0) + 0.5;
        float id = floor(f);
        float onda = 0.06 * sin(vMat.x * 40.0 + h1(id) * 6.28);
        float junta = smoothstep(0.0, 0.18, abs(fract(f + onda) - 0.5) * 2.0 - 0.6);
        float tono = 0.95 + 0.04 * h1(id + 3.0) - 0.07 * junta;
        // de lejos las líneas no se resuelven: se funden en su promedio (sin rayado ni puntos)
        float borroso = smoothstep(0.25, 0.6, fwidth(f));
        tono = mix(tono, 0.945, borroso);
        diffuseColor.rgb *= tono;
      `);
  };
  m.customProgramCacheKey = () => 'canto-v2';
  return m;
}

// ── tapas ──
export const ACABADOS = {
  lino:   { nombre: 'Tela de lino', normal: () => telaLino(), escala: 0.035, rugosidad: 0.86, brillo: 0.0, sheen: 0.7, fuerza: 0.7 },
  cuero:  { nombre: 'Cuero',        normal: () => cuero(),    escala: 0.08,  rugosidad: 0.55, brillo: 0.15, sheen: 0.0, fuerza: 0.55 },
  kraft:  { nombre: 'Cartón kraft', normal: () => kraft(),    escala: 0.06,  rugosidad: 0.93, brillo: 0.0, sheen: 0.0, fuerza: 0.45 },
  liso:   { nombre: 'Papel liso',   normal: () => granoPapel({ tipo: 'liso' }), escala: 0.05, rugosidad: 0.6, brillo: 0.0, sheen: 0.0, fuerza: 0.25 },
  plastico:{ nombre: 'Polipropileno', normal: () => granoPapel({ tipo: 'liso' }), escala: 0.08, rugosidad: 0.35, brillo: 0.5, sheen: 0.0, fuerza: 0.12 },
};

// uv de la geometría en metros: la repetición de la textura se fija por escala física
export function materialTapa({ color = '#2b3a67', acabado = 'lino' } = {}) {
  const a = ACABADOS[acabado] || ACABADOS.lino;
  const n = a.normal().clone(); n.needsUpdate = true;
  n.repeat.set(1 / a.escala, 1 / a.escala);
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: a.rugosidad, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(a.fuerza, a.fuerza),
    sheen: a.sheen, sheenRoughness: 0.75, sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.35),
    clearcoat: a.brillo, clearcoatRoughness: 0.4,
  });
}

// ── superficie bajo el cuaderno ──
export const SUPERFICIES = {
  estudio: { nombre: 'Papel de estudio' },
  madera:  { nombre: 'Mesa de roble' },
  lino:    { nombre: 'Mantel de lino' },
  oscuro:  { nombre: 'Estudio oscuro' },
};
export function materialMesa({ tipo = 'estudio', color } = {}) {
  if (tipo === 'madera') {
    const { color: c, normal } = madera();
    const rep = 6 / 0.5;                       // el plano mide 6 m; la textura, 0,5 m
    const cc = c.clone(); cc.needsUpdate = true; cc.repeat.set(rep, rep);
    const nn = normal.clone(); nn.needsUpdate = true; nn.repeat.set(rep, rep);
    return new THREE.MeshStandardMaterial({ map: cc, normalMap: nn, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.58, metalness: 0 });
  }
  if (tipo === 'lino') {
    const n = telaLino({ hilos: 160 }).clone(); n.needsUpdate = true; n.repeat.set(6 / 0.05, 6 / 0.05);
    return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color || '#b3aa9a'), roughness: 0.95, normalMap: n, normalScale: new THREE.Vector2(0.45, 0.45), sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') });
  }
  const n = papelContinuo().clone(); n.needsUpdate = true; n.repeat.set(6 / 0.4, 6 / 0.4);
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color || (tipo === 'oscuro' ? '#2b2825' : '#a59c90')), roughness: 0.94, normalMap: n, normalScale: new THREE.Vector2(0.2, 0.2) });
}
