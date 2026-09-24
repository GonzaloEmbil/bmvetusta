/**
 * Altas de abonado/a · Balonmano Vetusta
 * Cloudflare Worker. Recibe el formulario de /abonate/alta.html, valida en
 * servidor, guarda en D1 y avisa por correo.
 *
 * Rutas:
 *   POST /alta          → alta nueva. Devuelve { ok: true, numero }
 *   GET  /export.csv    → listado completo. Requiere ?token=ADMIN_TOKEN
 *   GET  /              → comprobación de vida
 */

import { ADMIN_HTML } from './admin.js';
import { correoAlta } from './correo.js';
import { accesoValido } from './acceso.js';
import { TEMPORADA, TEMPORADA_ANTERIOR } from './temporadas.js';
import { rutasCampanas, rutasPublicas, campanasProgramadas } from './campanas.js';

const PRIVADO = 'admin.balonmanovetusta.com';

const PRECIOS = { 'Sub 18': 20, 'Adulto': 40, 'Matrimonio': 70, 'Familiar': 90 };

// ── Validación (repetida aquí a propósito: el cliente se puede saltar) ──────

function dniValido(v) {
  const s = String(v || '').toUpperCase().replace(/[\s-]/g, '');
  const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(s);
  if (!m) return false;
  const num = (m[1] ? String('XYZ'.indexOf(m[1])) : '') + m[2];
  if (num.length !== 8) return false;
  return 'TRWAGMYFPDXBNJZSQVHLCKE'[parseInt(num, 10) % 23] === m[3];
}

function edad(iso) {
  const d = new Date(String(iso) + 'T00:00:00Z');
  if (isNaN(d)) return null;
  const hoy = new Date();
  let a = hoy.getUTCFullYear() - d.getUTCFullYear();
  const m = hoy.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && hoy.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

const texto = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);
const fechaOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

function validar(d) {
  const e = [];
  if (!PRECIOS[d.modalidad]) e.push('modalidad');
  ['nombre', 'localidad'].forEach((k) => { if (!texto(d[k])) e.push(k); });
  // El formulario recoge nombre y apellidos en un único campo, así que se
  // exige que traiga al menos dos palabras.
  if (texto(d.nombre).split(/\s+/).filter(Boolean).length < 2) e.push('nombre');
  if (!dniValido(d.dni)) e.push('dni');
  if (!fechaOk(d.nacimiento)) e.push('nacimiento');
  const años = edad(d.nacimiento);
  if (años === null || años < 0 || años > 120) e.push('nacimiento');
  if (!/^[0-9]{9}$/.test(texto(d.telefono).replace(/[\s()+-]/g, '').replace(/^34/, ''))) e.push('telefono');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto(d.email))) e.push('email');
  if (!['Transferencia', 'Presencial'].includes(d.pago)) e.push('pago');
  if (!['Sí', 'No'].includes(d.imagen)) e.push('imagen');
  if (!['Sí', 'No'].includes(d.comunicaciones)) e.push('comunicaciones');

  // Coherencia modalidad/edad: la misma regla que la condición 3 del abono.
  if (años !== null) {
    if (d.modalidad === 'Sub 18' && años >= 18) e.push('modalidad_edad');
    if (d.modalidad === 'Adulto' && años < 18) e.push('modalidad_edad');
  }
  // Menor de edad: hacen falta los datos del tutor.
  if (años !== null && años < 18) {
    const t = d.tutor || {};
    if (!texto(t.nombre) || !dniValido(t.dni)) e.push('tutor');
  }
  // Nº exacto de personas incluidas: 1 en Matrimonio (la otra persona adulta)
  // y 3 en Familiar (otra persona adulta + dos menores). Ya no son opcionales.
  const esperadas = { 'Matrimonio': 1, 'Familiar': 3 }[d.modalidad] || 0;
  const p = Array.isArray(d.incluidas) ? d.incluidas : [];
  if (esperadas) {
    if (p.length !== esperadas) e.push('incluidas');
    p.slice(0, esperadas).forEach((x, i) => {
      if (!texto(x.nombre) || !dniValido(x.dni) || !fechaOk(x.nacimiento) || !texto(x.parentesco)) {
        e.push('incluidas_' + (i + 1));
      }
      // En Familiar, las plazas 2 y 3 son de menores de 18.
      if (d.modalidad === 'Familiar' && i >= 1) {
        const ex = edad(x.nacimiento);
        if (ex === null || ex >= 18) e.push('incluidas_' + (i + 1) + '_edad');
      }
    });
  } else if (p.length) {
    e.push('incluidas');
  }
  return e;
}

