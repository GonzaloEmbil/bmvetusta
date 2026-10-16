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

// id de equipo en la federación → cómo se llama en el panel. El orden importa:
// de mayor a menor categoría, que es como salen en la tabla y en la imagen, y
// dentro de cada edad, el femenino siempre antes que el masculino.
export const EQUIPOS = [
  { id: '209500', nombre: 'Primera Nacional' },
  { id: '210109', nombre: 'Segunda Nacional' },
  { id: '208099', nombre: 'Juvenil masculino' },
  { id: '223060', nombre: 'Cadete femenino' },
  { id: '223058', nombre: 'Cadete masculino A' },
  { id: '227049', nombre: 'Cadete masculino B' },
  { id: '216662', nombre: 'Infantil femenino' },
  { id: '221137', nombre: 'Infantil masculino A' },
  { id: '223207', nombre: 'Infantil masculino B' },
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

// Un Worker gratuito puede hacer 50 consultas externas por petición, y cada
// consulta a la caché cuenta. Por eso se guarda la semana entera de una vez
// (dos accesos a la caché) en vez de cada consulta a la federación por
// separado: así una semana normal se queda en unas 25.
const CACHE_SEMANA = (desde) => new Request(`https://admin.balonmanovetusta.com/__cache/isquad/semana4/${TEMPORADA_ISQUAD}/${desde}`);

const trayectoria = async (id) =>
  ((await isquad('/ws/equipo', { id_equipo: id, id_temporada: TEMPORADA_ISQUAD })).equipo || {}).trayectoria || [];

// La trayectoria no dice dónde se juega. El calendario del grupo sí (el
// número de pabellón de cada partido), y /ws/estadio, el nombre y la dirección.
async function pabellonesDelGrupo(grupo) {
  const mapa = {};
  for (const m of (await isquad('/ws/calendario', { id_grupo: grupo })).calendarios || []) mapa[m.id] = m.id_estadio || '';
  return mapa;
}

// Localidades que la federación da por el barrio o la parroquia y el club
// prefiere nombrar por el concejo (el Manuel Novo está en Sotiello, Oviedo).
const LOCALIDADES = { sotiello: 'Oviedo' };

async function pabellon(id) {
  const e = (await isquad('/ws/estadio', { id_estadio: id })).estadio || {};
  const direccion = arreglarTexto(e.direccion);
  // La localidad es lo que va detrás del código postal: «33012 Oviedo, …».
  const localidad = ((direccion.match(/\b\d{5}\s+([^,]+)/) || [])[1] || '').trim();
  return { nombre: arreglarTexto(e.nombre_estadio).trim(), localidad: LOCALIDADES[localidad.toLowerCase()] || localidad };
}

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

// Escudos de la federación servidos desde el propio panel. Los de isquad no
// mandan cabeceras CORS en la descarga, y un <canvas> que dibuja una imagen de
// otro sitio sin ellas ya no se puede exportar. Pasando por aquí son «del
// mismo sitio» y la imagen para redes se descarga sin problema.
async function escudo(url) {
  const u = url.searchParams.get('u') || '';
  if (!/^https:\/\/balonmano\.isquad\.es\/images\/[\w\/.-]+\.(?:jpe?g|png|gif|webp)$/i.test(u)) {
    return new Response('', { status: 400 });
  }
  const clave = new Request(`https://admin.balonmanovetusta.com/__cache/escudo/${encodeURIComponent(u)}`);
  const cache = caches.default;
  let r = await cache.match(clave);
  if (!r) {
    const origen = await fetch(u, { headers: { 'User-Agent': UA } });
    const tipo = origen.headers.get('Content-Type') || '';
    if (!origen.ok || !tipo.startsWith('image/')) return new Response('', { status: 404 });
    r = new Response(await origen.arrayBuffer(), { headers: { 'Content-Type': tipo, 'Cache-Control': 'max-age=604800' } });
    await cache.put(clave, r.clone());
  }
  return new Response(r.body, {
    headers: { 'Content-Type': r.headers.get('Content-Type'), 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function rutasResultados(request, env, url) {
  if (url.pathname === '/admin/escudo' && request.method === 'GET') return escudo(url);
  if (url.pathname !== '/admin/resultados' || request.method !== 'GET') return null;
  // «desde» es el lunes de la semana: entran de lunes a domingo, para no
  // perder los partidos entre semana (las fechas de la federación ya vienen
  // en hora de España).
  const desde = url.searchParams.get('desde');
  if (!diaValido(desde)) return json({ ok: false, error: 'Fecha no válida.' }, 400);
  const dias = [0, 1, 2, 3, 4, 5, 6].map((n) => sumarDias(desde, n));

  // Cinco minutos en caché: recargar el panel no repite las consultas.
  const cache = caches.default;
  const guardada = await cache.match(CACHE_SEMANA(desde));
  if (guardada) return json(await guardada.json());

  const nuestros = new Map(EQUIPOS.map((e) => [e.id, e.nombre]));
  const rango = new Map(EQUIPOS.map((e, i) => [e.id, i]));
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
        // Puesto del equipo en EQUIPOS, que va de mayor a menor categoría.
        orden: Math.min(local ? rango.get(p.id_local) : 99, visitante ? rango.get(p.id_visitante) : 99),
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
  // De mayor a menor categoría y, dentro de cada una, por fecha.
  const partidos = [...vistos.values()].sort((a, b) => a.orden - b.orden || a.fecha.localeCompare(b.fecha));

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
  const respuesta = { ok: true, desde, dias, partidos, fallos };
  // Si algún equipo no se ha podido consultar, no se guarda: así la próxima
  // vez se vuelve a intentar.
  if (!fallos.length) {
    await cache.put(CACHE_SEMANA(desde), new Response(JSON.stringify(respuesta), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
    }));
  }
  return json(respuesta);
}
