// Web v4 · portada de NAUTA. Orquesta: precarga de gotas → «NAUTA» que se estira → «Andrés Alzate» se escribe y se llena de tinta →
// la tele se enciende con el reel; tinta cobalto bajo el puntero (y con el dedo); reel que crece con el scroll y corta en franjas;
// manifiesto por líneas; grilla con objetos y video líquido; lista de más proyectos con vista flotante.
// El HTML lo genera fuente_v3/construir.py con los datos reales: este archivo solo lo anima (sin JS, todo se lee y se navega igual).
import { iniciarTinta } from './tinta.js';
import { crearEscena } from './escena.js';

const { gsap, ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase, Lenis } = window;
gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase);
CustomEase.create('loza', 'M0,0 C0.2,0.7 0,1 1,1');
const BASE = new URL('../', import.meta.url).href;     // assets/v4/
// ?movimiento=1 fuerza las animaciones aunque el sistema pida reducirlas (para revisar en un PC con «efectos de animación» apagados)
const FORZAR = new URLSearchParams(location.search).has('movimiento');
if (FORZAR) document.documentElement.classList.add('forzar-mov');
const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches && !FORZAR;
const TACTIL = matchMedia('(hover: none)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- scroll suave (en pantallas táctiles manda el scroll nativo) ----------
let lenis = null;
if (!QUIETO) {
  lenis = new Lenis({ lerp: .085, wheelMultiplier: .9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}

// ---------- timecode (25 cps, como la línea de tiempo) ----------
const t0 = performance.now();
const tc = $('#tc'), cuadros = $('#cuadros');
const dos = (n) => String(n).padStart(2, '0');
gsap.ticker.add(() => {
  const f = Math.floor((performance.now() - t0) / 40);
  const ff = f % 25, s = Math.floor(f / 25);
  if (tc) tc.textContent = `${dos(Math.floor(s / 3600))}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}:${dos(ff)}`;
  if (cuadros) cuadros.textContent = dos(ff);
});

// ---------- «Andrés Alzate» en Ballet: contornos por letra ----------
const nombre = $('#nombre');
try { nombre.innerHTML = await fetch(BASE + 'assets/nombre.svg').then((r) => r.text()); } catch (_) { nombre.textContent = 'Andrés Alzate'; }
const glifos = $$('path', nombre);
const mapa = $('#liquido-mapa');

// ---------- «NAUTA» en letras ----------
const marca = $('.marca');
marca.innerHTML = [...marca.textContent].map((c) => `<span class="letra">${c}</span>`).join('');
const letras = $$('.letra', marca);

// ---------- WebGL (si el aparato no puede, la página queda con imágenes fijas) ----------
let escena = null;
try { escena = crearEscena($('#gl')); } catch (_) { document.documentElement.classList.add('sin-gl'); }
const tinta = QUIETO ? null : iniciarTinta($('#tinta'));
gsap.ticker.add(() => { escena?.cuadro(); tinta?.cuadro(); });
addEventListener('resize', () => { tinta?.medir(); ScrollTrigger.refresh(); });
const tvPromesa = escena ? escena.televisor($('#gl-portada'), BASE + 'media/tv_reel_4x3.mp4').catch(() => null) : Promise.resolve(null);

// ---------- grilla: cada celda trae sus datos en el HTML ----------
const celdas = $$('.celda');
const vistasGrilla = [];
if (escena) {
  const io = new IntersectionObserver((ents) => {
    for (const en of ents) {
      const c = en.target;
      if (!en.isIntersecting || c.dataset.cargada) continue;
      c.dataset.cargada = 1;
      const i = +c.dataset.i, anc = $('.ancla', c), d = c.dataset;
      const prom = d.objeto ? escena.objeto(anc, d.objeto, d.bucle)
        : escena.plano(anc, d.poster, d.bucle, d.formato === '9x16' ? 9 / 16 : 16 / 9);
      prom.then((v) => { vistasGrilla[i] = v; c.classList.add('con-gl'); if (c.classList.contains('activa')) entrar(c); }).catch(() => {});
    }
  }, { rootMargin: '400px 0px' });
  celdas.forEach((c) => io.observe(c));
}
function entrar(c) {
  const v = vistasGrilla[+c.dataset.i]; if (!v) return;
  gsap.to(v.est, { hover: 1, duration: .6, ease: 'power3.out' });
  v.activar?.(true); v.video?.play?.().catch(() => {});
}
function salir(c) {
  const v = vistasGrilla[+c.dataset.i]; if (!v) return;
  gsap.to(v.est, { hover: 0, duration: .8, ease: 'power3.out' });
  v.activar?.(false); if (!v.activar) v.video?.pause?.();
}
celdas.forEach((c) => {
  const i = +c.dataset.i;
  c.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const b = c.getBoundingClientRect();
    const mx = (e.clientX - b.left) / b.width, my = (e.clientY - b.top) / b.height;
    c.style.setProperty('--mx', `${mx * 100}%`); c.style.setProperty('--my', `${my * 100}%`);
    const v = vistasGrilla[i]; if (v) { v.est.mx = mx * 2 - 1; v.est.my = -(my * 2 - 1); }
  });
  c.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') entrar(c); });
  c.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') salir(c); });
});
// con el dedo no hay «hover»: la celda que cruza el centro de la pantalla se enciende sola
if (TACTIL) {
  const centro = new IntersectionObserver((ents) => {
    for (const en of ents) {
      en.target.classList.toggle('activa', en.isIntersecting);
      en.isIntersecting ? entrar(en.target) : salir(en.target);
    }
  }, { rootMargin: '-38% 0px -38% 0px' });
  celdas.forEach((c) => centro.observe(c));
}

// ---------- más proyectos: lista con vista flotante (con mouse) ----------
const vista = $('#vista'), vistaV = $('video', vista);
const vpos = { x: innerWidth / 2, y: innerHeight / 2, tx: 0, ty: 0 };
if (!TACTIL) {
  $$('.fila[data-poster]').forEach((f) => {
    f.addEventListener('pointerenter', () => {
      const s = f.dataset.src || '';
      if (!s) { vistaV.removeAttribute('src'); vistaV.poster = f.dataset.poster; vistaV.load(); }     // formatos sin bucle: su cuadro fijo
      else if (vistaV.getAttribute('src') !== s) { vistaV.poster = f.dataset.poster; vistaV.src = s; }
      if (s) vistaV.play().catch(() => {});
      vista.classList.add('on');
    });
    f.addEventListener('pointerleave', () => { vista.classList.remove('on'); vistaV.pause(); });
  });
  gsap.ticker.add(() => {
    vpos.x += (vpos.tx - vpos.x) * .12; vpos.y += (vpos.ty - vpos.y) * .12;
    const rot = (vpos.tx - vpos.x) * .04;
    vista.style.transform = `translate(${vpos.x + 24}px, ${vpos.y - 110}px) rotate(${rot}deg) scale(${vista.classList.contains('on') ? 1 : .6})`;
  });
}

// ---------- cursor ----------
const cursor = $('#cursor'), cursorT = $('span', cursor);
const cpos = { x: -100, y: -100, tx: -100, ty: -100 };
addEventListener('pointermove', (e) => { cpos.tx = e.clientX; cpos.ty = e.clientY; vpos.tx = e.clientX; vpos.ty = e.clientY; }, { passive: true });
if (!TACTIL) {
  gsap.ticker.add(() => {
    cpos.x += (cpos.tx - cpos.x) * .22; cpos.y += (cpos.ty - cpos.y) * .22;
    cursor.style.transform = `translate(${cpos.x}px, ${cpos.y}px)`;
  });
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor]');
    cursor.classList.toggle('grande', !!t); cursorT.textContent = t ? t.dataset.cursor : '';
  });
}

