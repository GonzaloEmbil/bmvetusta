/**
 * Campañas de correo del área privada.
 *
 * Salen por Resend desde CAMPANAS_DE y sólo van a quien aceptó recibir
 * comunicaciones del club: la casilla del formulario de alta o la de Cluber.
 * Cada correo lleva su enlace de baja, firmado con CLAVE_BAJAS para que nadie
 * pueda dar de baja a otra persona adivinando su dirección. Sin esa clave no
 * se envía nada: falla cerrado.
 *
 * Rutas (todas las /admin/* exigen haber entrado por Cloudflare Access):
 *   GET  /admin/campanas              historial y tamaño de cada lista
 *   GET  /admin/campanas/:id          una campaña
 *   POST /admin/campanas              crea o guarda un borrador
 *   POST /admin/campanas/previa       HTML del correo, para la vista previa
 *   POST /admin/campanas/prueba       envía la campaña sólo a quien la edita
 *   POST /admin/campanas/enviar       la envía ya a sus listas
 *   POST /admin/campanas/programar    la deja programada
 *   POST /admin/campanas/cancelar     programada → borrador
 *   POST /admin/campanas/borrar       borra un borrador
 *   POST /admin/imagen                sube una imagen a R2
 *   GET  /img/:clave                  sirve una imagen (pública: va en correos)
 *   GET/POST /baja                    página y acción de baja (pública)
 */

import { TEMPORADA, TEMPORADA_ANTERIOR } from './temporadas.js';
import { renovacion } from './renovacion.js';

// Dirección pública del Worker: la de la zona privada exige Access, así que
// las imágenes y el enlace de baja tienen que colgar de esta.
const PUBLICO = 'https://altas.balonmanovetusta.com';

// Segmentos a los que se puede enviar una campaña. Se eligen de uno en uno por
// grupo: todos los abonados de una temporada o sólo una parte de ellos.
const LISTAS = {
  actuales: 'Abonados ' + TEMPORADA,
  actuales_pagados: 'Abonados ' + TEMPORADA + ' · pagados',
  actuales_pendientes: 'Abonados ' + TEMPORADA + ' · pendientes de pago',
  anteriores: 'Abonados ' + TEMPORADA_ANTERIOR,
  anteriores_renovados: 'Abonados ' + TEMPORADA_ANTERIOR + ' · han renovado',
  anteriores_no_renovados: 'Abonados ' + TEMPORADA_ANTERIOR + ' · no han renovado',
  otros: 'Otros',
};
const GRUPO = (l) => l.split('_')[0];

// Resend acepta hasta 100 correos por llamada en su envío por lotes.
const POR_LOTE = 100;

const CAB = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CAB });
const ahora = () => new Date().toISOString();
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ── Destinatarios ──────────────────────────────────────────────────────────
// La casilla de comunicaciones manda, pero una baja pedida desde un correo
// pesa más que un dato anterior a ella: en los abonados, un alta nueva
// posterior a la baja vuelve a valer (es un consentimiento nuevo); en los
// socios de Cluber, que son datos viejos, la baja gana siempre.
const SQL_ACTUALES = `SELECT email, nombre FROM abonados a
                        WHERE temporada = ? AND email <> '' AND comunicaciones = 'Sí'
                          AND NOT EXISTS (SELECT 1 FROM bajas b WHERE b.email = lower(a.email) AND b.fecha > a.creado)`;
const SQL_ANTERIORES = `SELECT email, nombre, dni FROM socios_anteriores
                         WHERE temporada = ? AND email <> '' AND comunicaciones = 'Sí'
                           AND lower(email) NOT IN (SELECT email FROM bajas)`;
// Contactos sueltos: como los de Cluber, una baja gana siempre.
const SQL_OTROS = `SELECT email, nombre FROM contactos
                    WHERE lista = 'otros' AND email <> '' AND comunicaciones = 'Sí'
                      AND lower(email) NOT IN (SELECT email FROM bajas)`;

const correoValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

