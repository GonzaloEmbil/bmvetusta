/**
 * Pestaña «Posibles» de Patrocinadores: la lista de empresas a las que
 * dirigirse, con sus datos de contacto y unas notas de seguimiento.
 *
 * Como CAMPANAS_JS, va en String.raw (las barras invertidas llegan tal cual)
 * y no puede llevar comillas invertidas ni «${». Comparte el ámbito del script
 * del panel: usa api(), esc(), dato(), fecha(), fechaSuelta() y encajarTabla().
 */
export const PROSPECTOS_JS = String.raw`
  // ── Posibles patrocinadores ───────────────────────────────────────────────
  var prospectos = [];
  var abierto = null;   // el posible que está en el editor (null si es nuevo)

  // Sólo se enlaza lo que sea http(s); el servidor ya lo filtra al guardar.
  function enlaceWeb(u, texto){
    u = String(u || '');
    if (!/^https?:\/\//i.test(u)) return '';
    return '<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(texto || u.split('//')[1].replace('www.', '').split('/')[0])+'</a>';
  }

  function telefonos(t){
    return String(t || '').split(' · ').filter(Boolean).map(function(parte){
      var cifras = parte.replace(/[^0-9]/g, '').slice(-9);
      return cifras.length === 9 ? '<a href="tel:+34'+cifras+'">'+esc(parte)+'</a>' : esc(parte);
    }).join('<br>');
  }

  function cargarProspectos(){
    var m = document.getElementById('posibles-msg');
    return api('/admin/prospectos').then(function(r){ return r.json(); }).then(function(j){
      prospectos = j.prospectos || [];
      m.className = 'msg'; m.textContent = '';
      pintarProspectos();
      return true;
    }).catch(function(){ m.className = 'msg bad'; m.textContent = 'No se han podido cargar los posibles patrocinadores.'; return false; });
  }

  function listaPosibles(){
    var q = document.getElementById('buscar-posibles').value.toLowerCase().trim();
    return prospectos.filter(function(p){
      if (!q) return true;
      return [p.empresa, p.sector, p.zona, p.lote, p.fuente, p.motivo, p.responsable, p.notas, p.email]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    }).sort(function(a, b){
      return a.empresa.localeCompare(b.empresa, 'es');
    });
  }

  function pintarProspectos(){
    var lista = listaPosibles();
    document.getElementById('cuerpo-posibles').innerHTML = lista.map(function(p){
      var contacto = [
        p.email ? '<a href="mailto:'+esc(p.email)+'">'+esc(p.email)+'</a>' : '',
        telefonos(p.telefono),
        enlaceWeb(p.web)
      ].filter(Boolean).join('<br>');
      var paso = p.proximo_paso
        ? esc(p.proximo_paso) + (p.fecha_proximo ? '<br><span class="nota">'+fechaSuelta(p.fecha_proximo)+'</span>' : '')
        : '<span class="vacio">—</span>';
      return '<tr class="fila-posible" data-id="'+p.id+'" tabindex="0">'+
        '<td class="nom" data-k="Empresa">'+esc(p.empresa)+(p.sector ? '<span class="sector">'+esc(p.sector)+'</span>' : '')+'</td>'+
        '<td class="zona" data-k="Zona">'+dato(p.zona)+'</td>'+
        // Cada celda lleva un solo hijo: en el móvil la celda es una fila
        // flexible y varias líneas sueltas se pondrían una al lado de otra.
        '<td class="web contacto" data-k="Contacto">'+(contacto ? '<span class="lineas">'+contacto+'</span>' : '<span class="vacio">—</span>')+'</td>'+
        '<td class="web motivo" data-k="Fuente">'+(enlaceWeb(p.fuente_url, p.fuente) || dato(p.fuente))+'</td>'+
        '<td class="motivo" data-k="Por qué encaja">'+dato(p.motivo)+'</td>'+
        '<td class="motivo" data-k="Próximo paso">'+(p.proximo_paso ? '<span class="lineas">'+paso+'</span>' : paso)+'</td>'+
        '<td data-k="Responsable">'+dato(p.responsable)+'</td>'+
        '</tr>';
    }).join('') || '<tr><td colspan="7" style="padding:22px;color:#7b828b">'+
      (prospectos.length ? 'Ninguna coincide con la búsqueda.' : 'Todavía no hay posibles patrocinadores.')+'</td></tr>';
    var n = document.getElementById('posibles-cuenta');
    n.textContent = lista.length + (lista.length === 1 ? ' empresa' : ' empresas');
    encajarTabla();
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  var CAMPOS_POSIBLE = ['empresa', 'sector', 'zona', 'lote', 'web', 'telefono', 'email', 'contacto',
    'fuente', 'fuente_url', 'motivo', 'proximo_paso', 'fecha_proximo', 'responsable', 'notas'];

  function abrirPosible(p){
    abierto = p || null;
    var d = document.getElementById('posible');
    CAMPOS_POSIBLE.forEach(function(k){
      var el = document.getElementById('pp-'+k);
      el.value = p ? (p[k] || '') : '';
    });
    document.getElementById('posible-titulo').textContent = p ? p.empresa : 'Añadir posible patrocinador';
    document.getElementById('posible-quien').textContent = p && p.actualizado
      ? 'Última modificación: ' + fecha(p.actualizado) + (p.actualizado_por ? ' · ' + p.actualizado_por : '')
      : '';
    var m = document.getElementById('posible-msg'); m.className = 'msg'; m.textContent = '';
    d.showModal();
    document.getElementById('pp-' + (p ? 'proximo_paso' : 'empresa')).focus();
  }

  function guardarPosible(){
    var cuerpo = {};
    CAMPOS_POSIBLE.forEach(function(k){ cuerpo[k] = document.getElementById('pp-'+k).value; });
    var m = document.getElementById('posible-msg');
    if (!cuerpo.empresa.trim()) { m.className = 'msg bad'; m.textContent = 'Falta el nombre de la empresa.'; return; }
    if (abierto) cuerpo.actualizado = abierto.actualizado || '';
    var botones = document.querySelectorAll('#posible .acciones button');
    botones.forEach(function(b){ b.disabled = true; });
    m.className = 'msg'; m.textContent = 'Guardando…';
    api(abierto ? '/admin/prospectos/' + abierto.id : '/admin/prospectos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
    }).then(function(r){ return r.json().then(function(j){ return { s: r.status, j: j }; }); })
      .then(function(res){
        botones.forEach(function(b){ b.disabled = false; });
        if (!res.j.ok) { m.className = 'msg bad'; m.textContent = res.j.error || 'No se ha podido guardar.'; return; }
        var nuevo = res.j.prospecto;
        var i = prospectos.map(function(x){ return x.id; }).indexOf(nuevo.id);
        if (i >= 0) prospectos[i] = nuevo; else prospectos.push(nuevo);
        document.getElementById('posible').close();
        pintarProspectos();
      }).catch(function(){
        botones.forEach(function(b){ b.disabled = false; });
        m.className = 'msg bad'; m.textContent = 'No hay conexión con el servidor.';
      });
  }

  document.getElementById('cuerpo-posibles').addEventListener('click', function(ev){
    if (ev.target.closest('a')) return;
    var tr = ev.target.closest('tr[data-id]');
    if (tr) abrirPosible(prospectos.filter(function(p){ return p.id === +tr.dataset.id; })[0]);
  });
  document.getElementById('cuerpo-posibles').addEventListener('keydown', function(ev){
    var tr = ev.target.closest('tr[data-id]');
    if (tr && ev.key === 'Enter') abrirPosible(prospectos.filter(function(p){ return p.id === +tr.dataset.id; })[0]);
  });
  document.getElementById('nuevo-posible').addEventListener('click', function(){ abrirPosible(null); });
  document.getElementById('posible-guardar').addEventListener('click', guardarPosible);
  document.getElementById('posible-cancelar').addEventListener('click', function(){ document.getElementById('posible').close(); });
  document.getElementById('buscar-posibles').addEventListener('input', pintarProspectos);
`;