// ---------- tinta bajo el puntero (y el dedo: arrastrar de lado pinta, arrastrar hacia abajo baja la página) ----------
const portada = $('#portada');
if (tinta) {
  portada.addEventListener('pointermove', (e) => {
    const b = portada.getBoundingClientRect();
    tinta.pincel((e.clientX - b.left) / b.width, 1 - (e.clientY - b.top) / b.height);
  });
  portada.addEventListener('pointerleave', () => tinta.levantar());
  portada.addEventListener('pointerup', () => tinta.levantar());
  portada.addEventListener('pointercancel', () => tinta.levantar());
  ScrollTrigger.create({ trigger: portada, start: 'top top', end: 'bottom top', onLeave: () => { tinta.activo = false; }, onEnterBack: () => { tinta.activo = true; } });
}

// letras que se estiran cerca del puntero (eje de ancho de Archivo)
const anchoBase = 72;
let letrasVivas = false;
addEventListener('pointermove', (e) => {
  if (!letrasVivas || e.pointerType === 'touch') return;
  for (const l of letras) {
    const b = l.getBoundingClientRect();
    const d = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
    const k = Math.max(0, 1 - d / 420);
    gsap.to(l, { fontVariationSettings: `"wdth" ${anchoBase + k * 46}, "wght" ${900 - k * 250}`, duration: .6, ease: 'power3.out', overwrite: 'auto' });
  }
}, { passive: true });

