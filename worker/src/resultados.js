/**
 * Partidos y resultados de los equipos del club en una semana, para el área privada.
 *
 * Los datos vienen de la API de la federación (balonmano.isquad.es), la misma
 * que usa scripts/fetch-data.js para la web. /ws/equipo, con la temporada,
 * devuelve la «trayectoria» del equipo: todos sus partidos de la temporada en
 * cualquier competición (liga, copa, amistosos), jugados o por jugar.
 *
 * La API no tiene una consulta de «equipos de un club». Los equipos del Vetusta
 * se localizan recorriendo los grupos de la temporada y quedándose con los que
 * llevan el escudo del club (scripts/equipos-club.mjs). La lista de abajo es el
 * resultado; hay que repasarla cuando la federación cree grupos nuevos
 * (alevines, ligas que arrancan más tarde) y al empezar cada temporada.
 */

const ISQUAD = 'https://balonmano.isquad.es';
// La API sólo responde a la app oficial; es la misma cabecera que usa
// scripts/fetch-data.js (pública en el repositorio, no es una credencial).
const UA = '6&"7*/5*&,?"->(1483>%1*!("%* 0\'\'>8.38-"?",("2#,!$(1>:64?"?,#?*=\'")*2" =.70IOS';

export const TEMPORADA_ISQUAD = '2627';

// id de equipo en la federación → cómo se llama en el panel.
export const EQUIPOS = [
  { id: '209500', nombre: 'Primera Nacional' },
  { id: '210109', nombre: 'Segunda Nacional' },
  { id: '208099', nombre: 'Juvenil masculino' },
  { id: '223058', nombre: 'Cadete masculino A' },
  { id: '227049', nombre: 'Cadete masculino B' },
  { id: '223060', nombre: 'Cadete femenino' },
  { id: '221137', nombre: 'Infantil masculino A' },
  { id: '223207', nombre: 'Infantil masculino B' },
  { id: '216662', nombre: 'Infantil femenino' },
];

const CAB = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CAB });

// Trayectoria de un equipo. Se guarda cinco minutos en la caché del Worker:
// así recargar el panel no repite las nueve consultas a la federación.
async function trayectoria(id) {
  const clave = new Request(`https://admin.balonmanovetusta.com/__cache/isquad/equipo/${TEMPORADA_ISQUAD}/${id}`);
  const cache = caches.default;
  const guardada = await cache.match(clave);
  if (guardada) return guardada.json();
  const r = await fetch(`${ISQUAD}/ws/equipo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      Accept: 'application/json',
      'User-Agent': UA,
      'Accept-Language': 'es-ES;q=1.0, en-ES;q=0.9',
    },
    body: new URLSearchParams({ id_equipo: id, id_temporada: TEMPORADA_ISQUAD }).toString(),
  });
  if (!r.ok) throw new Error(`isquad ${r.status}`);
  const d = await r.json();
  if (d.status !== 'OK') throw new Error(`isquad ${d.error || 'KO'}`);
  const partidos = (d.equipo && d.equipo.trayectoria) || [];
  await cache.put(clave, new Response(JSON.stringify(partidos), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
  }));
  return partidos;
}

const diaValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z'));

function sumarDias(dia, n) {
  const d = new Date(dia + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Las competiciones llegan como «CATEGORÍA - FASE - GRUPO»; basta la primera parte.
const competicion = (s) => String(s || '').split(' - ')[0].trim();

export async function rutasResultados(request, env, url) {
  if (url.pathname !== '/admin/resultados' || request.method !== 'GET') return null;
  // «desde» es el lunes de la semana: entran de lunes a domingo, para no
  // perder los partidos entre semana (las fechas de la federación ya vienen
  // en hora de España).
  const desde = url.searchParams.get('desde');
  if (!diaValido(desde)) return json({ ok: false, error: 'Fecha no válida.' }, 400);
  const dias = [0, 1, 2, 3, 4, 5, 6].map((n) => sumarDias(desde, n));

  const nuestros = new Map(EQUIPOS.map((e) => [e.id, e.nombre]));
  const vistos = new Map();
  const fallos = [];
  await Promise.all(EQUIPOS.map(async (eq) => {
    let lista;
    try { lista = await trayectoria(eq.id); } catch { fallos.push(eq.nombre); return; }
    for (const p of lista) {
      if (!dias.includes(String(p.fecha || '').slice(0, 10))) continue;
      // Un partido entre dos equipos del club sale en las dos trayectorias:
      // se cuenta una vez, con los dos nombres.
      if (vistos.has(p.id)) continue;
      const local = nuestros.has(p.id_local), visitante = nuestros.has(p.id_visitante);
      vistos.set(p.id, {
        id: p.id,
        fecha: p.fecha,
        equipo: [local && nuestros.get(p.id_local), visitante && nuestros.get(p.id_visitante)].filter(Boolean).join(' · '),
        competicion: competicion(p.nombre_competicion),
        local: p.nombre_local,
        visitante: p.nombre_visitante,
        escudo_local: p.url_escudo_local || '',
        escudo_visitante: p.url_escudo_visitante || '',
        nuestro_local: local,
        nuestro_visitante: visitante,
        goles_local: p.resultado_local === null || p.resultado_local === '' ? null : Number(p.resultado_local),
        goles_visitante: p.resultado_visitante === null || p.resultado_visitante === '' ? null : Number(p.resultado_visitante),
        estado: p.estado_partido || '',
      });
    }
  }));
  const partidos = [...vistos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return json({ ok: true, desde, dias, partidos, fallos });
}
