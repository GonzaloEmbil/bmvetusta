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

import { DESCARGAS_JS } from './descargas.js';
import { CAMPANAS_JS } from './campanas-panel.js';

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Abonados · Balonmano Vetusta</title>
<style>
*,*::before,*::after{box-sizing:border-box}
/* hidden tiene que ocultar siempre, aunque la regla del elemento le dé otro
   display (la caja de programar es flex y, sin esto, salía abierta). */
[hidden]{display:none!important}
:root{--t:#14161a;--t2:#4a5058;--t3:#7b828b;--l:#e2e5ea;--l2:#cbd1d9;--bg:#fff;--bg2:#f6f7f9;--ok:#17803d;--err:#c0392b}
body{margin:0;background:var(--bg);color:var(--t);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
/* Alto fijo de 77px: el mismo que el bloque del escudo en la barra lateral,
   para que la línea inferior de los dos quede a la misma altura. */
header{border-bottom:1px solid var(--l);padding:16px 22px;min-height:77px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
header h1{font-size:1.25rem;margin:0;font-weight:800;letter-spacing:-.3px}
/* Quién está dentro. Sólo aparece tras Access, que es cuando se sabe. */
.quien{font-size:.8rem;color:var(--t3);white-space:nowrap}
header .sp{flex:1}
#recargar{min-width:132px}
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
/* Cuatro columnas idénticas que reparten todo el ancho: mismo hueco entre
   árboles y el primero y el último a ras de los márgenes. Que las columnas
   sean iguales tiene un precio: el árbol de modalidad mete cuatro tarjetas
   donde los demás meten dos, así que las suyas salen más estrechas. */
.arboles{display:grid;grid-template-columns:minmax(0,1fr);gap:26px;margin-bottom:20px}
/* La raíz se centra sobre el grupo para que el tronco caiga por su eje. El
   alto mínimo iguala las cuatro: la del ARPU no lleva cifra, y sin él quedaría
   más baja y desalinearía su árbol respecto a los demás. */
.raiz{width:min(100%,186px);margin:0 auto;min-height:77px;display:flex;flex-direction:column;justify-content:center}
.raiz.sin-cifra span{font-size:.95rem;letter-spacing:.6px;color:var(--t)}
.tronco{width:0;height:11px;margin:0 auto;border-left:1px solid var(--l2)}
.ramas{display:grid;gap:10px;height:9px}
.ramas i{position:relative}
.ramas i::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px solid var(--l2)}
.ramas i::after{content:"";position:absolute;left:50%;right:calc(-10px - 50%);top:0;border-top:1px solid var(--l2)}
.ramas i:last-child::after{content:none}
.mods{display:grid;gap:10px}
.mods,.ramas{grid-template-columns:repeat(2,minmax(0,1fr))}
.mod{border:1px solid var(--l);border-radius:9px;padding:8px 11px;min-width:0}
.mod b{display:block;font-size:1.1rem;line-height:1.2}
/* Con cuatro columnas iguales, las tarjetas del árbol de modalidad son la
   mitad de anchas que las de los demás y «MATRIMONIO» no cabe en una línea.
   Se parte con guion en vez de desbordar el recuadro. */
.mod span{display:block;font-size:.7rem;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--t3);overflow-wrap:break-word;hyphens:auto}
/* Los cortes van a mano y no con auto-fit: seis y cuatro tarjetas se reparten
   bien en 2, 3 y 6 columnas, mientras que dejando decidir al navegador se
   quedaba una suelta al final de la fila. */
/* Los cortes miden el ancho de <main>, no el de la ventana: con la barra
   lateral el contenido es 220px más estrecho que la pantalla, y con media
   queries los árboles se apretarían justo en el tramo en que no caben. Los
   umbrales son los de antes menos el relleno de main (22px por lado). */
@container (min-width:576px){
  .kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
  /* Las ramas tienen que partir la fila igual que las tarjetas, o el raíl
     dejaría de caer sobre el centro de cada una. */
  .arbol:not(.dos) .mods,
  .arbol:not(.dos) .ramas{grid-template-columns:repeat(4,minmax(0,1fr))}
}

/* En estrecho las cuatro modalidades bajan a dos filas, y un árbol de una sola
   rama por columna dejaría el raíl colgando sobre la fila de arriba. Se
   retiran los trazos y queda el número como rótulo, que es lo que dicen. */
/* Los cuatro en fila sólo a partir de aquí. Con columnas iguales, el árbol de
   modalidad mete cuatro tarjetas donde los demás meten dos, y por debajo de
   este ancho sus rótulos empiezan a partirse en varias líneas. Antes que eso,
   mejor dos y dos, que da tarjetas holgadas. */
/* Los cuatro árboles, en una sola fila en cualquier pantalla de ordenador.
   Cada columna es proporcional a las tarjetas que cuelgan de ella (2, 4, 2
   y 2): así todas miden lo mismo y el árbol de modalidad no se aprieta, que
   es lo que pasaba con cuatro columnas iguales. El rótulo de las tarjetas
   crece y mengua con el ancho (cqi) para que «MATRIMONIO» o «POR ABONADO»
   quepan siempre en una línea. Por debajo de este ancho (tablet), un árbol
   debajo de otro. */
@container (min-width:880px){
  .arboles{grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr) minmax(0,1fr);column-gap:clamp(14px,2cqi,26px)}
  .mod{padding-left:clamp(6px,.7cqi,11px);padding-right:clamp(6px,.7cqi,11px)}
  .mod span{font-size:clamp(.5rem,.88cqi,.7rem);letter-spacing:.2px;white-space:nowrap}
}
@container (max-width:575px){
  .tronco,.ramas{display:none}
  .raiz{text-align:left}
}
/* Tabla */
/* El scroll lateral se queda sólo como red de seguridad: lo normal es que la
   tabla se encoja hasta caber, y sólo si tuviera que encogerse tanto que
   dejara de leerse se permite arrastrarla. */
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
/* En escritorio el vínculo vive en el título emergente de la etiqueta; en
   táctil no hay forma de sacarlo, así que allí se escribe. */
