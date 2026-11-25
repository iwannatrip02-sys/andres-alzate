// cuerpo.js · el cuaderno como cuerpo rígido: peso, inercia de una caja, contacto con la mesa (impulsos secuenciales con
// rebote y roce) y una «mano» que lo toma de un punto con un resorte. Si se toma de una esquina, cuelga y gira como uno real.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3(0, 1, 0), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix3(), _Iinv = new THREE.Matrix3();

export class CuerpoRigido {
  constructor({ masa = 0.3, medio = new THREE.Vector3(0.08, 0.006, 0.11), centroLocal = new THREE.Vector3() } = {}) {
    this.p = new THREE.Vector3();           // centro de masa en el mundo
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3(); this.w = new THREE.Vector3();
    this.rebote = 0.15; this.roce = 0.55;
    this.dormido = true; this.quieto = 0;
    this.mano = null;                        // { local: Vector3 (desde el centro), objetivo: Vector3, k, c }
    this.medidas(masa, medio, centroLocal);
  }

  // caja de medio-lados `medio` alrededor de `centroLocal` (marco del cuaderno)
  medidas(masa, medio, centroLocal) {
    this.masa = masa; this.medio = medio.clone(); this.centroLocal = centroLocal.clone();
    const a = 2 * medio.x, b = 2 * medio.y, c = 2 * medio.z;
    this.Ilocal = new THREE.Vector3(masa / 12 * (b * b + c * c), masa / 12 * (a * a + c * c), masa / 12 * (a * a + b * b));
    // esquinas y medios de las aristas: los puntos que pueden tocar la mesa
    this.puntos = [];
    for (const sx of [-1, 0, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 0, 1]) if (sx || sz) this.puntos.push(new THREE.Vector3(sx * medio.x, sy * medio.y, sz * medio.z));
  }

  // inversa del tensor de inercia en el mundo: R · diag(1/I) · Rᵀ
  _inerciaInv() {
    const R = _m.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.q));
    const D = new THREE.Matrix3().set(1 / this.Ilocal.x, 0, 0, 0, 1 / this.Ilocal.y, 0, 0, 0, 1 / this.Ilocal.z);
    return _Iinv.copy(R).multiply(D).multiply(R.clone().transpose());
  }

  despertar() { this.dormido = false; this.quieto = 0; }

  tomar(puntoMundo) {
    const local = puntoMundo.clone().sub(this.p).applyQuaternion(this.q.clone().invert());
    const k = this.masa * (2 * Math.PI * 2.6) ** 2;
    this.mano = { local, objetivo: puntoMundo.clone(), k, c: 2 * Math.sqrt(k * this.masa) * 0.75 };
    this.despertar();
  }
  mover(objetivo) { if (this.mano) { this.mano.objetivo.copy(objetivo); this.despertar(); } }
  soltar() { this.mano = null; this.despertar(); }
  girarEnMano(rad) { if (this.mano) { this.w.y += rad * 6; this.despertar(); } }
  puntoMano(out = new THREE.Vector3()) { return out.copy(this.mano.local).applyQuaternion(this.q).add(this.p); }

  paso(dt, sub = 6) {
    if (this.dormido && !this.mano) return;
    const h = dt / sub, g = -9.81;
    for (let s = 0; s < sub; s++) {
      const Iinv = this._inerciaInv();
      this.v.y += g * h;
      // la mano: resorte con amortiguación en el punto tomado (fuerza y torque)
      if (this.mano) {
        _r.copy(this.mano.local).applyQuaternion(this.q);
        const pm = _t.copy(_r).add(this.p);
        const vp = _v.copy(this.w).cross(_r).add(this.v);
        const F = this.mano.objetivo.clone().sub(pm).multiplyScalar(this.mano.k).addScaledVector(vp, -this.mano.c);
        this.v.addScaledVector(F, h / this.masa);
        this.w.add(_w.copy(_r).cross(F).applyMatrix3(Iinv).multiplyScalar(h));
        this.w.multiplyScalar(1 / (1 + 2.5 * h));          // la mano también frena el giro (muñeca)
      }
      this.w.multiplyScalar(1 / (1 + 0.2 * h));
      // contacto con la mesa (y = 0), varias pasadas de impulsos
      for (let it = 0; it < 4; it++) {
        let hondo = 0;
        for (const pl of this.puntos) {
          _r.copy(pl).applyQuaternion(this.q);
          const y = this.p.y + _r.y;
          if (y > 0.0005) continue;
          hondo = Math.min(hondo, y);
          const vp = _v.copy(this.w).cross(_r).add(this.v);
          const vn = vp.y;
          if (vn < 0) {
            const rn = _w.copy(_r).cross(_n), k = 1 / this.masa + _t.copy(rn).applyMatrix3(Iinv).cross(_r).dot(_n);
            const j = -(1 + (vn < -0.3 ? this.rebote : 0)) * vn / k;
            this.v.y += j / this.masa;
            this.w.add(_t.copy(_r).cross(_n).multiplyScalar(j).applyMatrix3(Iinv));
            // roce (Coulomb) en el plano de la mesa
            const vp2 = _v.copy(this.w).cross(_r).add(this.v), vt = new THREE.Vector3(vp2.x, 0, vp2.z), vtl = vt.length();
            if (vtl > 1e-6) {
              const tdir = vt.multiplyScalar(1 / vtl), rt = _w.copy(_r).cross(tdir), kt = 1 / this.masa + _t.copy(rt).applyMatrix3(Iinv).cross(_r).dot(tdir);
              const jt = Math.max(-vtl / kt, -this.roce * j);
              this.v.addScaledVector(tdir, jt / this.masa);
              this.w.add(_t.copy(_r).cross(tdir).multiplyScalar(jt).applyMatrix3(Iinv));
            }
          }
        }
        if (hondo < 0) this.p.y -= hondo * 0.6;          // sacarlo de la mesa sin rebote extra
      }
      this.p.addScaledVector(this.v, h);
      _q.set(this.w.x * h * 0.5, this.w.y * h * 0.5, this.w.z * h * 0.5, 0).multiply(this.q);
      this.q.x += _q.x; this.q.y += _q.y; this.q.z += _q.z; this.q.w += _q.w; this.q.normalize();
    }
    // dormir apoyado
    if (!this.mano && this.v.length() < 0.004 && this.w.length() < 0.03) { this.quieto += dt; if (this.quieto > 0.5) { this.dormido = true; this.v.set(0, 0, 0); this.w.set(0, 0, 0); } }
    else this.quieto = 0;
  }

  // dónde va el grupo del cuaderno (su origen local no es el centro de masa)
  aplicar(grupo) {
    grupo.quaternion.copy(this.q);
    grupo.position.copy(this.centroLocal).multiplyScalar(-1).applyQuaternion(this.q).add(this.p);
    grupo.updateMatrixWorld();
  }
  // poner el cuerpo donde está el grupo (al empezar)
  desde(grupo) {
    this.q.copy(grupo.quaternion);
    this.p.copy(this.centroLocal).applyQuaternion(this.q).add(grupo.position);
  }
}
