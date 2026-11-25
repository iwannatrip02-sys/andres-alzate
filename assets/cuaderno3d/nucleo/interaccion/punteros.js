// punteros.js · todos los gestos sobre el cuaderno (ratón, dedo, lápiz):
//  · arrastrar una página → la hoja sigue al dedo por encima del lomo (física); soltarla → cae sola del lado que toque;
//  · tocar una página → pasa a la siguiente (derecha) o a la anterior (izquierda);
//  · arrastrar la tapa → abre o cierra el cuaderno; tocar la tapa cerrada → se abre;
//  · mantener apretado el cuaderno (o el modo «mover») → la mano lo toma de ese punto: se levanta, cuelga y se balancea; al
//    soltarlo cae a la mesa. Con la rueda se gira en la mano;
//  · arrastrar fuera del cuaderno → gira la cámara (con inercia); rueda o pellizco → acercar; botón derecho o dos dedos → desplazar.
import * as THREE from 'three';

const UMBRAL_ARRASTRE = 5;   // px
const PRESION_LARGA = 420;   // ms quieto sobre el cuaderno = tomarlo con la mano
const ALZAR = 0.07;          // m que se levanta al tomarlo

export class Punteros {
  constructor(lienzo, { escena, camara, orbital, cuaderno, cuerpo = null, alCambiar = () => {} }) {
    Object.assign(this, { lienzo, escena, camara, orbital, cuaderno, cuerpo, alCambiar });
    this.modo = 'leer';          // 'leer' | 'mover'
    this.ray = new THREE.Raycaster();
    this.activos = new Map();
    this.gesto = null;
    lienzo.style.touchAction = 'none';
    lienzo.addEventListener('pointerdown', e => this._abajo(e));
    lienzo.addEventListener('pointermove', e => this._mover(e));
    lienzo.addEventListener('pointerup', e => this._arriba(e));
    lienzo.addEventListener('pointercancel', e => this._arriba(e, true));
    lienzo.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.gesto?.tipo === 'cuerpo') { this.cuerpo.girarEnMano(-e.deltaY * 0.002); return; }
      this.orbital.acercar(Math.exp(e.deltaY * 0.0012)); this.orbital.libre = true;
    }, { passive: false });
    lienzo.addEventListener('contextmenu', e => e.preventDefault());
  }

  _ndc(e) { const r = this.lienzo.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  _rayo(e) { this.ray.setFromCamera(this._ndc(e), this.camara); return this.ray.ray; }
  _rayoLocal(e) {
    const r = this._rayo(e).clone(), inv = new THREE.Matrix4().copy(this.cuaderno.raiz.matrixWorld).invert();
    r.applyMatrix4(inv); r.direction.normalize();
    return r;
  }
  _tocar(e) {
    this.ray.setFromCamera(this._ndc(e), this.camara);
    const c = this.cuaderno, objetos = [c.bloques.izq.arriba, c.bloques.der.arriba, c.bloques.izq.canto, c.bloques.der.canto, c.tapaIzq, c.tapaDer, c.lomo, ...c.cabezadas, ...c.vuelos.map(v => v.malla)];
    const h = this.ray.intersectObjects(objetos.filter(o => o.visible), false);
    return h[0] || null;
  }

  _abajo(e) {
    this.lienzo.setPointerCapture(e.pointerId);
    this.activos.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    if (this.activos.size === 2) { this._iniciarDosDedos(); return; }
    if (this.activos.size > 2) return;
    const hit = this._tocar(e), c = this.cuaderno;
    const boton = e.button;
    if (boton === 2 || e.shiftKey) { this.gesto = { tipo: 'desplazar' }; return; }
    if (!hit) { this.gesto = { tipo: 'orbitar', ult: { x: e.clientX, y: e.clientY, t: performance.now() }, vel: { az: 0, el: 0 } }; return; }
    const d = hit.object.userData, local = c.raiz.worldToLocal(hit.point.clone());
    if (this.cuerpo && (this.modo === 'mover' || e.altKey)) { this._tomarCuerpo(hit.point); return; }
    // presión larga sin moverse: la mano toma el cuaderno
    if (this.cuerpo) {
      clearTimeout(this._largo);
      const id = e.pointerId, punto = hit.point.clone();
      this._largo = setTimeout(() => {
        const p = this.activos.get(id);
        if (!p || this.activos.size !== 1 || Math.hypot(p.x - p.x0, p.y - p.y0) > UMBRAL_ARRASTRE) return;
        if (this.gesto && !['pagina?', 'pliegue?'].includes(this.gesto.tipo)) return;
        this._tomarCuerpo(punto);
      }, PRESION_LARGA);
    }
    if (d.tipo === 'vuelo') {
      const v = d.vuelo; v.guion = null;
      c.agarrarHoja(v, hit.uv.x, hit.uv.y, local);
      this.gesto = { tipo: 'hoja', vuelo: v };
    } else if (d.tipo === 'pagina' && c.abierto) {
      this.gesto = { tipo: 'pagina?', lado: d.lado, u: hit.uv.x, v: hit.uv.y, local };
    } else if (d.tipo === 'tapa' || d.tipo === 'lomo' || (d.tipo === 'pagina' && !c.abierto) || d.tipo === 'canto') {
      if (d.tipo === 'tapa' && d.lado === 'der' && c.abierto) { this.gesto = { tipo: 'orbitar', ult: { x: e.clientX, y: e.clientY, t: performance.now() }, vel: { az: 0, el: 0 } }; return; }
      this.gesto = { tipo: 'pliegue?', local, z: local.z };
    } else this.gesto = { tipo: 'orbitar', ult: { x: e.clientX, y: e.clientY, t: performance.now() }, vel: { az: 0, el: 0 } };
  }

  _tomarCuerpo(punto) {
    const b = this.cuerpo;
    b.desde(this.cuaderno.raiz);
    b.tomar(punto);
    b.mover(punto.clone().add(new THREE.Vector3(0, ALZAR, 0)));
    this.gesto = { tipo: 'cuerpo', y: punto.y + ALZAR };
    this.lienzo.style.cursor = 'grabbing';
    this.alCambiar();
  }

  _mover(e) {
    const p = this.activos.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (this.activos.size >= 2) { this._dosDedos(); return; }
    const g = this.gesto; if (!g) return;
    const lejos = Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > UMBRAL_ARRASTRE;
    const c = this.cuaderno;
    if (lejos) clearTimeout(this._largo);
    if (g.tipo === 'pagina?' && lejos) {
      const v = c.levantar(g.lado);
      if (v) { c.agarrarHoja(v, g.u, g.v, g.local); this.gesto = { tipo: 'hoja', vuelo: v }; c.moverHojaConRayo(v, this._rayoLocal(e)); }
      else this.gesto = null;
      this.alCambiar();
    } else if (g.tipo === 'hoja') {
      c.moverHojaConRayo(g.vuelo, this._rayoLocal(e));
    } else if (g.tipo === 'pliegue?' && lejos) {
      c.agarrarPliegue(g.local); this.gesto = { tipo: 'pliegue', z: g.z };
      c.moverPliegueConRayo(this._rayoLocal(e), g.z);
    } else if (g.tipo === 'pliegue') {
      c.moverPliegueConRayo(this._rayoLocal(e), g.z);
    } else if (g.tipo === 'cuerpo') {
      const r = this._rayo(e), t = (g.y - r.origin.y) / (r.direction.y || -1e-6);
      if (t > 0) this.cuerpo.mover(r.origin.clone().addScaledVector(r.direction, Math.min(t, 4)));
    } else if (g.tipo === 'orbitar') {
      const ahora = performance.now(), dtt = Math.max((ahora - g.ult.t) / 1000, 1 / 240);
      const k = 3.2 / this.lienzo.clientHeight;
      this.orbital.girar(-dx * k, dy * k); this.orbital.libre = true;
      g.vel = { az: -dx * k / dtt, el: dy * k / dtt }; g.ult = { x: e.clientX, y: e.clientY, t: ahora };
    } else if (g.tipo === 'desplazar') {
      this.orbital.desplazar(dx / this.lienzo.clientHeight, dy / this.lienzo.clientHeight); this.orbital.libre = true;
    }
  }

  _arriba(e, cancelado = false) {
    clearTimeout(this._largo);
    const p = this.activos.get(e.pointerId);
    this.activos.delete(e.pointerId);
    if (this.dosDedos) { if (this.activos.size < 2) this.dosDedos = null; this.gesto = null; return; }
    const g = this.gesto; this.gesto = null;
    if (!g || !p) return;
    const corto = performance.now() - p.t0 < 350 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) <= UMBRAL_ARRASTRE;
    const c = this.cuaderno;
    if (g.tipo === 'cuerpo') { this.cuerpo.soltar(); this.lienzo.style.cursor = ''; }
    else if (g.tipo === 'hoja') c.soltarHoja(g.vuelo);
    else if (g.tipo === 'pagina?' && corto && !cancelado) c.pasar(g.lado === 'der' ? 1 : -1);
    else if (g.tipo === 'pliegue') c.soltarPliegue();
    else if (g.tipo === 'pliegue?' && corto && !cancelado) { if (c.abierto) c.cerrar(); else c.abrir(); }
    else if (g.tipo === 'orbitar') { if (performance.now() - g.ult.t < 80) this.orbital.soltar(g.vel.az, g.vel.el); }
    this.alCambiar();
  }

  _iniciarDosDedos() {
    // si había una hoja tomada, se suelta
    if (this.gesto?.tipo === 'hoja') this.cuaderno.soltarHoja(this.gesto.vuelo);
    if (this.gesto?.tipo === 'pliegue') this.cuaderno.soltarPliegue();
    this.gesto = null;
    const [a, b] = [...this.activos.values()];
    this.dosDedos = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  _dosDedos() {
    const [a, b] = [...this.activos.values()], s = this.dosDedos; if (!s) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x);
    this.orbital.acercar(s.d / Math.max(d, 1));
    this.orbital.desplazar((cx - s.cx) / this.lienzo.clientHeight, (cy - s.cy) / this.lienzo.clientHeight);
    this.orbital.girar(-(ang - s.ang), 0);
    this.orbital.libre = true;
    Object.assign(s, { d, cx, cy, ang });
  }
}

export function conectarTeclas(cuaderno, { alCambiar = () => {} } = {}) {
  addEventListener('keydown', (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { if (!cuaderno.abierto) cuaderno.abrir(); else cuaderno.pasar(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') cuaderno.pasar(-1);
    else if (e.key === 'Escape') cuaderno.cerrar();
    else if (e.key === ' ' || e.key === 'Enter') { if (cuaderno.abierto) cuaderno.cerrar(); else cuaderno.abrir(); }
    else return;
    e.preventDefault(); alCambiar();
  });
}
