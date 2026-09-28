/**
 * Posibles patrocinadores: la lista de empresas a las que el club piensa
 * dirigirse, con el seguimiento de cada una.
 *
 * Sólo existe tras Cloudflare Access (el panel antiguo con clave no la ve) y
 * sólo guarda datos de empresa publicados por ellas mismas: web, teléfono y
 * correo genérico, más de dónde salió cada una. No es una lista para
 * campañas: el contacto es uno a uno, desde el correo del club.
 */

const CAB = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CAB });
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// Un enlace sólo se guarda si es http(s): el panel lo pinta como href y un
// «javascript:» ahí sería código ejecutándose con la sesión abierta.
const enlace = (v) => {
  const s = texto(v, 500);
  return /^https?:\/\/[^\s"<>]+$/i.test(s) ? s : '';
};

const fechaDia = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

// Lo que se puede escribir desde el panel. Lo demás (id, creado, quién lo
// tocó por última vez) lo pone el servidor.
function campos(b) {
  return {
    lote: texto(b.lote, 60),
    empresa: texto(b.empresa, 160),
    sector: texto(b.sector, 120),
    zona: texto(b.zona, 120),
    web: enlace(b.web),
    telefono: texto(b.telefono, 120),
    email: texto(b.email, 200).toLowerCase(),
    contacto: texto(b.contacto, 200),
    fuente: texto(b.fuente, 300),
    fuente_url: enlace(b.fuente_url),
    motivo: texto(b.motivo, 1000),
    proximo_paso: texto(b.proximo_paso, 300),
    fecha_proximo: fechaDia(b.fecha_proximo),
    responsable: texto(b.responsable, 80),
    notas: texto(b.notas, 4000),
  };
}

async function leer(request) {
  try { return await request.json(); } catch { return {}; }
}

export async function rutasProspectos(request, env, url, correo) {
  const p = url.pathname;

  if (p === '/admin/prospectos' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM prospectos ORDER BY id').all();
    return json({ ok: true, prospectos: results || [] });
  }

  if (p === '/admin/prospectos' && request.method === 'POST') {
    const c = campos(await leer(request));
    if (!c.empresa) return json({ ok: false, error: 'Falta el nombre de la empresa.' }, 400);
    const ahora = new Date().toISOString();
    const nombres = Object.keys(c);
    const r = await env.DB.prepare(
      `INSERT INTO prospectos (${nombres.join(', ')}, creado, actualizado, actualizado_por)
       VALUES (${nombres.map(() => '?').join(', ')}, ?, ?, ?)`
    ).bind(...nombres.map((k) => c[k]), ahora, ahora, correo || '').run();
    const { results } = await env.DB.prepare('SELECT * FROM prospectos WHERE id = ?')
      .bind(r.meta.last_row_id).all();
    return json({ ok: true, prospecto: results[0] });
  }

  const m = /^\/admin\/prospectos\/(\d+)$/.exec(p);
  if (m && request.method === 'POST') {
    const b = await leer(request);
    const c = campos(b);
    if (!c.empresa) return json({ ok: false, error: 'Falta el nombre de la empresa.' }, 400);
    const ahora = new Date().toISOString();
    const nombres = Object.keys(c);
    // Sólo se guarda si nadie la ha cambiado desde que se abrió: si dos
    // personas la editan a la vez, la segunda no pisa a la primera sin verlo.
    const r = await env.DB.prepare(
      `UPDATE prospectos SET ${nombres.map((k) => k + ' = ?').join(', ')},
              actualizado = ?, actualizado_por = ?
        WHERE id = ? AND actualizado = ?`
    ).bind(...nombres.map((k) => c[k]), ahora, correo || '', +m[1], texto(b.actualizado, 40)).run();
    if (!r.meta.changes) {
      return json({ ok: false, error: 'Alguien la ha cambiado mientras la tenías abierta. Recarga y vuelve a intentarlo.' }, 409);
    }
    const { results } = await env.DB.prepare('SELECT * FROM prospectos WHERE id = ?').bind(+m[1]).all();
    return json({ ok: true, prospecto: results[0] });
  }

  return null;
}
