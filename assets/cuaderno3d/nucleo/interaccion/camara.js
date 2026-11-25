// camara.js · cámara orbital con inercia alrededor del cuaderno: girar, inclinar, acercar y desplazar, con límites (nunca bajo la mesa).
import * as THREE from 'three';

export class CamaraOrbital {
  constructor(camara, { objetivo = new THREE.Vector3(), az = 0.0, el = 0.95, dist = 0.62 } = {}) {
    this.camara = camara;
    this.objetivo = objetivo.clone();
    this.meta = { objetivo: objetivo.clone(), az, el, dist };
    this.az = az; this.el = el; this.dist = dist;
    this.vel = { az: 0, el: 0 };
    this.limites = { elMin: 0.16, elMax: 1.52, distMin: 0.16, distMax: 1.6 };
    this.libre = true;               // el usuario movió la cámara: el encuadre automático no la pisa
    this.aplicar();
  }

  girar(dAz, dEl) { this.vel.az = dAz; this.vel.el = dEl; this.meta.az += dAz; this.meta.el = Math.min(Math.max(this.meta.el + dEl, this.limites.elMin), this.limites.elMax); }
  soltar(vAz, vEl) { this.vel.az = vAz; this.vel.el = vEl; this.inercia = true; }
  acercar(f) { this.meta.dist = Math.min(Math.max(this.meta.dist * f, this.limites.distMin), this.limites.distMax); }
  desplazar(dx, dy) {
    // en el plano de la pantalla, escalado por la distancia
    const c = this.camara, d = this.meta.dist * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * 2;
    const der = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0), arr = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 1);
    this.meta.objetivo.addScaledVector(der, -dx * d).addScaledVector(arr, dy * d);
    this.meta.objetivo.y = Math.max(this.meta.objetivo.y, 0);
  }
  enfocar(centro, dist) { this.meta.objetivo.copy(centro); if (dist) this.meta.dist = dist; }

  paso(dt) {
    if (this.inercia) {
      const amort = Math.exp(-dt * 5.5);
      this.meta.az += this.vel.az * dt; this.meta.el = Math.min(Math.max(this.meta.el + this.vel.el * dt, this.limites.elMin), this.limites.elMax);
      this.vel.az *= amort; this.vel.el *= amort;
      if (Math.abs(this.vel.az) + Math.abs(this.vel.el) < 1e-3) this.inercia = false;
    }
    const k = 1 - Math.exp(-dt * 12);
    this.az += (this.meta.az - this.az) * k; this.el += (this.meta.el - this.el) * k; this.dist += (this.meta.dist - this.dist) * k;
    this.objetivo.lerp(this.meta.objetivo, 1 - Math.exp(-dt * 7));
    this.aplicar();
  }

  aplicar() {
    const { az, el, dist, objetivo } = this;
    this.camara.position.set(objetivo.x + dist * Math.cos(el) * Math.sin(az), objetivo.y + dist * Math.sin(el), objetivo.z + dist * Math.cos(el) * Math.cos(az));
    this.camara.lookAt(objetivo);
    this.camara.updateMatrixWorld();
  }

  // salto inmediato (captura y video)
  fijar({ az = this.meta.az, el = this.meta.el, dist = this.meta.dist, objetivo = this.meta.objetivo } = {}) {
    Object.assign(this.meta, { az, el, dist }); this.meta.objetivo.copy(objetivo);
    this.az = az; this.el = el; this.dist = dist; this.objetivo.copy(objetivo); this.vel.az = this.vel.el = 0; this.inercia = false;
    this.aplicar();
  }
}