// el nombre es tinta: se ondula al pasar el puntero cerca (o al tocar la portada) y vuelve a asentarse
let ondaLista = false, ultimaOnda = 0;
function onda() {
  if (!ondaLista || performance.now() - ultimaOnda < 900) return;
  ultimaOnda = performance.now();
  nombre.classList.add('liquido');
  gsap.timeline({ onComplete: () => nombre.classList.remove('liquido') })
    .to(mapa, { attr: { scale: 16 }, duration: .35, ease: 'power2.out' })
    .to(mapa, { attr: { scale: 0 }, duration: 1.3, ease: 'power2.out' });
}
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const b = nombre.getBoundingClientRect();
  if (e.clientX > b.left - 40 && e.clientX < b.right + 40 && e.clientY > b.top - 40 && e.clientY < b.bottom + 40) onda();
}, { passive: true });
portada.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') onda(); });

// en pantallas táctiles, el pincel pasa solo de vez en cuando mientras se ve la portada
if (tinta && TACTIL) {
  let viva = true;
  ScrollTrigger.create({ trigger: portada, start: 'top top', end: 'bottom top', onToggle: (s) => { viva = s.isActive; } });
  const pasada = () => {
    if (viva && ondaLista) {
      const p = { x: .05 + Math.random() * .2, y: .2 + Math.random() * .5 }, fin = .6 + Math.random() * .35, fase = Math.random() * 6;
      tinta.levantar();
      gsap.to(p, { x: fin, duration: 1.6, ease: 'power2.inOut',
        onUpdate() { tinta.pincel(p.x, p.y + Math.sin(p.x * 8 + fase) * .04, 1.3); }, onComplete() { tinta.levantar(); } });
    }
    gsap.delayedCall(4 + Math.random() * 3, pasada);
  };
  gsap.delayedCall(6, pasada);
}

// ---------- tono de la cabecera según la sección ----------
ScrollTrigger.create({ trigger: '#portada', start: 'bottom 80px', onEnter: () => $('#cab').classList.add('compacta'), onLeaveBack: () => $('#cab').classList.remove('compacta') });
$$('[data-tono="oscuro"]').forEach((s) => ScrollTrigger.create({
  trigger: s, start: 'top 60px', end: 'bottom 60px', toggleClass: { targets: '#cab', className: 'sobre-oscuro' },
}));

// ---------- secuencia de entrada ----------
// la tele no detiene la entrada: si su modelo tarda (red lenta), la portada arranca y la tele llega después
const tv = await Promise.race([tvPromesa, new Promise((r) => setTimeout(() => r(null), 3500))]);
await document.fonts.ready;
gsap.set(letras, { yPercent: 115, fontVariationSettings: '"wdth" 125, "wght" 900' });
gsap.set(glifos, { drawSVG: '0%' });
gsap.set(['.bajada', '.esquina'], { autoAlpha: 0, y: 14 });
gsap.set('#precarga', { clipPath: 'circle(75% at 50% 50%)' });