.vinc-tactil{display:none}
.detalle{font-size:.82rem;color:var(--t2);white-space:normal;min-width:200px;max-width:280px}
.vacio{color:var(--t3)}
th[title]{cursor:help;text-decoration:underline dotted 1px;text-underline-offset:3px}
/* Dinero a la izquierda y buscador a la derecha, alineados por abajo para que
   el borde inferior del campo case con el de las tarjetas. El margen
   automático es lo que lo empuja al extremo derecho. */
.fila-mods{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}
.filtros{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-left:auto}

/* ── Móvil ────────────────────────────────────────────────────────────────
   Dieciséis columnas no caben en un teléfono por mucho que se encojan, así
   que la tabla se deshace: cada fila pasa a ser una ficha y cada celda una
   línea de «etiqueta … valor». La etiqueta sale del data-k de la celda, de
   modo que la cabecera de la tabla y las fichas no pueden desincronizarse:
   son el mismo HTML. */
@media (max-width: 768px){
  main{padding:14px}
  header{padding:14px 16px;gap:10px}
  header{min-height:0}
  header h1{font-size:1.1rem}
  /* El separador deja de empujar: los botones bajan a su propia línea. */
  header .sp{flex-basis:100%;height:0}
  .quien{flex-basis:100%;order:1}
  header button{flex:1 1 0;padding:9px 8px;font-size:.82rem;white-space:nowrap}
  #recargar{min-width:0}

  .filtros{margin-left:0;width:100%}
  .filtros input{width:100%;min-width:0}

  .tabla-wrap{border:0;border-radius:0;overflow:visible}
  table{font-size:.9rem}
  thead{display:none}

  tbody tr{
    display:flex;
    flex-direction:column;
    border:1px solid var(--l);
    border-radius:12px;
    padding:12px 14px;
    margin-bottom:10px;
  }
  tbody tr.asoc{margin-left:14px}
  tbody tr.asoc td.nom{padding-left:0}
  tbody tr.asoc td.nom::before{content:none}

  tbody td{
    order:2;          /* número y nombre se adelantan; el resto, en su orden */
    display:flex;
    justify-content:space-between;
    align-items:baseline;
    gap:14px;
    padding:4px 0;
    border:0;
    white-space:normal;
    text-align:right;
    min-width:0;
  }

  tbody td::before{
    content:attr(data-k);
    flex:0 0 auto;
    font-size:.68rem;
    font-weight:700;
    letter-spacing:.8px;
    text-transform:uppercase;
    color:var(--t3);
    text-align:left;
  }

  /* Número y nombre hacen de titular de la ficha: sin etiqueta y en grande. */
  tbody td.num{order:0}
  tbody td.nom{order:1}
  tbody td.num,
  tbody td.nom{display:block;text-align:left;padding:0}
  tbody td.num::before,
  tbody td.nom::before{content:none}
  tbody td.num{font-size:1.35rem;line-height:1.1}
  tbody td.nom{font-size:1rem;font-weight:600;padding-bottom:8px;border-bottom:1px solid var(--l);margin-bottom:8px}

  /* Las filas sin dato no ocupan sitio: una ficha con ocho rayas no dice nada. */
  tbody td:has(> .vacio:only-child){display:none}

  .detalle{max-width:none;min-width:0;text-align:right}

  .chip.aso{cursor:default}
  .vinc-tactil{display:block;font-size:.82rem;color:var(--t2);padding-top:4px}
}
.filtros input{padding:9px 12px;border:1.5px solid var(--l2);border-radius:9px;font:inherit;min-width:220px}
/* Barra lateral: una entrada por sección del área privada (de momento sólo
   Abonados) y, colgando de cada una, sus subpestañas. El menú se queda fijo
   al bajar por la tabla, que es larga. */
