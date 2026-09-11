/**
 * Página de administración de abonados.
 *
 * Se sirve DESDE EL WORKER, no desde GitHub Pages, y por eso el repositorio
 * no contiene ninguna credencial: este archivo es solo la interfaz. La clave
 * vive cifrada en los secretos de Cloudflare y las comprobaciones ocurren en
 * el servidor, así que clonar el repositorio no da acceso a nada.
 *
 * La sesión viaja en una cabecera Authorization, no en una cookie: así no hay
 * superficie para CSRF, porque un sitio ajeno no puede añadir cabeceras ni
 * leer el sessionStorage de otro origen.
 */
// Escudo en versión oscura (la de fondos claros), reducido a 96px e incrustado
// como data: URI. Va dentro del HTML a propósito: el panel no carga ningún
// recurso externo, y enlazarlo a la web del club obligaría a abrir la
// Content-Security-Policy a otro origen por una imagen.
const ESCUDO = 'data:image/png;base64,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';

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Abonados · Balonmano Vetusta</title>
<style>
*,*::before,*::after{box-sizing:border-box}
:root{--t:#14161a;--t2:#4a5058;--t3:#7b828b;--l:#e2e5ea;--l2:#cbd1d9;--bg:#fff;--bg2:#f6f7f9;--ok:#17803d;--err:#c0392b}
body{margin:0;background:var(--bg);color:var(--t);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
header{border-bottom:1px solid var(--l);padding:16px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
header h1{font-size:1.05rem;margin:0;font-weight:800;letter-spacing:-.2px}
header .escudo{width:44px;height:44px;display:block;flex:0 0 auto}
header .sp{flex:1}
button{font:inherit;cursor:pointer;border-radius:9px;border:1.5px solid var(--l2);background:var(--bg);padding:9px 15px;font-weight:600}
button:hover{background:var(--bg2)}
button.pri{background:var(--t);color:#fff;border-color:var(--t)}
button.pri:hover{background:#000}
button:disabled{opacity:.5;cursor:default}
main{padding:22px}
/* Acceso */
#login{max-width:340px;margin:12vh auto;text-align:center}
#login h2{font-size:1.3rem;margin:0 0 6px}
#login p{color:var(--t3);margin:0 0 22px;font-size:.92rem}
#login input{width:100%;padding:13px 14px;border:1.5px solid var(--l2);border-radius:10px;font:inherit;margin-bottom:12px}
#login input:focus{outline:none;border-color:var(--t);box-shadow:0 0 0 3px rgba(20,22,26,.12)}
#login button{width:100%}
.msg{font-size:.9rem;margin-top:12px;min-height:20px}
.msg.bad{color:var(--err)}
/* Resumen.
   En rejilla y no en fila: con flex, cada tarjeta se anchaba según lo largo
   que fuera su texto y la fila quedaba desigual. Con columnas iguales se
   alinean todas y, al no caber las seis, bajan de tres en tres, que es
   justamente como se agrupan: tres de gente y tres de dinero. El ancho
   máximo evita que en un monitor grande queden seis tarjetas larguísimas con
   un número diminuto dentro. */
.resumen{margin-bottom:22px}
.kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;max-width:522px}
.kpi{background:var(--bg2);border:1px solid var(--l);border-radius:11px;padding:12px 16px;min-width:0}
.kpi b{display:block;font-size:1.5rem;letter-spacing:-.5px}
.kpi span{display:block;font-size:.72rem;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:var(--t3);line-height:1.3}
/* Reparto por modalidad: misma familia visual pero en segundo plano, para que
   no compita con los indicadores de arriba. Lleva rótulo porque si no, esas
   cuatro cifras sueltas parecen más indicadores con nombres crípticos. */
/* Cada reparto cuelga de SU indicador: la tarjeta de Abonados o la de Compras
   hace de raíz y el desglose cuelga de ella. Por eso esas dos no están en la
   fila de indicadores de abajo — estarían contadas dos veces, y además el
   árbol no podría nacer de ellas: un grupo de cuatro tarjetas no cabe bajo una
   sola columna de esa fila.
   El raíl horizontal se dibuja con el borde superior de cada rama, estirado
   desde su centro hasta el centro de la siguiente; la última no lo lleva, y
   por eso no sobresale por los lados. */
/* Los cuatro árboles reparten todo el ancho: crecen en proporción a cuántas
   ramas tienen —cuatro el de modalidad, dos los demás—, así que las tarjetas
   salen prácticamente del mismo tamaño en los cuatro. El hueco entre árboles
   es igual, y el primero y el último quedan a ras de los márgenes.
   El ancho de referencia es a la vez el punto en que se parte: cuando no
   caben en una línea, bajan. El tope evita que un árbol suelto en su propia
   línea se estire a lo absurdo. */
.arboles{display:flex;gap:26px;flex-wrap:wrap;margin-bottom:20px}
.arbol{flex:4 1 512px;max-width:840px}
.arbol.dos{flex:2 1 251px;max-width:420px}
/* La raíz se centra sobre el grupo para que el tronco caiga por su eje. El
   alto mínimo iguala las cuatro: la del ARPU no lleva cifra, y sin él quedaría
   más baja y desalinearía su árbol respecto a los demás. */
.raiz{width:min(100%,186px);margin:0 auto;min-height:69px;display:flex;flex-direction:column;justify-content:center}
.raiz.sin-cifra span{font-size:.95rem;letter-spacing:.6px;color:var(--t)}
.tronco{width:0;height:11px;margin:0 auto;border-left:1px solid var(--l2)}
.ramas{display:grid;gap:10px;height:9px}
.ramas i{position:relative}
.ramas i::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px solid var(--l2)}
.ramas i::after{content:"";position:absolute;left:50%;right:calc(-10px - 50%);top:0;border-top:1px solid var(--l2)}
.ramas i:last-child::after{content:none}
.mods{display:grid;gap:10px}
.mods,.ramas{grid-template-columns:repeat(2,minmax(0,1fr))}
.mod{border:1px solid var(--l);border-radius:9px;padding:8px 14px;min-width:0}
.mod b{display:block;font-size:1.1rem;line-height:1.2}
.mod span{display:block;font-size:.7rem;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--t3)}
/* Los cortes van a mano y no con auto-fit: seis y cuatro tarjetas se reparten
   bien en 2, 3 y 6 columnas, mientras que dejando decidir al navegador se
   quedaba una suelta al final de la fila. */
/* Con sitio para los cuatro, se les prohíbe partirse: prefieren encogerse
   todos a la vez, repartidos en la misma proporción, antes que dejar uno
   suelto en una segunda línea. Por debajo de eso sí bajan. */
@media (min-width:1100px){
  .arboles{flex-wrap:nowrap}
}
@media (min-width:620px){
  .kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
  /* Las ramas tienen que partir la fila igual que las tarjetas, o el raíl
     dejaría de caer sobre el centro de cada una. */
  .arbol:not(.dos) .mods,
  .arbol:not(.dos) .ramas{grid-template-columns:repeat(4,minmax(0,1fr))}
}

/* En estrecho las cuatro modalidades bajan a dos filas, y un árbol de una sola
   rama por columna dejaría el raíl colgando sobre la fila de arriba. Se
   retiran los trazos y queda el número como rótulo, que es lo que dicen. */
@media (max-width:619px){
  .tronco,.ramas{display:none}
  .raiz{text-align:left}
}
/* Tabla */
.tabla-wrap{overflow-x:auto;border:1px solid var(--l);border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--l);white-space:nowrap;vertical-align:top}
th{background:var(--bg2);font-size:.7rem;letter-spacing:1px;text-transform:uppercase;color:var(--t3);position:sticky;top:0}
tbody tr:last-child td{border-bottom:none}
tbody tr.pagado{background:#f2fbf5}
td.num{font-weight:800}
.chip{display:inline-block;padding:3px 9px;border-radius:999px;font-size:.72rem;font-weight:700;border:1px solid var(--l2)}
.chip.si{background:#e7f7ec;border-color:#a9dcb8;color:var(--ok)}
.chip.no{background:#fdf3f2;border-color:#e8b4ae;color:var(--err)}
.chip.tit{background:#eef1f6;color:var(--t2)}
tbody tr.asoc td.nom{padding-left:26px;position:relative}
tbody tr.asoc td.nom::before{content:"↳";position:absolute;left:12px;color:var(--t3)}
/* La de asociado va en hueco, para que la de titular siga destacando. El
   borde a trazos y el cursor avisan de que guarda algo debajo: el vínculo y
   el número del titular salen al posar el ratón. */
.chip.aso{background:var(--bg);color:var(--t3);border-style:dashed;cursor:help}
.detalle{font-size:.82rem;color:var(--t2);white-space:normal;min-width:200px;max-width:280px}
.vacio{color:var(--t3)}
th[title]{cursor:help;text-decoration:underline dotted 1px;text-underline-offset:3px}
/* Dinero a la izquierda y buscador a la derecha, alineados por abajo para que
   el borde inferior del campo case con el de las tarjetas. El margen
   automático es lo que lo empuja al extremo derecho. */
.fila-mods{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}
.filtros{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-left:auto}
.filtros input{padding:9px 12px;border:1.5px solid var(--l2);border-radius:9px;font:inherit;min-width:220px}
</style>
</head>
<body>
<div id="login">
  <h2>Abonados 2026/2027</h2>
  <p>Introduce la clave de administración</p>
  <input type="password" id="clave" autocomplete="current-password" placeholder="Clave">
  <button class="pri" id="entrar">Entrar</button>
  <p class="msg" id="login-msg"></p>
</div>

<div id="panel" hidden>
  <header>
    <img class="escudo" src="${ESCUDO}" alt="Balonmano Vetusta" width="44" height="44">
    <h1>Abonados 2026/2027</h1>
    <span class="sp"></span>
    <button id="recargar">Recargar</button>
    <button id="csv">Descargar CSV</button>
    <button id="salir">Salir</button>
  </header>
  <main>
    <div class="resumen">
      <div class="arboles">
        <div class="arbol dos">
          <div class="kpi raiz"><b id="raiz-abonados">0</b><span>Abonados</span></div>
          <div class="tronco"></div>
          <div class="ramas"><i></i><i></i></div>
          <div class="mods" id="tipos"></div>
        </div>
        <div class="arbol">
          <div class="kpi raiz"><b id="raiz-compras">0</b><span>Compras</span></div>
          <div class="tronco"></div>
          <div class="ramas"><i></i><i></i><i></i><i></i></div>
          <div class="mods" id="mods"></div>
        </div>
        <div class="arbol dos">
          <div class="kpi raiz"><b id="raiz-ingresos">0</b><span>Ingresos</span></div>
          <div class="tronco"></div>
          <div class="ramas"><i></i><i></i></div>
          <div class="mods" id="ingresos"></div>
        </div>
        <div class="arbol dos">
          <div class="kpi raiz sin-cifra"><span>ARPU</span></div>
          <div class="tronco"></div>
          <div class="ramas"><i></i><i></i></div>
          <div class="mods" id="arpus"></div>
        </div>
      </div>
      <div class="fila-mods">
        <div class="filtros">
          <input type="search" id="buscar" placeholder="Buscar por nombre, DNI, correo…">
        </div>
      </div>
    </div>
    <div class="tabla-wrap"><table>
      <thead><tr>
        <th>Nº socio</th><th>Pagado</th><th>Nombre</th><th>Vínculo</th><th>Alta</th>
        <th>Modalidad</th><th>Pago</th><th>Importe</th><th>DNI/NIE</th><th>Nacimiento</th>
        <th>Móvil</th><th>Correo</th><th>Localidad</th><th>Imagen</th><th>Comunic.</th><th title="Madre, padre o tutor/a legal. El formulario sólo lo pide cuando quien titula el abono es menor de edad.">Tutor/a legal</th>
      </tr></thead>
      <tbody id="cuerpo"></tbody>
    </table></div>
    <p class="msg" id="panel-msg"></p>
  </main>
</div>

<script>
(function(){
  'use strict';
  // La sesión se guarda en sessionStorage: muere al cerrar la pestaña y no se
  // envía sola en peticiones de otros sitios, al contrario que una cookie.
  var SES = 'bmv_admin_ses';
  var datos = [];

  function ses(){ try { return sessionStorage.getItem(SES) || ''; } catch(e){ return ''; } }
  function guardar(v){ try { v ? sessionStorage.setItem(SES,v) : sessionStorage.removeItem(SES); } catch(e){} }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function api(ruta, opts){
    opts = opts || {};
    opts.headers = Object.assign({'Authorization':'Bearer '+ses()}, opts.headers||{});
    return fetch(ruta, opts).then(function(r){
      if (r.status === 401) { guardar(''); pintarAcceso('La sesión ha caducado.'); throw new Error('401'); }
      return r;
    });
  }

  function pintarAcceso(msg){
    document.getElementById('panel').hidden = true;
    document.getElementById('login').hidden = false;
    var m = document.getElementById('login-msg');
    m.textContent = msg || '';
    m.className = 'msg' + (msg ? ' bad' : '');
  }

  document.getElementById('entrar').addEventListener('click', entrar);
  document.getElementById('clave').addEventListener('keydown', function(e){ if(e.key==='Enter') entrar(); });

  function entrar(){
    var btn = document.getElementById('entrar');
    var m = document.getElementById('login-msg');
    btn.disabled = true; m.className='msg'; m.textContent='Comprobando…';
    fetch('/admin/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ clave: document.getElementById('clave').value })
    }).then(function(r){ return r.json().then(function(j){ return {s:r.status,j:j}; }); })
      .then(function(res){
        btn.disabled = false;
        if (res.s === 200 && res.j.sesion) {
          guardar(res.j.sesion);
          document.getElementById('clave').value = '';
          abrirPanel();
          return;
        }
        m.className='msg bad';
        m.textContent = res.s === 429
          ? 'Demasiados intentos. Prueba dentro de un rato.'
          : 'Clave incorrecta.';
      }).catch(function(){
        btn.disabled = false; m.className='msg bad'; m.textContent='No hay conexión con el servidor.';
      });
  }

  function abrirPanel(){
    document.getElementById('login').hidden = true;
    document.getElementById('panel').hidden = false;
    cargar();
  }

  function cargar(){
    var m = document.getElementById('panel-msg');
    m.className='msg'; m.textContent='Cargando…';
    api('/admin/datos').then(function(r){ return r.json(); }).then(function(j){
      datos = j.abonados || [];
      m.textContent = '';
      pintar();
    }).catch(function(){ m.className='msg bad'; m.textContent='No se han podido cargar los datos.'; });
  }

  function pintar(){
    var q = document.getElementById('buscar').value.toLowerCase().trim();
    var lista = datos.filter(function(a){
      if (!q) return true;
      return [a.nombre,a.dni,a.email,a.telefono,a.localidad,a.modalidad,a.titular_nombre,String(a.id)]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });

    // Socios y abonos no son lo mismo: un abono Familiar son cuatro socios.
    // El dinero se cuenta sobre los titulares, que es donde está la cuota.
    // Personas frente a compras: un abono Familiar es UNA compra y CUATRO
    // abonados. El dinero se cuenta sólo en los titulares, que son quienes
    // llevan el importe; si se sumaran todas las filas saldría multiplicado.
    var abonados = datos.length;
    var titulares = datos.filter(function(a){return !a.titular_id;});
    var euros = titulares.reduce(function(s,a){return s+(a.importe||0);},0);
    var cobrado = titulares.filter(function(a){return a.pagado;})
      .reduce(function(s,a){return s+(a.importe||0);},0);
    // Cobrado y Por cobrar no se solapan: son las dos mitades del total, así
    // que sumarlos da el dinero de la campaña sin contar nada dos veces.
    var porCobrar = euros - cobrado;
    var arpu = abonados ? (cobrado + porCobrar) / abonados : 0;
    // Los dos ARPU no cuelgan de ningún árbol: son cocientes entre las cifras
    // de dos de ellos, así que van aparte, al final de la fila.
    var arpuCompra = titulares.length ? euros / titulares.length : 0;
    document.getElementById('arpus').innerHTML =
      tarjeta(eur(arpu), 'Por abonado') + tarjeta(eur(arpuCompra), 'Por compra');

    // La modalidad es del abono, no de la persona: un Familiar es UNA venta.
    // Se listan las cuatro siempre, aunque estén a cero, para que se vea el
    // reparto de un vistazo y no sólo lo que se ha vendido.
    document.getElementById('mods').innerHTML = MODALIDADES.map(function(m){
      return tarjeta(titulares.filter(function(a){return a.modalidad === m;}).length, m);
    }).join('');

    // Aquí se cuentan personas, no ventas: cuántas compraron el abono y
    // cuántas van incluidas en el de otra persona. Los titulares coinciden
    // con las compras, porque cada compra tiene exactamente un titular.
    document.getElementById('tipos').innerHTML =
      tarjeta(titulares.length, 'Titular') +
      tarjeta(abonados - titulares.length, 'Asociado');

    document.getElementById('ingresos').innerHTML =
      tarjeta(cobrado + ' €', 'Cobrado') +
      tarjeta(porCobrar + ' €', 'Por cobrar');

    document.getElementById('raiz-compras').textContent = titulares.length;
    document.getElementById('raiz-abonados').textContent = abonados;
    document.getElementById('raiz-ingresos').textContent = euros + ' €';

    document.getElementById('cuerpo').innerHTML = lista.map(function(a){
      var tu = a.tutor ? esc(a.tutor.nombre)+'<br>'+esc(a.tutor.dni)+'<br>'+esc(a.tutor.telefono) : '<span class="vacio">—</span>';
      var asociado = !!a.titular_id;
      var vinculo = asociado
        ? '<span class="chip aso" title="'+esc(a.parentesco)+' del abonado nº '+a.titular_id+'">Asociado</span>'
        : '<span class="chip tit">Titular</span>';
      return '<tr class="'+(a.pagado?'pagado ':'')+(asociado?'asoc':'')+'">'+
        '<td class="num">'+a.id+'</td>'+
        '<td><button data-pagar="'+a.id+'" class="chip '+(a.pagado?'si':'no')+'">'+(a.pagado?'Sí':'No')+'</button></td>'+
        '<td class="nom">'+esc(a.nombre)+'</td>'+
        '<td>'+vinculo+'</td>'+
        '<td>'+fecha(a.creado)+'</td>'+
        '<td>'+esc(a.modalidad)+'</td>'+
        '<td>'+esc(a.pago)+'</td>'+
        '<td>'+(a.importe ? esc(a.importe)+' €' : '—')+'</td>'+
        '<td>'+esc(a.dni)+'</td>'+
        '<td>'+fechaSuelta(a.nacimiento)+'</td>'+
        '<td>'+dato(a.telefono)+'</td>'+
        '<td>'+dato(a.email)+'</td>'+
        '<td>'+esc(a.localidad)+'</td>'+
        '<td>'+esc(a.imagen)+'</td>'+
        '<td>'+esc(a.comunicaciones)+'</td>'+
        '<td class="detalle">'+tu+'</td>'+
        '</tr>';
    }).join('') || '<tr><td colspan="16" style="padding:22px;color:#7b828b">Todavía no hay altas.</td></tr>';

    document.querySelectorAll('[data-pagar]').forEach(function(b){
      b.addEventListener('click', function(){ alternarPago(parseInt(b.dataset.pagar,10), b); });
    });
  }

  // Sólo el titular facilita móvil y correo, así que las filas de las personas
  // incluidas en su abono los tienen vacíos a propósito.
  function dato(v){ return v ? esc(v) : '<span class="vacio">—</span>'; }

  var MODALIDADES = ['Sub 18', 'Adulto', 'Matrimonio', 'Familiar'];

  // La fecha se guarda en UTC. Se pasa por Date para mostrarla en la hora de
  // quien mira el panel: si no, un alta hecha a las 00:30 en España aparecería
  // con la fecha del día anterior, que es cuando era en UTC.
  // La fecha de nacimiento es un día suelto, sin hora: se le da la vuelta a
  // los trozos y ya está. Pasarla por Date sería un error, porque la
  // interpretaría como medianoche UTC y en husos por detrás de Greenwich
  // mostraría el día anterior.
  function fechaSuelta(s){
    var p = String(s || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : esc(s || '');
  }

  function fecha(iso){
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return esc(String(iso).slice(0, 10));
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
  }

  // Un decimal y coma, como se escriben los números en español.
  function dec(n){ return n.toFixed(1).replace('.', ','); }
  function eur(n){ return dec(n) + ' €'; }

  function tarjeta(n,t){ return '<div class="mod"><b>'+esc(n)+'</b><span>'+esc(t)+'</span></div>'; }

  function kpi(v,t){ return '<div class="kpi"><b>'+esc(v)+'</b><span>'+esc(t)+'</span></div>'; }

  function alternarPago(id, btn){
    var a = datos.filter(function(x){return x.id===id;})[0];
    if (!a) return;
    var nuevo = a.pagado ? 0 : 1;
    btn.disabled = true;
    api('/admin/pagado', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: id, pagado: nuevo })
    }).then(function(r){
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function(j){
      // El pago es del abono: se refleja en el titular y en sus asociados.
      var grupo = j.grupo || id;
      datos.forEach(function(x){
        if (x.id === grupo || x.titular_id === grupo) x.pagado = !!nuevo;
      });
      pintar();
    }).catch(function(){
      btn.disabled = false;
      var m = document.getElementById('panel-msg');
      m.className='msg bad'; m.textContent='No se ha podido guardar el cambio.';
    });
  }

  document.getElementById('recargar').addEventListener('click', cargar);
  document.getElementById('buscar').addEventListener('input', pintar);
  document.getElementById('salir').addEventListener('click', function(){
    guardar(''); pintarAcceso('');
    document.getElementById('login').hidden = false;
  });

  // La descarga necesita la cabecera, así que se pide por fetch y se guarda
  // el blob: un <a href> no puede llevar Authorization.
  document.getElementById('csv').addEventListener('click', function(){
    var btn = this; btn.disabled = true;
    api('/export.csv').then(function(r){ return r.blob(); }).then(function(b){
      var u = URL.createObjectURL(b);
      var a = document.createElement('a');
      a.href = u; a.download = 'abonados-2026-2027.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(u); btn.disabled = false;
    }).catch(function(){ btn.disabled = false; });
  });

  if (ses()) abrirPanel(); else pintarAcceso('');
})();
</script>
</body>
</html>`;
