// Un solo lienzo WebGL fijo para toda la página: cada «vista» se dibuja dentro del rectángulo de su ancla del DOM (tijera).
// Portada: televisor CRT (Poly Haven, CC0) con el reel en su vidrio curvo. Grilla: objetos de oficio y planos de video líquido.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PANTALLA } from './tv_pantalla.js';

// rutas relativas a este archivo: sirven igual en el prototipo y en assets/v4/ del sitio publicado
const M = (r) => new URL(`../modelos/${r}`, import.meta.url).href;
const MODELOS = {
  television_02: M('television_02/television_02_2k.gltf'),
  antique_ceramic_vase_01: M('antique_ceramic_vase_01/antique_ceramic_vase_01_1k.gltf'),
  vintage_video_camera: M('vintage_video_camera/vintage_video_camera_1k.gltf'),
  filmstrip_projector_8mm: M('filmstrip_projector_8mm/filmstrip_projector_8mm_1k.gltf'),
  boombox: M('boombox/boombox_1k.gltf'),
  megaphone_01: M('megaphone_01/Megaphone_01_1k.gltf'),
};

// ---------- pantalla CRT: barrido, curvatura, aberración, encendido ----------
const CRT_V = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const CRT_F = `
uniform sampler2D uVideo; uniform float uT; uniform float uOn; uniform float uHover; uniform vec2 uRes;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec2 uv=vUv-.5; float r2=dot(uv,uv); uv*=1.+r2*.10; uv+=.5;                 // curvatura del tubo
  vec2 cuadro=uv; cuadro.x=(cuadro.x-.5)*(1.+uHover*.02)+.5;
  float ab=.0018+uHover*.004;
  vec3 c=vec3(texture2D(uVideo,cuadro+vec2(ab,0.)).r, texture2D(uVideo,cuadro).g, texture2D(uVideo,cuadro-vec2(ab,0.)).b);
  c=pow(c,vec3(.95))*1.08;
  float lin=.86+.14*sin((uv.y*uRes.y)*3.14159);                              // líneas de barrido
  c*=lin;
  c+= (h(uv*uRes+uT)-.5)*.05;                                                  // nieve fina
  c*=1.-smoothstep(.18,.55,r2)*.9;                                             // viñeta del vidrio
  // encendido: punto → línea → imagen
  float on=clamp(uOn,0.,1.);
  float linea=smoothstep(.0,.35,on), abre=smoothstep(.35,1.,on);
  float alto=mix(.004,.5,abre), ancho=mix(.0,.5,linea);
  float m=step(abs(vUv.y-.5),alto)*step(abs(vUv.x-.5),ancho);
  vec3 blanco=vec3(1.)*(1.-abre)*2.;
  c=mix(blanco, c, abre)*m;
  // brillo del vidrio
  float g=smoothstep(.5,.0,length(vUv-vec2(.28,.78)))*.10;
  c+=g;
  if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) c=vec3(0.);
  gl_FragColor=vec4(c,1.);
  #include <colorspace_fragment>
}`;