// ── Seguridad ──────────────────────────────────────────────────────────────

/**
 * Comparación en tiempo constante. Con `!==` el número de caracteres que
 * coinciden se nota en el tiempo de respuesta y permite adivinar el token
 * carácter a carácter.
 */
function igualSeguro(a, b) {
  const A = new TextEncoder().encode(String(a || ''));
  const B = new TextEncoder().encode(String(b || ''));
  if (A.length !== B.length) return false;
  let d = 0;
  for (let i = 0; i < A.length; i++) d |= A[i] ^ B[i];
  return d === 0;
}

// ── Renovaciones ───────────────────────────────────────────────────────────
// Para saber si un socio de la temporada pasada ha renovado se busca entre las
// altas de la actual: primero por DNI y, si no lo hay —Cluber no se lo pedía a
// los familiares—, por nombre completo. El correo no sirve para esto: en un
// abono familiar varias personas comparten el del titular, y el cruce daría
// por renovada a la persona equivocada.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

function palabras(nombre) {
  return new Set(String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w && !PARTICULAS.has(w)));
}

// Mismo nombre si uno contiene al otro entero y comparten al menos dos
// palabras: «Mariam Mena» es «Mariam Mena Carballo», pero dos personas que
// sólo coinciden en un «Fernández» no son la misma.
function mismoNombre(a, b) {
  const [menor, mayor] = a.size <= b.size ? [a, b] : [b, a];
  if (menor.size < 2) return false;
  for (const w of menor) if (!mayor.has(w)) return false;
  return true;
}

/** Nº de abonado actual de quien era socio la temporada pasada, o null. */
function renovacion(socio, actuales) {
  const dni = String(socio.dni || '').toUpperCase();
  if (dni) {
    const porDni = actuales.find((a) => String(a.dni || '').toUpperCase() === dni);
    if (porDni) return porDni.id;
  }
  const suyo = palabras(socio.nombre);
  const porNombre = actuales.find((a) => mismoNombre(suyo, palabras(a.nombre)));
  return porNombre ? porNombre.id : null;
}

/** Hash de la IP: permite contar intentos sin guardar la IP en claro. */
async function hashIP(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '0';
  const datos = new TextEncoder().encode(ip + '|' + (env.ADMIN_TOKEN || 'sal'));
  const h = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Consulta si se ha excedido el límite de intentos, SIN apuntar uno nuevo.
 * Separar la consulta del apunte permite contar sólo lo que interesa: en el
 * acceso y en la descarga se apuntan únicamente los FALLOS, porque contar
 * también los aciertos dejaba fuera a quien usa el panel con normalidad.
 * Las filas viejas se borran aquí, así no hace falta tarea programada.
 */
async function excedeLimite(env, ipHash, ruta, maximo, ventanaSeg) {
  const ahora = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM limites WHERE ts < ?').bind(ahora - 86400).run();
  const { results } = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM limites WHERE ruta = ? AND ip_hash = ? AND ts > ?'
  ).bind(ruta, ipHash, ahora - ventanaSeg).all();
  return (results[0] && results[0].n) >= maximo;
}

/** Apunta un intento. */
async function apuntarIntento(env, ipHash, ruta) {
  await env.DB.prepare('INSERT INTO limites (ip_hash, ruta, ts) VALUES (?,?,?)')
    .bind(ipHash, ruta, Math.floor(Date.now() / 1000)).run();
}

/** Borra los intentos de una IP: se llama tras un acierto. */
async function limpiarIntentos(env, ipHash, ruta) {
  await env.DB.prepare('DELETE FROM limites WHERE ruta = ? AND ip_hash = ?')
    .bind(ruta, ipHash).run();
}