const intro = gsap.timeline({ defaults: { ease: 'loza' }, onComplete: () => { letrasVivas = true; ondaLista = true; } });
intro
  .to('#precarga .g1', { attr: { cx: -26, cy: 8 }, duration: .5, ease: 'power2.out' }, 0)
  .to('#precarga .g2', { attr: { cx: 24, cy: -10 }, duration: .5, ease: 'power2.out' }, 0)
  .to('#precarga .g3', { attr: { cx: 6, cy: 26 }, duration: .5, ease: 'power2.out' }, .1)
  .to('#precarga circle:not(.g0)', { attr: { cx: 0, cy: 0 }, duration: .45, ease: 'power3.in' }, .6)
  .to('#precarga .g0', { attr: { r: 24 }, duration: .3, ease: 'back.out(3)' }, 1.02)
  .to('#precarga', { clipPath: 'circle(0% at 50% 50%)', duration: .9, ease: 'expo.inOut' }, 1.25)
  .add(() => document.documentElement.classList.add('listo'), 1.6)
  .to(letras, { yPercent: 0, duration: 1.1, stagger: .055 }, 1.45)
  .to(letras, { fontVariationSettings: `"wdth" ${anchoBase}, "wght" 900`, duration: 1.4, stagger: .055, ease: 'expo.out' }, 1.75);
// la pluma traza el contorno de cada letra, la tinta lo llena corriéndose (desplazamiento líquido que se asienta) y queda un halo de porcelana
const tNombre = 2.2;
intro
  .add(() => nombre.classList.add('liquido'), tNombre)
  .to(glifos, { drawSVG: '100%', duration: 1.1, stagger: .085, ease: 'power1.inOut' }, tNombre)
  .fromTo(mapa, { attr: { scale: 46 } }, { attr: { scale: 0 }, duration: 2.4, ease: 'power2.out' }, tNombre + .55)
  .to(glifos, { fillOpacity: 1, duration: .9, stagger: .085, ease: 'power2.out' }, tNombre + .55)
  .to(glifos, { stroke: '#F3F0E8', strokeWidth: 5, duration: .8, stagger: .085, ease: 'power2.out' }, tNombre + 1.1)
  .add(() => nombre.classList.remove('liquido'), tNombre + 3.1);
if (tv) {
  intro
    .to(tv.estado, { intro: 1, duration: 1.8, ease: 'expo.out' }, 1.9)
    .add(() => tv.encender(1.2), 2.8);
} else {
  tvPromesa.then((t) => { if (!t) return; gsap.to(t.estado, { intro: 1, duration: 1.8, ease: 'expo.out' }); gsap.delayedCall(.9, () => t.encender(1.2)); montarTv(t); });
}
intro
  .to(['.bajada', '.esquina'], { autoAlpha: 1, y: 0, duration: .9, stagger: .08 }, 3.0)
  .add(() => lenis?.start(), 3.0);

// pincelada de entrada: el pincel cruza bajo el titular antes de que el usuario mueva el mouse
if (tinta) {
  const brocha = { x: .02, y: .30 };
  intro.add(() => tinta.levantar(), 2.39);
  intro.to(brocha, {
    x: .62, duration: 1.3, ease: 'power2.inOut',
    onUpdate() { tinta.pincel(brocha.x, brocha.y + Math.sin(brocha.x * 9) * .035, 1.5); },
    onComplete() { tinta.levantar(); },
  }, 2.4);
}

// la tele reacciona al hover, lleva al reel con un clic y se aleja con el scroll
const ancla = $('#ancla-tv');
const irAlReel = () => (lenis ? lenis.scrollTo('#reel', { offset: innerHeight * .9, duration: 1.8 }) : $('#reel').scrollIntoView({ behavior: 'smooth' }));
function montarTv(t) {
  ancla.addEventListener('pointerenter', () => { t.estado.hover = 1; });
  ancla.addEventListener('pointerleave', () => { t.estado.hover = 0; });
  ancla.style.pointerEvents = 'auto';
  ancla.addEventListener('click', irAlReel);
  gsap.to(t.estado, { scroll: 1, ease: 'none', scrollTrigger: { trigger: portada, start: 'top top', end: 'bottom top', scrub: true } });
}
if (tv) montarTv(tv);
gsap.to('.titular', { yPercent: -35, ease: 'none', scrollTrigger: { trigger: portada, start: 'top top', end: 'bottom top', scrub: true } });

