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

async function isquad(ruta, datos) {
  const r = await fetch(`${ISQUAD}${ruta}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      Accept: 'application/json',
      'User-Agent': UA,
      'Accept-Language': 'es-ES;q=1.0, en-ES;q=0.9',
    },
    body: new URLSearchParams(datos).toString(),
  });
  if (!r.ok) throw new Error(`isquad ${r.status}`);
  const d = await r.json();
  if (d.status !== 'OK') throw new Error(`isquad ${d.error || 'KO'}`);
  return d;
}

// Guarda en la caché del Worker lo que devuelve «obtener» durante «segundos».
async function cacheado(clave, segundos, obtener) {
  const peticion = new Request(`https://admin.balonmanovetusta.com/__cache/isquad/${clave}`);
  const cache = caches.default;
  const guardada = await cache.match(peticion);
  if (guardada) return guardada.json();
  const valor = await obtener();
  await cache.put(peticion, new Response(JSON.stringify(valor), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${segundos}` },
  }));
  return valor;
}

// Trayectoria de un equipo: cinco minutos en caché, para que recargar el
// panel no repita las nueve consultas a la federación.
const trayectoria = (id) => cacheado(`equipo/${TEMPORADA_ISQUAD}/${id}`, 300, async () =>
  ((await isquad('/ws/equipo', { id_equipo: id, id_temporada: TEMPORADA_ISQUAD })).equipo || {}).trayectoria || []);

// La trayectoria no dice dónde se juega. El calendario del grupo sí (el
// número de pabellón de cada partido), y /ws/estadio, el nombre y la dirección.
const pabellonesDelGrupo = (grupo) => cacheado(`grupo/${grupo}`, 3600, async () => {
  const mapa = {};
  for (const m of (await isquad('/ws/calendario', { id_grupo: grupo })).calendarios || []) mapa[m.id] = m.id_estadio || '';
  return mapa;
});

const pabellon = (id) => cacheado(`estadio/${id}`, 86400, async () => {
  const e = (await isquad('/ws/estadio', { id_estadio: id })).estadio || {};
  const direccion = arreglarTexto(e.direccion);
  // La localidad es lo que va detrás del código postal: «33012 Oviedo, …».
  const localidad = (direccion.match(/\b\d{5}\s+([^,]+)/) || [])[1] || '';
  return { nombre: arreglarTexto(e.nombre_estadio).trim(), localidad: localidad.trim() };
});

// Algunos textos de la federación llegan con los bytes UTF-8 leídos como
// latin-1 («GijÃ³n»). Se reinterpretan sólo si muestran la marca Ã/Â y si el
// resultado es UTF-8 válido (el mismo arreglo que fixMojibake en fetch-data.js).
function arreglarTexto(s) {
  s = String(s || '');
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

const diaValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z'));

function sumarDias(dia, n) {
  const d = new Date(dia + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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
        grupo: p.id_grupo,
        fecha: p.fecha,
        equipo: [local && nuestros.get(p.id_local), visitante && nuestros.get(p.id_visitante)].filter(Boolean).join(' · '),
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

  // Pabellón de cada partido. Si la federación falla aquí, los partidos salen
  // igual, sólo que sin lugar.
  try {
    const grupos = [...new Set(partidos.map((p) => p.grupo).filter(Boolean))];
    const mapas = Object.assign({}, ...await Promise.all(grupos.map((g) => pabellonesDelGrupo(g).catch(() => ({})))));
    const ids = [...new Set(partidos.map((p) => mapas[p.id]).filter(Boolean))];
    const nombres = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await pabellon(id).catch(() => null)])));
    for (const p of partidos) {
      const e = nombres[mapas[p.id]];
      p.pabellon = e ? e.nombre : '';
      p.localidad = e ? e.localidad : '';
    }
  } catch { /* sin pabellones */ }
  for (const p of partidos) delete p.grupo;
  return json({ ok: true, desde, dias, partidos, fallos });
}
