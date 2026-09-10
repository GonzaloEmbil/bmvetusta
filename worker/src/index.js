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

const PRECIOS = { 'Sub 18': 20, 'Adulto': 40, 'Matrimonio': 70, 'Familiar': 90 };
const TEMPORADA = '2026/2027';

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

/** Hash de la IP: permite contar intentos sin guardar la IP en claro. */
async function hashIP(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '0';
  const datos = new TextEncoder().encode(ip + '|' + (env.ADMIN_TOKEN || 'sal'));
  const h = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Límite de intentos por IP y ruta en una ventana de tiempo.
 * Devuelve true si se ha excedido. Las filas viejas se borran aquí mismo,
 * así no hace falta ninguna tarea programada.
 */
async function excedeLimite(env, ipHash, ruta, maximo, ventanaSeg) {
  const ahora = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM limites WHERE ts < ?').bind(ahora - 86400).run();
  const { results } = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM limites WHERE ruta = ? AND ip_hash = ? AND ts > ?'
  ).bind(ruta, ipHash, ahora - ventanaSeg).all();
  if ((results[0] && results[0].n) >= maximo) return true;
  await env.DB.prepare('INSERT INTO limites (ip_hash, ruta, ts) VALUES (?,?,?)')
    .bind(ipHash, ruta, ahora).run();
  return false;
}

// ── Correo (opcional: solo si hay RESEND_API_KEY) ──────────────────────────

function resumen(d, numero) {
  const L = [
    `ALTA DE ABONADO/A Nº ${numero} · TEMPORADA ${TEMPORADA}`,
    '',
    `Modalidad: ${d.modalidad} (${PRECIOS[d.modalidad]} €)`,
    `Forma de pago: ${d.pago}`,
    '',
    'TITULAR',
    `${d.nombre}`,
    `DNI/NIE: ${d.dni}`,
    `Nacimiento: ${d.nacimiento} (${edad(d.nacimiento)} años)`,
    `Móvil: ${d.telefono}`,
    `Correo: ${d.email}`,
    `Localidad: ${d.localidad}`,
  ];
  if (d.incluidas && d.incluidas.length) {
    L.push('', 'PERSONAS INCLUIDAS');
    d.incluidas.forEach((p) => L.push(`- ${p.nombre} | ${p.dni} | ${p.nacimiento} | ${p.parentesco}`));
  }
  if (d.tutor) {
    L.push('', 'TUTOR/A LEGAL', `${d.tutor.nombre} | ${d.tutor.dni} | ${d.tutor.telefono}`);
  }
  L.push('', 'CONSENTIMIENTOS', `Derechos de imagen: ${d.imagen}`, `Comunicaciones: ${d.comunicaciones}`);
  L.push('', 'Pendiente de comprobar la transferencia.');
  return L.join('\n');
}

async function enviarCorreo(env, { para, asunto, texto: cuerpo }) {
  if (!env.RESEND_API_KEY) return { saltado: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.AVISO_DE, to: [para], subject: asunto, text: cuerpo }),
  });
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

    if (url.pathname === '/') {
      return json({ ok: true }, 200);
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
      if (!env.ADMIN_TOKEN || !igualSeguro(enviado, env.ADMIN_TOKEN)) {
        return new Response('No autorizado', { status: 401 });
      }
      const { results } = await env.DB.prepare(
        'SELECT * FROM abonados ORDER BY id'
      ).all();
      const cols = ['id', 'creado', 'modalidad', 'pago', 'importe', 'pagado', 'nombre', 'apellidos',
        'dni', 'nacimiento', 'telefono', 'email', 'localidad', 'imagen', 'comunicaciones',
        'incluidas', 'tutor'];
      const escapar = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const csv = [cols.join(';')]
        .concat((results || []).map((r) => cols.map((c) => escapar(r[c])).join(';')))
        .join('\r\n');
      return new Response('﻿' + csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="abonados-2026-2027.csv"',
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
    if (await excedeLimite(env, ipHash, 'alta', 6, 3600)) {
      return json({ ok: false, error: 'limite' }, 429, cabeceras);
    }

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

    let numero;
    try {
      const res = await env.DB.prepare(
        `INSERT INTO abonados
           (temporada, creado, modalidad, pago, importe, nombre, apellidos, dni,
            nacimiento, telefono, email, localidad, provincia, imagen, comunicaciones,
            incluidas, tutor, ip_pais)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        fila.temporada, fila.creado, fila.modalidad, fila.pago, fila.importe, fila.nombre,
        fila.apellidos, fila.dni, fila.nacimiento, fila.telefono, fila.email,
        fila.localidad, fila.provincia, fila.imagen, fila.comunicaciones,
        fila.incluidas, fila.tutor, fila.ip_pais
      ).run();
      numero = res.meta.last_row_id;
    } catch (err) {
      // El índice único salta si ese DNI ya está dado de alta esta temporada.
      if (String(err && err.message).includes('UNIQUE')) {
        return json({ ok: false, error: 'duplicado' }, 409, cabeceras);
      }
      return json({ ok: false, error: 'bd' }, 500, cabeceras);
    }

    // Los correos no deben tumbar el alta: ya está guardada.
    const cuerpo = resumen({ ...d, dni }, numero);
    try {
      await enviarCorreo(env, {
        para: env.AVISO_A,
        asunto: `Alta de abonado/a nº ${numero} · ${fila.nombre}`,
        texto: cuerpo,
      });
      await enviarCorreo(env, {
        para: fila.email,
        asunto: `Tu alta como abonado/a del Balonmano Vetusta · nº ${numero}`,
        texto: [
          `Hola ${fila.nombre}:`,
          '',
          `Hemos recibido tu solicitud de alta como abonado/a para la temporada ${TEMPORADA}.`,
          `Tu número de abonado/a es el ${numero}.`,
          '',
          ...(fila.pago === 'Presencial' ? [
            `Puedes pagar los ${fila.importe} € en el Florida Arena cualquier día que`,
            'el Balonmano Vetusta juegue como local.',
          ] : [
            'Queda un último paso, la transferencia:',
            `  Importe: ${fila.importe} €`,
            '  Destinatario: Club Balonmano Vetusta',
            `  IBAN: ${env.IBAN || '(pendiente)'}`,
            `  Concepto: ${fila.nombre} - Abono ${fila.modalidad}`,
          ]),
          '',
          'Cuando recibamos el pago te confirmamos el alta y te avisamos de cuándo recoger el carné.',
          '',
          'Cualquier duda, responde a este correo.',
          'Balonmano Vetusta',
        ].join('\n'),
      });
    } catch { /* sin efecto sobre el alta */ }

    return json({ ok: true, numero }, 200, cabeceras);
  },
};
