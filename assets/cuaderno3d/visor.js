// visor.js · el cuaderno NAUTA en 3D dentro de la web (16-nov-2026).
// Motor: estudio_creativo/modulos/bitacora_3d/nucleo (el mismo del reel), sin el panel del taller.
// Estética de la web: porcelana de fondo (canvas transparente + sombra real sobre un plano invisible), tapa de tela cobalto,
// guardas cobalto claro y la interfaz con las píldoras de la barra. Sin oclusión ambiental (rinde en celulares).
// Parámetros: ?lang=en · ?abrir=<pliego> (abre en ese pliego; para la foto de portada) · ?captura (el tiempo lo avanza window.__visor)
import * as THREE from 'three';
import { Escena } from './nucleo/escena/escena.js';
import { CamaraOrbital } from './nucleo/interaccion/camara.js';
import { Punteros, conectarTeclas } from './nucleo/interaccion/punteros.js';
import { Cuaderno } from './nucleo/libro/cuaderno.js';

const params = new URLSearchParams(location.search);
const en = params.get('lang') === 'en';
const captura = params.has('captura');
const T = en
  ? { abrir: 'Open', cerrar: 'Close', ant: 'Previous page', sig: 'Next page', tapa: 'Tap the cover to open', guardas: 'Endpapers', pliego: (a, b) => `Spread ${a} of ${b}`,
      pista: 'Drag a page corner to turn it · drag outside the notebook to look around', cargando: 'Loading the notebook…', sinGL: 'This browser cannot show 3D. The illustrations are in the gallery.' }
  : { abrir: 'Abrir', cerrar: 'Cerrar', ant: 'Página anterior', sig: 'Página siguiente', tapa: 'Toca la tapa para abrir', guardas: 'Guardas', pliego: (a, b) => `Pliego ${a} de ${b}`,
      pista: 'Arrastra la esquina de una hoja para pasarla · arrastra fuera del cuaderno para girar', cargando: 'Cargando el cuaderno…', sinGL: 'Este navegador no muestra 3D. Las ilustraciones están en la galería.' };
document.documentElement.lang = en ? 'en' : 'es';
if (params.has('limpio')) document.documentElement.classList.add('limpio');   // sin interfaz: para la foto de la sección
const $ = (id) => document.getElementById(id);
$('estado').textContent = T.cargando;
$('pista').textContent = T.pista;
$('b-ant').title = $('b-ant').ariaLabel = T.ant;
$('b-sig').title = $('b-sig').ariaLabel = T.sig;

const lienzo = $('lienzo');
let escena;
try {
  escena = new Escena(lienzo, { preservar: captura, transparente: true, ao: false, luz: 'estudio' });
} catch (err) {
  $('estado').textContent = T.sinGL; throw err;
}
// sombra real sobre la porcelana de la página: el plano de la mesa queda, pero solo recibe sombra
escena.mesa.material.dispose();
escena.mesa.material = new THREE.ShadowMaterial({ opacity: 0.2 });
escena.mesa.visible = true;
const orbital = new CamaraOrbital(escena.camara, { az: 0, el: 0.98, dist: 0.6 });

const cargador = new THREE.TextureLoader();
const maxAniso = escena.render.capabilities.getMaxAnisotropy();
const pendientes = new Set();
function cargarTextura(url) {
  const t = cargador.load(url, () => pendientes.delete(t), undefined, () => pendientes.delete(t));
  pendientes.add(t);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
  return t;
}

const ruta = '../media/cuaderno/nauta/cuaderno.json';
const datos = await (await fetch(ruta)).json();
datos.base = ruta.replace(/[^/]*$/, '');
// la estética de la web: tela cobalto, guardas y cabezada en la misma tinta
const spec = { ...datos, tapa: { color: '#2340C8', acabado: 'lino' }, guardas: { color: '#dfe3f7' }, cabezada: { colores: ['#F3F0E8', '#2340C8'] }, cinta: false };
const cuaderno = new Cuaderno(spec, { cargarTextura, render: escena.render });
escena.escena.add(cuaderno.raiz);
cuaderno.raiz.updateMatrixWorld();
new Punteros(lienzo, { escena, camara: escena.camara, orbital, cuaderno, cuerpo: null, alCambiar: ui });
conectarTeclas({ get abierto() { return cuaderno.abierto; }, abrir: () => cuaderno.abrir(), cerrar: () => cuaderno.cerrar(), pasar: (d) => cuaderno.pasar(d) }, { alCambiar: ui });
cuaderno.alCambiar = () => ui();

function encuadreAuto(inmediato = false) {
  const c = cuaderno.caja(), centro = new THREE.Vector3().addVectors(c.min, c.max).multiplyScalar(0.5);
  centro.y = 0.006;
  cuaderno.raiz.localToWorld(centro);
  const ancho = c.max.x - c.min.x, fondo = c.max.z - c.min.z;
  const cam = escena.camara, tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), tanH = tanV * cam.aspect;
  const dist = Math.max(ancho / 2 / tanH, fondo * 0.62 / tanV) * 1.16;
  if (inmediato) orbital.fijar({ objetivo: centro, dist }); else orbital.enfocar(centro, dist);
  escena.seguir(centro);
}

function ui() {
  const c = cuaderno, ab = c.abierto || c.psi > 0.5;
  $('b-abrir').textContent = ab ? T.cerrar : T.abrir;
  $('estado').textContent = !c.abierto ? T.tapa : c.kIzq === 0 ? T.guardas : T.pliego(c.kIzq, c.N);
}
$('b-abrir').onclick = () => { if (cuaderno.abierto || cuaderno.psi > 0.5) cuaderno.cerrar(); else cuaderno.abrir(); ui(); };
$('b-sig').onclick = () => { if (!cuaderno.abierto) cuaderno.abrir(); else cuaderno.pasar(1); ui(); };
$('b-ant').onclick = () => { cuaderno.pasar(-1); ui(); };

function redimensionar() { escena.encuadrar(lienzo.clientWidth, lienzo.clientHeight); encuadreAuto(true); }
new ResizeObserver(redimensionar).observe(lienzo);
redimensionar();

let antes = performance.now(), estabaAbierto = cuaderno.abierto;
function cuadro(dt, dibujar = true) {
  cuaderno.paso(dt);
  if (!orbital.libre || cuaderno.abierto !== estabaAbierto) encuadreAuto();
  if (cuaderno.abierto !== estabaAbierto) { estabaAbierto = cuaderno.abierto; orbital.libre = false; ui(); }
  orbital.paso(dt);
  if (dibujar) escena.dibujar();
}
function bucle(t) {
  const dt = Math.min((t - antes) / 1000, 1 / 20); antes = t;
  cuadro(dt);
  requestAnimationFrame(bucle);
}
ui();
document.documentElement.classList.add('listo');

// abrir directo en un pliego (para la foto de la portada de la sección)
const abrirEn = parseInt(params.get('abrir') || '', 10);
if (abrirEn > 0) {
  cuaderno.abrir();
  for (let i = 0; i < 240; i++) cuadro(1 / 60, false);
  for (let k = 1; k < abrirEn; k++) { cuaderno.pasar(1); for (let i = 0; i < 120; i++) cuadro(1 / 60, false); }
  orbital.fijar && encuadreAuto(true);
  for (let i = 0; i < 30; i++) cuadro(1 / 60, false);
  escena.dibujar();
  ui();
}
if (!captura) requestAnimationFrame(bucle);
window.__visor = { cuaderno, avanzar(seg, fps = 60) { for (let i = 0; i < Math.round(seg * fps); i++) cuadro(1 / fps); }, listo: () => pendientes.size === 0 };
