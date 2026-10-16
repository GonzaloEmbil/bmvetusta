/**
 * Imagen para redes sociales de la sección «Resultados»: los partidos de la
 * semana (categoría, rivales, día, hora y pabellón) o sus resultados, sobre
 * una foto de fondo que se elige en cada momento. Se exporta en JPG.
 *
 * Todo se dibuja en un <canvas> en el navegador: la foto no sale del equipo
 * de quien la elige. Las tipografías (Bebas Neue e Inter, las de la web) y el
 * escudo se cargan de balonmanovetusta.com (que envía cabeceras CORS) y los
 * escudos de la federación, a través del propio panel; así el lienzo no queda
 * «contaminado» y se puede exportar.
 *
 * Como el resto de módulos del panel, va en String.raw: sin comillas
 * invertidas ni «${». Usa ultimaSemana (resultados-panel.js) y
 * guardarArchivo() (descargas.js).
 */
export const GRAFICA_JS = String.raw`
  // ── Imagen para redes ─────────────────────────────────────────────────────
  var graf = { tipo: 'partidos', formato: 'post', fondo: null, escudos: {}, fuentes: null, escudoClub: null, turno: 0 };
  var FORMATOS = { post: [1080, 1350], historia: [1080, 1920] };
  var AMARILLO = '#ffe500';
  var WEB = 'https://balonmanovetusta.com/src/assets/';
  var DIAS_LARGOS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  var DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  var MESES_MAY = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  function cargarFuentes(){
    if (!graf.fuentes) {
      var fuentes = [
        new FontFace('Bebas Neue', 'url(' + WEB + 'fonts/bebas-neue.woff2)'),
        new FontFace('Inter', 'url(' + WEB + 'fonts/inter.woff2)', { weight: '100 900' })
      ];
      graf.fuentes = Promise.all(fuentes.map(function(f){
        return f.load().then(function(cargada){ document.fonts.add(cargada); }).catch(function(){});
      }));
    }
    return graf.fuentes;
  }

  function imagen(url){
    return new Promise(function(listo){
      var i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = function(){ listo(i); };
      i.onerror = function(){ listo(null); };
      i.src = url;
    });
  }

  // Los escudos de la federación pasan por el panel (/admin/escudo): sin eso
  // el lienzo quedaría «contaminado» y no se podría descargar.
  function escudoDe(url){
    if (!/^https:\/\/balonmano\.isquad\.es\//.test(url || '')) return Promise.resolve(null);
    if (!graf.escudos[url]) graf.escudos[url] = imagen('/admin/escudo?u=' + encodeURIComponent(url));
    return graf.escudos[url];
  }

  // «POLID. MANUEL NOVO» → «Polid. Manuel Novo»; las siglas con punto se quedan.
  var MENUDAS = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el'];
  function bonito(s){
    return String(s || '').toLowerCase().split(/(\s+)/).map(function(p, i){
      if (/^\s+$/.test(p) || !p) return p;
      if (/^([a-záéíóúñ]\.){1,4}$/i.test(p)) return p.toUpperCase();
      if (i > 0 && MENUDAS.indexOf(p) >= 0) return p;
      return p.replace(/^(["“«(]?)(\S)/, function(_, a, b){ return a + b.toUpperCase(); });
    }).join('');
  }

  // Los equipos del club salen como «BM VETUSTA» (con su letra si la tienen).
  function nombreEquipo(p, lado){
    var bruto = String(lado === 'local' ? p.local : p.visitante).replace(/\s+/g, ' ').trim();
    var nuestro = lado === 'local' ? p.nuestro_local : p.nuestro_visitante;
    if (!nuestro) return bruto;
    var letra = (bruto.match(/\s([A-C])$/) || [])[1];
    return 'BM VETUSTA' + (letra ? ' ' + letra : '');
  }

  function partidosGrafica(){
    var lista = (typeof ultimaSemana !== 'undefined' && ultimaSemana && ultimaSemana.partidos) || [];
    if (graf.tipo === 'resultados') return lista.filter(function(p){ return p.estado === 'Finalizado' && p.goles_local !== null && p.goles_visitante !== null; });
    return lista.filter(function(p){ return p.estado !== 'Suspendido'; });
  }

  function fechaDe(p){ var d = p.fecha.slice(0, 10).split('-'); return new Date(+d[0], +d[1] - 1, +d[2]); }

  // «SÁBADO 17 DE OCTUBRE», «17 Y 18 DE OCTUBRE» o «DEL 13 AL 18 DE OCTUBRE».
  function textoFechas(lista){
    var dias = [];
    lista.forEach(function(p){ var k = p.fecha.slice(0, 10); if (dias.indexOf(k) < 0) dias.push(k); });
    dias.sort();
    if (!dias.length) return '';
    var a = fechaDe({ fecha: dias[0] }), b = fechaDe({ fecha: dias[dias.length - 1] });
    if (dias.length === 1) return DIAS_LARGOS[a.getDay()] + ' ' + a.getDate() + ' DE ' + MESES_MAY[a.getMonth()];
    var mes = a.getMonth() === b.getMonth() ? '' : ' DE ' + MESES_MAY[a.getMonth()];
    var une = dias.length === 2 && (b - a) === 86400000 ? a.getDate() + mes + ' Y ' : 'DEL ' + a.getDate() + mes + ' AL ';
    return une + b.getDate() + ' DE ' + MESES_MAY[b.getMonth()];
  }

  function ajustar(ctx, texto, fuente, tam, ancho){
    var t = tam;
    ctx.font = fuente.replace('{t}', t);
    while (ctx.measureText(texto).width > ancho && t > tam * 0.62) { t -= 1; ctx.font = fuente.replace('{t}', t); }
    if (ctx.measureText(texto).width <= ancho) return texto;
    while (texto.length > 1 && ctx.measureText(texto + '…').width > ancho) texto = texto.slice(0, -1);
    return texto + '…';
  }

  // Nombre de equipo en una línea si cabe a un tamaño razonable; si no, en
  // dos, repartiendo las palabras para que queden parecidas.
  function nombreEnLineas(ctx, texto, x, yc, ancho, tam, alinear){
    ctx.textAlign = alinear; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + tam + 'px Inter';
    var t = tam;
    while (ctx.measureText(texto).width > ancho && t > tam * 0.8) { t -= 1; ctx.font = '800 ' + t + 'px Inter'; }
    var palabras = texto.split(' ');
    if (ctx.measureText(texto).width <= ancho || palabras.length < 2) {
      ctx.fillText(ajustar(ctx, texto, '800 {t}px Inter', t, ancho), x, yc);
      return;
    }
    var mejor = 1, dif = Infinity, t2 = tam * 0.74;
    ctx.font = '800 ' + t2 + 'px Inter';
    for (var i = 1; i < palabras.length; i++) {
      var d = Math.abs(ctx.measureText(palabras.slice(0, i).join(' ')).width - ctx.measureText(palabras.slice(i).join(' ')).width);
      if (d < dif) { dif = d; mejor = i; }
    }
    var l1 = palabras.slice(0, mejor).join(' '), l2 = palabras.slice(mejor).join(' '), sep = t2 * 0.6;
    ctx.fillText(ajustar(ctx, l1, '800 {t}px Inter', t2, ancho), x, yc - sep);
    ctx.fillText(ajustar(ctx, l2, '800 {t}px Inter', t2, ancho), x, yc + sep);
  }

  function rectRedondo(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function dibujarFondo(ctx, W, H){
    if (graf.fondo) {
      var f = graf.fondo, k = Math.max(W / f.width, H / f.height);
      ctx.drawImage(f, (W - f.width * k) / 2, (H - f.height * k) / 2, f.width * k, f.height * k);
      var velo = ctx.createLinearGradient(0, 0, 0, H);
      velo.addColorStop(0, 'rgba(0,0,0,0.62)'); velo.addColorStop(0.35, 'rgba(0,0,0,0.30)'); velo.addColorStop(1, 'rgba(0,0,0,0.70)');
      ctx.fillStyle = velo; ctx.fillRect(0, 0, W, H);
    } else {
      // Sin foto: negro con unas franjas amarillas, para que la vista previa
      // no quede vacía y se pueda publicar igualmente.
      var g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#16171a'); g.addColorStop(1, '#050505');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalAlpha = 0.09; ctx.fillStyle = AMARILLO;
      for (var i = -H; i < W; i += 140) { ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + 60, H); ctx.lineTo(i + 60 + H, 0); ctx.lineTo(i + H, 0); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
  }

  function dibujarTarjeta(ctx, p, x, y, w, h, esc2){
    // La tarjeta se diseña a 165 px de alto y se escala con k. Va apretada a
    // propósito: con siete u ocho partidos la letra sigue leyéndose en el móvil.
    var k = Math.max(0.62, Math.min(1.3, h / 165));
    var pad = 18 * k;
    ctx.fillStyle = 'rgba(10,10,12,0.74)'; rectRedondo(ctx, x, y, w, h, 20 * k); ctx.fill();
    // Un filo amarillo a la izquierda, recortado por las esquinas de la tarjeta.
    ctx.save(); rectRedondo(ctx, x, y, w, h, 20 * k); ctx.clip();
    ctx.fillStyle = AMARILLO; ctx.fillRect(x, y, 5, h);
    ctx.restore();
    var ix = x + pad + 6, dx = x + w - pad;

    // Fila 1: categoría y día (y hora en la de partidos).
    var y1 = y + pad + 27 * k;
    var d = fechaDe(p), hora = p.fecha.slice(11, 16);
    var cuando = DIAS_CORTOS[d.getDay()] + ' ' + d.getDate() + (graf.tipo === 'partidos' && hora && hora !== '00:00' ? '  ·  ' + hora : '');
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = (36 * k) + 'px "Bebas Neue"';
    ctx.fillText(cuando, dx, y1);
    var anchoCuando = ctx.measureText(cuando).width;
    ctx.textAlign = 'left'; ctx.fillStyle = AMARILLO;
    ctx.fillText(ajustar(ctx, p.equipo.toUpperCase(), '{t}px "Bebas Neue"', 36 * k, w - 2 * pad - anchoCuando - 40), ix, y1);

    if (graf.tipo === 'resultados') return marcador(ctx, p, ix, dx, y1, k, esc2);

    // Fila 2: local, «VS», visitante.
    var yc = y1 + 41 * k, cr = 70 * k, centro = x + w / 2;
    var hueco = 46 * k;
    [['local', ix, 1], ['visitante', dx, -1]].forEach(function(l){
      var lado = l[0], borde = l[1], dir = l[2];
      var img = esc2[lado === 'local' ? p.escudo_local : p.escudo_visitante];
      var xcr = dir === 1 ? borde : borde - cr;
      if (img) {
        var r = Math.min(cr / img.width, cr / img.height);
        ctx.drawImage(img, xcr + (cr - img.width * r) / 2, yc - cr / 2 + (cr - img.height * r) / 2, img.width * r, img.height * r);
      }
      var nuestro = lado === 'local' ? p.nuestro_local : p.nuestro_visitante;
      var xt = dir === 1 ? borde + cr + 14 * k : borde - cr - 14 * k;
      var ancho = Math.abs(centro - xt) - hueco;
      ctx.fillStyle = nuestro ? AMARILLO : '#ffffff';
      nombreEnLineas(ctx, nombreEquipo(p, lado), xt, yc, ancho, 30 * k, dir === 1 ? 'left' : 'right');
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = (40 * k) + 'px "Bebas Neue"';
    ctx.fillText('VS', centro, yc + 3 * k);

    // Fila 3: pabellón y localidad.
    if (p.pabellon || p.localidad) {
      var lugar = [bonito(p.pabellon), bonito(p.localidad)].filter(Boolean).join(' · ');
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.fillText(ajustar(ctx, lugar, '500 {t}px Inter', 22 * k, w - 2 * pad), centro, y + h - pad);
    }
  }

  // Resultados, como un marcador: cada equipo en su línea con sus goles a la
  // derecha. Así caben los nombres largos y el resultado se lee de un vistazo.
  function marcador(ctx, p, ix, dx, y1, k, esc2){
    var cr = 52 * k, filas = [['local', p.goles_local], ['visitante', p.goles_visitante]];
    var otro = { local: p.goles_visitante, visitante: p.goles_local };
    filas.forEach(function(f, n){
      var lado = f[0], goles = f[1];
      var yc = y1 + 33 * k + n * 54 * k;
      var img = esc2[lado === 'local' ? p.escudo_local : p.escudo_visitante];
      if (img) {
        var r = Math.min(cr / img.width, cr / img.height);
        ctx.drawImage(img, ix + (cr - img.width * r) / 2, yc - cr / 2 + (cr - img.height * r) / 2, img.width * r, img.height * r);
      }
      var nuestro = lado === 'local' ? p.nuestro_local : p.nuestro_visitante;
      var gana = goles > otro[lado];
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right'; ctx.font = (56 * k) + 'px "Bebas Neue"';
      ctx.fillStyle = nuestro ? AMARILLO : gana ? '#ffffff' : 'rgba(255,255,255,0.62)';
      ctx.fillText(String(goles), dx, yc + 4 * k);
      var anchoGoles = ctx.measureText('00').width;
      ctx.fillStyle = nuestro ? AMARILLO : '#ffffff';
      nombreEnLineas(ctx, nombreEquipo(p, lado), ix + cr + 16 * k, yc, dx - anchoGoles - 30 * k - (ix + cr + 16 * k), 30 * k, 'left');
    });
  }

  function dibujar(ctx, W, H, lista, esc2){
    var M = 60;
    dibujarFondo(ctx, W, H);

    // Cabecera: escudo, título y fechas. Con muchos partidos en formato post
    // se encoge, para dejar el sitio a las tarjetas.
    var n = lista.length;
    var c = graf.formato === 'post' && n > 4 ? 0.74 : 1;
    var tamEscudo = 168 * c;
    if (graf.escudoClub) ctx.drawImage(graf.escudoClub, M - 8, M - 10, tamEscudo, tamEscudo);
    var tx = M + tamEscudo + 18;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff'; ctx.font = '800 ' + Math.round(26 * c) + 'px Inter';
    ctx.fillText('BALONMANO VETUSTA', tx + 4, M + 30 * c);
    ctx.fillStyle = AMARILLO; ctx.font = Math.round(132 * c) + 'px "Bebas Neue"';
    ctx.fillText(graf.tipo === 'partidos' ? 'PARTIDOS' : 'RESULTADOS', tx, M + 140 * c);
    ctx.fillStyle = '#ffffff';
    var fechas = textoFechas(lista);
    ctx.fillText(ajustar(ctx, fechas, '{t}px "Bebas Neue"', Math.round(46 * c), W - tx - M), tx + 2, M + 186 * c);

    // Pie.
    ctx.font = '600 26px Inter'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'left';
    ctx.fillText('balonmanovetusta.com', M, H - M + 6);
    ctx.textAlign = 'right'; ctx.fillStyle = AMARILLO; ctx.font = '800 26px Inter';
    ctx.fillText('#FamiliaVetusta', W - M, H - M + 6);

    // Tarjetas.
    var arriba = M + 236 * c, abajo = H - M - 50, hueco = 12;
    if (!n) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = '600 34px Inter';
      ctx.fillText(graf.tipo === 'partidos' ? 'No hay partidos esta semana' : 'Todavía no hay resultados esta semana', W / 2, (arriba + abajo) / 2);
      return;
    }
    var alto = Math.min(215, (abajo - arriba - hueco * (n - 1)) / n);
    // Las tarjetas van pegadas al título; si sobra sitio, se ve la foto debajo.
    var y = arriba;
    lista.forEach(function(p){ dibujarTarjeta(ctx, p, M, y, W - 2 * M, alto, esc2); y += alto + hueco; });
  }

  // Dibuja la vista previa. Los turnos evitan que una carga lenta (fuentes,
  // escudos) pinte encima de una más reciente.
  function pintarGrafica(){
    var lienzo = document.getElementById('graf-lienzo');
    if (!lienzo) return Promise.resolve();
    var turno = ++graf.turno;
    var dims = FORMATOS[graf.formato], lista = partidosGrafica();
    var nota = document.getElementById('graf-nota');
    var total = (typeof ultimaSemana !== 'undefined' && ultimaSemana && ultimaSemana.partidos || []).length;
    nota.textContent = graf.tipo === 'resultados' && lista.length < total
      ? (total - lista.length) + (total - lista.length === 1 ? ' partido aún sin resultado no sale en la imagen.' : ' partidos aún sin resultado no salen en la imagen.')
      : '';
    if (lista.length > 9) nota.textContent = 'Hay ' + lista.length + ' partidos: las tarjetas salen más pequeñas. En formato historia caben mejor.';
    var esperas = [cargarFuentes(), graf.escudoClub ? null : imagen(WEB + 'escudo.png').then(function(i){ graf.escudoClub = i; })];
    var urls = [];
    lista.forEach(function(p){ [p.escudo_local, p.escudo_visitante].forEach(function(u){ if (u && urls.indexOf(u) < 0) urls.push(u); }); });
    var escudos = {};
    urls.forEach(function(u){ esperas.push(escudoDe(u).then(function(i){ escudos[u] = i; })); });
    return Promise.all(esperas).then(function(){
      if (turno !== graf.turno) return;
      lienzo.width = dims[0]; lienzo.height = dims[1];
      var ctx = lienzo.getContext('2d');
      ctx.clearRect(0, 0, dims[0], dims[1]);
      dibujar(ctx, dims[0], dims[1], lista, escudos);
    });
  }

  function descargarGrafica(){
    var b = document.getElementById('graf-descargar'), lienzo = document.getElementById('graf-lienzo');
    b.disabled = true;
    pintarGrafica().then(function(){
      try {
        lienzo.toBlob(function(blob){
          b.disabled = false;
          if (!blob) { document.getElementById('graf-nota').textContent = 'No se ha podido generar la imagen.'; return; }
          var dia = (partidosGrafica()[0] || { fecha: semana || '' }).fecha.slice(0, 10);
          guardarArchivo(blob, (graf.tipo === 'partidos' ? 'partidos-' : 'resultados-') + dia + (graf.formato === 'historia' ? '-historia' : '') + '.jpg');
        }, 'image/jpeg', 0.92);
      } catch (e) {
        b.disabled = false;
        document.getElementById('graf-nota').textContent = 'El navegador no deja exportar la imagen (algún escudo no se ha podido usar).';
      }
    });
  }

  document.querySelectorAll('[data-tipo-graf]').forEach(function(b){
    b.addEventListener('click', function(){
      graf.tipo = b.dataset.tipoGraf;
      document.querySelectorAll('[data-tipo-graf]').forEach(function(x){ x.classList.toggle('on', x === b); });
      pintarGrafica();
    });
  });
  document.querySelectorAll('[data-formato-graf]').forEach(function(b){
    b.addEventListener('click', function(){
      graf.formato = b.dataset.formatoGraf;
      document.querySelectorAll('[data-formato-graf]').forEach(function(x){ x.classList.toggle('on', x === b); });
      document.getElementById('graf-lienzo').classList.toggle('historia', graf.formato === 'historia');
      pintarGrafica();
    });
  });
  document.getElementById('graf-fondo').addEventListener('change', function(){
    var f = this.files && this.files[0];
    if (!f) return;
    // Se lee como data: (la política del panel admite imágenes data:) y se
    // carga en un <img>; la foto no sale del navegador.
    var lector = new FileReader();
    lector.onload = function(){
      var i = new Image();
      i.onload = function(){
        graf.fondo = i;
        document.getElementById('graf-quitar').hidden = false;
        pintarGrafica();
      };
      i.onerror = function(){ document.getElementById('graf-nota').textContent = 'No se ha podido abrir esa imagen.'; };
      i.src = lector.result;
    };
    lector.readAsDataURL(f);
    this.value = '';
  });
  document.getElementById('graf-quitar').addEventListener('click', function(){
    graf.fondo = null; this.hidden = true; pintarGrafica();
  });
  document.getElementById('graf-descargar').addEventListener('click', descargarGrafica);
`;