async function filas(env, sql, ...params) {
  const q = env.DB.prepare(sql);
  const { results } = await (params.length ? q.bind(...params) : q).all();
  return results || [];
}

/**
 * Personas de un segmento con permiso para recibir campañas.
 *  · Pagados / pendientes: el pago es del abono, y el correo sólo lo lleva el
 *    titular, así que basta con mirar su fila.
 *  · Han renovado / no han renovado: el mismo cruce que la tabla de 2025/2026
 *    (DNI y, si no, nombre completo) contra las altas de esta temporada.
 */
async function personasDe(env, lista, actuales) {
  let gente = [];
  if (GRUPO(lista) === 'actuales') {
    const pago = { actuales_pagados: ' AND pagado = 1', actuales_pendientes: ' AND pagado = 0' }[lista] || '';
    gente = await filas(env, SQL_ACTUALES + pago, TEMPORADA);
  } else if (GRUPO(lista) === 'anteriores') {
    gente = await filas(env, SQL_ANTERIORES, TEMPORADA_ANTERIOR);
    if (lista !== 'anteriores') {
      const quiere = lista === 'anteriores_renovados';
      gente = gente.filter((p) => !!renovacion(p, actuales) === quiere);
    }
  } else if (lista === 'otros') {
    gente = await filas(env, SQL_OTROS);
  }
  return gente
    .map((p) => ({ email: String(p.email).trim().toLowerCase(), nombre: p.nombre }))
    .filter((p) => correoValido(p.email));
}

const altasActuales = (env) => filas(env, 'SELECT id, nombre, dni FROM abonados WHERE temporada = ?', TEMPORADA);

/** Personas de los segmentos pedidos, una por dirección aunque esté en varios. */
async function destinatarios(env, listas) {
  const actuales = await altasActuales(env);
  const vistos = new Map();
  for (const l of listas) {
    if (!LISTAS[l]) continue;
    for (const p of await personasDe(env, l, actuales)) if (!vistos.has(p.email)) vistos.set(p.email, p);
  }
  return [...vistos.values()];
}

/**
 * Quién hay en cada segmento, para que el editor cuente cuántas personas
 * recibirán la campaña con cualquier combinación. No se mandan los correos:
 * cada dirección distinta se cambia por un número, y el panel sólo necesita
 * saber cuántos números distintos suman los segmentos elegidos.
 */
async function segmentos(env) {
  const actuales = await altasActuales(env);
  const indice = new Map();
  const salida = {};
  for (const l of Object.keys(LISTAS)) {
    const ids = new Set();
    for (const p of await personasDe(env, l, actuales)) {
      if (!indice.has(p.email)) indice.set(p.email, indice.size);
      ids.add(indice.get(p.email));
    }
    salida[l] = [...ids];
  }
  return salida;
}

// ── Enlace de baja ─────────────────────────────────────────────────────────

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function firma(env, mensaje) {
  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.CLAVE_BAJAS),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const s = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(mensaje));
  return base64url(new Uint8Array(s).slice(0, 18));
}

async function enlaceBaja(env, email, campanaId) {
  const t = await firma(env, `baja|${email}|${campanaId}`);
  return `${PUBLICO}/baja?e=${encodeURIComponent(email)}&c=${campanaId}&t=${t}`;
}

function igualSeguro(a, b) {
  const A = new TextEncoder().encode(String(a || ''));
  const B = new TextEncoder().encode(String(b || ''));
  if (A.length !== B.length) return false;
  let d = 0;
  for (let i = 0; i < A.length; i++) d |= A[i] ^ B[i];
  return d === 0;
}

// ── El correo ──────────────────────────────────────────────────────────────
// Mismas reglas que el de confirmación de alta (tablas, estilos en línea,
// ancho máximo de 600px) y el mismo aspecto: cabecera negra con el escudo.

const NEGRO = '#14161a';
const AMARILLO = '#FDED3A';
const TINTA_3 = '#7b828b';
const LINEA = '#e2e5ea';
const FONDO = '#f4f4f5';
const TIPO = 'Arial, Helvetica, sans-serif';
const ESCUDO = 'https://balonmanovetusta.com/src/assets/escudo.png';

