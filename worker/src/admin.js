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
header{border-bottom:1px solid var(--l);padding:16px 22px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
header h1{font-size:1.05rem;margin:0;font-weight:800;letter-spacing:-.2px}
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
/* Resumen */
.kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
.kpi{background:var(--bg2);border:1px solid var(--l);border-radius:11px;padding:12px 16px;min-width:120px}
.kpi b{display:block;font-size:1.5rem;letter-spacing:-.5px}
.kpi span{font-size:.72rem;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:var(--t3)}
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
tbody tr.asoc td.num{font-weight:600;color:var(--t2)}
tbody tr.asoc td.nom{padding-left:26px;position:relative}
tbody tr.asoc td.nom::before{content:"↳";position:absolute;left:12px;color:var(--t3)}
.vinc{font-size:.82rem;color:var(--t2)}
.detalle{font-size:.82rem;color:var(--t2);white-space:normal;max-width:280px}
.filtros{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
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
    <h1>Abonados 2026/2027</h1>
    <span class="sp"></span>
    <button id="recargar">Recargar</button>
    <button id="csv">Descargar CSV</button>
    <button id="salir">Salir</button>
  </header>
  <main>
    <div class="kpis" id="kpis"></div>
    <div class="filtros">
      <input type="search" id="buscar" placeholder="Buscar por nombre, DNI, correo…">
      <label><input type="checkbox" id="solo-pendientes"> Solo pendientes de pago</label>
    </div>
    <div class="tabla-wrap"><table>
      <thead><tr>
        <th>Nº socio</th><th>Pagado</th><th>Nombre</th><th>Vínculo</th><th>Alta</th>
        <th>Modalidad</th><th>Pago</th><th>Importe</th><th>DNI/NIE</th><th>Nacimiento</th>
        <th>Móvil</th><th>Correo</th><th>Localidad</th><th>Imagen</th><th>Comunic.</th><th>Tutor/a</th>
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
    var soloPend = document.getElementById('solo-pendientes').checked;
    var lista = datos.filter(function(a){
      if (soloPend && a.pagado) return false;
      if (!q) return true;
      return [a.nombre,a.dni,a.email,a.telefono,a.localidad,a.modalidad,a.titular_nombre,String(a.id)]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });

    // Socios y abonos no son lo mismo: un abono Familiar son cuatro socios.
    // El dinero se cuenta sobre los titulares, que es donde está la cuota.
    var socios = datos.length;
    var titulares = datos.filter(function(a){return !a.titular_id;});
    var abonosPag = titulares.filter(function(a){return a.pagado;}).length;
    var euros = titulares.reduce(function(s,a){return s+(a.importe||0);},0);
    var cobrado = titulares.filter(function(a){return a.pagado;})
      .reduce(function(s,a){return s+(a.importe||0);},0);
    document.getElementById('kpis').innerHTML =
      kpi(socios,'Socios') + kpi(titulares.length,'Abonos') +
      kpi(abonosPag,'Abonos pagados') + kpi(titulares.length-abonosPag,'Pendientes') +
      kpi(cobrado+' €','Cobrado') + kpi(euros+' €','Comprometido');

    document.getElementById('cuerpo').innerHTML = lista.map(function(a){
      var tu = a.tutor ? esc(a.tutor.nombre)+'<br>'+esc(a.tutor.dni)+'<br>'+esc(a.tutor.telefono) : '';
      var asociado = !!a.titular_id;
      var vinculo = asociado
        ? '<span class="vinc">'+esc(a.parentesco)+' de '+esc(a.titular_nombre)+' (nº '+a.titular_id+')</span>'
        : '<span class="chip tit">Titular</span>';
      return '<tr class="'+(a.pagado?'pagado ':'')+(asociado?'asoc':'')+'">'+
        '<td class="num">'+a.id+'</td>'+
        '<td><button data-pagar="'+a.id+'" class="chip '+(a.pagado?'si':'no')+'">'+(a.pagado?'Sí':'No')+'</button></td>'+
        '<td class="nom">'+esc(a.nombre)+'</td>'+
        '<td class="detalle">'+vinculo+'</td>'+
        '<td>'+esc((a.creado||'').slice(0,10))+'</td>'+
        '<td>'+esc(a.modalidad)+'</td>'+
        '<td>'+esc(a.pago)+'</td>'+
        '<td>'+(a.importe ? esc(a.importe)+' €' : '—')+'</td>'+
        '<td>'+esc(a.dni)+'</td>'+
        '<td>'+esc(a.nacimiento)+'</td>'+
        '<td>'+esc(a.telefono)+'</td>'+
        '<td>'+esc(a.email)+'</td>'+
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
  document.getElementById('solo-pendientes').addEventListener('change', pintar);
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
