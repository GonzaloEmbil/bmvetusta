/**
 * Datos de la liga del primer equipo para la web pública, en
 * balonmanovetusta.com/api/liga/<temporada>/<archivo>.json: los mismos cinco
 * JSON que la tarea de GitHub deja en data/ (clasificación, resultados,
 * goleadores, calendario y próximo partido), calculados con el mismo módulo
 * (liga.js) y servidos desde la base de datos. La web los pide primero aquí
 * y, si esto falla, carga los estáticos.
 *
 * La federación no se consulta por cada visita. Lo guardado se sirve al
 * instante y, si tiene más de FRESCURA, se renueva en segundo plano una sola
 * vez (las visitas siguientes ya reciben lo nuevo). Si es más viejo que
 * CADUCIDAD —o no hay nada—, se renueva antes de responder, para que el
 * primer visitante del día no vea datos de ayer. Las actas de los partidos
 * terminados y los pabellones se guardan y no se vuelven a pedir, así una
 * renovación normal son una o dos llamadas. Si la federación falla, se sigue
 * sirviendo lo último que hubo y no se reintenta hasta pasado REINTENTO.
 *
 * Sólo la temporada en curso: las anteriores no cambian y la web las lee de
 * los JSON estáticos.
 */

import * as liga from './liga.js';
import { isquad } from './resultados.js';

const FRESCURA = 15 * 60 * 1000;
const CADUCIDAD = 6 * 60 * 60 * 1000;
const REINTENTO = 2 * 60 * 1000;
// Actas nuevas por renovación. Un Worker gratuito puede hacer 50 consultas
// externas por petición; con el calendario y un pabellón, esto deja margen.
// Sólo importa la primera vez: después se piden una o dos por semana.
const MAX_ACTAS = 30;

const ARCHIVOS = ['clasificacion', 'resultados', 'goleadores', 'calendario', 'proximo-partido'];

const CAB = {
  'Content-Type': 'application/json; charset=utf-8',
  // Cloudflare guarda la respuesta un minuto: un día de partido con muchas
  // visitas no multiplica las lecturas.
  'Cache-Control': 'public, max-age=60',
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
};
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CAB, ...extra } });

async function leer(env, temporada) {
  const fila = await env.DB.prepare('SELECT json FROM liga_cache WHERE clave = ?').bind(`liga:${temporada}`).first();
  return fila ? JSON.parse(fila.json) : null;
}

async function guardar(env, temporada, fila) {
  await env.DB.prepare(
    `INSERT INTO liga_cache (clave, json, actualizado) VALUES (?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET json = excluded.json, actualizado = excluded.actualizado`
  ).bind(`liga:${temporada}`, JSON.stringify(fila), fila.intento).run();
}

// Lo que los goleadores necesitan de un acta: los goles y las fotos de los
// jugadores del club. El acta entera trae todos los eventos del partido y
// pesa decenas de KB; guardarla entera, partido a partido, llenaría la fila.
function recortarActa(acta) {
  const nuestro = (x) => String(x.id_equipo) === liga.TEAM_ID;
  return {
    goles: (acta.goles || []).filter(nuestro).map((g) => ({ id: g.id, nombre: g.nombre, id_equipo: g.id_equipo, es_propia: g.es_propia })),
    jugadores: (acta.jugadores || []).filter(nuestro).map((j) => ({ id: j.id, id_equipo: j.id_equipo, imagen: j.imagen })),
  };
}

// Vuelve a calcular los cinco JSON de una temporada y los guarda. Si la
// federación falla, la fila se queda como estaba (sólo cambia «intento»).
async function renovar(env, temporada) {
  const t = liga.TEMPORADAS.find((x) => x.code === temporada);
  const fila = (await leer(env, temporada)) || { actas: {}, estadios: {} };
  const ahora = new Date().toISOString();
  try {
    const partidos = (await isquad('/ws/calendario', { id_grupo: t.grupo })).calendarios || [];
    if (!partidos.length) throw new Error('calendario vacío');

    // Actas que faltan. En orden de calendario, que es el orden en que el
    // script las lee: con él se decide el desempate entre goleadores iguales.
    const conActa = liga.matchesWithActa(partidos);
    let pedidas = 0;
    for (const m of conActa) {
      if (fila.actas[m.id] || pedidas >= MAX_ACTAS) continue;
      pedidas++;
      const acta = (await isquad('/ws/acta', { id_grupo: t.grupo, id_partido: String(m.id) })).acta;
      if (acta) fila.actas[m.id] = recortarActa(acta);
    }
    const actas = conActa.filter((m) => fila.actas[m.id]).map((m) => ({ matchId: m.id, acta: fila.actas[m.id] }));

    const estadio = async (id) => {
      id = String(id);
      if (!fila.estadios[id]) {
        const e = (await isquad('/ws/estadio', { id_estadio: id })).estadio;
        if (e) fila.estadios[id] = { nombre_estadio: e.nombre_estadio, direccion: e.direccion };
      }
      return fila.estadios[id] || null;
    };

    fila.salida = {
      clasificacion: liga.buildClasificacion(partidos),
      resultados: liga.buildResultados(partidos),
      goleadores: liga.buildGoleadores(actas),
      calendario: liga.buildCalendario(partidos),
      'proximo-partido': await liga.buildProximoPartido(partidos, estadio),
    };
    fila.actualizado = ahora;
  } catch (e) {
    console.warn(`liga ${temporada}: no se ha podido renovar: ${e.message}`);
  }
  fila.intento = ahora;
  await guardar(env, temporada, fila);
  return fila;
}

export async function rutasApi(request, env, ctx, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'método' }, 405);
  const m = /^\/api\/liga\/(\d{4})\/([a-z-]+)\.json$/.exec(url.pathname);
  if (!m || m[1] !== liga.TEMPORADA_ACTUAL || !ARCHIVOS.includes(m[2])) return json({ error: 'no existe' }, 404);
  const [, temporada, archivo] = m;

  let fila = await leer(env, temporada);
  const edad = fila && fila.actualizado ? Date.now() - Date.parse(fila.actualizado) : Infinity;
  const desdeIntento = fila && fila.intento ? Date.now() - Date.parse(fila.intento) : Infinity;
  if (edad > CADUCIDAD) {
    if (desdeIntento > REINTENTO) fila = await renovar(env, temporada);
  } else if (edad > FRESCURA && desdeIntento > REINTENTO) {
    ctx.waitUntil(renovar(env, temporada));
  }

  if (!fila || !fila.salida) return json({ error: 'sin datos' }, 503, { 'Cache-Control': 'no-store' });
  return json(fila.salida[archivo] ?? null, 200, { 'X-Actualizado': fila.actualizado });
}
