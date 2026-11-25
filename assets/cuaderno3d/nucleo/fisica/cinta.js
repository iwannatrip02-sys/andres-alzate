// cinta.js · cinta marcapáginas de raso: una cadena XPBD (no se estira, se dobla poco, el aire la frena) atada al lomo.
// El contacto lo da quien la usa (función que corrige cada punto); unidades SI en el marco del cuaderno.

export class Cinta {
  constructor({ largo = 0.27, n = 40, ancho = 0.006, gramaje = 60 } = {}) {
    this.n = n; this.largo = largo; this.ancho = ancho;
    this.l = largo / (n - 1);
    this.masa = gramaje / 1000 * ancho * this.l;            // por punto
    this.pos = new Float64Array(3 * n); this.prev = new Float64Array(3 * n); this.vel = new Float64Array(3 * n);
    this.fijos = new Uint8Array(n);
    this.gravedad = [0, -9.81, 0];
    this.contacto = null;                                   // (x, y, z, i) → [x, y, z] corregido o null
    this.objetivoFijo = null;                               // (i) → [x, y, z] para los puntos fijos
  }

  colocar(f) { for (let i = 0; i < this.n; i++) { const p = f(i * this.l, i); this.pos.set(p, 3 * i); } this.prev.set(this.pos); this.vel.fill(0); }

  paso(dt, sub = 8) {
    const h = dt / sub, { n, pos, prev, vel, fijos } = this, [gx, gy, gz] = this.gravedad;
    const arrastre = 0.5 * 1.2 * 1.1 * this.ancho * this.l / this.masa;   // aire (1/m)
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < n; i++) {
        const k = 3 * i;
        prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2];
        if (fijos[i]) { const t = this.objetivoFijo(i); pos[k] = t[0]; pos[k + 1] = t[1]; pos[k + 2] = t[2]; continue; }
        let vx = vel[k] + gx * h, vy = vel[k + 1] + gy * h, vz = vel[k + 2] + gz * h;
        const v = Math.hypot(vx, vy, vz), f = 1 / (1 + arrastre * 0.5 * v * h);
        vx *= f; vy *= f; vz *= f;
        pos[k] += vx * h; pos[k + 1] += vy * h; pos[k + 2] += vz * h;
      }
      for (let it = 0; it < 3; it++) {
        // largo fijo
        for (let i = 0; i < n - 1; i++) {
          const a = 3 * i, b = a + 3, wa = fijos[i] ? 0 : 1, wb = fijos[i + 1] ? 0 : 1, w = wa + wb; if (!w) continue;
          const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2], L = Math.hypot(dx, dy, dz) || 1e-9;
          const c = (L - this.l) / L / w;
          pos[a] += wa * c * dx; pos[a + 1] += wa * c * dy; pos[a + 2] += wa * c * dz;
          pos[b] -= wb * c * dx; pos[b + 1] -= wb * c * dy; pos[b + 2] -= wb * c * dz;
        }
        // flexión suave (la cinta de raso se dobla casi sin resistencia)
        for (let i = 0; i < n - 2; i++) {
          const a = 3 * i, b = a + 6, wa = fijos[i] ? 0 : 1, wb = fijos[i + 2] ? 0 : 1, w = wa + wb; if (!w) continue;
          const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2], L = Math.hypot(dx, dy, dz) || 1e-9;
          const objetivo = 2 * this.l * 0.985; if (L >= objetivo) continue;
          const c = 0.18 * (L - objetivo) / L / w;
          pos[a] += wa * c * dx; pos[a + 1] += wa * c * dy; pos[a + 2] += wa * c * dz;
          pos[b] -= wb * c * dx; pos[b + 1] -= wb * c * dy; pos[b + 2] -= wb * c * dz;
        }
        if (this.contacto) for (let i = 0; i < n; i++) {
          if (fijos[i]) continue;
          const k = 3 * i, r = this.contacto(pos[k], pos[k + 1], pos[k + 2], i);
          if (r) {
            // apoyada: se corrige al borde y el roce le quita parte del deslizamiento (raso sobre papel)
            pos[k] = prev[k] + (r[0] - prev[k]) * 0.7; pos[k + 1] = r[1]; pos[k + 2] = prev[k + 2] + (r[2] - prev[k + 2]) * 0.7;
          }
        }
      }
      // velocidad de cada punto, con tope: una cinta de raso no da latigazos (el aire la frena) aunque el cuaderno choque
      for (let i = 0; i < n; i++) {
        const k = 3 * i; let vx = (pos[k] - prev[k]) / h, vy = (pos[k + 1] - prev[k + 1]) / h, vz = (pos[k + 2] - prev[k + 2]) / h;
        const v = Math.hypot(vx, vy, vz); if (v > 1.2) { const f = 1.2 / v; vx *= f; vy *= f; vz *= f; }
        vel[k] = vx; vel[k + 1] = vy; vel[k + 2] = vz;
      }
    }
  }
}
