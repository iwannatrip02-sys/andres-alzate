// encuadernacion.js · geometría de un cuaderno COSIDO de tapa dura, en sección (plano x-y, igual en todo el alto z).
//
// El bloque de hojas va cosido a un ARCO (el lomo del bloque, de largo = grosor del bloque). Abierto sobre la mesa el arco
// queda acostado bajo el canal; cerrado queda de pie a la izquierda. Al cerrar en un ángulo ψ (π = abierto plano, 0 = cerrado):
//   · la mitad derecha (tapa trasera + pila derecha) no se mueve;
//   · el arco gira −β = −(π − ψ)/2 alrededor de su punta derecha (la mitad del pliegue: el lomo queda «en medio»);
//   · la mitad izquierda (tapa delantera + pila izquierda) gira −(π − ψ) alrededor de Q, el eje que deja la tapa justo encima
//     de la pila cuando ψ = 0.
// Cada hoja sale del arco perpendicular a él y se acuesta sobre su pila con una curva (Hermite) en el canal: por eso las páginas
// visibles se hunden hacia el lomo, el canto de la pila queda inclinado (las hojas de arriba recorren más papel en la curva)
// y la hoja que se pasa sale del MISMO punto que las dos visibles. Nada flota: todo está cosido al arco.
//
// Marco del cuaderno: x a lo ancho (el punto de partición del bloque, el fondo del canal, en x = 0), y hacia arriba
// (la mesa en y = 0), z a lo alto. Metros.

export const MUESTRAS = 40;   // puntos por curva de hoja (más densos en el canal)

const rot = (a, x, y) => [Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y];

// u_k: posiciones por largo de arco, apretadas cerca de la costura (la curva del canal necesita más puntos)
export function muestrasU(W, M = MUESTRAS) {
  const u = new Float64Array(M + 1);
  for (let k = 0; k <= M; k++) { const t = k / M; u[k] = W * (0.35 * t * t + 0.65 * t) ** 1.25; }
  u[M] = W;
  return u;
}

// curva de una hoja: Hermite de la raíz (dirección de salida) al punto donde empieza a acostarse (dirección del plano),
// luego recta. Devuelve x, y en los largos de arco us (de 0 a W).
function curvaHoja(raiz, dir0, inicio, dir1, us, out) {
  const dx = inicio[0] - raiz[0], dy = inicio[1] - raiz[1], d = Math.hypot(dx, dy);
  const m0 = d * 1.05, m1 = d * 1.05;
  const P = (t) => {
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    return [h00 * raiz[0] + h10 * m0 * dir0[0] + h01 * inicio[0] + h11 * m1 * dir1[0],
            h00 * raiz[1] + h10 * m0 * dir0[1] + h01 * inicio[1] + h11 * m1 * dir1[1]];
  };
  // tabla de largo de arco del tramo curvo
  const N = 48, tx = new Float64Array(N + 1), ty = new Float64Array(N + 1), ts = new Float64Array(N + 1);
  let acc = 0, prev = P(0);
  tx[0] = prev[0]; ty[0] = prev[1];
  for (let i = 1; i <= N; i++) { const p = P(i / N); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); ts[i] = acc; tx[i] = p[0]; ty[i] = p[1]; prev = p; }
  const largoCurva = acc;
  let j = 0;
  for (let k = 0; k < us.length; k++) {
    const s = us[k];
    if (s <= largoCurva) {
      while (j < N - 1 && ts[j + 1] < s) j++;
      const f = (s - ts[j]) / (ts[j + 1] - ts[j] || 1);
      out.x[k] = tx[j] + (tx[j + 1] - tx[j]) * f; out.y[k] = ty[j] + (ty[j + 1] - ty[j]) * f;
    } else {
      const r = s - largoCurva;
      out.x[k] = inicio[0] + dir1[0] * r; out.y[k] = inicio[1] + dir1[1] * r;
    }
  }
  out.largoCurva = largoCurva;
  return out;
}

const nuevaCurva = (n) => ({ x: new Float64Array(n), y: new Float64Array(n), largoCurva: 0 });

