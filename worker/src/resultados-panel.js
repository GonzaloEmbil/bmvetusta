/**
 * Sección «Resultados» del panel: los partidos de todos los equipos del club
 * en una semana (de lunes a domingo), con el resultado de los ya jugados y la
 * hora de los que faltan, y flechas para ir a la semana anterior o siguiente.
 *
 * Como el resto de módulos del panel, va en String.raw y no puede llevar
 * comillas invertidas ni «${». Comparte el ámbito del script del panel: usa
 * api(), esc() y encajarTabla().
 */
export const RESULTADOS_JS = String.raw`
  // ── Resultados ────────────────────────────────────────────────────────────
  var semana = null;          // lunes (AAAA-MM-DD) de la semana que se ve
  var resultadosCargados = false;
  var ultimaSemana = null;   // la última respuesta, que usa también la imagen para redes
  var DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function diaIso(d){
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function deIso(s){ var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function masDias(s, n){ var d = deIso(s); d.setDate(d.getDate() + n); return diaIso(d); }

  // Se abre en la semana en curso, de lunes a domingo.
  function lunesPorDefecto(){
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    hoy.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    return diaIso(hoy);
  }

  function tituloSemana(lunes){
    var l = deIso(lunes), d = deIso(masDias(lunes, 6));
    return l.getMonth() === d.getMonth()
      ? 'Semana del ' + l.getDate() + ' al ' + d.getDate() + ' de ' + MESES[d.getMonth()]
      : 'Semana del ' + l.getDate() + ' de ' + MESES[l.getMonth()] + ' al ' + d.getDate() + ' de ' + MESES[d.getMonth()];
  }

  function cargarResultados(){
    if (!semana) semana = lunesPorDefecto();
    var m = document.getElementById('resultados-msg');
    document.getElementById('res-titulo').textContent = tituloSemana(semana);
    m.className = 'msg'; m.textContent = 'Cargando…';
    var pedido = semana;
    return api('/admin/resultados?desde=' + pedido).then(function(r){ return r.json(); }).then(function(j){
      if (pedido !== semana) return true;           // se ha cambiado de semana mientras cargaba
      if (!j.ok) throw new Error('ko');
      resultadosCargados = true;
      pintarResultados(j);
      m.textContent = j.fallos && j.fallos.length ? 'No se han podido consultar: ' + j.fallos.join(', ') + '.' : '';
      if (j.fallos && j.fallos.length) m.className = 'msg bad';
      return !(j.fallos && j.fallos.length);
    }).catch(function(){ m.className = 'msg bad'; m.textContent = 'No se han podido cargar los resultados de la federación.'; return false; });
  }

  // Resultado visto desde el Vetusta: V, E, D o null si no se ha jugado.
  function desenlace(p){
    if (p.estado !== 'Finalizado' || p.goles_local === null || p.goles_visitante === null) return null;
    if (p.nuestro_local && p.nuestro_visitante) return 'interno';
    var nuestros = p.nuestro_local ? p.goles_local : p.goles_visitante;
    var suyos = p.nuestro_local ? p.goles_visitante : p.goles_local;
    return nuestros > suyos ? 'V' : nuestros < suyos ? 'D' : 'E';
  }

  function equipoHtml(nombre, escudo, nuestro){
    var img = /^https:\/\/balonmano\.isquad\.es\//.test(escudo) ? '<img class="escudo-res" src="'+esc(escudo)+'" alt="" loading="lazy">' : '';
    return '<span class="eq-res'+(nuestro ? ' nuestro' : '')+'">'+img+esc(nombre)+'</span>';
  }

  function pintarResultados(j){
    ultimaSemana = j;
    pintarGrafica();
    var cuenta = { V: 0, E: 0, D: 0, pend: 0 };
    document.getElementById('cuerpo-resultados').innerHTML = j.partidos.map(function(p){
      var fecha = deIso(p.fecha.slice(0, 10)), hora = p.fecha.slice(11, 16);
      var cuando = DIAS_SEMANA[fecha.getDay()] + ' ' + String(fecha.getDate()).padStart(2, '0') + '/' + String(fecha.getMonth() + 1).padStart(2, '0') +
        (hora && hora !== '00:00' ? ' · ' + hora : '');
      var r = desenlace(p), celda;
      if (r) {
        var marcador = p.goles_local + ' – ' + p.goles_visitante;
        var clase = r === 'V' ? 'si' : r === 'D' ? 'no' : 'borr';
        var texto = r === 'V' ? 'Victoria' : r === 'D' ? 'Derrota' : r === 'E' ? 'Empate' : 'Entre equipos del club';
        if (r !== 'interno') cuenta[r]++;
        celda = '<span class="chip '+clase+'" title="'+texto+'">'+marcador+'</span>';
      } else if (p.estado === 'Suspendido') {
        celda = '<span class="chip borr">Suspendido</span>';
      } else if (new Date(p.fecha.replace(' ', 'T')) < new Date()) {
        // Ya debería haberse jugado, pero la federación aún no tiene el acta.
        celda = '<span class="chip borr" title="La federación todavía no ha publicado el resultado">Sin resultado</span>';
      } else {
        cuenta.pend++;
        celda = '<span class="chip prog">Por jugar</span>';
      }
      return '<tr>'+
        '<td data-k="Día">'+esc(cuando)+'</td>'+
        '<td class="nom" data-k="Equipo">'+esc(p.equipo)+'</td>'+
        '<td class="partido-res" data-k="Partido"><span class="lineas">'+
          equipoHtml(p.local, p.escudo_local, p.nuestro_local)+
          equipoHtml(p.visitante, p.escudo_visitante, p.nuestro_visitante)+'</span></td>'+
        '<td data-k="Resultado">'+celda+'</td>'+
        '<td class="lugar-res" data-k="Lugar">'+(p.pabellon ? esc(p.pabellon)+(p.localidad ? ' · '+esc(p.localidad) : '') : '<span class="vacio">—</span>')+'</td>'+
        '</tr>';
    }).join('') || '<tr><td colspan="5" style="padding:22px;color:#7b828b">Ningún equipo del club juega esta semana.</td></tr>';

    var partes = [];
    if (cuenta.V) partes.push(cuenta.V + (cuenta.V === 1 ? ' victoria' : ' victorias'));
    if (cuenta.E) partes.push(cuenta.E + (cuenta.E === 1 ? ' empate' : ' empates'));
    if (cuenta.D) partes.push(cuenta.D + (cuenta.D === 1 ? ' derrota' : ' derrotas'));
    if (cuenta.pend) partes.push(cuenta.pend + ' por jugar');
    document.getElementById('res-resumen').textContent = partes.join(' · ');
    encajarTabla();
  }

  function moverSemana(n){
    semana = masDias(semana || lunesPorDefecto(), 7 * n);
    document.getElementById('res-resumen').textContent = '';
    document.getElementById('cuerpo-resultados').innerHTML = '';
    ultimaSemana = null;
    cargarResultados();
  }

  document.getElementById('res-ant').addEventListener('click', function(){ moverSemana(-1); });
  document.getElementById('res-sig').addEventListener('click', function(){ moverSemana(1); });
  document.getElementById('res-hoy').addEventListener('click', function(){ semana = null; cargarResultados(); });
`;