// ---------- plano de video líquido ----------
const LIQ_V = `
uniform float uHover; uniform float uT; uniform vec2 uMouse; varying vec2 vUv;
void main(){ vUv=uv; vec3 p=position;
  float d=distance(uv,uMouse);
  p.z+= sin(d*10.-uT*3.)*.035*uHover*(1.-d);                                  // ola que sale del puntero
  p.z+= -(pow(uv.x-.5,2.)+pow(uv.y-.5,2.))*.25*uHover;                         // se curva como papel
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;
const LIQ_F = `
uniform sampler2D uTex; uniform float uHover; uniform float uT; uniform vec2 uMouse; uniform float uAspTex; uniform float uAspPlano;
varying vec2 vUv;
float n(vec2 p){ return sin(p.x*7.+uT*1.3)*sin(p.y*9.-uT*1.1); }
void main(){
  vec2 uv=vUv;
  // object-fit: cover
  vec2 s=vec2(1.); if(uAspTex>uAspPlano) s.x=uAspPlano/uAspTex; else s.y=uAspTex/uAspPlano;
  uv=(uv-.5)*s+.5;
  float d=distance(vUv,uMouse);
  vec2 desp=vec2(n(vUv*2.), n(vUv.yx*2.+3.))*.012*uHover + (vUv-uMouse)*.06*uHover*smoothstep(.45,.0,d);
  uv+=desp;
  float ab=.006*uHover;
  vec3 c=vec3(texture2D(uTex,uv+vec2(ab,0.)).r, texture2D(uTex,uv).g, texture2D(uTex,uv-vec2(ab,0.)).b);
  // esquinas redondeadas
  vec2 q=abs(vUv-.5)*vec2(uAspPlano,1.); vec2 lim=vec2(.5*uAspPlano,.5)-.035;
  float a=1.-smoothstep(.0,.004,length(max(q-lim,0.))-.035);
  gl_FragColor=vec4(c,a);
  #include <colorspace_fragment>
}`;

export function crearEscena(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(hover: none)').matches ? 1.5 : 1.75));   // en tableta y celular, menos píxeles: más fluido
  r.setSize(innerWidth, innerHeight, false);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.VSMShadowMap;
  r.setClearColor(0x000000, 0);
  const pm = new THREE.PMREMGenerator(r);
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const loader = new GLTFLoader();
  const cache = {};
  const cargar = (id) => (cache[id] ||= loader.loadAsync(MODELOS[id]).then((g) => g.scene));
  const vistas = [];
  const raton = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { raton.x = e.clientX / innerWidth * 2 - 1; raton.y = -(e.clientY / innerHeight * 2 - 1); }, { passive: true });

  function baseEscena(sombra = true) {
    const s = new THREE.Scene();
    s.environment = env;
    const sol = new THREE.DirectionalLight(0xfff4e6, 2.2);
    sol.position.set(-2.2, 2.6, 3.2);
    if (sombra) {
      sol.castShadow = true; sol.shadow.mapSize.set(512, 512); sol.shadow.radius = 22; sol.shadow.blurSamples = 24;
      Object.assign(sol.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: .1, far: 14 });
      sol.shadow.bias = -0.0015;
    }
    s.add(sol);
    const relleno = new THREE.DirectionalLight(0xc8d2ff, .5); relleno.position.set(3, 1, 2); s.add(relleno);
    return { s, sol };
  }

  function normalizar(obj, alto = 1) {
    obj.scale.setScalar(1); obj.position.set(0, 0, 0); obj.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(obj);
    const tam = caja.getSize(new THREE.Vector3()), cen = caja.getCenter(new THREE.Vector3());
    const k = alto / Math.max(tam.y, tam.x * .75);
    obj.scale.setScalar(k);
    obj.position.set(-cen.x * k, -cen.y * k, -cen.z * k);
    obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
    return k;
  }

  // sombra proyectada sobre la «pared» de porcelana, detrás del objeto (como en un estudio)
  function pared(s, z = -.62) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: 0x13207a, opacity: .16 }));
    p.position.z = z; p.receiveShadow = true; s.add(p);
    return p;
  }

  function videoTex(src) {
    const v = document.createElement('video');
    Object.assign(v, { src, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
    v.setAttribute('playsinline', '');
    const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace;
    return { v, t };
  }

  // ---------- vista de la portada: televisor ----------
  async function televisor(el, src) {
    const { s } = baseEscena(true);
    pared(s, -.95);
    const cam = new THREE.PerspectiveCamera(26, 1, .1, 50); cam.position.set(0, .05, 3.1);
    const grupo = new THREE.Group(); s.add(grupo);
    const pivote = new THREE.Group(); grupo.add(pivote);
    const tv = (await cargar('television_02')).clone(true);   // el original queda limpio en la caché para la grilla
    const k = normalizar(tv, 1.05);
    pivote.add(tv);
    const caja = new THREE.Box3().setFromObject(tv); const cen0 = caja.getCenter(new THREE.Vector3());
    // vidrio: la superficie medida en la malla (tv_pantalla.js), en coordenadas del modelo
    const P = PANTALLA;
    const g = new THREE.PlaneGeometry(P.x1 - P.x0, P.y1 - P.y0, P.nx, P.ny);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, P.z[i]);
    g.translate((P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, 0);
    const { v, t } = videoTex(src);
    const mat = new THREE.ShaderMaterial({ vertexShader: CRT_V, fragmentShader: CRT_F, toneMapped: false,
      uniforms: { uVideo: { value: t }, uT: { value: 0 }, uOn: { value: 0 }, uHover: { value: 0 }, uRes: { value: new THREE.Vector2(640, 240) } } });
    const vidrio = new THREE.Mesh(g, mat);
    // el modelo se escaló y centró: el vidrio va dentro del mismo nodo para heredar todo
    // el vidrio se midió en coordenadas de la malla: va como hijo de la malla para heredar su transformación
    tv.getObjectByProperty('isMesh', true).add(vidrio);
    const luzPantalla = new THREE.PointLight(0x8fa2ff, 0, 3); luzPantalla.position.set(0, .05, .9); s.add(luzPantalla);
    const estado = { rx: 0, ry: 0, intro: 0, scroll: 0, hover: 0 };
    const vista = {
      el, s, cam, video: v, mat, estado, grupo, pivote, encender(d = 1.4) {
        v.play().catch(() => {});
        return gsap.to(mat.uniforms.uOn, { value: 1, duration: d, ease: 'power2.inOut' });
      },
      update(tt) {
        mat.uniforms.uT.value = tt;
        const objY = raton.x * .55 - .35 + Math.sin(tt * .5) * .05, objX = -raton.y * .18 + Math.sin(tt * .7) * .03;
        estado.ry += (objY - estado.ry) * .06; estado.rx += (objX - estado.rx) * .06;
        pivote.rotation.set(estado.rx + estado.scroll * .5, estado.ry - (1 - estado.intro) * 1.9 + estado.scroll * .9, (1 - estado.intro) * .25);
        pivote.position.y = (1 - estado.intro) * -1.6 + Math.sin(tt * 1.1) * .02 - estado.scroll * .4;
        // encuadre: la tele abajo a la derecha del cuadro de la portada (en celular, centrada abajo)
        const altoV = 2 * cam.position.z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), anchoV = altoV * cam.aspect;
        // el cuadro de render se alarga 45 % bajo la portada (.gl-portada) para que la tele no se corte al hacer scroll
        const EXT = .45, frac = 1 / (1 + EXT), ancho = cam.aspect * (1 + EXT);
        const kTv = (ancho > 1 ? .74 : .62) * frac;
        grupo.scale.setScalar(kTv);
        grupo.position.set(ancho > 1 ? anchoV * .25 : anchoV * .06, -altoV / 2 + altoV * EXT * frac + .56 * kTv + .05 * frac, 0);
        mat.uniforms.uHover.value += (estado.hover - mat.uniforms.uHover.value) * .1;
        luzPantalla.intensity = mat.uniforms.uOn.value * 1.6;
      },
    };
    vistas.push(vista);
    return vista;
  }

  // ---------- vistas de la grilla ----------
  async function objeto(el, id, src, opciones = {}) {
    const { s } = baseEscena(true);
    pared(s, -.95);
    const cam = new THREE.PerspectiveCamera(24, 1, .1, 50); cam.position.set(0, .12, 3.4);
    const piv = new THREE.Group(); s.add(piv);
    const obj = (await cargar(id)).clone(true);
    normalizar(obj, opciones.alto || .95);
    piv.add(obj);
    let mat = null, vid = null;
    if (id === 'television_02' && src) {            // la tele de la grilla también muestra su video
      const P = PANTALLA;
      const g = new THREE.PlaneGeometry(P.x1 - P.x0, P.y1 - P.y0, P.nx, P.ny);
      for (let i = 0; i < g.attributes.position.count; i++) g.attributes.position.setZ(i, P.z[i]);
      g.translate((P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, 0);
      vid = videoTex(src);
      mat = new THREE.ShaderMaterial({ vertexShader: CRT_V, fragmentShader: CRT_F, toneMapped: false,
        uniforms: { uVideo: { value: vid.t }, uT: { value: 0 }, uOn: { value: 1 }, uHover: { value: 0 }, uRes: { value: new THREE.Vector2(640, 240) } } });
      obj.getObjectByProperty('isMesh', true).add(new THREE.Mesh(g, mat));
    }
    const altavoces = [];
    obj.traverse((m) => { if (m.isMesh && /speaker/i.test(m.material?.name || '')) altavoces.push(m); });
    const est = { hover: 0, mx: 0, my: 0, giro: Math.random() * 6 };
    const vista = {
      el, s, cam, est, video: vid?.v,
      update(tt, caja) {
        est.giro += .004 + est.hover * .012;
        piv.rotation.y = Math.sin(est.giro) * .55 + est.mx * .5 * est.hover;
        piv.rotation.x = -est.my * .25 * est.hover + Math.sin(tt * .8 + est.giro) * .03;
        piv.position.y = Math.sin(tt * 1.2 + est.giro) * .025;
        const k = 1 + est.hover * .06; piv.scale.setScalar(k);
        if (mat) mat.uniforms.uT.value = tt;
        for (const a of altavoces) a.scale.z = 1 + Math.max(0, Math.sin(tt * 10.5)) ** 6 * .6 * (.3 + est.hover);   // golpe de bajo
      },
    };
    vistas.push(vista);
    return vista;
  }

  async function plano(el, poster, src, asp = 16 / 9) {
    const s = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, .1, 50); cam.position.set(0, 0, 3);
    const tex = await new THREE.TextureLoader().loadAsync(poster); tex.colorSpace = THREE.SRGBColorSpace;
    const altoP = asp < 1 ? 1.35 : .9, anchoP = altoP * asp;
    const mat = new THREE.ShaderMaterial({ vertexShader: LIQ_V, fragmentShader: LIQ_F, transparent: true, toneMapped: false,
      uniforms: { uTex: { value: tex }, uHover: { value: 0 }, uT: { value: 0 }, uMouse: { value: new THREE.Vector2(.5, .5) },
        uAspTex: { value: tex.image.width / tex.image.height }, uAspPlano: { value: asp } } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(anchoP, altoP, 48, 48), mat); s.add(m);
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(anchoP * 1.02, altoP * 1.02),
      new THREE.MeshBasicMaterial({ color: 0x13207a, transparent: true, opacity: .12 }));
    sombra.position.set(.06, -.08, -.25); s.add(sombra);
    let vid = null;
    const est = { hover: 0, mx: 0, my: 0 };
    const vista = {
      el, s, cam, est,
      get video() { return vid?.v; },
      activar(on) {
        if (on && !vid) { vid = videoTex(src); vid.v.addEventListener('playing', () => { mat.uniforms.uTex.value = vid.t; mat.uniforms.uAspTex.value = vid.v.videoWidth / vid.v.videoHeight; }, { once: true }); }
        if (vid) on ? vid.v.play().catch(() => {}) : vid.v.pause();
      },
      update(tt) {
        mat.uniforms.uT.value = tt;
        mat.uniforms.uHover.value += (est.hover - mat.uniforms.uHover.value) * .08;
        mat.uniforms.uMouse.value.lerp(new THREE.Vector2(est.mx * .5 + .5, est.my * .5 + .5), .15);
        m.rotation.y += ((est.mx * .35 * est.hover) - m.rotation.y) * .08;
        m.rotation.x += ((-est.my * .25 * est.hover) - m.rotation.x) * .08;
        sombra.rotation.copy(m.rotation);
        m.position.z = est.hover * .12; m.position.y = Math.sin(tt * 1.1) * .015;
      },
    };
    vistas.push(vista);
    return vista;
  }

  function medir() { r.setSize(innerWidth, innerHeight, false); }
  addEventListener('resize', medir);

  const reloj = new THREE.Clock();
  function cuadro() {
    const tt = reloj.getElapsedTime();
    r.setScissorTest(false); r.clear(); r.setScissorTest(true);
    for (const v of vistas) {
      const b = v.el.getBoundingClientRect();
      if (b.bottom < -50 || b.top > innerHeight + 50 || b.width < 4) { v.visible = false; continue; }
      v.visible = true;
      const x = b.left, y = innerHeight - b.bottom;
      r.setViewport(x, y, b.width, b.height); r.setScissor(x, y, b.width, b.height);
      v.cam.aspect = b.width / b.height; v.cam.updateProjectionMatrix();
      v.update(tt, b);
      r.render(v.s, v.cam);
    }
  }
  return { r, televisor, objeto, plano, cuadro, vistas };
}
