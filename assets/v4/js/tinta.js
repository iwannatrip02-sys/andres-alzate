// Tinta cobalto sobre porcelana: el puntero pinta como pincel de loza; la tinta se corre, se difumina y se seca con borde más oscuro.
// WebGL2 puro (sin three) en dos texturas que se alternan: R = densidad de tinta, G/B = velocidad que deja el trazo.
const VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;

const RUIDO = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float ruido(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`;

const PASO = `#version 300 es
precision highp float;
uniform sampler2D uPrev; uniform vec2 uTexel; uniform vec2 uA; uniform vec2 uB; uniform vec2 uVel;
uniform float uFuerza; uniform float uRadio; uniform float uAspecto; uniform float uT; uniform float uSeca;
in vec2 vUv; out vec4 o;
${RUIDO}
vec2 rizo(vec2 p){ float e=.02;
  return vec2(ruido(p+vec2(0,e))-ruido(p-vec2(0,e)), -(ruido(p+vec2(e,0))-ruido(p-vec2(e,0))))/(2.*e); }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-7),0.,1.); return length(pa-ba*h); }
void main(){
  vec4 c = texture(uPrev, vUv);
  vec2 atras = vUv - c.gb*uTexel*5. - rizo(vUv*4.+uT*.04)*.00028;
  vec4 a = texture(uPrev, atras);
  vec4 s = .25*(texture(uPrev, atras+vec2(uTexel.x,0.)) + texture(uPrev, atras-vec2(uTexel.x,0.))
              + texture(uPrev, atras+vec2(0.,uTexel.y)) + texture(uPrev, atras-vec2(0.,uTexel.y)));
  float d = mix(a.r, s.r, .3) * uSeca;
  vec2 v = mix(a.gb, s.gb, .55) * .955;
  vec2 q = vec2(vUv.x*uAspecto, vUv.y);
  float dist = seg(q, vec2(uA.x*uAspecto, uA.y), vec2(uB.x*uAspecto, uB.y));
  float r = uRadio*(.8 + .45*ruido(vUv*18. + uT*.3));
  float g = exp(-(dist*dist)/(r*r));
  g *= smoothstep(.15,.6, ruido(vUv*55.+uT*.7)*.6 + .55);     // cerdas del pincel: el borde no es liso
  d += g*uFuerza;
  v += g*uVel;
  o = vec4(min(d, 1.8), v, 1.);
}`;

const PINTA = `#version 300 es
precision highp float;
uniform sampler2D uTinta; uniform vec2 uTexel; uniform vec3 uColor; uniform vec3 uHondo; uniform float uT;
in vec2 vUv; out vec4 o;
${RUIDO}
void main(){
  float d = texture(uTinta, vUv).r;
  float dx = texture(uTinta, vUv+vec2(uTexel.x,0.)).r - texture(uTinta, vUv-vec2(uTexel.x,0.)).r;
  float dy = texture(uTinta, vUv+vec2(0.,uTexel.y)).r - texture(uTinta, vUv-vec2(0.,uTexel.y)).r;
  float borde = clamp(length(vec2(dx,dy))*5.5, 0., 1.);
  float cubre = smoothstep(.02, .32, d);
  float papel = ruido(gl_FragCoord.xy*.42) * .6 + ruido(gl_FragCoord.xy*.09) * .4;
  cubre *= .82 + .32*papel;                                         // granulado de la acuarela sobre el bizcocho
  vec3 col = mix(uColor, uHondo, clamp(borde*1.3 + smoothstep(.7, 1.6, d)*.55, 0., 1.));
  float a = clamp(cubre*.9 + borde*.45*step(.02,d), 0., 1.);
  o = vec4(col*a, a);
}`;

function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }

export function iniciarTinta(canvas, { color = '#2340C8', hondo = '#13207A', escala = 0.5 } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const flotante = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');

  const prog = (fs) => {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); return null; }
      gl.attachShader(p, sh);
    }
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const k = gl.getActiveUniform(p, i).name; u[k] = gl.getUniformLocation(p, k); }
    return { p, u };
  };
  const paso = prog(PASO), pinta = prog(PINTA);
  if (!paso || !pinta) return null;

  const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let W = 0, H = 0, sw = 0, sh = 0, rts = [];
  const rt = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, flotante ? gl.RGBA16F : gl.RGBA8, sw, sh, 0, gl.RGBA, flotante ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return { t, f };
  };
  function medir() {
    const dpr = Math.min(devicePixelRatio, 1.5);
    W = Math.round(canvas.clientWidth * dpr); H = Math.round(canvas.clientHeight * dpr);
    canvas.width = W; canvas.height = H;
    sw = Math.max(64, Math.round(W * escala)); sh = Math.max(64, Math.round(H * escala));
    rts = [rt(), rt()];
  }
  medir();

  const col = hexRGB(color), hon = hexRGB(hondo);
  let a = null, b = null, vel = [0, 0], fuerza = 0, t0 = performance.now(), activo = true;
  // el pincel: puntos en coordenadas 0-1 del lienzo (y hacia arriba)
  function pincel(x, y, f = 1) {
    const p = [x, y];
    if (!b) { a = p; b = p; return; }
    a = b; b = p;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const rapidez = Math.hypot(dx, dy);
    vel = [dx * 60, dy * 60];
    fuerza = Math.min(.8, .2 + rapidez * 12) * f;
  }
  function levantar() { a = b = null; }

  function cuadro() {
    if (!activo) return;
    const t = (performance.now() - t0) / 1000;
    gl.disable(gl.BLEND);
    gl.useProgram(paso.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rts[1].f); gl.viewport(0, 0, sw, sh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rts[0].t);
    gl.uniform1i(paso.u.uPrev, 0);
    gl.uniform2f(paso.u.uTexel, 1 / sw, 1 / sh);
    gl.uniform2f(paso.u.uA, ...(a || [-9, -9])); gl.uniform2f(paso.u.uB, ...(b || [-9, -9]));
    gl.uniform2f(paso.u.uVel, vel[0], vel[1]);
    gl.uniform1f(paso.u.uFuerza, a ? fuerza : 0);
    gl.uniform1f(paso.u.uRadio, .022 + Math.min(.02, Math.hypot(vel[0], vel[1]) * .004));
    gl.uniform1f(paso.u.uAspecto, W / H); gl.uniform1f(paso.u.uT, t); gl.uniform1f(paso.u.uSeca, .9972);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rts.reverse();
    if (a) { a = b; fuerza *= .5; vel = [vel[0] * .5, vel[1] * .5]; }   // si el puntero se queda quieto, no sigue cargando tinta

    gl.useProgram(pinta.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, rts[0].t);
    gl.uniform1i(pinta.u.uTinta, 0); gl.uniform2f(pinta.u.uTexel, 1 / sw, 1 / sh);
    gl.uniform3f(pinta.u.uColor, ...col); gl.uniform3f(pinta.u.uHondo, ...hon); gl.uniform1f(pinta.u.uT, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { pincel, levantar, cuadro, medir, set activo(v) { activo = v; }, get activo() { return activo; } };
}