// ── Sesión de administración ───────────────────────────────────────────────
//
// La sesión es un testigo firmado con HMAC-SHA256: "caducidad.firma". No se
// guarda nada en servidor, y como la firma sólo se puede generar con el
// secreto, no se puede falsificar. Viaja en la cabecera Authorization, no en
// una cookie, para que no exista superficie de CSRF.

const SESION_HORAS = 8;

async function claveHmac(env) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('sesion|' + (env.ADMIN_TOKEN || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function firmar(env, mensaje) {
  const f = await crypto.subtle.sign('HMAC', await claveHmac(env), new TextEncoder().encode(mensaje));
  return b64url(f);
}

async function crearSesion(env) {
  const exp = String(Date.now() + SESION_HORAS * 3600 * 1000);
  return exp + '.' + (await firmar(env, exp));
}

async function sesionValida(env, testigo) {
  const partes = String(testigo || '').split('.');
  if (partes.length !== 2) return false;
  const [exp, firma] = partes;
  if (!/^\d+$/.test(exp) || Date.now() > Number(exp)) return false;
  return igualSeguro(firma, await firmar(env, exp));
}

/** Extrae el testigo de la cabecera Authorization. */
function testigoDe(request) {
  return (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
}

/** Cabeceras para todo lo administrativo: nada de caché ni de indexación. */
const CAB_ADMIN = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/**
 * Sin recursos externos: si alguien lograse inyectar algo, no podría cargar ni
 * enviar nada a otro origen. Las imágenes sólo pueden venir del propio club:
 * el escudo va incrustado, y la vista previa de las campañas muestra las
 * imágenes subidas (altas.) y el escudo que llevan los correos (la web).
 */
const CSP_PANEL = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
    "img-src data: https://altas.balonmanovetusta.com https://balonmanovetusta.com; " +
    "connect-src 'self'; form-action 'none'; base-uri 'none'; " +
    "frame-ancestors 'none'",
};

/**
 * El panel es el mismo en las dos puertas. Lo único que cambia es quién dice
 * que puedes pasar: tras Access no hay pantalla de clave, porque la identidad
 * ya está resuelta y pedir una contraseña encima sólo sería ceremonia.
 */
function panelHtml(porAccess, correo) {
  return ADMIN_HTML
    .replace('__POR_ACCESS__', porAccess ? 'true' : 'false')
    .replace('__CORREO__', JSON.stringify(correo || ''));
}

/** Lo único que ve quien llegue a la zona privada sin pasar por Access. */
const PORTADA_PRIVADA = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Zona privada · Balonmano Vetusta</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
     background:#14161a;color:#fff;text-align:center;padding:24px;
     font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
h1{font-size:1.15rem;margin:0 0 8px}
p{margin:0;color:#9aa0a8;font-size:.92rem}
</style></head>
<body><div>
<h1>Zona privada del Balonmano Vetusta</h1>
<p>Acceso restringido.</p>
</div></body></html>`;

// ── Correo (opcional: solo si hay RESEND_API_KEY) ──────────────────────────

async function enviarCorreo(env, { para, copia, asunto, texto: cuerpo, html, responder }) {
  if (!env.RESEND_API_KEY) return { saltado: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.AVISO_DE,
      to: [para],
      ...(copia ? { cc: [copia] } : {}),
      subject: asunto,
      text: cuerpo,
      ...(html ? { html } : {}),
      reply_to: responder || env.AVISO_A,
    }),
  });
  // Un fallo no puede tumbar el alta, pero tiene que dejar rastro: sin esto un
  // dominio sin verificar en Resend se traduce en silencio absoluto.
  if (!r.ok) {
    console.warn('resend', r.status, await r.text().catch(() => ''));
  }
  return { ok: r.ok, status: r.status };
}

// ── CORS ───────────────────────────────────────────────────────────────────

function cors(origen, env) {
  const permitidos = String(env.ORIGENES || '').split(',').map((s) => s.trim());
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origen && permitidos.includes(origen)) h['Access-Control-Allow-Origin'] = origen;
  return h;
}

const json = (obj, status, extra) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(extra || {}) },
  });

// ── Worker ─────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origen = request.headers.get('Origin');
    const cabeceras = cors(origen, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabeceras });

    // ── Zona privada ────────────────────────────────────────────────────────
    // Cloudflare Access filtra por delante y aquí se vuelve a comprobar su
    // testigo: si la aplicación de Access se borrase o se configurase mal,
    // esto falla cerrado en vez de dejar el panel abierto.
    const porAccess = url.hostname === PRIVADO ? await accesoValido(request, env) : null;

    // Imágenes de las campañas y enlace de baja: públicos, porque los abre
    // quien recibe el correo. Sólo en la puerta pública.
    if (url.hostname !== PRIVADO) {
      const publica = await rutasPublicas(request, env, url);
      if (publica) return publica;
    }

    if (url.hostname === PRIVADO) {
      if (!porAccess) {
        return new Response(PORTADA_PRIVADA, {
          status: 403,
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...CAB_ADMIN },
        });
      }
      // Access autentica con una cookie, y el navegador la manda aunque la
      // petición la lance otra web. Para que una página ajena no pueda
      // enviar una campaña o marcar pagos en nombre de quien tiene la sesión
      // abierta, toda escritura tiene que venir del propio panel.
      if (request.method === 'POST' && request.headers.get('Origin') !== `https://${PRIVADO}`) {
        return json({ ok: false, error: 'origen' }, 403, CAB_ADMIN);
      }
      const campanas = await rutasCampanas(request, env, url, porAccess);
      if (campanas) return campanas;
      // Dentro sólo vive, por ahora, el panel de abonados. Cuando haya más
      // secciones, la raíz pasará a ser un índice y cada una tendrá su ruta.
      if (url.pathname === '/' || url.pathname === '/abonados') {
        return new Response(panelHtml(true, porAccess), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...CAB_ADMIN, ...CSP_PANEL },
        });
      }
    }

    if (url.pathname === '/') {
      return json({ ok: true }, 200);
    }

    // ── Administración ──────────────────────────────────────────────────
    // La página se sirve desde aquí, no desde GitHub Pages: el repositorio
    // sólo contiene su código, sin credenciales, y sin clave no devuelve
    // ningún dato.

    if (url.pathname === '/admin' && request.method === 'GET') {
      return new Response(panelHtml(false, null), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...CAB_ADMIN, ...CSP_PANEL },
      });
    }

    if (url.pathname === '/admin/login' && request.method === 'POST') {
      const ipHash = await hashIP(request, env);
      if (await excedeLimite(env, ipHash, 'login', 8, 3600)) {
        return json({ ok: false, error: 'limite' }, 429, CAB_ADMIN);
      }
      let body = {};
      try { body = await request.json(); } catch { /* clave vacía */ }
      if (!env.ADMIN_TOKEN || !igualSeguro(body.clave, env.ADMIN_TOKEN)) {
        await apuntarIntento(env, ipHash, 'login');   // sólo cuentan los fallos
        return json({ ok: false }, 401, CAB_ADMIN);
      }
      await limpiarIntentos(env, ipHash, 'login');    // el acierto libera el contador
      return json({ ok: true, sesion: await crearSesion(env) }, 200, CAB_ADMIN);
    }

    if (url.pathname === '/admin/datos' && request.method === 'GET') {
      // Dos formas de estar autorizado: haber pasado por Access en el dominio
      // privado, o traer la sesión firmada del panel antiguo.
      if (!porAccess && !(await sesionValida(env, testigoDe(request)))) {
        return json({ ok: false }, 401, CAB_ADMIN);
      }
      // Cada socio es una fila. Los asociados traen el nombre de su titular
      // resuelto aquí, para que el panel no tenga que cruzarlo.
      const { results } = await env.DB.prepare(
        `SELECT a.id, a.creado, a.modalidad, a.pago, a.importe, a.pagado, a.nombre,
                a.dni, a.nacimiento, a.telefono, a.email, a.localidad, a.imagen,
                a.comunicaciones, a.tutor, a.titular_id, a.parentesco,
                t.nombre AS titular_nombre
           FROM abonados a
           LEFT JOIN abonados t ON t.id = a.titular_id
          -- De menor a mayor número. Los abonos siguen saliendo agrupados
          -- sin pedirlo: las personas incluidas se insertan justo después de
          -- su titular, así que cada abono es un bloque de ids consecutivos.
          ORDER BY a.id`
      ).all();
      const abonados = (results || []).map((r) => ({
        ...r,
        pagado: !!r.pagado,
        tutor: r.tutor ? JSON.parse(r.tutor) : null,
      }));
      return json({ ok: true, abonados }, 200, CAB_ADMIN);
    }

    if (url.pathname === '/admin/anteriores' && request.method === 'GET') {
      if (!porAccess && !(await sesionValida(env, testigoDe(request)))) {
        return json({ ok: false }, 401, CAB_ADMIN);
      }
      const { results: anteriores } = await env.DB.prepare(
        `SELECT id, numero, nombre, dni, telefono, email, titular, cuota, alta, pago,
                localidad, imagen, comunicaciones
           FROM socios_anteriores
          WHERE temporada = ?
          -- Por número de socio; los que Cluber dejó sin número, al final.
          ORDER BY numero IS NULL, numero, id`
      ).bind(TEMPORADA_ANTERIOR).all();
      const { results: actuales } = await env.DB.prepare(
        'SELECT id, nombre, dni FROM abonados WHERE temporada = ?'
      ).bind(TEMPORADA).all();
      const socios = (anteriores || []).map((s) => ({
        ...s, renovado: renovacion(s, actuales || []),
      }));
      return json({ ok: true, temporada: TEMPORADA_ANTERIOR, socios }, 200, CAB_ADMIN);
    }

    if (url.pathname === '/admin/pagado' && request.method === 'POST') {
      // Dos formas de estar autorizado: haber pasado por Access en el dominio
      // privado, o traer la sesión firmada del panel antiguo.
      if (!porAccess && !(await sesionValida(env, testigoDe(request)))) {
        return json({ ok: false }, 401, CAB_ADMIN);
      }
      let body = {};
      try { body = await request.json(); } catch { /* nada */ }
      const id = parseInt(body.id, 10);
      if (!Number.isInteger(id) || id < 1) return json({ ok: false }, 400, CAB_ADMIN);
      // El pago es del abono, no de cada socio: se marca el grupo entero,
      // titular y asociados, para que no queden estados incoherentes.
      const { results } = await env.DB.prepare(
        'SELECT COALESCE(titular_id, id) AS grupo FROM abonados WHERE id = ?'
      ).bind(id).all();
      const grupo = results[0] && results[0].grupo;
      if (!grupo) return json({ ok: false }, 404, CAB_ADMIN);
      await env.DB.prepare('UPDATE abonados SET pagado = ? WHERE id = ? OR titular_id = ?')
        .bind(body.pagado ? 1 : 0, grupo, grupo).run();
      return json({ ok: true, grupo }, 200, CAB_ADMIN);
    }

    // Exportación para el club: rellenar carnés, cuadrar transferencias.
    if (url.pathname === '/export.csv' && request.method === 'GET') {
      // El token se admite por cabecera (preferido: no queda en registros ni en
      // el historial del navegador) y, por comodidad, también por parámetro.
      const cabecera = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const enviado = cabecera || url.searchParams.get('token') || '';

      // Sin límite, el token se podría probar a fuerza bruta.
      const ipHash = await hashIP(request, env);
      if (await excedeLimite(env, ipHash, 'export', 10, 3600)) {
        return new Response('Demasiados intentos. Prueba dentro de un rato.', { status: 429 });
      }
      const conClave = env.ADMIN_TOKEN && igualSeguro(enviado, env.ADMIN_TOKEN);
      const conSesion = await sesionValida(env, enviado);
      if (!porAccess && !conClave && !conSesion) {
        await apuntarIntento(env, ipHash, 'export');
        return new Response('No autorizado', { status: 401, headers: CAB_ADMIN });
      }
      await limpiarIntentos(env, ipHash, 'export');
      const { results } = await env.DB.prepare(
        'SELECT * FROM abonados ORDER BY id'
      ).all();
      const cols = ['id', 'titular_id', 'parentesco', 'creado', 'modalidad', 'pago',
        'importe', 'pagado', 'nombre', 'dni', 'nacimiento', 'telefono', 'email',
        'localidad', 'imagen', 'comunicaciones', 'tutor'];
      const escapar = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const csv = [cols.join(';')]
        .concat((results || []).map((r) => cols.map((c) => escapar(r[c])).join(';')))
        .join('\r\n');
      return new Response('﻿' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="abonados-2026-2027.csv"',
          ...CAB_ADMIN,
        },
      });
    }

    if (url.pathname !== '/alta' || request.method !== 'POST') {
      return json({ ok: false, error: 'ruta' }, 404, cabeceras);
    }
    if (!cabeceras['Access-Control-Allow-Origin']) {
      return json({ ok: false, error: 'origen' }, 403, cabeceras);
    }

    let d;
    try {
      d = await request.json();
    } catch {
      return json({ ok: false, error: 'json' }, 400, cabeceras);
    }

    // Trampa antispam: un campo invisible que sólo rellenan los bots.
    if (texto(d.web)) return json({ ok: true, numero: 0 }, 200, cabeceras);

    // CORS no autentica: cualquiera puede enviar la cabecera Origin que quiera
    // desde fuera de un navegador. El límite por IP es lo que de verdad
    // contiene el abuso de un endpoint de escritura abierto.
    const ipHash = await hashIP(request, env);
    if (await excedeLimite(env, ipHash, 'alta', 15, 3600)) {
      return json({ ok: false, error: 'limite' }, 429, cabeceras);
    }
    await apuntarIntento(env, ipHash, 'alta');

    const errores = validar(d);
    if (errores.length) {
      return json({ ok: false, error: 'validacion', campos: errores }, 422, cabeceras);
    }

    const dni = texto(d.dni).toUpperCase();
    const fila = {
      temporada: TEMPORADA,
      creado: new Date().toISOString(),
      modalidad: d.modalidad,
      pago: d.pago,
      importe: PRECIOS[d.modalidad],          // el precio lo pone el servidor
      nombre: texto(d.nombre),
      apellidos: texto(d.apellidos),
      dni,
      nacimiento: d.nacimiento,
      telefono: texto(d.telefono, 20),
      email: texto(d.email, 160),
      localidad: texto(d.localidad, 80),
      provincia: texto(d.provincia, 60),
      imagen: d.imagen,
      comunicaciones: d.comunicaciones,
      incluidas: JSON.stringify(
        (Array.isArray(d.incluidas) ? d.incluidas : []).slice(0, 3).map((p) => ({
          nombre: texto(p.nombre), dni: texto(p.dni, 12).toUpperCase(),
          nacimiento: texto(p.nacimiento, 10), parentesco: texto(p.parentesco, 40),
        }))
      ),
      tutor: d.tutor ? JSON.stringify({
        nombre: texto(d.tutor.nombre), dni: texto(d.tutor.dni, 12).toUpperCase(),
        telefono: texto(d.tutor.telefono, 20),
      }) : null,
      ip_pais: request.headers.get('CF-IPCountry') || null,
    };

    // Cada persona del abono es un socio con su propio número, así que se
    // insertan varias filas: el titular y una por cada persona incluida,
    // enlazadas por titular_id. El importe va sólo en el titular: la cuota es
    // del abono, no de cada persona, y si se repitiera los totales de dinero
    // saldrían multiplicados.
    const incluidas = JSON.parse(fila.incluidas);

    // Se comprueban todos los DNI antes de escribir nada: si uno ya está
    // dado de alta, es mejor rechazar el conjunto que dejar medio abono
    // creado. El índice único sigue siendo la garantía final.
    const dnis = [dni, ...incluidas.map((p) => p.dni)];
    if (new Set(dnis).size !== dnis.length) {
      return json({ ok: false, error: 'dni_repetido' }, 422, cabeceras);
    }
    const marcadores = dnis.map(() => '?').join(',');
    const yaExisten = await env.DB.prepare(
      `SELECT dni FROM abonados WHERE temporada = ? AND dni IN (${marcadores})`
    ).bind(TEMPORADA, ...dnis).all();
    if ((yaExisten.results || []).length) {
      return json({
        ok: false,
        error: 'duplicado',
        dnis: yaExisten.results.map((r) => r.dni),
      }, 409, cabeceras);
    }

    const SQL = `INSERT INTO abonados
        (temporada, creado, modalidad, pago, importe, nombre, apellidos, dni,
         nacimiento, telefono, email, localidad, provincia, imagen, comunicaciones,
         incluidas, tutor, ip_pais, titular_id, parentesco)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

    let numero;
    const socios = [];
    try {
      const res = await env.DB.prepare(SQL).bind(
        fila.temporada, fila.creado, fila.modalidad, fila.pago, fila.importe,
        fila.nombre, fila.apellidos, fila.dni, fila.nacimiento, fila.telefono,
        fila.email, fila.localidad, fila.provincia, fila.imagen,
        fila.comunicaciones, '[]', fila.tutor, fila.ip_pais, null, 'Titular'
      ).run();
      numero = res.meta.last_row_id;
      socios.push({ numero, nombre: fila.nombre, parentesco: 'Titular' });

      // Las personas incluidas heredan del titular la localidad y los
      // consentimientos, pero NO el teléfono ni el correo: el formulario pide
      // un solo contacto, el del titular, y repetirlo en cada fila daría a
      // entender que cada persona facilitó el suyo. Importe 0, porque la
      // cuota ya está en el titular.
      for (const p of incluidas) {
        const r = await env.DB.prepare(SQL).bind(
          fila.temporada, fila.creado, fila.modalidad, fila.pago, 0,
          p.nombre, '', p.dni, p.nacimiento, '', '',
          fila.localidad, fila.provincia, fila.imagen, fila.comunicaciones,
          '[]', null, fila.ip_pais, numero, p.parentesco || 'Incluido/a'
        ).run();
        socios.push({ numero: r.meta.last_row_id, nombre: p.nombre, parentesco: p.parentesco });
      }
    } catch (err) {
      // Si falla a mitad, se retira lo escrito para no dejar un abono partido.
      if (numero) {
        await env.DB.prepare('DELETE FROM abonados WHERE id = ? OR titular_id = ?')
          .bind(numero, numero).run();
      }
      if (String(err && err.message).includes('UNIQUE')) {
        return json({ ok: false, error: 'duplicado' }, 409, cabeceras);
      }
      return json({ ok: false, error: 'bd' }, 500, cabeceras);
    }

    // Un solo envío: va al abonado y el club queda en copia. Antes eran dos
    // correos y el del club repetía en texto lo que el panel ya muestra mejor,
    // así que se gasta la mitad del cupo del proveedor sin perder el registro:
    // el club recibe una copia por cada alta.
    // Nunca puede tumbar el alta, que ya está guardada.
    // Ojo con el nombre: desestructurar aquí un `texto` taparía la función
    // texto() del módulo en TODO el manejador, y por la zona muerta temporal
    // del const, las llamadas anteriores a texto() reventarían.
    const correo = correoAlta({
      fila, socios, numero, temporada: TEMPORADA, iban: env.IBAN || '(pendiente)',
    });

    try {
      await enviarCorreo(env, {
        para: fila.email,
        copia: env.AVISO_A,
        asunto: `Tu alta como abonado/a del Balonmano Vetusta · nº ${numero}`,
        texto: correo.texto,
        html: correo.html,
      });
    } catch { /* sin efecto sobre el alta */ }

    return json({ ok: true, numero, socios }, 200, cabeceras);
  },

  // Cada cinco minutos (ver [triggers] en wrangler.toml): envía las campañas
  // cuya hora programada ya ha llegado.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(campanasProgramadas(env));
  },
};