export class Encuadernacion {
  // spec: medidas físicas del cuaderno (m): ancho/alto de página, hojas, calibre, tapa (grosor, ceja, junta), grosor del lomo
  constructor({ ancho, alto, hojas, calibre, tapa = {}, lomo = {} }) {
    this.W = ancho; this.H = alto; this.N = hojas; this.tp = calibre;
    this.tb = tapa.grosor ?? 0.0025;        // cartón de la tapa
    this.ceja = tapa.ceja ?? 0.003;         // lo que la tapa sobresale de las hojas
    this.junta = tapa.junta ?? 0.005;       // ranura entre el cartón y el lomo (la bisagra de tela)
    this.ys = lomo.grosor ?? 0.0012;        // lomo de tela + refuerzo, bajo el arco
    this.Wb = this.W + this.ceja - this.junta;
    this.Hb = this.H + 2 * this.ceja;
    this.us = muestrasU(this.W);
    const n = this.us.length;
    this.curvas = { arribaDer: nuevaCurva(n), abajoDer: nuevaCurva(n), arribaIzq: nuevaCurva(n), abajoIzq: nuevaCurva(n) };
    this.lomo = nuevaCurva(49);
  }

  // largo del canal según cuánto tiene que subir la hoja
  _canal(sube) { return 0.010 + 2.2 * Math.max(sube, 0); }

  // estado: kIzq / kDer hojas quietas en cada pila, enVuelo hojas en el aire, psi pliegue del cuaderno
  poner({ kIzq, kDer, enVuelo = 0, psi = Math.PI }) {
    const { tp, tb, ys, junta, us } = this;
    const hL = kIzq * tp, hR = kDer * tp, hV = enVuelo * tp;
    const T = hL + hR + hV;
    const beta = (Math.PI - psi) / 2;
    this.estado = { kIzq, kDer, enVuelo, psi, beta, hL, hR, T };
    // arco: de su punta izquierda A a la derecha B (B fija, en x = hR + hV/2 para que la partición quede en x = 0)
    const Bx = hR + hV / 2, By = ys;
    const giraArco = (dx) => { const [rx, ry] = rot(-beta, dx, 0); return [Bx + rx, By + ry]; };
    const raiz = giraArco(-(hR + hV / 2));               // punto de partición (raíz de las páginas visibles y de las que vuelan)
    const salida = [Math.sin(beta), Math.cos(beta)];     // normal del arco hacia dentro del bloque
    const A = giraArco(-T);
    this.arcoA = A; this.arcoB = [Bx, By];
    // mitad izquierda: giro −2β alrededor de Q
    const Qx = (hR + hV / 2 - (hL + hV / 2)) / 2, Qy = tb + T / 2;
    const ang = -2 * beta;
    const izq = (x, y) => { const [rx, ry] = rot(ang, x - Qx, y - Qy); return [Qx + rx, Qy + ry]; };
    const dirIzq = rot(ang, -1, 0);
    this.tapaIzq = { ang, tx: Qx - (Math.cos(ang) * Qx - Math.sin(ang) * Qy), ty: Qy - (Math.sin(ang) * Qx + Math.cos(ang) * Qy) };
    this.raiz = { x: raiz[0], y: raiz[1], dx: salida[0], dy: salida[1] };

    // pilas: la hoja de arriba (la página visible) y la de abajo (sobre la tapa)
    const altoDer = tb + hR, altoIzq = tb + hL;
    const LR = this._canal(altoDer - ys), LL = this._canal(altoIzq - ys);
    const c = this.curvas;
    curvaHoja(raiz, salida, [LR, altoDer], [1, 0], us, c.arribaDer);
    curvaHoja([Bx, By], salida, [Bx + junta * 0.8, tb + tp / 2], [1, 0], us, c.abajoDer);
    curvaHoja(raiz, salida, izq(-LL, altoIzq), dirIzq, us, c.arribaIzq);
    curvaHoja(A, salida, izq(-(hL + hV / 2) - junta * 0.8, tb + tp / 2), dirIzq, us, c.abajoIzq);

    // tapas (cara de abajo, borde de la bisagra): la derecha quieta, la izquierda girada
    this.bordeTapaDer = [Bx + hV / 2 + junta, 0];
    this.bordeTapaIzqAbierta = [-(hL + hV / 2) - junta, 0];
    this.bordeTapaIzq = izq(...this.bordeTapaIzqAbierta);
    // lomo de tela: del borde de la tapa izquierda al de la derecha ENVOLVIENDO el arco por fuera; cerrado se abomba (lomo
    // redondo). Puntos de control: tapa izq · punta A del arco · arco abombado · punta B · tapa der → Catmull-Rom.
    {
      const nx = -salida[0], ny = -salida[1];                       // normal del arco hacia afuera del bloque
      const ctrl = [this.bordeTapaIzq];
      const nArco = 7, bomba = 0.18 * T * Math.sin(beta);
      for (let i = 0; i <= nArco; i++) {
        const f = i / nArco, px = A[0] + (Bx - A[0]) * f, py = A[1] + (By - A[1]) * f, o = ys * 0.9 + bomba * Math.sin(Math.PI * f);
        ctrl.push([px + nx * o, py + ny * o]);
      }
      ctrl.push(this.bordeTapaDer);
      const L = this.lomo, n = L.x.length, segs = ctrl.length - 1;
      for (let i = 0; i < n; i++) {
        const g = i / (n - 1) * segs, k = Math.min(Math.floor(g), segs - 1), t = g - k;
        const p0 = ctrl[Math.max(k - 1, 0)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(k + 2, segs)];
        const t2 = t * t, t3 = t2 * t;
        for (let e = 0; e < 2; e++) {
          const v = 0.5 * (2 * p1[e] + (-p0[e] + p2[e]) * t + (2 * p0[e] - 5 * p1[e] + 4 * p2[e] - p3[e]) * t2 + (-p0[e] + 3 * p1[e] - 3 * p2[e] + p3[e]) * t3);
          (e === 0 ? L.x : L.y)[i] = v;
        }
      }
    }
    // perfil de contacto para las hojas en vuelo (solo con el cuaderno abierto plano)
    this.perfil = psi > Math.PI * 0.97 ? this._perfil() : null;
    return this;
  }

