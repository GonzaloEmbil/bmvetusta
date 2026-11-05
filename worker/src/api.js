/**
 * Datos de liga para la web pública, en balonmanovetusta.com/api:
 *
 *   /api/liga/<temporada>/<archivo>.json   los cinco JSON del primer equipo
 *       (clasificación, resultados, goleadores, calendario y próximo partido),
 *       los mismos que la tarea de GitHub deja en data/.
 *   /api/equipo/<temporada>/<id>.json[?grupo=<id_grupo>]   todo lo que pinta
 *       la sección de categorías de la portada para un equipo del club, en una
 *       sola respuesta: sus grupos de liga (fases), y clasificación, resultados
 *       y próximos partidos del grupo pedido (por defecto el actual); los
 *       equipos sénior llevan además goleadores. El primer equipo sale de los
 *       mismos datos que /api/liga.
 *
 * Todo se calcula con el mismo módulo que la tarea de GitHub (liga.js) y se
 * sirve desde la base de datos. La web lo pide primero aquí y, si esto falla,
 * carga los JSON estáticos de respaldo.
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
const EQUIPOS_WEB = liga.EQUIPOS.filter((e) => e.web);
const listaEquipos = () => EQUIPOS_WEB.map((e) => ({ id: e.id, nombre: e.nombre }));

const CAB = {
  'Content-Type': 'application/json; charset=utf-8',
  // El navegador guarda la respuesta cinco minutos: quien va de página en
  // página no vuelve a ejecutar el worker. Los datos se renuevan cada 15, así
  // que como mucho ve datos de hace 20 en vez de 16.
  'Cache-Control': 'public, max-age=300',
  // Sin cabecera CORS: la web llama desde su propio dominio, y así otras webs
  // no pueden consumir la API desde el navegador de sus visitantes.
  'X-Content-Type-Options': 'nosniff',
};
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CAB, ...extra } });
const sinDatos = () => json({ error: 'sin datos' }, 503, { 'Cache-Control': 'no-store' });

async function leer(env, clave) {
  const fila = await env.DB.prepare('SELECT json FROM liga_cache WHERE clave = ?').bind(clave).first();
  return fila ? JSON.parse(fila.json) : null;
}

async function guardar(env, clave, fila) {
  await env.DB.prepare(
    `INSERT INTO liga_cache (clave, json, actualizado) VALUES (?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET json = excluded.json, actualizado = excluded.actualizado`
  ).bind(clave, JSON.stringify(fila), fila.intento).run();
}

// Según la edad de lo guardado: se renueva antes de responder (y se devuelve
// la fila nueva), en segundo plano (se devuelve null y se sirve lo guardado)
// o nada. Un intento reciente, fallido o no, frena el siguiente.
async function segunFrescura(ctx, actualizado, intento, renovar) {
  const edad = actualizado ? Date.now() - Date.parse(actualizado) : Infinity;
  const desdeIntento = intento ? Date.now() - Date.parse(intento) : Infinity;
  if (edad > CADUCIDAD) return desdeIntento > REINTENTO ? renovar() : null;
  if (edad > FRESCURA && desdeIntento > REINTENTO) ctx.waitUntil(renovar());
  return null;
}

// Lo que los goleadores necesitan de un acta: los goles y las fotos de los
// jugadores del equipo. El acta entera trae todos los eventos del partido y
// pesa decenas de KB; guardarla entera, partido a partido, llenaría la fila.
function recortarActa(acta, teamId) {
  const nuestro = (x) => String(x.id_equipo) === String(teamId);
  return {
    goles: (acta.goles || []).filter(nuestro).map((g) => ({ id: g.id, nombre: g.nombre, id_equipo: g.id_equipo, es_propia: g.es_propia })),
    jugadores: (acta.jugadores || []).filter(nuestro).map((j) => ({ id: j.id, id_equipo: j.id_equipo, imagen: j.imagen })),
  };
}

// Pide las actas que faltan de los partidos del grupo y devuelve las de todos
// ellos, en orden de calendario: es el orden en que las lee el script, y con
// él se decide el desempate entre goleadores iguales.
async function completarActas(fila, grupo, partidos, teamId) {
  const conActa = liga.matchesWithActa(partidos, teamId);
  let pedidas = 0;
  for (const m of conActa) {
    if (fila.actas[m.id] || pedidas >= MAX_ACTAS) continue;
    pedidas++;
    const acta = (await isquad('/ws/acta', { id_grupo: grupo, id_partido: String(m.id) })).acta;
    if (acta) fila.actas[m.id] = recortarActa(acta, teamId);
  }
  return conActa.filter((m) => fila.actas[m.id]).map((m) => ({ matchId: m.id, acta: fila.actas[m.id] }));
}

// ── Primer equipo: los cinco JSON ──────────────────────────────────────────

async function renovarLiga(env, temporada) {
  const t = liga.TEMPORADAS.find((x) => x.code === temporada);
  const clave = `liga:${temporada}`;
  const fila = (await leer(env, clave)) || { actas: {}, estadios: {} };
  const ahora = new Date().toISOString();
  try {
    const partidos = (await isquad('/ws/calendario', { id_grupo: t.grupo })).calendarios || [];
    if (!partidos.length) throw new Error('calendario vacío');
    const actas = await completarActas(fila, t.grupo, partidos, liga.TEAM_ID);

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
  await guardar(env, clave, fila);
  return fila;
}

async function filaLiga(env, ctx, temporada) {
  const fila = await leer(env, `liga:${temporada}`);
  const nueva = await segunFrescura(ctx, fila && fila.actualizado, fila && fila.intento, () => renovarLiga(env, temporada));
  return nueva || fila;
}

// ── Equipos del club: un paquete por equipo y grupo ─────────────────────────

// La fila de un equipo guarda sus grupos de liga (de la trayectoria) y, por
// grupo, lo calculado del calendario; las actas, sólo si lleva goleadores.
async function renovarEquipo(env, temporada, equipo, grupoPedido) {
  const clave = `equipo:${temporada}:${equipo.id}`;
  const fila = (await leer(env, clave)) || { grupos: [], datos: {}, actas: {} };
  const ahora = new Date().toISOString();
  try {
    const t = await isquad('/ws/equipo', { id_equipo: equipo.id, id_temporada: temporada });
    fila.grupos = liga.gruposDeLiga((t.equipo && t.equipo.trayectoria) || []);
    fila.actualizado = ahora;
    const grupo = grupoDe(fila, grupoPedido);
    if (grupo) {
      const partidos = (await isquad('/ws/calendario', { id_grupo: grupo })).calendarios || [];
      const datos = {
        clasificacion: liga.buildClasificacion(partidos, equipo.id),
        resultados: liga.buildResultados(partidos, equipo.id),
        calendario: liga.buildCalendario(partidos, equipo.id),
        actualizado: ahora,
      };
      if (equipo.goleadores) datos.goleadores = liga.buildGoleadores(await completarActas(fila, grupo, partidos, equipo.id), equipo.id);
      fila.datos[grupo] = datos;
    }
  } catch (e) {
    console.warn(`equipo ${equipo.id}: no se ha podido renovar: ${e.message}`);
  }
  fila.intento = ahora;
  await guardar(env, clave, fila);
  return fila;
}

// El grupo que toca: el pedido, si es uno de los del equipo; si no, el actual.
function grupoDe(fila, grupoPedido) {
  if (!fila) return null;
  if (grupoPedido && fila.grupos.some((g) => g.id === grupoPedido)) return grupoPedido;
  const actual = fila.grupos.find((g) => g.actual);
  return actual ? actual.id : null;
}

function paquete(equipo, temporada, grupos, grupo, d, actualizado) {
  const cuerpo = {
    equipo: { id: equipo.id, nombre: equipo.nombre },
    temporada,
    equipos: listaEquipos(),
    grupos,
    grupo,
    clasificacion: d.clasificacion,
    resultados: d.resultados,
    calendario: d.calendario,
  };
  if (d.goleadores) cuerpo.goleadores = d.goleadores;
  // El primer equipo trae también el próximo partido: la portada pinta el
  // banner con él y se ahorra una petición.
  if (d['proximo-partido'] !== undefined) cuerpo['proximo-partido'] = d['proximo-partido'];
  cuerpo.actualizado = actualizado;
  return json(cuerpo, 200, { 'X-Actualizado': actualizado || '' });
}

async function rutaEquipo(env, ctx, temporada, id, grupoPedido) {
  const equipo = EQUIPOS_WEB.find((e) => e.id === id);
  if (!equipo) return json({ error: 'no existe' }, 404);

  // El primer equipo sale de los datos de /api/liga: un solo grupo.
  if (equipo.id === liga.TEAM_ID) {
    const t = liga.TEMPORADAS.find((x) => x.code === temporada);
    if (grupoPedido && grupoPedido !== t.grupo) return json({ error: 'no existe' }, 404);
    const fila = await filaLiga(env, ctx, temporada);
    if (!fila || !fila.salida) return sinDatos();
    return paquete(equipo, temporada, [liga.grupoPrimera(t.grupo)], t.grupo, fila.salida, fila.actualizado);
  }

  let fila = await leer(env, `equipo:${temporada}:${id}`);
  let grupo = grupoDe(fila, grupoPedido);
  // Frescura de lo que se va a servir: los datos del grupo o, si el equipo
  // no tiene liga, la lista de grupos.
  const d = grupo ? fila.datos[grupo] : null;
  const actualizado = grupo ? d && d.actualizado : fila && fila.actualizado;
  const nueva = await segunFrescura(ctx, actualizado, fila && fila.intento, () => renovarEquipo(env, temporada, equipo, grupoPedido));
  if (nueva) { fila = nueva; grupo = grupoDe(fila, grupoPedido); }

  if (!fila || !fila.actualizado) return sinDatos();
  if (grupo) {
    if (!fila.datos[grupo]) return sinDatos();
    return paquete(equipo, temporada, fila.grupos, grupo, fila.datos[grupo], fila.datos[grupo].actualizado);
  }
  // Sin competición de liga publicada todavía.
  return paquete(equipo, temporada, fila.grupos, null, { clasificacion: [], resultados: [], calendario: [] }, fila.actualizado);
}

// ── Rutas ───────────────────────────────────────────────────────────────────

export async function rutasApi(request, env, ctx, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'método' }, 405);

  const eq = /^\/api\/equipo\/(\d{4})\/(\d+)\.json$/.exec(url.pathname);
  if (eq) {
    const grupo = url.searchParams.get('grupo');
    if (eq[1] !== liga.TEMPORADA_ACTUAL || (grupo && !/^\d+$/.test(grupo))) return json({ error: 'no existe' }, 404);
    return rutaEquipo(env, ctx, eq[1], eq[2], grupo || null);
  }

  const m = /^\/api\/liga\/(\d{4})\/([a-z-]+)\.json$/.exec(url.pathname);
  if (!m || m[1] !== liga.TEMPORADA_ACTUAL || !ARCHIVOS.includes(m[2])) return json({ error: 'no existe' }, 404);
  const [, temporada, archivo] = m;
  const fila = await filaLiga(env, ctx, temporada);
  if (!fila || !fila.salida) return sinDatos();
  return json(fila.salida[archivo] ?? null, 200, { 'X-Actualizado': fila.actualizado });
}