// Texto del editor → HTML. Sólo entiende tres cosas: **negrita**,
// [texto](https://enlace) y la línea en blanco como cambio de párrafo. Se
// escapa todo antes, así que no se puede colar HTML.
function marcado(t) {
  return String(t || '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).filter(Boolean).map((bloque) => {
    const h = esc(bloque)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g,
        (m, txt, url) => `<a href="${url}" style="color:${NEGRO};font-weight:bold;text-decoration:underline">${txt}</a>`)
      .replace(/\n/g, '<br>');
    return `<p style="margin:0 0 16px;font-family:${TIPO};font-size:15px;line-height:1.6;color:${NEGRO}">${h}</p>`;
  }).join('');
}

function textoPlano(t) {
  return String(t || '').replace(/\r\n?/g, '\n').trim()
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '$1 ($2)');
}

export function correoCampana({ asunto, texto: cuerpo, imagenUrl, botonTexto, botonUrl, bajaUrl, prueba }) {
  const imagen = imagenUrl
    ? `<tr><td style="padding:0"><img src="${esc(imagenUrl)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`
    : '';
  const boton = botonTexto && botonUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:6px 0 18px">
        <tr><td style="background:${AMARILLO};border-radius:999px">
          <a href="${esc(botonUrl)}" style="display:inline-block;padding:14px 30px;font-family:${TIPO};font-size:15px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#000000;text-decoration:none">${esc(botonTexto)}</a>
        </td></tr>
      </table>`
    : '';
  const baja = prueba
    ? `<span style="color:${TINTA_3}">Darte de baja (enlace desactivado en las pruebas)</span>`
    : `<a href="${esc(bajaUrl)}" style="color:${TINTA_3}">Darte de baja</a>`;

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:${FONDO};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:${FONDO}">
  <tr><td align="center" style="padding:26px 12px">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
      <tr><td style="background:${NEGRO};padding:20px 26px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle"><img src="${ESCUDO}" width="42" height="42" alt="Balonmano Vetusta" style="display:block;width:42px;height:42px;border:0"></td>
            <td style="padding-left:14px;vertical-align:middle;font-family:${TIPO};font-size:16px;font-weight:bold;letter-spacing:0.5px;color:#ffffff">BALONMANO VETUSTA</td>
          </tr>
        </table>
      </td></tr>
      ${imagen}
      <tr><td style="padding:28px 26px 12px">
        ${marcado(cuerpo)}
        ${boton}
      </td></tr>
      <tr><td style="border-top:1px solid ${LINEA};padding:18px 26px 22px">
        <p style="margin:0 0 8px;font-family:${TIPO};font-size:11px;line-height:1.6;color:${TINTA_3}">
          Recibes este correo porque eres o has sido abonado/a del Balonmano Vetusta y aceptaste recibir comunicaciones del club. ${baja}
        </p>
        <p style="margin:0;font-family:${TIPO};font-size:11px;line-height:1.6;color:${TINTA_3}">
          CDB Club Balonmano Vetusta · CIF G74174277 · El Llano 11, Naranco · 33194 Oviedo ·
          <a href="https://balonmanovetusta.com" style="color:${TINTA_3}">balonmanovetusta.com</a>
        </p>
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body></html>`;

  const plano = [
    textoPlano(cuerpo),
    botonTexto && botonUrl ? `\n${botonTexto}: ${botonUrl}` : '',
    '\n—\nBalonmano Vetusta · balonmanovetusta.com',
    'Recibes este correo porque eres o has sido abonado/a del Balonmano Vetusta y aceptaste recibir comunicaciones del club.',
    prueba ? 'Darte de baja: (desactivado en las pruebas)' : `Darte de baja: ${bajaUrl}`,
  ].filter(Boolean).join('\n');

  return { html, texto: plano };
}

// ── Envío ──────────────────────────────────────────────────────────────────

const imagenUrlDe = (clave) => (clave ? `${PUBLICO}/img/${clave}` : '');