.cuerpo{display:flex;align-items:flex-start;min-height:100vh}
/* Ocupa todo el alto y se queda quieta al bajar por la tabla. */
.lateral{flex:0 0 200px;position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--bg2);border-right:1px solid var(--l);padding:0 12px 18px}
.marca{display:flex;align-items:center;gap:10px;height:77px;margin:0 -12px 16px;padding:0 20px;border-bottom:1px solid var(--l);font-weight:800;font-size:1.05rem;letter-spacing:-.2px}
.marca .escudo{width:40px;height:40px;display:block;flex:0 0 auto}
.columna{flex:1 1 auto;min-width:0}
.lateral .seccion{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;padding:9px 12px;border-radius:9px;font-weight:800;color:var(--t);text-align:left}
.lateral .seccion:hover{background:#eceef2}
.lateral .seccion svg{flex:0 0 auto}
.lateral .subs{display:flex;flex-direction:column;gap:2px;margin:4px 0 0 21px;padding-left:12px;border-left:1px solid var(--l2)}
.lateral .sub{border:0;background:none;text-align:left;padding:7px 12px;border-radius:8px;color:var(--t2);font-weight:600}
.lateral .sub:hover{background:#eceef2;color:var(--t)}
.lateral .sub[aria-current="page"]{background:var(--t);color:#fff}
main{container-type:inline-size}
/* Filtro de renovación: tres opciones excluyentes en una sola pieza. */
.segmento{display:inline-flex;border:1.5px solid var(--l2);border-radius:9px;overflow:hidden}
.segmento button{border:0;border-radius:0;padding:8px 13px;font-size:.85rem}
.segmento button+button{border-left:1.5px solid var(--l2)}
.segmento button.on{background:var(--t);color:#fff}
.kpis.cuatro{max-width:820px}
.lateral .grupo+.grupo{margin-top:18px}
/* Campañas */
.barra-campanas{display:flex;justify-content:flex-end;margin-bottom:16px}
.fila-campana{cursor:pointer}
.fila-campana:hover td{background:var(--bg2)}
.chip.prog{background:#fff8d6;border-color:#eadb85;color:#6b5a00}
.chip.borr{background:var(--bg2);color:var(--t2)}
.editor{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:26px;align-items:start}
.editor-previa{position:sticky;top:18px;background:var(--bg2);border:1px solid var(--l);border-radius:12px;padding:14px}
.previa-asunto{margin:0 0 10px;font-weight:700;font-size:.92rem}
.previa{border-radius:10px;overflow:hidden}
.campo{display:block;margin:0 0 18px;border:0;padding:0;min-width:0}
.campo>span,.campo legend{display:block;font-size:.72rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--t3);margin-bottom:6px;padding:0}
.campo input[type=text],.campo textarea,.programar input{width:100%;padding:10px 12px;border:1.5px solid var(--l2);border-radius:9px;font:inherit;background:var(--bg)}
.campo input:focus,.campo textarea:focus,.programar input:focus{outline:none;border-color:var(--t);box-shadow:0 0 0 3px rgba(20,22,26,.12)}
.campo textarea{resize:vertical;min-height:220px;line-height:1.5}
.campo input:disabled,.campo textarea:disabled{background:var(--bg2);color:var(--t2)}
.check{display:flex;align-items:center;gap:8px;margin:4px 0;font-weight:600}
.total{margin:6px 0 0;font-size:.85rem;color:var(--t2)}
.herramientas{display:flex;gap:6px;margin-bottom:6px}
.herramientas button{padding:5px 11px;font-size:.85rem}
.fila2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:8px}
.acciones{display:flex;flex-wrap:wrap;gap:8px}
.programar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.programar input{width:auto}
.nota{font-size:.8rem;color:var(--t3)}
.aviso{background:#fff8d6;border:1px solid #eadb85;border-radius:10px;padding:10px 14px;font-size:.9rem;margin:0 0 18px}
.imagen-caja{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.imagen-caja img{height:56px;border-radius:8px;border:1px solid var(--l)}
/* Formulario y vista previa, uno al lado del otro sólo si caben los dos. */
@container (max-width:900px){ .editor{grid-template-columns:minmax(0,1fr)} .editor-previa{position:static} }
dialog#descarga{border:0;border-radius:16px;padding:0;width:min(92vw,420px);color:var(--t);box-shadow:0 24px 64px rgba(0,0,0,.28)}
dialog#descarga::backdrop{background:rgba(20,22,26,.45)}
#descarga .caja{padding:24px}
#descarga h2{margin:0 0 4px;font-size:1.15rem}
.descarga-que{margin:0 0 18px;color:var(--t3);font-size:.88rem}
.formatos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}
.formatos button{padding:14px 8px;border-radius:12px;font-size:1rem;font-weight:700}
.formatos button:hover{border-color:var(--t);background:var(--bg2)}
#descarga .cancelar{width:100%;border:0;background:none;color:var(--t3)}
#descarga .cancelar:hover{color:var(--t)}
@container (min-width:576px){ .kpis.cuatro{grid-template-columns:repeat(4,minmax(0,1fr))} }
@media (max-width: 768px){
  /* En el móvil la barra pasa arriba: la sección como rótulo y sus
     subpestañas en una fila, a partes iguales. */
  .cuerpo{flex-direction:column;align-items:stretch;min-height:0}
  .lateral{position:static;height:auto;flex:none;border-right:0;border-bottom:1px solid var(--l);padding:0 16px 12px}
  .marca{height:auto;margin:0 -16px 12px;padding:12px 16px}
  .marca .escudo{width:32px;height:32px}
  .lateral .seccion{padding:0 0 10px;font-size:.92rem}
  .lateral .seccion:hover{background:none}
  .lateral .subs{flex-direction:row;gap:8px;margin:0;padding:0;border:0}
  .lateral .sub{flex:1 1 0;text-align:center;border:1.5px solid var(--l2);padding:8px 6px}
  .lateral .sub[aria-current="page"]{border-color:var(--t)}
  .segmento{width:100%}
  .segmento button{flex:1 1 0;padding:9px 4px;font-size:.8rem}
}
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
  <div class="cuerpo">
  <aside class="lateral">
    <div class="marca">
      <img class="escudo" src="${ESCUDO}" alt="Balonmano Vetusta" width="40" height="40">
      <span>Área privada</span>
    </div>
    <nav aria-label="Secciones">
      <div class="grupo">
      <button class="seccion" data-ir="actual">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Abonados
      </button>
      <div class="subs">
        <button class="sub" id="tab-actual" data-vista="actual" aria-controls="vista-actual" aria-current="page">2026/2027</button>
        <button class="sub" id="tab-anterior" data-vista="anterior" aria-controls="vista-anterior">2025/2026</button>
      </div>
      </div>
      <!-- Sólo tras Access: las campañas no existen en el panel antiguo. -->
      <div class="grupo" id="sec-campanas">
      <button class="seccion" data-ir="campanas">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
        Campañas
      </button>
      <div class="subs">
        <button class="sub" id="tab-editor" data-vista="editor" aria-controls="vista-editor">Nueva campaña</button>
        <button class="sub" id="tab-campanas" data-vista="campanas" aria-controls="vista-campanas">Historial</button>
      </div>
      </div>
    </nav>
  </aside>
  <div class="columna">
  <header>
    <h1 id="titulo">Abonados 2026/2027</h1>
    <span class="sp"></span>
    <span class="quien" id="quien" hidden></span>
    <button id="recargar">Recargar</button>
    <button id="descargar">Descargar</button>
    <button id="salir">Salir</button>
  </header>
  <main>
  <section id="vista-actual" aria-label="Abonados 2026/2027">
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
  </section>
  <!-- Socios de la temporada pasada, importados de Cluber. Sólo lectura: la
       columna que importa es si han renovado este año. -->
  <section id="vista-anterior" aria-label="Abonados 2025/2026" hidden>
    <div class="resumen">
      <div class="arboles">
        <div class="arbol dos">
          <div class="kpi raiz"><b id="raiz-abonados-ant">0</b><span>Abonados</span></div>
          <div class="tronco"></div>
          <div class="ramas"><i></i><i></i></div>
          <div class="mods" id="tipos-ant"></div>
        </div>
        <div class="arbol">
          <div class="kpi raiz"><b id="raiz-compras-ant">0</b><span>Compras</span></div>
          <div class="tronco"></div>
          <div class="ramas"><i></i><i></i><i></i><i></i></div>
          <div class="mods" id="mods-ant"></div>
        </div>
        <div class="arbol dos">
          <div class="kpi raiz"><b id="raiz-ingresos-ant">0</b><span>Ingresos</span></div>
          <div class="tronco"></div>
          <div class="ramas"><i></i><i></i></div>
          <div class="mods" id="ingresos-ant"></div>
        </div>
        <div class="arbol dos">
          <div class="kpi raiz sin-cifra"><span>ARPU</span></div>
          <div class="tronco"></div>
          <div class="ramas"><i></i><i></i></div>
          <div class="mods" id="arpus-ant"></div>
        </div>
      </div>
      <div class="fila-mods">
        <div class="segmento" role="group" aria-label="Filtrar por renovación">
          <button data-filtro="todos" class="on">Todos</button><button data-filtro="si">Han renovado</button><button data-filtro="no">No han renovado</button>
        </div>
        <div class="filtros">
          <input type="search" id="buscar-anterior" placeholder="Buscar por nombre, DNI, correo…">
        </div>
      </div>
    </div>
    <div class="tabla-wrap"><table>
      <thead><tr>
        <th title="Número de socio que tenía en Cluber">Nº socio</th><th>Pagado</th><th>Nombre</th><th>Vínculo</th><th>Alta</th>
        <th>Modalidad</th><th>Pago</th><th>Importe</th><th>DNI/NIE</th><th>Nacimiento</th>
        <th>Móvil</th><th>Correo</th><th>Localidad</th><th>Imagen</th><th>Comunic.</th><th>Tutor/a legal</th>
      </tr></thead>
      <tbody id="cuerpo-anterior"></tbody>
    </table></div>
    <p class="msg" id="anterior-msg"></p>
  </section>

  <section id="vista-campanas" aria-label="Campañas" hidden>
    <div class="barra-campanas">
      <button class="pri" id="nueva-campana">Nueva campaña</button>
    </div>
    <div class="tabla-wrap"><table>
      <thead><tr>
        <th>Fecha</th><th>Asunto</th><th>Destinatarios</th><th>Estado</th><th>Enviados</th><th>Fallidos</th><th>Bajas</th>
      </tr></thead>
      <tbody id="cuerpo-campanas"></tbody>
    </table></div>
    <p class="msg" id="campanas-msg"></p>
  </section>

  <section id="vista-editor" aria-label="Campaña" hidden>
    <div class="editor">
      <div class="editor-form">
        <p class="aviso" id="editor-aviso" hidden></p>
        <label class="campo"><span>Asunto</span><input type="text" id="c-asunto" maxlength="150"></label>
        <fieldset class="campo">
          <legend>Destinatarios</legend>
          <label class="check"><input type="checkbox" id="c-actuales"> <span id="c-actuales-txt">Abonados</span></label>
          <label class="check"><input type="checkbox" id="c-anteriores"> <span id="c-anteriores-txt">Socios</span></label>
          <p class="total" id="c-total"></p>
        </fieldset>
        <div class="campo">
          <span>Imagen</span>
          <div class="imagen-caja">
            <img id="c-imagen-min" alt="" hidden>
            <button type="button" id="c-imagen-subir">Subir imagen</button>
            <button type="button" id="c-imagen-quitar" hidden>Quitar</button>
            <input type="file" id="c-imagen-archivo" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            <span class="nota" id="c-imagen-nota"></span>
          </div>
        </div>
        <div class="campo">
          <span>Texto</span>
          <div class="herramientas">
            <button type="button" data-formato-texto="negrita" title="Negrita"><b>B</b></button>
            <button type="button" data-formato-texto="enlace">Enlace</button>
          </div>
          <textarea id="c-texto" rows="12"></textarea>
        </div>
        <div class="campo">
          <span>Botón (opcional)</span>
          <div class="fila2">
            <input type="text" id="c-boton-texto" maxlength="40" placeholder="Texto del botón">
            <input type="text" id="c-boton-url" placeholder="https://…">
          </div>
        </div>
        <div class="acciones">
          <button type="button" id="c-guardar">Guardar borrador</button>
          <button type="button" id="c-prueba">Enviarme una prueba</button>
          <button type="button" id="c-programar">Programar…</button>
          <button type="button" class="pri" id="c-enviar">Enviar ahora</button>
          <button type="button" id="c-cancelar" hidden>Cancelar programación</button>
          <button type="button" id="c-duplicar" hidden>Duplicar</button>
          <button type="button" id="c-borrar" hidden>Borrar</button>
        </div>
        <div class="programar" id="c-programar-caja" hidden>
          <input type="datetime-local" id="c-cuando">
          <button type="button" class="pri" id="c-programar-ok">Programar</button>
          <span class="nota">Sale en los 5 minutos siguientes a la hora elegida.</span>
        </div>
        <p class="msg" id="editor-msg"></p>
      </div>
      <div class="editor-previa">
        <p class="previa-asunto" id="c-previa-asunto"></p>
        <div class="previa" id="c-previa"></div>
      </div>
    </div>
  </section>
  </main>
  </div>
  </div>
</div>

<!-- Elección de formato. El contenido va en un div interior para que un clic
     en el fondo oscuro (fuera de la caja) se distinga de uno dentro. -->
<dialog id="descarga" aria-labelledby="descarga-titulo">
  <div class="caja">
    <h2 id="descarga-titulo">Descargar listado</h2>
    <p class="descarga-que" id="descarga-que"></p>
    <div class="formatos">
      <button data-formato="csv">CSV</button>
      <button data-formato="excel">Excel</button>
      <button data-formato="pdf">PDF</button>
    </div>
    <button class="cancelar" id="descarga-cancelar">Cancelar</button>
  </div>
</dialog>

<script>
(function(){
  'use strict';
  // La sesión se guarda en sessionStorage: muere al cerrar la pestaña y no se
  // envía sola en peticiones de otros sitios, al contrario que una cookie.
  var SES = 'bmv_admin_ses';
  var datos = [];
  var anteriores = [];
  var filtroAnterior = 'todos';

  // Los rellena el servidor al servir la página. Tras Access la identidad ya
  // está resuelta, así que no hay pantalla de clave ni sesión que guardar.
  var POR_ACCESS = __POR_ACCESS__;
  var CORREO = __CORREO__;

  function ses(){ try { return sessionStorage.getItem(SES) || ''; } catch(e){ return ''; } }
  function guardar(v){ try { v ? sessionStorage.setItem(SES,v) : sessionStorage.removeItem(SES); } catch(e){} }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function api(ruta, opts){
    opts = opts || {};
    // Tras Access la autorización viaja en su propia cookie, que el navegador
    // manda sola: añadir una cabecera nuestra aquí no pintaría nada.
    if (!POR_ACCESS) {
      opts.headers = Object.assign({'Authorization':'Bearer '+ses()}, opts.headers||{});
    }
    return fetch(ruta, opts).then(function(r){
      if (r.status === 401) {
        if (POR_ACCESS) { location.reload(); throw new Error('401'); }
        guardar(''); pintarAcceso('La sesión ha caducado.'); throw new Error('401');
      }
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

  // Pide las dos temporadas y devuelve si ambas han llegado bien, para que
  // el botón Recargar pueda decirlo.
  function cargar(){
    var m = document.getElementById('panel-msg');
    m.className='msg'; m.textContent='Cargando…';
    var actual = api('/admin/datos').then(function(r){ return r.json(); }).then(function(j){
      datos = j.abonados || [];
      m.textContent = '';
      pintar();
      return true;
    }).catch(function(){ m.className='msg bad'; m.textContent='No se han podido cargar los datos.'; return false; });
    return Promise.all([actual, cargarAnteriores(), POR_ACCESS ? cargarCampanas() : true])
      .then(function(r){ return r.every(Boolean); });
  }

  function cargarAnteriores(){
    var m = document.getElementById('anterior-msg');
    m.className='msg'; m.textContent='Cargando…';
    return api('/admin/anteriores').then(function(r){ return r.json(); }).then(function(j){
      anteriores = j.socios || [];
      m.textContent = '';
      pintarAnteriores();
      return true;
    }).catch(function(){ m.className='msg bad'; m.textContent='No se han podido cargar los socios de la temporada pasada.'; return false; });
  }

  // Socios de 2025/26. El servidor ya trae resuelto si han renovado: el nº
  // de abonado que tienen este año, o null.
  function pintarAnteriores(){
    // Mismos indicadores y columnas que 2026/27. El verde marca a quien pagó
    // (lo dice el informe de cargos de Cluber). Nacimiento y tutor no los
    // guardaba Cluber: salen vacíos.
    pintarResumen('-ant', anteriores, function(s){ return !s.titular; });
    var lista = listaAnterior();

    document.getElementById('cuerpo-anterior').innerHTML = lista.map(function(s){
      var asociado = !!s.titular;
      var vinculo = asociado
        ? '<span class="chip aso" title="En el abono de '+esc(s.titular)+'">Asociado</span>'+
          '<span class="vinc-tactil">En el abono de '+esc(s.titular)+'</span>'
        : '<span class="chip tit">Titular</span>';
      return '<tr class="'+(s.pagado?'pagado ':'')+(asociado?'asoc':'')+'">'+
        '<td class="num" data-k="Nº socio">'+(s.numero ? esc(s.numero) : '<span class="vacio">—</span>')+'</td>'+
        '<td data-k="Pagado"><span class="chip '+(s.pagado?'si':'no')+'"'+(s.fecha_pago ? ' title="Pagado el '+fechaSuelta(s.fecha_pago)+'"' : '')+'>'+(s.pagado?'Sí':'No')+'</span></td>'+
        '<td class="nom" data-k="Nombre">'+esc(s.nombre)+'</td>'+
        '<td data-k="Vínculo">'+vinculo+'</td>'+
        '<td data-k="Alta">'+(s.alta ? fechaSuelta(s.alta) : '<span class="vacio">—</span>')+'</td>'+
        '<td data-k="Modalidad">'+dato(s.modalidad)+'</td>'+
        '<td data-k="Pago">'+dato(s.pago)+'</td>'+
        '<td data-k="Importe">'+(s.importe ? esc(s.importe)+' €' : '<span class="vacio">—</span>')+'</td>'+
        '<td data-k="DNI/NIE">'+dato(s.dni)+'</td>'+
        '<td data-k="Nacimiento"><span class="vacio">—</span></td>'+
        '<td data-k="Móvil">'+dato(s.telefono)+'</td>'+
        '<td data-k="Correo">'+dato(s.email)+'</td>'+
        '<td data-k="Localidad">'+dato(s.localidad)+'</td>'+
        '<td data-k="Imagen">'+dato(s.imagen)+'</td>'+
        '<td data-k="Comunic.">'+dato(s.comunicaciones)+'</td>'+
        '<td class="detalle" data-k="Tutor/a legal"><span class="vacio">—</span></td>'+
        '</tr>';
    }).join('') || '<tr><td colspan="16" style="padding:22px;color:#7b828b">'+
      (anteriores.length ? 'Nadie coincide con la búsqueda.' : 'No hay socios de la temporada pasada.')+'</td></tr>';

    encajarTabla();
  }

  // Subpestañas de la barra lateral. La activa se apunta en la dirección
  // (#2025-26) para que al recargar la página se vuelva a la misma.
  var VISTAS = {
    actual:   { tab: 'tab-actual',   titulo: 'Abonados 2026/2027', hash: '' },
    anterior: { tab: 'tab-anterior', titulo: 'Abonados 2025/2026', hash: '#2025-26' },
    campanas: { tab: 'tab-campanas', titulo: 'Campañas',           hash: '#campanas' },
    editor:   { tab: 'tab-editor',   titulo: 'Nueva campaña',      hash: '#nueva' }
  };

  function mostrar(vista){
    // Una campaña ya guardada se abre desde el historial: se marca esa
    // subpestaña, no la de «Nueva campaña».
    var existente = vista === 'editor' && typeof editando !== 'undefined' && editando && editando.id;
    Object.keys(VISTAS).forEach(function(v){
      document.getElementById('vista-'+v).hidden = v !== vista;
      document.getElementById(VISTAS[v].tab).removeAttribute('aria-current');
    });
    document.getElementById(existente ? 'tab-campanas' : VISTAS[vista].tab).setAttribute('aria-current', 'page');
    document.getElementById('titulo').textContent = existente ? 'Campaña' : VISTAS[vista].titulo;
    // Descargar es de los listados de abonados.
    document.getElementById('descargar').hidden = vista === 'campanas' || vista === 'editor';
    try { history.replaceState(null, '', existente ? '#campanas' : (VISTAS[vista].hash || location.pathname + location.search)); } catch(e){}
    encajarTabla();
  }

  // Lo que se ve en cada pestaña con su búsqueda y su filtro. Lo usan la
  // tabla y las descargas, que así bajan exactamente lo que hay en pantalla.
  function listaActual(){
    var q = document.getElementById('buscar').value.toLowerCase().trim();
    return datos.filter(function(a){
      if (!q) return true;
      return [a.nombre,a.dni,a.email,a.telefono,a.localidad,a.modalidad,a.titular_nombre,String(a.id)]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  function listaAnterior(){
    var q = document.getElementById('buscar-anterior').value.toLowerCase().trim();
    return anteriores.filter(function(s){
      if (filtroAnterior === 'si' && !s.renovado) return false;
      if (filtroAnterior === 'no' && s.renovado) return false;
      if (!q) return true;
      return [s.nombre,s.dni,s.email,s.telefono,s.localidad,s.titular,String(s.numero||'')]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  // Los cuatro árboles de indicadores. Sirve para las dos temporadas: sufijo
  // elige los elementos ('' para 2026/27, '-ant' para 2025/26) y esTitular
  // dice quién lleva la cuota en cada una.
  //
  // Personas frente a compras: un abono Familiar es UNA compra y CUATRO
  // abonados. El dinero se cuenta sólo en los titulares, que son quienes
  // llevan el importe; si se sumaran todas las filas saldría multiplicado.
  function pintarResumen(sufijo, filas, esTitular){
    var abonados = filas.length;
    var titulares = filas.filter(esTitular);
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
    document.getElementById('arpus'+sufijo).innerHTML =
      tarjeta(eur(arpu), 'Por abonado') + tarjeta(eur(arpuCompra), 'Por compra');

    // La modalidad es del abono, no de la persona: un Familiar es UNA venta.
    // Se listan las cuatro siempre, aunque estén a cero, para que se vea el
    // reparto de un vistazo y no sólo lo que se ha vendido.
    document.getElementById('mods'+sufijo).innerHTML = MODALIDADES.map(function(m){
      return tarjeta(titulares.filter(function(a){return a.modalidad === m;}).length, m);
    }).join('');

    // Aquí se cuentan personas, no ventas: cuántas compraron el abono y
    // cuántas van incluidas en el de otra persona. Los titulares coinciden
    // con las compras, porque cada compra tiene exactamente un titular.
    document.getElementById('tipos'+sufijo).innerHTML =
      tarjeta(titulares.length, 'Titular') +
      tarjeta(abonados - titulares.length, 'Asociado');

    document.getElementById('ingresos'+sufijo).innerHTML =
      tarjeta(cobrado + ' €', 'Cobrado') +
      tarjeta(porCobrar + ' €', 'Por cobrar');

    document.getElementById('raiz-compras'+sufijo).textContent = titulares.length;
    document.getElementById('raiz-abonados'+sufijo).textContent = abonados;
    document.getElementById('raiz-ingresos'+sufijo).textContent = euros + ' €';
  }

  function pintar(){
    var lista = listaActual();
    pintarResumen('', datos, function(a){ return !a.titular_id; });
    document.getElementById('cuerpo').innerHTML = lista.map(function(a){
      var tu = a.tutor ? esc(a.tutor.nombre)+'<br>'+esc(a.tutor.dni)+'<br>'+esc(a.tutor.telefono) : '<span class="vacio">—</span>';
      var asociado = !!a.titular_id;
      var vinculo = asociado
        ? '<span class="chip aso" title="'+esc(a.parentesco)+' del abonado nº '+a.titular_id+'">Asociado</span>'+
          '<span class="vinc-tactil">'+esc(a.parentesco)+' del abonado nº '+a.titular_id+'</span>'
        : '<span class="chip tit">Titular</span>';
      // data-k lleva el nombre de la columna. En pantalla ancha no se usa; en
      // móvil, donde la tabla se deshace en fichas y la cabecera desaparece,
      // es lo que pone la etiqueta delante de cada dato.
      return '<tr class="'+(a.pagado?'pagado ':'')+(asociado?'asoc':'')+'">'+
        '<td class="num" data-k="Nº socio">'+a.id+'</td>'+
        '<td data-k="Pagado"><button data-pagar="'+a.id+'" class="chip '+(a.pagado?'si':'no')+'">'+(a.pagado?'Sí':'No')+'</button></td>'+
        '<td class="nom" data-k="Nombre">'+esc(a.nombre)+'</td>'+
        '<td data-k="Vínculo">'+vinculo+'</td>'+
        '<td data-k="Alta">'+fecha(a.creado)+'</td>'+
        '<td data-k="Modalidad">'+esc(a.modalidad)+'</td>'+
        '<td data-k="Pago">'+esc(a.pago)+'</td>'+
        '<td data-k="Importe">'+(a.importe ? esc(a.importe)+' €' : '<span class="vacio">—</span>')+'</td>'+
        '<td data-k="DNI/NIE">'+esc(a.dni)+'</td>'+
        '<td data-k="Nacimiento">'+fechaSuelta(a.nacimiento)+'</td>'+
        '<td data-k="Móvil">'+dato(a.telefono)+'</td>'+
        '<td data-k="Correo">'+dato(a.email)+'</td>'+
        '<td data-k="Localidad">'+esc(a.localidad)+'</td>'+
        '<td data-k="Imagen">'+esc(a.imagen)+'</td>'+
        '<td data-k="Comunic.">'+esc(a.comunicaciones)+'</td>'+
        '<td class="detalle" data-k="Tutor/a legal">'+tu+'</td>'+
        '</tr>';
    }).join('') || '<tr><td colspan="16" style="padding:22px;color:#7b828b">Todavía no hay altas.</td></tr>';

    document.querySelectorAll('[data-pagar]').forEach(function(b){
      b.addEventListener('click', function(){ alternarPago(parseInt(b.dataset.pagar,10), b); });
    });

    encajarTabla();
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

  // La tabla tiene dieciséis columnas y rara vez cabe. En vez de dejar que se
  // arrastre de lado —que obliga a perder de vista el nombre para ver el
  // correo—, se reduce lo justo para que entre entera, como un zoom del
  // navegador pero sólo sobre la tabla.
  //
  // Se usa zoom y no transform:scale porque zoom recalcula la maquetación:
  // con scale, el hueco que ocupaba la tabla sin escalar se quedaría vacío
  // debajo y habría que compensarlo a mano.
  var MINIMO = 0.62;   // por debajo de esto ya no se lee: mejor arrastrarla

  // Hay una tabla por pestaña; la oculta mide cero y se deja como está, y se
  // encaja al mostrarla.
  function encajarTabla(){
    document.querySelectorAll('.tabla-wrap').forEach(function(env){
      var tabla = env.querySelector('table');
      if (!tabla || !env.offsetParent) return;
      tabla.style.zoom = '';
      // En móvil la tabla se deshace en fichas: no hay nada que encoger.
      if (window.innerWidth <= 768) return;
      var natural = env.scrollWidth, hueco = env.clientWidth;
      if (!natural || !hueco) return;
      var k = hueco / natural;
      tabla.style.zoom = k >= 1 ? '' : Math.max(k, MINIMO);
    });
  }

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

  // Al cambiar el ancho de la ventana hay que volver a medir. Se espera a que
  // el arrastre del ratón pare, o se recalcularía en cada píxel.
  var temporizador;
  window.addEventListener('resize', function(){
    clearTimeout(temporizador);
    temporizador = setTimeout(encajarTabla, 120);
  });

  // Recargar vuelve a pedir los datos al servidor. Si nada ha cambiado, la
  // pantalla queda igual, así que el propio botón dice que lo ha hecho.
  document.getElementById('recargar').addEventListener('click', function(){
    var b = this;
    b.disabled = true; b.textContent = 'Recargando…';
    cargar().then(function(ok){
      b.textContent = ok ? 'Actualizado ✓' : 'Error ✕';
      setTimeout(function(){ b.textContent = 'Recargar'; b.disabled = false; }, ok ? 1500 : 2500);
    });
  });
  document.getElementById('buscar').addEventListener('input', pintar);
  document.getElementById('buscar-anterior').addEventListener('input', pintarAnteriores);
  document.querySelectorAll('.lateral [data-vista]').forEach(function(b){
    b.addEventListener('click', function(){
      if (b.dataset.vista === 'editor') nuevaCampana(); else mostrar(b.dataset.vista);
    });
  });
  // La sección lleva a su primera subpestaña, la temporada en curso.
  document.querySelectorAll('.lateral [data-ir]').forEach(function(b){
    b.addEventListener('click', function(){ mostrar(b.dataset.ir); });
  });
  document.querySelectorAll('.segmento [data-filtro]').forEach(function(b){
    b.addEventListener('click', function(){
      filtroAnterior = b.dataset.filtro;
      document.querySelectorAll('.segmento [data-filtro]').forEach(function(x){
        x.classList.toggle('on', x === b);
      });
      pintarAnteriores();
    });
  });
  document.getElementById('salir').addEventListener('click', function(){
    if (POR_ACCESS) { location.href = '/cdn-cgi/access/logout'; return; }
    guardar(''); pintarAcceso('');
    document.getElementById('login').hidden = false;
  });

${DESCARGAS_JS}
${CAMPANAS_JS}
  if (!POR_ACCESS) document.getElementById('sec-campanas').hidden = true;
  if (location.hash === '#2025-26') mostrar('anterior');
  else if (POR_ACCESS && location.hash === '#campanas') mostrar('campanas');
  else if (POR_ACCESS && location.hash === '#nueva') nuevaCampana();

  if (POR_ACCESS && CORREO) {
    var q = document.getElementById('quien');
    q.textContent = CORREO;
    q.hidden = false;
  }

  if (POR_ACCESS || ses()) abrirPanel(); else pintarAcceso('');
})();
</script>
</body>
</html>`;
