// Web v3 · Andrés Alzate. Sin dependencias.
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s), $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tactil = matchMedia('(hover: none)').matches;
  const ahorro = !!(navigator.connection && navigator.connection.saveData);
  const tc = (s, fps = 30) => { s = Math.max(0, s || 0); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), Math.floor(s % 60), Math.floor((s % 1) * fps)].map(n => String(n).padStart(2, '0')).join(':'); };
  const medir = (nombre) => { try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'clic-' + nombre, event: true }); } catch (_) { } };
  document.addEventListener('click', ev => { const a = ev.target.closest('[data-medir]'); if (a) medir(a.dataset.medir); });

  // ---- barra: transparente sobre el reel, sólida al bajar
  const barra = $('.barra[data-barra="portada"]');
  if (barra) { const f = () => barra.toggleAttribute('data-solida', scrollY > innerHeight * .55); addEventListener('scroll', f, { passive: true }); f(); }

  // ---- entradas de montaje y trazo de loza
  const visto = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('visto'); visto.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.revela, .trazo').forEach(el => quieto ? el.classList.add('visto') : visto.observe(el));

  // ---- portada: reel a sangre, silenciado, con botón de sonido y timecode
  const portada = $('[data-portada]');
  if (portada) {
    const v = $('.portada__video', portada), btn = $('[data-sonido]', portada), bt = $('[data-sonido-t]', portada), tcEl = $('[data-tc]', portada), d = v.dataset;
    const vertical = matchMedia('(max-aspect-ratio: 4/5)').matches;
    const grande = innerWidth * (devicePixelRatio || 1) > 1400;
    const src = vertical ? (d.v ? (grande && d.v1080 && !ahorro ? d.v1080 : d.v) : null) : (grande && !ahorro ? d.h1080 : d.h720);
    if (src) { portada.dataset.formato = vertical ? 'v' : 'h'; portada.toggleAttribute('data-ambiente', true); }
    if (!src || quieto) bt.textContent = btn.dataset.ver;
    // en silencio corre el tramo de ambiente (sin firma de apertura ni tarjeta de cierre); con sonido, el reel entero
    const desde = +(vertical ? d.vdesde : d.hdesde) || 0, hasta = +(vertical ? d.vhasta : d.hhasta) || 0;
    let ambiente = true;
    const vigilar = () => { tcEl.textContent = tc(v.currentTime); if (ambiente && hasta && (v.currentTime >= hasta || v.currentTime < desde - .5)) v.currentTime = desde; };
    const pintar = () => { vigilar(); if (!v.paused) requestAnimationFrame(pintar); };
    v.addEventListener('playing', () => { portada.classList.add('reproduciendo'); requestAnimationFrame(pintar); });
    v.addEventListener('timeupdate', vigilar);
    v.addEventListener('loadedmetadata', () => { if (ambiente && desde) v.currentTime = desde; });
    const arrancar = () => { if (!src) return; if (!v.getAttribute('src')) v.src = src; v.play().catch(() => { }); };
    // el fondo es la versión sin textos; con sonido se pasa al reel completo (con títulos), desde el principio
    const completo = vertical ? (grande && d.vc1080 && !ahorro ? d.vc1080 : d.vc) : (grande && !ahorro ? d.hc1080 : d.hc);
    const alCompleto = () => { if (completo && v.getAttribute('src') !== completo) { v.src = completo; v.currentTime = 0; } };
    if (!quieto && src) { if (document.readyState === 'complete') setTimeout(arrancar, 250); else addEventListener('load', () => setTimeout(arrancar, 250)); }
    const dlg = $('[data-dialogo-reel]', portada);
    btn.addEventListener('click', () => {
      if (!src) { // celular en vertical sin reel vertical publicable: el reel 16:9 completo, sin recortar, en un diálogo
        const dv = $('video', dlg); if (!dv.getAttribute('src')) dv.src = dv.dataset.src;
        dlg.showModal(); dv.play().catch(() => { }); return;
      }
      if (v.paused || !v.getAttribute('src')) { ambiente = false; alCompleto(); arrancar(); v.muted = false; }
      else { v.muted = !v.muted; if (!v.muted && ambiente) { ambiente = false; alCompleto(); v.currentTime = 0; v.play().catch(() => { }); } }
      portada.toggleAttribute('data-ambiente', ambiente);
      btn.setAttribute('aria-pressed', String(!v.muted));
      bt.textContent = v.muted ? btn.dataset.on : btn.dataset.off;
    });
    if (dlg) { $('[data-cerrar]', dlg).addEventListener('click', () => dlg.close()); dlg.addEventListener('close', () => $('video', dlg).pause()); }
    new IntersectionObserver(([en]) => { if (!v.getAttribute('src')) return; if (en.isIntersecting) { if (portada.classList.contains('reproduciendo')) v.play().catch(() => { }); } else v.pause(); }).observe(portada);
  }

  // ---- línea de tiempo: el cabezal avanza con el scroll y el monitor muestra el cuadro del clip por el que pasa
  const lt = $('[data-lt]');
  if (lt) {
    const D = JSON.parse($('#lt-datos').textContent), lista = $('[data-lt-lista]');
    // las hojas de cuadros de los clips se piden solo cuando la línea de tiempo se acerca (no compiten con la portada)
    // se piden cuando el título de la sección ya está entero en pantalla y la página terminó de cargar
    const titulo = $('#lt-t');
    const fondos = new IntersectionObserver(([en]) => { if (en.isIntersecting) { $$('[data-bg]', lt).forEach(x => { x.style.backgroundImage = `url(${x.dataset.bg})`; }); fondos.disconnect(); } }, { threshold: 1 });
    if (document.readyState === 'complete') fondos.observe(titulo); else addEventListener('load', () => fondos.observe(titulo));
    if (quieto) lista.open = true;
    else {
      const mon = $('[data-monitor]', lt), tiles = $$('.tile', lt), clips = $$('.clip', lt), anio = $('[data-anio]', lt), mes = $('[data-mes]', lt), act = $('[data-activos]', lt);
      const cartaF = $('[data-carta-f]', lt), cartaT = $('[data-carta-t]', lt), cab = $('[data-cabezal-t]', lt);
      const meses = document.documentElement.lang === 'es' ? ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const etqCab = mes.textContent.split(' ')[0];
      let clave = '', precargado = false;
      const precargar = () => { if (precargado) return; precargado = true; [...new Set(D.clips.map(c => c.skim))].forEach(u => { const i = new Image(); i.src = u; }); };
      const actualizar = () => {
        const r = lt.getBoundingClientRect(), fijo = lt.firstElementChild, arriba = parseFloat(getComputedStyle(fijo).top) || 0;
        const pp = Math.min(1, Math.max(0, (arriba - r.top) / Math.max(1, r.height - fijo.offsetHeight)));
        lt.style.setProperty('--p', pp.toFixed(4));
        const t = D.ini + (D.fin - D.ini) * Math.min(.99999, pp);
        const y = Math.floor(t), m = Math.floor((t - y) * 12);
        anio.textContent = y; mes.textContent = `${etqCab} ${y}.${String(m + 1).padStart(2, '0')}`; cab.textContent = `${meses[m]} ${y}`;
        const activos = D.clips.filter(c => t >= c.a && t < c.b);
        const n = Math.min(4, activos.length);
        mon.dataset.n = n;
        activos.slice(0, 4).forEach((c, i) => {
          const tl = tiles[i], k = Math.min(9, Math.floor((t - c.a) / (c.b - c.a) * 10));
          if (tl.dataset.id !== String(c.i)) { tl.dataset.id = c.i; tl.style.backgroundImage = `url(${c.skim})`; tl.href = c.url; tl.firstElementChild.textContent = `${c.pista} · ${c.t}`; }
          tl.style.backgroundPosition = `${k * 100 / 9}% 0`;
        });
        const k2 = activos.map(c => c.i).join(',');
        if (k2 !== clave) {
          clave = k2;
          const ids = new Set(activos.map(c => String(c.i)));
          clips.forEach(el => el.classList.toggle('activo', ids.has(el.dataset.i)));
          act.innerHTML = activos.map(c => `<li><b>${c.pista}</b><span>${c.t}</span><span class="mono">${c.cat} · TC ${c.tc}${c.pend ? ' · ' + D.pend : ''}</span></li>`).join('');
        }
        if (!n) { const mk = D.marcas.filter(x => x.t <= t).pop() || D.marcas[0]; cartaF.textContent = mk.f; cartaT.textContent = mk.txt; }
      };
      let pend = false;
      const pedir = () => { if (!pend) { pend = true; requestAnimationFrame(() => { pend = false; actualizar(); }); } };
      new IntersectionObserver(([en]) => { if (en.isIntersecting) { addEventListener('scroll', pedir, { passive: true }); pedir(); } else removeEventListener('scroll', pedir); }, { rootMargin: '100% 0px' }).observe(lt);
      const pre = new IntersectionObserver(([en]) => { if (en.isIntersecting) { pre.disconnect(); precargar(); } }, { threshold: 1 });
      if (document.readyState === 'complete') pre.observe(titulo); else addEventListener('load', () => pre.observe(titulo));
      addEventListener('resize', pedir);
      actualizar();
    }
  }

  // ---- skimming: el cursor recorre la hoja de 10 cuadros; en táctil, el bucle de 3 s al entrar en pantalla
  $$('[data-skim]').forEach(a => {
    if (tactil) return;
    const li = a.closest('.tarjeta'), cuadro = $('.tarjeta__cuadro', a), capa = $('.tarjeta__skim', a);
    a.addEventListener('pointerenter', () => { if (!capa.style.backgroundImage) capa.style.backgroundImage = `url(${a.dataset.skim})`; });
    a.addEventListener('pointermove', ev => {
      const r = cuadro.getBoundingClientRect(), k = Math.min(9, Math.max(0, Math.floor((ev.clientX - r.left) / r.width * 10)));
      capa.style.backgroundPosition = `${k * 100 / 9}% 0`; li.classList.add('skim');
    });
    a.addEventListener('pointerleave', () => li.classList.remove('skim'));
  });
  const bucles = $$(tactil ? '[data-bucle]' : '.labc__cuadro[data-bucle]').filter(el => el.dataset.bucle);
  if (bucles.length && !quieto && !ahorro) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      const el = en.target, host = el.matches('a') ? $('.tarjeta__cuadro', el) : el;
      let v = $('video', host);
      if (en.isIntersecting && en.intersectionRatio >= .6) {
        if (!v) {
          v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'none'; v.setAttribute('aria-hidden', 'true'); v.tabIndex = -1;
          v.src = el.dataset.bucle; v.addEventListener('timeupdate', () => { if (v.currentTime > 3) v.currentTime = 0; }); v.loop = true; host.append(v);
        }
        v.play().catch(() => { });
      } else if (v) v.pause();
    }), { threshold: [0, .6] });
    bucles.forEach(el => io.observe(el));
  }

  // ---- laboratorio: cada muestra se ve entera (video en un diálogo, horizontal o vertical; las piezas de la identidad en una galería)
  const dlab = $('[data-dialogo-lab]');
  if (dlab) {
    const dv = $('video', dlab);
    $$('[data-ver-video]').forEach(b => b.addEventListener('click', () => {
      dlab.dataset.formato = b.dataset.formato; dlab.setAttribute('aria-label', b.dataset.titulo);
      const u = new URL(b.dataset.verVideo, location.href).href;
      if (dv.src !== u) dv.src = u; else dv.currentTime = 0;
      dlab.showModal(); dv.play().catch(() => { });
    }));
    dlab.addEventListener('close', () => dv.pause());
  }
  $$('[data-ver-galeria]').forEach(b => b.addEventListener('click', () => { const g = document.getElementById(b.dataset.verGaleria); if (g) g.showModal(); }));
  $$('.dialogo-lab').forEach(d => {
    $('[data-cerrar]', d).addEventListener('click', () => d.close());
    d.addEventListener('click', ev => { if (ev.target === d) d.close(); }); // clic en el fondo
  });

  // ---- filtros de /trabajo/ por tipo y año
  const fil = $('[data-filtros]');
  if (fil) {
    const lis = $$('.rejilla--trabajo > li'), cuenta = $('[data-f-cuenta]'), vacio = $('[data-f-vacio]');
    const sel = { cat: '*', anio: '*' };
    const aplicar = () => {
      let n = 0;
      lis.forEach(li => { const ok = (sel.cat === '*' || li.dataset.cat === sel.cat) && (sel.anio === '*' || li.dataset.anios.split(' ').includes(sel.anio)); li.hidden = !ok; if (ok) n++; });
      cuenta.textContent = n === 1 ? fil.dataset.uno : fil.dataset.varios.replace('{n}', n);
      vacio.hidden = n > 0;
    };
    fil.addEventListener('click', ev => {
      const b = ev.target.closest('button[data-f]'); if (!b) return;
      sel[b.dataset.f] = b.dataset.v;
      $$(`button[data-f="${b.dataset.f}"]`, fil).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      aplicar();
    });
  }

  // ---- Bruto → Corte: puntero, táctil y teclado; role=slider con aria-valuenow
  $$('[data-bc]').forEach(f => {
    const marco = $('.bc__marco', f), mango = $('[role=slider]', f), texto = f.dataset.texto;
    let pos = 50;
    const poner = v => {
      pos = Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
      f.style.setProperty('--pos', pos + '%');
      mango.setAttribute('aria-valuenow', String(Math.round(pos)));
      mango.setAttribute('aria-valuetext', texto.replace('{v}', Math.round(pos)));
    };
    const desde = ev => { const r = marco.getBoundingClientRect(); poner((ev.clientX - r.left) / r.width * 100); };
    marco.addEventListener('pointerdown', ev => { if (ev.button !== 0) return; marco.setPointerCapture(ev.pointerId); desde(ev); mango.focus({ preventScroll: true }); });
    marco.addEventListener('pointermove', ev => { if (marco.hasPointerCapture(ev.pointerId)) { desde(ev); ev.preventDefault(); } });
    const soltar = ev => { if (marco.hasPointerCapture(ev.pointerId)) marco.releasePointerCapture(ev.pointerId); };
    marco.addEventListener('pointerup', soltar); marco.addEventListener('pointercancel', soltar);
    mango.addEventListener('keydown', ev => {
      const paso = ev.shiftKey ? 10 : 2;
      const m = { ArrowLeft: -paso, ArrowDown: -paso, ArrowRight: paso, ArrowUp: paso, PageDown: -10, PageUp: 10 };
      if (ev.key in m) poner(pos + m[ev.key]); else if (ev.key === 'Home') poner(0); else if (ev.key === 'End') poner(100); else return;
      ev.preventDefault();
    });
  });

  // ---- YouTube con facade: no se carga nada de YouTube hasta el clic
  $$('[data-yt]').forEach(b => b.addEventListener('click', () => {
    const fr = document.createElement('iframe');
    fr.src = `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0`;
    fr.title = b.dataset.titulo; fr.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; fr.allowFullscreen = true;
    b.replaceWith(fr); medir('youtube');
  }));

  // ---- bucles de los casos: suenan mudos solo mientras se ven
  const autos = $$('video[data-auto]');
  if (autos.length) {
    if (quieto) autos.forEach(v => v.controls = true);
    else {
      const io = new IntersectionObserver(es => es.forEach(en => { const v = en.target; if (en.isIntersecting) v.play().catch(() => { }); else v.pause(); }), { threshold: .4 });
      autos.forEach(v => io.observe(v));
    }
  }

  // ---- cotizador (lógica de la v2): rango con la tabla de precios y mensaje listo para WhatsApp o correo
  const f = $('[data-cotizador]');
  if (f) {
    const T = JSON.parse(f.dataset.textos), sep = T.sep_miles;
    const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    const cant = f.elements.cantidad, msg = $('[data-mensaje]', f);
    const q = new URLSearchParams(location.search).get('s');
    const marcar = k => { const r = f.querySelector(`input[name=servicio][value="${k}"]`); if (r) r.checked = true; };
    if (q) marcar(q);
    let editado = false;
    msg.addEventListener('input', () => { editado = true; enlaces(); });
    const val = n => (f.querySelector(`input[name=${n}]:checked`) || {}).value;
    const enlaces = () => {
      const texto = msg.value, wa = $('[data-enviar=wa]', f);
      if (wa && f.dataset.wa) wa.href = `https://wa.me/${f.dataset.wa}?text=${encodeURIComponent(texto)}`;
      $('[data-enviar=correo]', f).href = `mailto:${f.dataset.correo}?subject=${encodeURIComponent(T.cot_asunto)}&body=${encodeURIComponent(texto)}`;
    };
    const calcular = () => {
      const s = f.querySelector('input[name=servicio]:checked'), rec = s.dataset.rec === '1';
      $('[data-paso-frecuencia]', f).hidden = rec;
      const n = Math.max(1, Math.min(60, parseInt(cant.value, 10) || 1));
      $('[data-unidad]', f).textContent = n === 1 ? s.dataset.u1 : s.dataset.u2;
      const fr = rec ? 'mes' : val('frecuencia'), mult = rec ? 1 : fr === 'semana' ? 4 : 1;
      const lo = +s.dataset.desde * n * mult, hi = +s.dataset.hasta * n * mult, mensual = rec || fr !== 'una';
      const rango = `${fmt(lo)} – ${fmt(hi)} USD`;
      $('[data-rango]', f).textContent = rango;
      $('[data-rango-det]', f).textContent = mensual ? T.cot_al_mes : T.cot_total;
      const etq = s.closest('label').querySelector('.opcion__n').textContent;
      const lineas = [T.cot_saludo, `${T.cot_necesito}: ${n} × ${etq}${rec ? '' : ' · ' + T.frec[fr]}.`, `${T.cot_plazo_l}: ${T.plazos[val('plazo')]}.`, `${T.cot_rango_l}: ${rango}${mensual ? ' ' + T.cot_al_mes : ''}.`];
      const nom = f.elements.nombre.value.trim(), can = f.elements.canal.value.trim(), no = f.elements.notas.value.trim();
      if (nom) lineas.push(`${T.cot_soy} ${nom}.`);
      if (can) lineas.push(`${T.cot_canal_l}: ${can}`);
      if (no) lineas.push(`${T.cot_notas_l}: ${no}`);
      if (!editado) msg.value = lineas.join('\n');
      enlaces();
    };
    f.addEventListener('input', ev => { if (ev.target !== msg) calcular(); });
    f.addEventListener('change', ev => { if (ev.target !== msg) calcular(); });
    $('[data-copiar]', f).addEventListener('click', ev => {
      const b = ev.currentTarget;
      (navigator.clipboard ? navigator.clipboard.writeText(msg.value) : Promise.reject()).catch(() => { msg.select(); document.execCommand('copy'); })
        .finally(() => { b.textContent = T.cot_copiado; setTimeout(() => { b.textContent = T.cot_copiar; }, 1600); });
    });
    $$('[data-cotizar]').forEach(a => a.addEventListener('click', () => { marcar(a.dataset.cotizar); calcular(); }));
    calcular();
  }
})();
