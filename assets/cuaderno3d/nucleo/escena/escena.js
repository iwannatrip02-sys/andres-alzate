// escena.js · render físico: tono neutro (fiel al color del dibujo), luz de ventana con sombra suave, ambiente de estudio (reflejos) y la superficie.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { materialMesa } from '../materiales/materiales.js';

export const LUCES = {
  ventana: { nombre: 'Ventana de tarde', color: '#fff3e3', fuerza: 3.1, dir: [-0.42, 0.86, 0.38], ambiente: 0.55, cielo: '#e4ebff', suelo: '#8a7764', relleno: 0.3 },
  estudio: { nombre: 'Estudio neutro',   color: '#ffffff', fuerza: 2.6, dir: [-0.25, 0.92, 0.32], ambiente: 0.75, cielo: '#ffffff', suelo: '#999999', relleno: 0.35 },
  noche:   { nombre: 'Lámpara de noche', color: '#ffd9a8', fuerza: 3.2, dir: [0.55, 0.7, 0.2],    ambiente: 0.16, cielo: '#7f8db8', suelo: '#3b3029', relleno: 0.12 },
  calle:   { nombre: 'Calle de noche (farol)', color: '#ffe6c4', fuerza: 3.4, dir: [-0.3, 0.75, 0.75], ambiente: 0.42, cielo: '#b4c3e2', suelo: '#3a373c', relleno: 0.32 },
  nublado: { nombre: 'Día nublado', color: '#eef2f7', fuerza: 1.4, dir: [-0.2, 0.95, 0.3], ambiente: 0.95, cielo: '#e8eef6', suelo: '#8d8a84', relleno: 0.45 },
};

