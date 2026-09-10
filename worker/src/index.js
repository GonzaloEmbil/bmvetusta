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
  ['nombre', 'apellidos', 'localidad'].forEach((k) => { if (!texto(d[k])) e.push(k); });
  if (!dniValido(d.dni)) e.push('dni');
  if (!fechaOk(d.nacimiento)) e.push('nacimiento');
  const años = edad(d.nacimiento);
  if (años === null || años < 0 || años > 120) e.push('nacimiento');
  if (!/^[0-9]{9}$/.test(texto(d.telefono).replace(/[\s()+-]/g, '').replace(/^34/, ''))) e.push('telefono');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto(d.email))) e.push('email');
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
  // Matrimonio y Familiar exigen al menos la segunda persona adulta.
  if (['Matrimonio', 'Familiar'].includes(d.modalidad)) {
    const p = Array.isArray(d.incluidas) ? d.incluidas : [];
    if (!p.length || !texto(p[0].nombre) || !dniValido(p[0].dni)) e.push('incluidas');
    if (d.modalidad === 'Matrimonio' && p.length > 1) e.push('incluidas');
    if (d.modalidad === 'Familiar' && p.length > 3) e.push('incluidas');
  }
  return e;
}

// ── Correo (opcional: solo si hay RESEND_API_KEY) ──────────────────────────

function resumen(d, numero) {
  const L = [
    `ALTA DE ABONADO/A Nº ${numero} · TEMPORADA ${TEMPORADA}`,
    '',
    `Modalidad: ${d.modalidad} (${PRECIOS[d.modalidad]} €)`,
    '',
    'TITULAR',
    `${d.nombre} ${d.apellidos}`,
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
      return json({ ok: true, servicio: 'altas', temporada: TEMPORADA }, 200);
    }

    // Exportación para el club: rellenar carnés, cuadrar transferencias.
    if (url.pathname === '/export.csv' && request.method === 'GET') {
      if (!env.ADMIN_TOKEN || url.searchParams.get('token') !== env.ADMIN_TOKEN) {
        return new Response('No autorizado', { status: 401 });
      }
      const { results } = await env.DB.prepare(
        'SELECT * FROM abonados ORDER BY id'
      ).all();
      const cols = ['id', 'creado', 'modalidad', 'importe', 'pagado', 'nombre', 'apellidos',
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

    const errores = validar(d);
    if (errores.length) {
      return json({ ok: false, error: 'validacion', campos: errores }, 422, cabeceras);
    }

    const dni = texto(d.dni).toUpperCase();
    const fila = {
      temporada: TEMPORADA,
      creado: new Date().toISOString(),
      modalidad: d.modalidad,
      importe: PRECIOS[d.modalidad],          // el precio lo pone el servidor
      nombre: texto(d.nombre),
      apellidos: texto(d.apellidos),
      dni,
      nacimiento: d.nacimiento,
      telefono: texto(d.telefono, 20),
      email: texto(d.email, 160),
      localidad: texto(d.localidad, 80),
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
           (temporada, creado, modalidad, importe, nombre, apellidos, dni, nacimiento,
            telefono, email, localidad, imagen, comunicaciones, incluidas, tutor, ip_pais)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        fila.temporada, fila.creado, fila.modalidad, fila.importe, fila.nombre,
        fila.apellidos, fila.dni, fila.nacimiento, fila.telefono, fila.email,
        fila.localidad, fila.imagen, fila.comunicaciones, fila.incluidas,
        fila.tutor, fila.ip_pais
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
        asunto: `Alta de abonado/a nº ${numero} · ${fila.nombre} ${fila.apellidos}`,
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
          'Queda un último paso, la transferencia:',
          `  Importe: ${fila.importe} €`,
          `  IBAN: ${env.IBAN || '(pendiente)'}`,
          `  Concepto: Abono 26/27 · ${fila.nombre} ${fila.apellidos} · ${fila.modalidad}`,
          '',
          'Cuando la recibamos te confirmamos el alta y te avisamos de cuándo recoger el carné.',
          '',
          'Cualquier duda, responde a este correo.',
          'Balonmano Vetusta',
        ].join('\n'),
      });
    } catch { /* sin efecto sobre el alta */ }

    return json({ ok: true, numero }, 200, cabeceras);
  },
};
