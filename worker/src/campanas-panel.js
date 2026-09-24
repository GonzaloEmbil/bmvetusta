/**
 * Sección «Campañas» del panel: historial y editor.
 *
 * Como DESCARGAS_JS, va en String.raw para que las barras invertidas lleguen
 * tal cual a la página, y por lo mismo no puede llevar comillas invertidas ni
 * «${». Se inserta dentro del script del panel y comparte su ámbito: usa
 * api(), esc(), mostrar() y el resto de utilidades de allí.
 *
 * El correo de la vista previa lo compone el servidor con la misma función
 * que el de verdad, así que lo que se ve es exactamente lo que sale.
 */
export const CAMPANAS_JS = String.raw`
  // ── Estado ────────────────────────────────────────────────────────────────
  var campanas = [];
  var infoCampanas = null;   // tamaño de las listas, si hay almacén de imágenes…
  var editando = null;       // la campaña abierta en el editor

  var ESTADOS = {
    borrador:   { chip: 'borr', texto: 'Borrador' },
    programada: { chip: 'prog', texto: 'Programada' },
    enviando:   { chip: 'prog', texto: 'Enviando…' },
    enviada:    { chip: 'si',   texto: 'Enviada' },
    error:      { chip: 'no',   texto: 'Error' }
  };

  function $(id){ return document.getElementById(id); }

  function fechaHora(iso){
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return fecha(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function listasDe(c){
    try { return JSON.parse(c.listas || '[]'); } catch(e){ return []; }
  }

  function nombresListas(ls){
    var n = (infoCampanas && infoCampanas.nombresListas) || {};
    return ls.map(function(l){ return n[l] || l; }).join(' + ');
  }

  // ── Historial ─────────────────────────────────────────────────────────────
  function cargarCampanas(){
    var m = $('campanas-msg');
    return api('/admin/campanas').then(function(r){ return r.json(); }).then(function(j){
      campanas = j.campanas || [];
      infoCampanas = j;
      m.textContent = ''; m.className = 'msg';
      pintarCampanas();
      pintarListas();
      return true;
    }).catch(function(){ m.className = 'msg bad'; m.textContent = 'No se han podido cargar las campañas.'; return false; });
  }

  function pintarCampanas(){
    $('cuerpo-campanas').innerHTML = campanas.map(function(c){
      var e = ESTADOS[c.estado] || ESTADOS.borrador;
      var cuando = c.estado === 'programada' ? fechaHora(c.programada)
        : (c.enviada ? fechaHora(c.enviada) : fechaHora(c.creada));
      var enviada = c.estado === 'enviada' || c.estado === 'error';
      var cifra = function(n){ return enviada ? esc(n) : '<span class="vacio">—</span>'; };
      return '<tr class="fila-campana" data-campana="' + c.id + '">' +
        '<td data-k="Fecha">' + esc(cuando) + '</td>' +
        '<td class="nom" data-k="Asunto">' + (c.asunto ? esc(c.asunto) : '<span class="vacio">(sin asunto)</span>') + '</td>' +
        '<td data-k="Destinatarios">' + esc(nombresListas(listasDe(c))) + '</td>' +
        '<td data-k="Estado"><span class="chip ' + e.chip + '"' + (c.error ? ' title="' + esc(c.error) + '"' : '') + '>' + e.texto + '</span></td>' +
        '<td data-k="Enviados">' + cifra(c.enviados) + '</td>' +
        '<td data-k="Fallidos">' + cifra(c.fallidos) + '</td>' +
        '<td data-k="Bajas">' + cifra(c.bajas) + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="7" style="padding:22px;color:#7b828b">Todavía no hay campañas.</td></tr>';
    document.querySelectorAll('[data-campana]').forEach(function(tr){
      tr.addEventListener('click', function(){ abrirCampana(parseInt(tr.dataset.campana, 10)); });
    });
    encajarTabla();
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  // Cada desplegable elige un segmento de su lista. Las opciones muestran
  // cuántas personas con permiso hay en cada uno.
  var GRUPOS_CAMPANA = ['actuales', 'anteriores', 'otros'];

  function pintarListas(){
    if (!infoCampanas) return;
    var s = infoCampanas.segmentos || {}, n = infoCampanas.nombresListas || {};
    GRUPOS_CAMPANA.forEach(function(g){
      var etiqueta = document.querySelector('label[for="c-seg-' + g + '"]');
      if (n[g]) etiqueta.textContent = n[g];
      [].forEach.call($('c-seg-' + g).options, function(o){
        if (!o.dataset.texto) o.dataset.texto = o.textContent;
        o.textContent = o.value ? o.dataset.texto + ' (' + (s[o.value] || []).length + ')' : o.dataset.texto;
      });
    });
    $('c-imagen-subir').disabled = !infoCampanas.imagenes || !editable();
    $('c-imagen-nota').textContent = infoCampanas.imagenes ? '' : 'Falta activar el almacén de imágenes (R2).';
    pintarTotal();
  }

  // Cuántas personas recibirían el correo con las listas marcadas, contando
  // una sola vez a quien esté en las dos.
  function marcadas(){
    return GRUPOS_CAMPANA.map(function(g){ return $('c-seg-' + g).value; }).filter(Boolean);
  }

  // Cuántas personas distintas suman los segmentos elegidos. El servidor
  // manda cada segmento como una lista de números (uno por dirección), así
  // que basta con contar los números distintos.
  function totalMarcado(){
    var s = (infoCampanas && infoCampanas.segmentos) || {};
    var vistas = {};
    marcadas().forEach(function(l){ (s[l] || []).forEach(function(i){ vistas[i] = true; }); });
    return Object.keys(vistas).length;
  }

  function pintarTotal(){
    var n = totalMarcado();
    $('c-total').textContent = n
      ? 'Se enviará a ' + n + (n === 1 ? ' persona' : ' personas') + ' que han aceptado recibir comunicaciones.' +
        (n > 100 ? ' Supera los 100 correos diarios del plan gratuito de Resend.' : '')
      : 'Elige a quién se envía.';
  }

  function editable(){ return !!editando && editando.estado === 'borrador'; }

  function nuevaCampana(base){
    editando = {
      id: null, estado: 'borrador',
      asunto: base ? base.asunto : '', texto: base ? base.texto : '', imagen: base ? base.imagen : '',
      boton_texto: base ? base.boton_texto : '', boton_url: base ? base.boton_url : '',
      listas: base ? base.listas : '["actuales","anteriores","otros"]'
    };
    llenarFormulario();
    mostrar('editor');
  }

  function abrirCampana(id){
    api('/admin/campanas/' + id).then(function(r){ return r.json(); }).then(function(j){
      if (!j.campana) return;
      editando = j.campana;
      llenarFormulario();
      mostrar('editor');
    });
  }

  function llenarFormulario(){
    var c = editando, ed = editable(), ls = listasDe(c);
    $('c-asunto').value = c.asunto || '';
    $('c-texto').value = c.texto || '';
    $('c-boton-texto').value = c.boton_texto || '';
    $('c-boton-url').value = c.boton_url || '';
    GRUPOS_CAMPANA.forEach(function(g){
      $('c-seg-' + g).value = ls.filter(function(l){ return l.split('_')[0] === g; })[0] || '';
    });
    pintarImagen();
    ['c-asunto','c-texto','c-boton-texto','c-boton-url','c-seg-actuales','c-seg-anteriores','c-seg-otros'].forEach(function(i){ $(i).disabled = !ed; });
    document.querySelectorAll('[data-formato-texto]').forEach(function(b){ b.disabled = !ed; });

    // Qué se puede hacer depende del estado.
    var est = c.estado;
    $('c-guardar').hidden = !ed;
    $('c-prueba').hidden = !(ed || est === 'programada');
    $('c-enviar').hidden = !ed;
    $('c-programar').hidden = !ed;
    $('c-cancelar').hidden = est !== 'programada';
    $('c-duplicar').hidden = !c.id || ed;
    $('c-borrar').hidden = !c.id || !ed;
    $('c-programar-caja').hidden = true;

    var aviso = '';
    if (est === 'programada') aviso = 'Programada para el ' + fechaHora(c.programada) + '. Para cambiar algo, cancela la programación.';
    else if (est === 'enviando') aviso = 'Se está enviando ahora mismo.';
    else if (est === 'enviada') aviso = 'Enviada el ' + fechaHora(c.enviada) + ' a ' + c.enviados + ' de ' + c.destinatarios + ' personas.' +
      (c.fallidos ? ' Fallaron ' + c.fallidos + '.' : '');
    else if (est === 'error') aviso = 'No se pudo enviar' + (c.error ? ': ' + c.error : '.');
    $('editor-aviso').textContent = aviso;
    $('editor-aviso').hidden = !aviso;
    $('editor-msg').textContent = '';
    pintarListas();
    previa();
  }

  function leerFormulario(){
    var ls = marcadas();
    return {
      id: editando.id, asunto: $('c-asunto').value, texto: $('c-texto').value, imagen: editando.imagen || '',
      boton_texto: $('c-boton-texto').value, boton_url: $('c-boton-url').value, listas: ls
    };
  }

  function mensaje(t, mal){
    var m = $('editor-msg');
    m.textContent = t; m.className = 'msg' + (mal ? ' bad' : '');
  }

  function post(ruta, cuerpo){
    return api(ruta, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
    }).then(function(r){ return r.json().then(function(j){ j.status = r.status; return j; }); });
  }

  var FALTAS = { asunto: 'el asunto', texto: 'el texto', listas: 'a quién se envía', boton_url: 'el enlace del botón' };
  function explicar(j){
    if (j.error === 'incompleta') return 'Falta ' + (j.faltas || []).map(function(f){ return FALTAS[f] || f; }).join(', ') + '.';
    if (j.error === 'sin_configurar') return 'El envío de correos no está configurado en el servidor.';
    if (j.error === 'no_editable') return 'Esta campaña ya no se puede cambiar: recarga para ver su estado.';
    if (j.error === 'fecha') return 'Elige una fecha y hora futuras.';
    return j.error ? 'No se ha podido: ' + j.error : 'No se ha podido.';
  }

  // Todo lo que actúa sobre la campaña la guarda antes, para no enviar una
  // versión distinta de la que se ve en pantalla.
  function guardar(){
    return post('/admin/campanas', leerFormulario()).then(function(j){
      if (!j.ok) throw new Error(explicar(j));
      editando.id = j.id;
      return j.id;
    });
  }

  function trasEnviar(texto){
    mensaje(texto);
    return cargarCampanas().then(function(){ abrirCampanaSilenciosa(editando.id); });
  }

  function abrirCampanaSilenciosa(id){
    return api('/admin/campanas/' + id).then(function(r){ return r.json(); }).then(function(j){
      if (j.campana) { editando = j.campana; var m = $('editor-msg').textContent; llenarFormulario(); mensaje(m); mostrar('editor'); }
    });
  }

  function ocupado(b, si){ b.disabled = si; }

  $('c-guardar').addEventListener('click', function(){
    var b = this; ocupado(b, true);
    guardar().then(function(){ mensaje('Borrador guardado.'); cargarCampanas(); mostrar('editor'); })
      .catch(function(e){ mensaje(e.message, true); }).then(function(){ ocupado(b, false); });
  });

  $('c-prueba').addEventListener('click', function(){
    var b = this; ocupado(b, true); mensaje('Enviando la prueba…');
    (editable() ? guardar() : Promise.resolve(editando.id)).then(function(id){
      return post('/admin/campanas/prueba', { id: id });
    }).then(function(j){
      if (!j.ok) throw new Error(explicar(j));
      mensaje('Prueba enviada a ' + j.para + '.');
      cargarCampanas();
    }).catch(function(e){ mensaje(e.message, true); }).then(function(){ ocupado(b, false); });
  });

  $('c-enviar').addEventListener('click', function(){
    var n = totalMarcado();
    if (!n) { mensaje('Elige a quién se envía.', true); return; }
    if (!confirm('Se enviará a ' + n + (n === 1 ? ' persona' : ' personas') + '. ¿Enviar ahora?')) return;
    var b = this; ocupado(b, true); mensaje('Enviando…');
    guardar().then(function(id){ return post('/admin/campanas/enviar', { id: id }); }).then(function(j){
      if (!j.ok && !j.enviados) throw new Error(j.error && j.error !== 'incompleta' && j.error !== 'no_editable' && j.error !== 'sin_configurar' ? 'No se pudo enviar: ' + j.error : explicar(j));
      return trasEnviar('Enviada a ' + j.enviados + ' de ' + j.total + ' personas.' + (j.fallidos ? ' Fallaron ' + j.fallidos + '.' : ''));
    }).catch(function(e){ mensaje(e.message, true); }).then(function(){ ocupado(b, false); });
  });

  $('c-programar').addEventListener('click', function(){
    var caja = $('c-programar-caja');
    caja.hidden = !caja.hidden;
    if (!caja.hidden && !$('c-cuando').value) {
      // Por defecto, mañana a las 10:00 (hora de quien programa).
      var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0);
      $('c-cuando').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0') + 'T10:00';
    }
  });

  $('c-programar-ok').addEventListener('click', function(){
    var v = $('c-cuando').value;
    var cuando = v ? new Date(v) : null;
    if (!cuando || isNaN(cuando)) { mensaje('Elige una fecha y hora.', true); return; }
    var b = this; ocupado(b, true);
    guardar().then(function(id){ return post('/admin/campanas/programar', { id: id, cuando: cuando.toISOString() }); })
      .then(function(j){
        if (!j.ok) throw new Error(explicar(j));
        return trasEnviar('Programada para el ' + fechaHora(cuando.toISOString()) + '.');
      }).catch(function(e){ mensaje(e.message, true); }).then(function(){ ocupado(b, false); });
  });

  $('c-cancelar').addEventListener('click', function(){
    var b = this; ocupado(b, true);
    post('/admin/campanas/cancelar', { id: editando.id }).then(function(j){
      if (!j.ok) throw new Error(explicar(j));
      return trasEnviar('Programación cancelada: vuelve a ser un borrador.');
    }).catch(function(e){ mensaje(e.message, true); }).then(function(){ ocupado(b, false); });
  });

  $('c-duplicar').addEventListener('click', function(){ nuevaCampana(editando); });

  $('c-borrar').addEventListener('click', function(){
    if (!confirm('¿Borrar este borrador?')) return;
    post('/admin/campanas/borrar', { id: editando.id }).then(function(j){
      if (!j.ok) throw new Error(explicar(j));
      return cargarCampanas().then(function(){ mostrar('campanas'); });
    }).catch(function(e){ mensaje(e.message, true); });
  });

  // ── Imagen ────────────────────────────────────────────────────────────────
  function pintarImagen(){
    var url = editando && editando.imagen ? 'https://altas.balonmanovetusta.com/img/' + editando.imagen : '';
    $('c-imagen-min').hidden = !url;
    if (url) $('c-imagen-min').src = url;
    $('c-imagen-quitar').hidden = !url || !editable();
    $('c-imagen-subir').textContent = url ? 'Cambiar imagen' : 'Subir imagen';
  }

  $('c-imagen-subir').addEventListener('click', function(){ $('c-imagen-archivo').click(); });
  $('c-imagen-quitar').addEventListener('click', function(){ editando.imagen = ''; pintarImagen(); previa(); });
  $('c-imagen-archivo').addEventListener('change', function(){
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { mensaje('La imagen pesa más de 5 MB.', true); return; }
    mensaje('Subiendo la imagen…');
    api('/admin/imagen', { method: 'POST', headers: { 'Content-Type': f.type }, body: f })
      .then(function(r){ return r.json(); }).then(function(j){
        if (!j.ok) throw new Error(j.error === 'tipo' ? 'Sólo se admiten imágenes PNG, JPG, WEBP o GIF.' : 'No se ha podido subir la imagen.');
        editando.imagen = j.clave;
        pintarImagen(); previa(); mensaje('');
      }).catch(function(e){ mensaje(e.message, true); });
  });

  // ── Texto: negrita y enlace ───────────────────────────────────────────────
  function envolver(antes, despues, relleno){
    var t = $('c-texto'), a = t.selectionStart, b = t.selectionEnd;
    var sel = t.value.slice(a, b) || relleno;
    t.value = t.value.slice(0, a) + antes + sel + despues + t.value.slice(b);
    t.focus();
    t.setSelectionRange(a + antes.length, a + antes.length + sel.length);
    previa();
  }

  document.querySelectorAll('[data-formato-texto]').forEach(function(b){
    b.addEventListener('click', function(){
      if (b.dataset.formatoTexto === 'negrita') { envolver('**', '**', 'texto en negrita'); return; }
      var url = prompt('Dirección del enlace', 'https://');
      if (!url || !/^(https?:\/\/|mailto:)\S+$/.test(url)) return;
      envolver('[', '](' + url + ')', 'texto del enlace');
    });
  });

  // ── Vista previa ──────────────────────────────────────────────────────────
  // Va en un shadow DOM para que los estilos del panel (tablas, tipografía)
  // no se mezclen con los del correo, que lleva los suyos en línea.
  var raizPrevia = $('c-previa').attachShadow({ mode: 'open' });
  raizPrevia.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('a')) e.preventDefault();
  });
  var temporizadorPrevia;

  function previa(){
    clearTimeout(temporizadorPrevia);
    temporizadorPrevia = setTimeout(function(){
      if (!editando) return;
      var datos = leerFormulario();
      $('c-previa-asunto').textContent = datos.asunto || '(sin asunto)';
      post('/admin/campanas/previa', datos).then(function(j){
        if (!j.ok) return;
        var doc = new DOMParser().parseFromString(j.html, 'text/html');
        raizPrevia.innerHTML = doc.body.innerHTML;
      });
    }, 350);
  }

  ['c-asunto','c-texto','c-boton-texto','c-boton-url'].forEach(function(i){ $(i).addEventListener('input', previa); });
  GRUPOS_CAMPANA.forEach(function(g){ $('c-seg-' + g).addEventListener('change', pintarTotal); });
  $('nueva-campana').addEventListener('click', function(){ nuevaCampana(); });
`;