export class Escena {
  constructor(lienzo, { preservar = false, mesa = 'estudio', fondo = '#9d958a', luz = 'ventana', ao = !/Mobi|Android/i.test(navigator.userAgent), transparente = false } = {}) {
    // transparente: el cuaderno sale con su canal alfa (sin mesa ni fondo) para ponerlo sobre un video o una foto sin recortar
    const r = this.render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: transparente, premultipliedAlpha: true, preserveDrawingBuffer: preservar, powerPreference: 'high-performance' });
    this.transparente = transparente;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;   // respeta el color de las ilustraciones (AgX lo lava)
    r.toneMappingExposure = 0.82;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap;
    this.escena = new THREE.Scene();
    this.fondo = new THREE.Color(fondo);
    this.escena.background = this.fondo;
    this.escena.fog = new THREE.Fog(this.fondo, 1.6, 3.4);
    const pm = new THREE.PMREMGenerator(r);
    this.escena.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    this.camara = new THREE.PerspectiveCamera(30, 1, 0.01, 20);

    // luz principal (la ventana) con sombra suave, y relleno de cielo/suelo
    const l = this.luz = new THREE.DirectionalLight(0xffffff, 2.5);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.radius = 9; l.shadow.blurSamples = 20;
    l.shadow.bias = -0.00025; l.shadow.normalBias = 0.0004;
    Object.assign(l.shadow.camera, { left: -0.42, right: 0.42, top: 0.42, bottom: -0.42, near: 0.05, far: 3 });
    this.escena.add(l, l.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.25);
    this.escena.add(this.hemi);
    this.ponerLuz(luz);

    // mesa
    this.mesa = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), materialMesa({ tipo: mesa }));
    this.mesa.rotation.x = -Math.PI / 2;
    this.mesa.receiveShadow = true;
    this.mesa.userData = { tipo: 'mesa' };
    this.escena.add(this.mesa);
    if (transparente) { r.setClearColor(0x000000, 0); this.escena.background = null; this.escena.fog = null; this.mesa.visible = false; }

    // oclusión ambiental (GTAO, en el espacio de la pantalla): oscurece donde la luz del ambiente no llega — el fondo del
    // canal, bajo una hoja que se levanta, el cuaderno contra la mesa, el canto de las pilas. Radio en metros (escala real)
    this.ao = { activa: ao, fuerza: 1, radio: 0.04 };
    if (ao) this._prepararAO();
  }

  _prepararAO() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.compositor = new EffectComposer(this.render, rt);
    this.compositor.addPass(new RenderPass(this.escena, this.camara));
    this.gtao = new GTAOPass(this.escena, this.camara, 1, 1);
    // las hojas son de doble cara: sin esto la cara de atrás de una hoja levantada no existe para la oclusión
    this.gtao.normalMaterial.side = THREE.DoubleSide;
    this.gtao.updateGtaoMaterial({ radius: this.ao.radio, distanceExponent: 1.2, thickness: 0.5, scale: 0.9, samples: 24, distanceFallOff: 1, screenSpaceRadius: false });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 1.5, normalPhi: 2, radius: 9, rings: 3, samples: 24 });
    this.gtao.blendIntensity = this.ao.fuerza;
    this.compositor.addPass(this.gtao);
    this.compositor.addPass(new OutputPass());
    if (this.tam) this.encuadrar(this.tam.ancho, this.tam.alto);
  }

  ponerAO({ activa = this.ao.activa, fuerza = this.ao.fuerza, radio = this.ao.radio } = {}) {
    Object.assign(this.ao, { activa, fuerza, radio });
    if (activa && !this.compositor) this._prepararAO();
    if (this.gtao) { this.gtao.blendIntensity = fuerza; this.gtao.updateGtaoMaterial({ radius: radio }); }
  }

  // un preajuste por nombre, o una luz propia { color, fuerza, dir, ambiente, cielo, suelo, relleno, exposicion }
  // (la que mide render/luz_fondo.py en el video de fondo, para que el cuaderno quede con la luz del lugar)
  ponerLuz(nombre) {
    const p = nombre && typeof nombre === 'object' ? { ...LUCES.calle, ...nombre } : LUCES[nombre] || LUCES.ventana;
    this.ajusteLuz = p;
    this.render.toneMappingExposure = p.exposicion ?? 0.82;
    this.luz.color.set(p.color); this.luz.intensity = p.fuerza;
    this.escena.environmentIntensity = p.ambiente;
    this.hemi.color.set(p.cielo); this.hemi.groundColor.set(p.suelo); this.hemi.intensity = p.relleno;
    this._apuntarLuz(this.luz.target.position);
  }
  ponerMesa(tipo, color) {
    this.mesa.material.dispose();
    this.mesa.material = materialMesa({ tipo, color });
    const fondos = { estudio: '#9d958a', madera: '#6e5440', lino: '#aaa293', oscuro: '#26231f' };
    this.ponerFondo(color || fondos[tipo] || '#9d958a');
  }
  ponerFondo(color) { this.fondo.set(color); if (this.escena.fog) this.escena.fog.color.set(color); }
  // iluminación por imagen: una foto (el cuadro del video de fondo, desenfocado y en 2:1) pasa a ser el entorno que ilumina
  // y se refleja en el cuaderno, así el papel y la tapa toman el cielo, el suelo y los colores del lugar
  async ponerEntorno(url) {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    const tex = new THREE.Texture(img);
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const pm = this._pmrem || (this._pmrem = new THREE.PMREMGenerator(this.render));
    const rt = pm.fromEquirectangular(tex);
    tex.dispose();
    if (this._entornoRT) this._entornoRT.dispose();
    this._entornoRT = rt;
    this.escena.environment = rt.texture;
  }

  // la luz sigue al cuaderno para que la sombra tenga siempre resolución
  _apuntarLuz(centro) {
    const d = this.ajusteLuz.dir, L = Math.hypot(...d);
    this.luz.target.position.copy(centro);
    this.luz.position.set(centro.x + d[0] / L * 1.4, centro.y + d[1] / L * 1.4, centro.z + d[2] / L * 1.4);
    this.luz.target.updateMatrixWorld();
  }
  seguir(centro) { this._apuntarLuz(centro); }

  encuadrar(ancho, alto) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.render.setPixelRatio(dpr);
    this.render.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
    this.tam = { ancho, alto };
    if (this.compositor) { this.compositor.setPixelRatio(dpr); this.compositor.setSize(ancho, alto); }
  }

  dibujar() {
    if (this.ao.activa && this.compositor) this.compositor.render();
    else this.render.render(this.escena, this.camara);
  }
}