// ---------- reel que crece y corta en franjas ----------
const marco = $('#reel-marco'), rv = $('#reel-video');
const tlReel = gsap.timeline({ scrollTrigger: { trigger: '#reel', start: 'top bottom', end: 'bottom bottom', scrub: .6,
  onToggle: (s) => (s.isActive ? rv.play().catch(() => {}) : rv.pause()) } });
tlReel
  .fromTo(marco, { clipPath: 'inset(31vh 29vw 31vh 29vw round 18px)' }, { clipPath: 'inset(0vh 0vw 0vh 0vw round 0px)', ease: 'power2.inOut', duration: .55 })
  .to('#franjas i', { scaleY: 1, duration: .08, stagger: .012, ease: 'power2.in' }, .6)
  .add(() => { if (rv.duration) rv.currentTime = (rv.currentTime + 7) % rv.duration; }, .72)    // el corte: salta de plano detrás de las franjas
  .set('#franjas i', { transformOrigin: 'bottom' }, .72)
  .to('#franjas i', { scaleY: 0, duration: .08, stagger: .012, ease: 'power2.out' }, .73)
  .to('.reel-rotulo', { opacity: 1, duration: .1 }, .85);
// el reel completo, con sonido y controles, en un diálogo
const dlg = $('#dialogo-reel'), dv = dlg && $('video', dlg);
$('#reel-sonido')?.addEventListener('click', () => {
  if (!dlg) return;
  if (!dv.getAttribute('src')) dv.src = dv.dataset.src;
  rv.pause(); lenis?.stop(); dlg.showModal(); dv.play().catch(() => {});
});
dlg?.addEventListener('close', () => { dv.pause(); lenis?.start(); });
if (dlg) $('[data-cerrar]', dlg).addEventListener('click', () => dlg.close());
dlg?.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

// ---------- manifiesto por líneas ----------
const split = SplitText.create('#manifiesto', { type: 'lines', mask: 'lines', linesClass: 'linea' });
gsap.from(split.lines, { yPercent: 105, duration: 1.1, stagger: .09, ease: 'expo.out',
  scrollTrigger: { trigger: '.manifiesto', start: 'top 70%' } });

// ---------- títulos y filas que entran ----------
gsap.from('.trabajos-cab h2', { yPercent: 100, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.trabajos', start: 'top 80%' } });
gsap.from('.celda', { opacity: 0, y: 60, duration: 1, stagger: .07, ease: 'expo.out', scrollTrigger: { trigger: '.grilla', start: 'top 80%' } });
$$('.mas__grupo').forEach((g) => gsap.from($$('.fila', g), { opacity: 0, x: -30, duration: .8, stagger: .04, ease: 'expo.out', scrollTrigger: { trigger: g, start: 'top 82%' } }));
gsap.from('.servicio', { opacity: 0, y: 30, duration: .8, stagger: .05, ease: 'expo.out', scrollTrigger: { trigger: '.hago', start: 'top 78%' } });
gsap.from('.pie-web .grande', { yPercent: 60, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.pie-web', start: 'top 80%' } });

// ---------- contacto: copiar el correo; clics medidos (GoatCounter, cuando esté activo) ----------
function medir(n) { try { window.goatcounter?.count?.({ path: 'clic-' + n, event: true }); } catch (_) { /* sin métricas */ } }
document.addEventListener('click', (e) => { const a = e.target.closest('[data-medir]'); if (a) medir(a.dataset.medir); });
$$('[data-copiar-correo]').forEach((b) => b.addEventListener('click', async () => {
  const c = b.dataset.copiarCorreo, antes = b.textContent;
  try { await navigator.clipboard.writeText(c); } catch (_) { const i = document.createElement('input'); i.value = c; document.body.append(i); i.select(); document.execCommand('copy'); i.remove(); }
  b.textContent = b.dataset.hecho; medir('copiar-correo'); setTimeout(() => { b.textContent = antes; }, 2200);
}));

if (QUIETO) { intro.progress(1); }