  // sólido por debajo, como polilínea creciente en x: mesa · tapa izq · pila izq · canal · pila der · tapa der · mesa
  _perfil() {
    const { curvas: c, tb, Wb } = this, xs = [], ys = [];
    const pon = (x, y) => { if (xs.length && x <= xs[xs.length - 1]) x = xs[xs.length - 1] + 1e-6; xs.push(x); ys.push(y); };
    const M = this.us.length - 1;
    const bordeIzq = this.bordeTapaIzq[0] - Wb, bordeDer = this.bordeTapaDer[0] + Wb;
    pon(bordeIzq - 0.05, 0); pon(bordeIzq - 0.0005, 0); pon(bordeIzq, tb);
    pon(c.abajoIzq.x[M], tb);
    for (let k = M; k >= 0; k--) pon(c.arribaIzq.x[k], c.arribaIzq.y[k]);
    for (let k = 1; k <= M; k++) pon(c.arribaDer.x[k], c.arribaDer.y[k]);
    pon(c.abajoDer.x[M], tb);
    pon(bordeDer, tb); pon(bordeDer + 0.0005, 0); pon(bordeDer + 0.05, 0);
    return { xs: Float64Array.from(xs), ys: Float64Array.from(ys) };
  }

  // la hoja s ∈ [0, 1] de una pila (0 = la de arriba) en el largo de arco u_k, interpolando la de arriba y la de abajo
  hojaEn(lado, s, k) {
    const a = this.curvas[lado === 'der' ? 'arribaDer' : 'arribaIzq'], b = this.curvas[lado === 'der' ? 'abajoDer' : 'abajoIzq'];
    return [a.x[k] + (b.x[k] - a.x[k]) * s, a.y[k] + (b.y[k] - a.y[k]) * s];
  }
}