/**
 * Envía una campaña. Con `soloA`, es una prueba: un único correo a esa
 * dirección, con [PRUEBA] en el asunto y sin registrar nada.
 */
async function enviar(env, c, soloA) {
  const listas = JSON.parse(c.listas || '[]');
  const gente = soloA ? [{ email: soloA, nombre: '' }] : await destinatarios(env, listas);
  const resultado = { total: gente.length, enviados: 0, fallidos: 0, error: '' };
  if (!gente.length) return resultado;

  for (let i = 0; i * POR_LOTE < gente.length; i++) {
    const lote = gente.slice(i * POR_LOTE, (i + 1) * POR_LOTE);
    const correos = await Promise.all(lote.map(async (p) => {
      const bajaUrl = await enlaceBaja(env, p.email, c.id || 0);
      const correo = correoCampana({
        asunto: c.asunto, texto: c.texto, imagenUrl: imagenUrlDe(c.imagen),
        botonTexto: c.boton_texto, botonUrl: c.boton_url, bajaUrl, prueba: !!soloA,
      });
      return {
        from: env.CAMPANAS_DE,
        to: [p.email],
        subject: (soloA ? '[PRUEBA] ' : '') + c.asunto,
        html: correo.html,
        text: correo.texto,
        reply_to: env.AVISO_A,
        // Baja en un clic desde el propio cliente de correo (Gmail, Apple
        // Mail…). Los grandes proveedores la piden para no tratar el envío
        // como spam.
        ...(soloA ? {} : {
          headers: {
            'List-Unsubscribe': `<${bajaUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      };
    }));

    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Si un reintento repite la llamada, Resend no vuelve a enviar el lote.
        ...(soloA ? {} : { 'Idempotency-Key': `campana-${c.id}-lote-${i}` }),
      },
      body: JSON.stringify(correos),
    });
    let respuesta = null;
    try { respuesta = await r.json(); } catch { /* sin cuerpo */ }

    if (r.ok) {
      resultado.enviados += lote.length;
    } else {
      resultado.fallidos += lote.length;
      resultado.error = (respuesta && (respuesta.message || respuesta.name)) || `Resend ${r.status}`;
      console.warn('campaña', c.id, 'lote', i, r.status, JSON.stringify(respuesta));
    }

    if (!soloA) {
      const ids = (respuesta && Array.isArray(respuesta.data)) ? respuesta.data : [];
      await env.DB.batch(lote.map((p, j) => env.DB.prepare(
        'INSERT OR REPLACE INTO campana_envios (campana_id, email, estado, resend_id) VALUES (?,?,?,?)'
      ).bind(c.id, p.email, r.ok ? 'enviado' : 'fallido', (ids[j] && ids[j].id) || null)));
    }
  }
  return resultado;
}

/** Envía una campaña ya reservada (estado «enviando») y guarda el resultado. */
async function enviarYRegistrar(env, c) {
  let res;
  try {
    res = await enviar(env, c);
  } catch (err) {
    res = { total: 0, enviados: 0, fallidos: 0, error: String(err && err.message || err) };
  }
  const estado = res.enviados ? 'enviada' : 'error';
  await env.DB.prepare(
    `UPDATE campanas SET estado = ?, enviada = ?, destinatarios = ?, enviados = ?, fallidos = ?, error = ?
      WHERE id = ?`
  ).bind(estado, ahora(), res.total, res.enviados, res.fallidos, res.error || (res.total ? null : 'No hay destinatarios'), c.id).run();
  return { ...res, estado };
}

/**
 * Marca la campaña como «enviando» sólo si seguía en el estado esperado. Es
 * el cerrojo que impide enviarla dos veces: si dos peticiones (o el
 * programador y un clic) llegan a la vez, sólo una consigue el cambio.
 */
async function reservar(env, id, desde) {
  const marcas = desde.map(() => '?').join(',');
  const r = await env.DB.prepare(
    `UPDATE campanas SET estado = 'enviando' WHERE id = ? AND estado IN (${marcas})`
  ).bind(id, ...desde).run();
  return r.meta.changes === 1;
}

/** Lo llama el programador del Worker cada pocos minutos. */
export async function campanasProgramadas(env) {
  if (!env.RESEND_API_KEY || !env.CLAVE_BAJAS) return;
  const { results } = await env.DB.prepare(
    `SELECT * FROM campanas WHERE estado = 'programada' AND programada <= ? ORDER BY programada`
  ).bind(ahora()).all();
  for (const c of results || []) {
    if (await reservar(env, c.id, ['programada'])) await enviarYRegistrar(env, c);
  }
}

// ── Validación ─────────────────────────────────────────────────────────────

const CLAVE_IMAGEN = /^campanas\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;

function campos(d) {
  const c = {
    asunto: texto(d.asunto, 150),
    texto: texto(d.texto, 20000),
    imagen: CLAVE_IMAGEN.test(String(d.imagen || '')) ? d.imagen : '',
    boton_texto: texto(d.boton_texto, 40),
    boton_url: texto(d.boton_url, 500),
    // Un segmento por grupo: «todos» y «los que no han renovado» de la misma
    // temporada a la vez no tienen sentido.
    listas: JSON.stringify((Array.isArray(d.listas) ? d.listas : [])
      .filter((l, i, arr) => LISTAS[l] && arr.findIndex((x) => GRUPO(x) === GRUPO(l)) === i)),
  };
  if (c.boton_url && !/^https?:\/\/\S+$/.test(c.boton_url)) c.boton_url = '';
  return c;
}

/** Lo que falta para poder enviar; vacío si está lista. */
function faltas(c) {
  const f = [];
  if (!c.asunto) f.push('asunto');
  if (!c.texto) f.push('texto');
  if (!JSON.parse(c.listas || '[]').length) f.push('listas');
  if (c.boton_texto && !c.boton_url) f.push('boton_url');
  return f;
}

// ── Rutas de la zona privada ───────────────────────────────────────────────

async function leer(request) {
  try { return await request.json(); } catch { return {}; }
}

async function campana(env, id) {
  const { results } = await env.DB.prepare('SELECT * FROM campanas WHERE id = ?').bind(id).all();
  return results[0] || null;
}

export async function rutasCampanas(request, env, url, correo) {
  const p = url.pathname;

  if (p === '/admin/campanas' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, creada, autor, asunto, listas, estado, programada, enviada,
              destinatarios, enviados, fallidos, error,
              (SELECT COUNT(*) FROM bajas b WHERE b.campana_id = campanas.id) AS bajas
         FROM campanas ORDER BY id DESC`
    ).all();
    return json({
      ok: true,
      campanas: results || [],
      segmentos: await segmentos(env),
      nombresListas: LISTAS,
      imagenes: !!env.IMAGENES,
      listoParaEnviar: !!(env.RESEND_API_KEY && env.CLAVE_BAJAS && env.CAMPANAS_DE),
    });
  }

  const m = /^\/admin\/campanas\/(\d+)$/.exec(p);
  if (m && request.method === 'GET') {
    const c = await campana(env, +m[1]);
    return c ? json({ ok: true, campana: c }) : json({ ok: false }, 404);
  }

  if (p === '/admin/campanas/previa' && request.method === 'POST') {
    const c = campos(await leer(request));
    const { html } = correoCampana({
      asunto: c.asunto, texto: c.texto, imagenUrl: imagenUrlDe(c.imagen),
      botonTexto: c.boton_texto, botonUrl: c.boton_url, bajaUrl: '#', prueba: false,
    });
    return json({ ok: true, html });
  }

  if (request.method !== 'POST') return null;

  if (p === '/admin/campanas') {
    const d = await leer(request);
    const c = campos(d);
    const id = parseInt(d.id, 10);
    if (id) {
      // Sólo se editan borradores: lo programado o enviado queda fijado.
      const r = await env.DB.prepare(
        `UPDATE campanas SET asunto = ?, texto = ?, imagen = ?, boton_texto = ?, boton_url = ?, listas = ?
          WHERE id = ? AND estado = 'borrador'`
      ).bind(c.asunto, c.texto, c.imagen, c.boton_texto, c.boton_url, c.listas, id).run();
      if (r.meta.changes !== 1) return json({ ok: false, error: 'no_editable' }, 409);
      return json({ ok: true, id });
    }
    const r = await env.DB.prepare(
      `INSERT INTO campanas (creada, autor, asunto, texto, imagen, boton_texto, boton_url, listas)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(ahora(), correo, c.asunto, c.texto, c.imagen, c.boton_texto, c.boton_url, c.listas).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }

  if (p === '/admin/imagen') {
    if (!env.IMAGENES) return json({ ok: false, error: 'sin_almacen' }, 503);
    const tipos = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
    const tipo = (request.headers.get('Content-Type') || '').split(';')[0].trim();
    if (!tipos[tipo]) return json({ ok: false, error: 'tipo' }, 415);
    const datos = await request.arrayBuffer();
    if (!datos.byteLength || datos.byteLength > 5 * 1024 * 1024) return json({ ok: false, error: 'tamano' }, 413);
    const clave = `campanas/${crypto.randomUUID()}.${tipos[tipo]}`;
    await env.IMAGENES.put(clave, datos, { httpMetadata: { contentType: tipo } });
    return json({ ok: true, clave, url: imagenUrlDe(clave) });
  }

  // El resto actúa sobre una campaña existente. Cualquier otra ruta se deja
  // pasar sin tocar el cuerpo de la petición, que es de quien la atienda.
  const ACCIONES = ['prueba', 'enviar', 'programar', 'cancelar', 'borrar'].map((a) => '/admin/campanas/' + a);
  if (!ACCIONES.includes(p)) return null;
  const d = await leer(request);
  const id = parseInt(d.id, 10);
  const c = id ? await campana(env, id) : null;
  if (!c) return json({ ok: false, error: 'no_existe' }, 404);
  const listoParaEnviar = env.RESEND_API_KEY && env.CLAVE_BAJAS && env.CAMPANAS_DE;

  if (p === '/admin/campanas/prueba') {
    if (!listoParaEnviar) return json({ ok: false, error: 'sin_configurar' }, 503);
    const f = faltas(c).filter((x) => x !== 'listas');
    if (f.length) return json({ ok: false, error: 'incompleta', faltas: f }, 422);
    const res = await enviar(env, c, correo);
    return json({ ok: res.enviados === 1, para: correo, error: res.error }, res.enviados === 1 ? 200 : 502);
  }

  if (p === '/admin/campanas/enviar') {
    if (!listoParaEnviar) return json({ ok: false, error: 'sin_configurar' }, 503);
    const f = faltas(c);
    if (f.length) return json({ ok: false, error: 'incompleta', faltas: f }, 422);
    if (!(await reservar(env, id, ['borrador']))) return json({ ok: false, error: 'no_editable' }, 409);
    const res = await enviarYRegistrar(env, c);
    return json({ ok: res.enviados > 0, ...res });
  }

  if (p === '/admin/campanas/programar') {
    const f = faltas(c);
    if (f.length) return json({ ok: false, error: 'incompleta', faltas: f }, 422);
    const cuando = new Date(d.cuando);
    if (isNaN(cuando) || cuando.getTime() < Date.now() + 60e3) return json({ ok: false, error: 'fecha' }, 422);
    const r = await env.DB.prepare(
      `UPDATE campanas SET estado = 'programada', programada = ? WHERE id = ? AND estado = 'borrador'`
    ).bind(cuando.toISOString(), id).run();
    return r.meta.changes === 1 ? json({ ok: true }) : json({ ok: false, error: 'no_editable' }, 409);
  }

  if (p === '/admin/campanas/cancelar') {
    const r = await env.DB.prepare(
      `UPDATE campanas SET estado = 'borrador', programada = NULL WHERE id = ? AND estado = 'programada'`
    ).bind(id).run();
    return r.meta.changes === 1 ? json({ ok: true }) : json({ ok: false, error: 'no_editable' }, 409);
  }

  if (p === '/admin/campanas/borrar') {
    const r = await env.DB.prepare(`DELETE FROM campanas WHERE id = ? AND estado = 'borrador'`).bind(id).run();
    return r.meta.changes === 1 ? json({ ok: true }) : json({ ok: false, error: 'no_editable' }, 409);
  }

  return null;
}

// ── Rutas públicas: imágenes y bajas ───────────────────────────────────────

function pagina(titulo, cuerpo) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${titulo} · Balonmano Vetusta</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#14161a;color:#fff;text-align:center;padding:24px;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.caja{max-width:420px}
h1{font-size:1.25rem;margin:0 0 10px}
p{margin:0 0 20px;color:#b9bec5;font-size:.95rem}
button{font:inherit;font-weight:800;letter-spacing:1px;text-transform:uppercase;cursor:pointer;background:#FDED3A;color:#000;border:0;border-radius:999px;padding:14px 30px}
a{color:#FDED3A}
</style></head>
<body><div class="caja">${cuerpo}</div></body></html>`;
}

const CAB_PAGINA = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

export async function rutasPublicas(request, env, url) {
  const m = /^\/img\/(campanas\/[^/]+)$/.exec(url.pathname);
  if (m && request.method === 'GET') {
    if (!env.IMAGENES || !CLAVE_IMAGEN.test(m[1])) return new Response('No encontrada', { status: 404 });
    const obj = await env.IMAGENES.get(m[1]);
    if (!obj) return new Response('No encontrada', { status: 404 });
    return new Response(obj.body, {
      headers: {
        'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
        // La clave es aleatoria y no se reutiliza: se puede guardar para siempre.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (url.pathname !== '/baja') return null;

  const email = String(url.searchParams.get('e') || '').trim().toLowerCase();
  const campanaId = parseInt(url.searchParams.get('c'), 10) || 0;
  const t = url.searchParams.get('t') || '';
  const valido = env.CLAVE_BAJAS && correoValido(email) &&
    igualSeguro(t, await firma(env, `baja|${email}|${campanaId}`));
  if (!valido) {
    return new Response(pagina('Enlace no válido',
      '<h1>Este enlace no es válido</h1><p>Si quieres dejar de recibir correos del club, escríbenos a <a href="mailto:balonmanovetusta@gmail.com">balonmanovetusta@gmail.com</a>.</p>'),
      { status: 400, headers: CAB_PAGINA });
  }

  // GET sólo pregunta: los antivirus del correo abren los enlaces por su
  // cuenta, y si la baja se hiciera al abrir, darían de baja a la gente sin
  // que lo pidiera. La baja se hace con el botón (POST), que es también lo
  // que usa la baja en un clic de Gmail o Apple Mail.
  if (request.method === 'GET') {
    return new Response(pagina('Darte de baja',
      `<h1>¿Dejar de recibir correos del Balonmano Vetusta?</h1>
       <p>${esc(email)} no volverá a recibir nuestras campañas.</p>
       <form method="post"><button type="submit">Darme de baja</button></form>`),
      { headers: CAB_PAGINA });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const fecha = ahora();
  await env.DB.batch([
    env.DB.prepare(`UPDATE abonados SET comunicaciones = 'No' WHERE lower(email) = ?`).bind(email),
    env.DB.prepare(`UPDATE socios_anteriores SET comunicaciones = 'No' WHERE lower(email) = ?`).bind(email),
    env.DB.prepare(`UPDATE contactos SET comunicaciones = 'No' WHERE lower(email) = ?`).bind(email),
    env.DB.prepare('INSERT INTO bajas (email, fecha, campana_id) VALUES (?,?,?)').bind(email, fecha, campanaId || null),
  ]);
  return new Response(pagina('Baja confirmada',
    '<h1>Hecho: te hemos dado de baja</h1><p>No volverás a recibir nuestras campañas. Si ha sido un error, escríbenos a <a href="mailto:balonmanovetusta@gmail.com">balonmanovetusta@gmail.com</a>.</p>'),
    { headers: CAB_PAGINA });
}
