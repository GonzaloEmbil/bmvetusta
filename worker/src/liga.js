/**
 * Cálculos de liga de los equipos del club a partir de los datos de la
 * federación: clasificación (con los desempates del art. 152 del RPC de la
 * RFEBM), últimos resultados, goleadores (de las actas), próximos partidos,
 * el próximo partido del primer equipo para el banner y los grupos de liga
 * (fases) de cada equipo.
 *
 * Lo usan dos sitios y por eso vive aquí, sin tocar disco ni red: la tarea
 * de GitHub (scripts/fetch-data.js), que escribe los JSON estáticos de
 * respaldo, y el worker, que sirve los mismos JSON en balonmanovetusta.com/api.
 * Un solo código, un solo resultado: los dos caminos generan archivos
 * idénticos. La única llamada externa (el pabellón del próximo partido) la
 * hace quien llama, a través de una función que se pasa como parámetro.
 *
 * La API de la federación no devuelve la clasificación ni los goleadores (las
 * listas llegan vacías), así que se calculan de calendario y actas.
 */

// Temporadas publicadas, de la más antigua a la actual. `grupo` es el
// id_grupo de Primera Nacional (Grupo B) de cada temporada en la federación.
export const TEMPORADAS = [
  { code: '2122', grupo: '1007844', label: '2021/2022' },
  { code: '2223', grupo: '1012866', label: '2022/2023' },
  { code: '2324', grupo: '1018089', label: '2023/2024' },
  { code: '2425', grupo: '1023856', label: '2024/2025' },
  { code: '2526', grupo: '1031242', label: '2025/2026' },
  { code: '2627', grupo: '1038396', label: '2026/2027' },
];
export const TEMPORADA_ACTUAL = '2627';

// El grupo de Primera Nacional como lo ve el selector de fase (sólo hay uno).
export const grupoPrimera = (grupo) => ({
  id: grupo, nombre: 'Liga Regular · Grupo B', competicion: 'Primera Nacional · Liga Regular · Grupo B', actual: true,
});

// El nombre del equipo cambia con el patrocinador; el id no.
export const TEAM_ID = '209500';

// Equipos del club en la federación, de mayor a menor categoría y, en cada
// edad, el femenino antes que el masculino. Es la lista del área privada; la
// web pública enseña los que llevan «web» (el juvenil no, de momento) y sólo
// publica goleadores de los que llevan «goleadores»: los equipos sénior. En
// cantera son menores y sus nombres y fotos no se sacan de las actas. Hay
// que repasarla al empezar cada temporada y cuando la federación cree grupos
// nuevos (scripts/equipos-club.mjs los localiza).
export const EQUIPOS = [
  { id: '209500', nombre: 'Primera Nacional', web: true, goleadores: true },
  { id: '210109', nombre: 'Segunda Nacional', web: true, goleadores: true },
  { id: '208099', nombre: 'Juvenil Masculino', web: false },
  { id: '223060', nombre: 'Cadete Femenino', web: true },
  { id: '223058', nombre: 'Cadete Masculino A', web: true },
  { id: '227049', nombre: 'Cadete Masculino B', web: true },
  { id: '216662', nombre: 'Infantil Femenino', web: true },
  { id: '221137', nombre: 'Infantil Masculino A', web: true },
  { id: '223207', nombre: 'Infantil Masculino B', web: true },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a team name to allow reliable comparison.
 */
export function normaliseName(name) {
  return (name || '').trim().toUpperCase();
}

/**
 * Repair double-encoded text coming from the API. Some records (notably the
 * /ws/estadio addresses) store UTF-8 bytes that were read as latin-1, so
 * "Gijón" arrives as "GijÃ³n". Re-interpreting the bytes fixes it. Only
 * strings showing the telltale Ã/Â are touched, and the result is discarded
 * if the bytes aren't valid UTF-8.
 */
export function fixMojibake(str) {
  if (!str || !/[ÃÂ]/.test(str)) return str;
  try {
    const bytes = Uint8Array.from(str, (c) => c.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    return str;
  }
}

// The club's display name changes per season (sponsor), but id_equipo is
// stable, so identify the team by id across seasons. `teamId` defaults to
// the first team; the other club teams pass their own.
export function sideIsVetusta(m, side, teamId = TEAM_ID) {
  const id = side === 'local' ? m.id_local : m.id_visitante;
  return String(id) === String(teamId);
}

export function matchHasVetusta(m, teamId = TEAM_ID) {
  return sideIsVetusta(m, 'local', teamId) || sideIsVetusta(m, 'visitante', teamId);
}

// A fixture only counts as "upcoming" once it has a real, parseable date.
// Before the calendar is published (e.g. a season that hasn't started),
// matches exist with an empty fecha and must not surface as próximos.
export function hasValidDate(m) {
  if (!m.fecha || !String(m.fecha).trim()) return false;
  const d = new Date(String(m.fecha).replace(' ', 'T'));
  return !isNaN(d.getTime());
}

function isFinished(m) {
  return (m.estado_partido || '').toLowerCase() === 'finalizado';
}

/**
 * Title-case a team name, keeping Spanish prepositions lowercase.
 */
export function titleCase(str) {
  const lower = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);
  return str
    .split(/\s+/)
    .map((w, i) => {
      const lc = w.toLowerCase();
      if (i > 0 && lower.has(lc)) return lc;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Generate a short display name from an ALL-CAPS team name.
 *   "UNIVERSIDAD DE LEON ADEMAR" → "León Ademar"
 *   "CAJA VIVA -  BALONMANO CAMARGO" → "BM Camargo"
 */
export function shortName(raw) {
  let name = raw.replace(/\s*-+\s*/g, ' ').trim();
  // Replace BALONMANO → BM before processing
  name = name.replace(/\bBALONMANO\b/gi, 'BM');
  const lower = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);
  const acronyms = new Set(['BM', 'SD', 'CD', 'CF', 'SDC', 'CB', 'AD']);
  const words = name.split(/\s+/);
  const significant = words.filter((w) => !lower.has(w.toLowerCase()));
  if (significant.length <= 2) {
    return significant.map((w) => {
      if (acronyms.has(w.toUpperCase())) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }
  return significant
    .slice(-2)
    .map((w) => {
      if (acronyms.has(w.toUpperCase())) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Extract city from a stadium address string.
 *   "C. Valdés, 2, 33012 Oviedo, Asturias, España" → "Oviedo"
 */
export function extractCity(address) {
  if (!address) return null;
  // Look for 5-digit postal code followed by city name
  const m = address.match(/\d{5}\s+([^,]+)/);
  return m ? m[1].trim() : null;
}

/**
 * Shorten a stadium name for the banner.
 *   "POLIDEPORTIVO MUNICIPAL FLORIDA ARENA" → "Florida Arena"
 */
export function shortVenueName(raw) {
  if (!raw) return null;
  // Strip common prefixes (case-insensitive)
  const prefixes = [
    /^POLIDEPORTIVO\s+MUNICIPAL\s+/i,
    /^POLIDEPORTIVO\s+/i,
    /^PABELLON\s+MUNICIPAL\s+DE\s+DEPORTES\s+/i,
    /^PABELLON\s+MUNICIPAL\s+/i,
    /^PABELLON\s+DE\s+DEPORTES\s+/i,
    /^PABELLON\s+/i,
    /^COMPLEJO\s+DEPORTIVO\s+MUNICIPAL\s+/i,
    /^COMPLEJO\s+DEPORTIVO\s+/i,
    /^CENTRO\s+DEPORTIVO\s+MUNICIPAL\s+/i,
    /^CENTRO\s+DEPORTIVO\s+/i,
    /^INSTALACIONES\s+DEPORTIVAS\s+/i,
  ];
  let name = raw.trim();
  for (const re of prefixes) {
    name = name.replace(re, '');
  }
  return titleCase(name.trim());
}

/**
 * Format a date string to Spanish display for the banner.
 *   "2026-03-29 12:00:00" → "Dom 29 Mar · 12:00h"
 */
export function formatDateForBanner(dateStr) {
  if (!dateStr || dateStr.trim() === '') return 'Horario por definir';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return dateStr;

  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const month = months[d.getMonth()];
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');

  return `${dayName} ${dayNum} ${month} · ${hours}:${mins}h`;
}

// ── Processors ───────────────────────────────────────────────────────────────

/**
 * Build calendario.json — next 3 pending Vetusta matches.
 */
export function buildCalendario(matches, teamId = TEAM_ID) {
  const pending = matches
    .filter((m) => !isFinished(m) && matchHasVetusta(m, teamId) && hasValidDate(m))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .slice(0, 3);

  return pending.map((m) => {
    const esLocal = sideIsVetusta(m, 'local', teamId);
    const rival = esLocal ? m.nombre_visitante : m.nombre_local;
    const escudoRival = esLocal ? m.url_escudo_visitante : m.url_escudo_local;
    const streaming = m.url_streaming && m.url_streaming.trim() !== '' ? m.url_streaming.trim() : null;

    return {
      fecha: m.fecha,
      jornada: m.jornada,
      es_local: esLocal,
      rival: rival,
      escudo_rival: escudoRival || null,
      url_streaming: streaming,
      // El pabellón lo rellena conSedes(); hasta entonces va el id.
      sede: null,
      id_estadio: m.id_estadio ? String(m.id_estadio) : null,
    };
  });
}

// Localidades que la federación da por el barrio o la parroquia y el club
// prefiere nombrar por el concejo (el Manuel Novo está en Sotiello, Oviedo).
export const LOCALIDADES = { sotiello: 'Oviedo' };

/** Localidad tal como se enseña: en forma de título y con el mapa de arriba. */
export function localidadBonita(ciudad) {
  if (!ciudad) return null;
  const limpia = titleCase(String(ciudad).trim());
  return LOCALIDADES[limpia.toLowerCase()] || limpia;
}

/**
 * «Pabellón · Localidad» a partir de un registro de /ws/estadio, igual que lo
 * enseña el banner: "Florida Arena · Oviedo". Null si no hay nada que decir.
 */
export function sedeDe(stadium) {
  if (!stadium) return null;
  const venueName = fixMojibake(stadium.nombre_estadio) || null;
  const venueCity = localidadBonita(fixMojibake(extractCity(stadium.direccion)));
  const shortVenue = shortVenueName(venueName);
  if (shortVenue && venueCity) return `${shortVenue} · ${venueCity}`;
  return shortVenue || venueCity || null;
}

/**
 * Rellena la sede de cada próximo partido con `fetchStadium(id)` (inyectada,
 * para que quien llama guarde los pabellones como prefiera). Si un pabellón
 * no se puede consultar, la sede queda a null y el resto sigue.
 */
export async function conSedes(calendario, fetchStadium) {
  for (const p of calendario) {
    if (p.id_estadio) {
      try {
        p.sede = sedeDe(await fetchStadium(p.id_estadio));
      } catch (err) {
        console.warn(`   ⚠ pabellón ${p.id_estadio}: ${err.message}`);
      }
    }
    delete p.id_estadio;
  }
  return calendario;
}

// ── Tiebreaker helpers (Art. 152, RPC RFEBM Feb 2025) ───────────────────

/**
 * Group a sorted array into sub-arrays where adjacent elements share
 * the same value (as returned by valueFn).
 */
function groupByValue(arr, valueFn) {
  const groups = [];
  for (const item of arr) {
    const val = valueFn(item);
    if (groups.length === 0 || valueFn(groups[groups.length - 1][0]) !== val) {
      groups.push([item]);
    } else {
      groups[groups.length - 1].push(item);
    }
  }
  return groups;
}

/**
 * Get finished matches played exclusively among a set of teams.
 */
function getGroupH2HMatches(teamNorms, finishedMatches) {
  return finishedMatches.filter((m) => {
    const local = normaliseName(m.nombre_local);
    const visit = normaliseName(m.nombre_visitante);
    return teamNorms.includes(local) && teamNorms.includes(visit);
  });
}

/**
 * Compute mini-league stats (pts, gf, gc, dif) for each team within a group.
 */
function computeGroupH2HStats(teamNorms, h2hMatches) {
  const stats = {};
  for (const n of teamNorms) {
    stats[n] = { pts: 0, gf: 0, gc: 0, dif: 0 };
  }
  for (const m of h2hMatches) {
    const gl = parseInt(m.resultado_local, 10);
    const gv = parseInt(m.resultado_visitante, 10);
    if (isNaN(gl) || isNaN(gv)) continue;
    const local = normaliseName(m.nombre_local);
    const visit = normaliseName(m.nombre_visitante);
    if (!stats[local] || !stats[visit]) continue;
    stats[local].gf += gl;
    stats[local].gc += gv;
    stats[visit].gf += gv;
    stats[visit].gc += gl;
    if (gl > gv) {
      stats[local].pts += 2;
    } else if (gl < gv) {
      stats[visit].pts += 2;
    } else {
      stats[local].pts += 1;
      stats[visit].pts += 1;
    }
  }
  for (const n of teamNorms) {
    stats[n].dif = stats[n].gf - stats[n].gc;
  }
  return stats;
}

/**
 * Check whether every pair among the given teams has at least `min` h2h matches.
 */
function allPairsHaveMinMatches(teamNorms, h2hMatches, min) {
  for (let i = 0; i < teamNorms.length; i++) {
    for (let j = i + 1; j < teamNorms.length; j++) {
      const count = h2hMatches.filter((m) => {
        const l = normaliseName(m.nombre_local);
        const v = normaliseName(m.nombre_visitante);
        return (l === teamNorms[i] && v === teamNorms[j]) ||
               (l === teamNorms[j] && v === teamNorms[i]);
      }).length;
      if (count < min) return false;
    }
  }
  return true;
}

/**
 * Sort teams by valueFn (desc), group by equal values, and recursively
 * resolve each sub-group.  Returns null if all values are equal (no split).
 */
function splitAndResolve(teams, valueFn, finishedMatches) {
  const sorted = [...teams].sort((a, b) => valueFn(b) - valueFn(a));
  const groups = groupByValue(sorted, valueFn);
  if (groups.length <= 1) return null;
  return groups.flatMap((g) => resolveTiedGroup(g, finishedMatches));
}

/**
 * Resolve tie between exactly 2 teams — Art. 152 a).
 */
function resolveTwoTeamTie(a, b, finishedMatches) {
  const normA = normaliseName(a.nombre);
  const normB = normaliseName(b.nombre);
  const h2h = getGroupH2HMatches([normA, normB], finishedMatches);
  const hasH2H = h2h.length > 0;

  if (hasH2H) {
    const s = computeGroupH2HStats([normA, normB], h2h);
    // 1º H2H goal difference
    if (s[normA].dif !== s[normB].dif)
      return s[normA].dif > s[normB].dif ? [a, b] : [b, a];
  }

  // 2º Overall goal difference
  if (a.DIF !== b.DIF) return a.DIF > b.DIF ? [a, b] : [b, a];

  // 3º Overall goals scored
  if (a.GF !== b.GF) return a.GF > b.GF ? [a, b] : [b, a];

  if (hasH2H) {
    const s = computeGroupH2HStats([normA, normB], h2h);
    // 4º H2H GF/GC ratio
    const rA = s[normA].gc > 0 ? s[normA].gf / s[normA].gc : s[normA].gf;
    const rB = s[normB].gc > 0 ? s[normB].gf / s[normB].gc : s[normB].gf;
    if (Math.abs(rA - rB) > 1e-9) return rA > rB ? [a, b] : [b, a];
  }

  // 5º Overall GF/GC ratio
  const rA = a.GC > 0 ? a.GF / a.GC : a.GF;
  const rB = b.GC > 0 ? b.GF / b.GC : b.GF;
  if (Math.abs(rA - rB) > 1e-9) return rA > rB ? [a, b] : [b, a];

  return [a, b]; // 6º would be a tiebreaker match
}

/**
 * Resolve tie among 3+ teams — Art. 152 b).
 */
function resolveMultiTeamTie(teams, finishedMatches) {
  const norms = teams.map((t) => normaliseName(t.nombre));
  const h2h = getGroupH2HMatches(norms, finishedMatches);
  const canUseH2H = allPairsHaveMinMatches(norms, h2h, 1);
  const norm = (t) => normaliseName(t.nombre);

  if (canUseH2H) {
    const s = computeGroupH2HStats(norms, h2h);
    // 1º H2H points
    let r = splitAndResolve(teams, (t) => s[norm(t)].pts, finishedMatches);
    if (r) return r;
    // 2º H2H goal difference
    r = splitAndResolve(teams, (t) => s[norm(t)].dif, finishedMatches);
    if (r) return r;
  }

  // 3º Overall goal difference
  let r = splitAndResolve(teams, (t) => t.DIF, finishedMatches);
  if (r) return r;

  if (canUseH2H) {
    const s = computeGroupH2HStats(norms, h2h);
    // 4º H2H goals scored
    r = splitAndResolve(teams, (t) => s[norm(t)].gf, finishedMatches);
    if (r) return r;
  }

  // 5º Overall goals scored
  r = splitAndResolve(teams, (t) => t.GF, finishedMatches);
  if (r) return r;

  // 6º Overall GF/GC ratio (scaled to integer for safe comparison)
  const ratio = (t) => {
    if (t.GC === 0) return t.GF > 0 ? 1e9 : 0;
    return Math.round((t.GF / t.GC) * 100000);
  };
  r = splitAndResolve(teams, ratio, finishedMatches);
  if (r) return r;

  return teams;
}

/**
 * Dispatch tiebreaker resolution based on group size.
 */
function resolveTiedGroup(tiedTeams, finishedMatches) {
  if (tiedTeams.length <= 1) return tiedTeams;
  if (tiedTeams.length === 2) {
    return resolveTwoTeamTie(tiedTeams[0], tiedTeams[1], finishedMatches);
  }
  return resolveMultiTeamTie(tiedTeams, finishedMatches);
}

/**
 * Build clasificacion.json — full standings computed from results.
 */
export function buildClasificacion(matches, teamId = TEAM_ID) {
  const teams = {}; // keyed by normalised name

  // Collect all unique team names with their shield URLs
  for (const m of matches) {
    const localNorm = normaliseName(m.nombre_local);
    const visitNorm = normaliseName(m.nombre_visitante);

    if (!teams[localNorm]) {
      teams[localNorm] = {
        id: String(m.id_local || ''),
        nombre: m.nombre_local?.trim(),
        escudo: m.url_escudo_local || null,
        PJ: 0, PG: 0, PE: 0, PP: 0, GF: 0, GC: 0,
      };
    }
    if (!teams[visitNorm]) {
      teams[visitNorm] = {
        id: String(m.id_visitante || ''),
        nombre: m.nombre_visitante?.trim(),
        escudo: m.url_escudo_visitante || null,
        PJ: 0, PG: 0, PE: 0, PP: 0, GF: 0, GC: 0,
      };
    }
  }

  // Process only finalised matches
  const finished = matches.filter(isFinished);

  for (const m of finished) {
    const gl = parseInt(m.resultado_local, 10);
    const gv = parseInt(m.resultado_visitante, 10);
    if (isNaN(gl) || isNaN(gv)) continue;

    const local = teams[normaliseName(m.nombre_local)];
    const visit = teams[normaliseName(m.nombre_visitante)];
    if (!local || !visit) continue;

    local.PJ++;
    visit.PJ++;
    local.GF += gl;
    local.GC += gv;
    visit.GF += gv;
    visit.GC += gl;

    if (gl > gv) {
      local.PG++;
      visit.PP++;
    } else if (gl < gv) {
      visit.PG++;
      local.PP++;
    } else {
      local.PE++;
      visit.PE++;
    }
  }

  // Classify using Art. 152 tiebreaker rules (RPC RFEBM Feb 2025)
  const teamsArray = Object.values(teams).map((t) => ({
    ...t,
    DIF: t.GF - t.GC,
    puntos: t.PG * 2 + t.PE,
  }));
  teamsArray.sort((a, b) => b.puntos - a.puntos);
  const groups = groupByValue(teamsArray, (t) => t.puntos);
  const sorted = groups.flatMap((g) =>
    g.length === 1 ? g : resolveTiedGroup(g, finished)
  );

  return sorted.map((t, i) => ({
    posicion: i + 1,
    nombre: t.nombre,
    escudo: t.escudo,
    es_vetusta: String(t.id) === String(teamId),
    PJ: t.PJ,
    PG: t.PG,
    PE: t.PE,
    PP: t.PP,
    GF: t.GF,
    GC: t.GC,
    DIF: t.DIF,
    puntos: t.puntos,
  }));
}

/**
 * Finished Vetusta matches whose match report has been uploaded: the ones
 * whose acta is worth fetching for the scorers list.
 */
export function matchesWithActa(matches, teamId = TEAM_ID) {
  return matches.filter(
    (m) => isFinished(m) && String(m.acta_subida) === '1' && matchHasVetusta(m, teamId)
  );
}

/**
 * Build goleadores.json — top scorers of the Vetusta team.
 *
 * Each entry in acta.goles is a single goal event:
 *   { id, nombre, id_equipo, nombre_equipo, minuto, dorsal, bloque, comentario, es_penalti, es_propia }
 * We count individual goal events per player where id_equipo === TEAM_ID.
 */
export function buildGoleadores(actas, teamId = TEAM_ID) {
  const scorers = {}; // keyed by player name → total goals
  const playerPhotosById = {}; // player id → photo URL
  teamId = String(teamId);

  for (const { matchId, acta } of actas) {
    if (!acta) continue;

    // Collect player photos from jugadores array, keyed by player ID
    if (Array.isArray(acta.jugadores)) {
      for (const j of acta.jugadores) {
        if (String(j.id_equipo) !== teamId) continue;
        const playerId = String(j.id || '').trim();
        const foto = (j.imagen || '').trim();
        if (playerId && foto) {
          // Convert http to https for security
          playerPhotosById[playerId] = foto.replace(/^http:\/\//, 'https://');
        }
      }
    }

    if (!Array.isArray(acta.goles)) continue;

    for (const g of acta.goles) {
      // Only count goals from our team
      if (String(g.id_equipo) !== teamId) continue;

      // Skip own goals (propia) — they count for the other team
      if (String(g.es_propia) === '1') continue;

      const name = (g.nombre || '').trim();
      const playerId = String(g.id || '').trim();
      if (!name) continue;

      if (!scorers[name]) {
        scorers[name] = { goals: 0, playerId, matches: new Set() };
      }
      scorers[name].goals++;
      scorers[name].matches.add(matchId);
      // Keep latest playerId (in case of discrepancies)
      if (playerId) scorers[name].playerId = playerId;
    }
  }

  return Object.entries(scorers)
    .map(([nombre, data]) => {
      const partidos = data.matches.size || 0;
      return {
        nombre,
        goles: data.goals,
        partidos,
        media: partidos > 0 ? Math.round((data.goals / partidos) * 10) / 10 : 0,
        foto: playerPhotosById[data.playerId] || null,
      };
    })
    .sort((a, b) => b.goles - a.goles);
}

/**
 * Build resultados.json — last 3 finished Vetusta matches.
 */
export function buildResultados(matches, teamId = TEAM_ID) {
  const finished = matches
    .filter((m) => isFinished(m) && matchHasVetusta(m, teamId))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 3);

  return finished.map((m) => {
    const esLocal = sideIsVetusta(m, 'local', teamId);
    const rival = esLocal ? m.nombre_visitante : m.nombre_local;
    const escudoRival = esLocal ? m.url_escudo_visitante : m.url_escudo_local;
    const golesVetusta = esLocal ? parseInt(m.resultado_local, 10) : parseInt(m.resultado_visitante, 10);
    const golesRival = esLocal ? parseInt(m.resultado_visitante, 10) : parseInt(m.resultado_local, 10);
    let resultado = 'E';
    if (golesVetusta > golesRival) resultado = 'V';
    else if (golesVetusta < golesRival) resultado = 'D';

    return {
      fecha: m.fecha,
      jornada: m.jornada,
      es_local: esLocal,
      rival: rival,
      escudo_rival: escudoRival || null,
      goles_vetusta: golesVetusta,
      goles_rival: golesRival,
      resultado: resultado,
    };
  });
}

/**
 * Build proximo-partido.json — next match banner data.
 *
 * `fetchStadium(id)` resolves to the /ws/estadio record ({ nombre_estadio,
 * direccion, … }) or null; it's injected so this module stays free of
 * network code and each caller can cache venues its own way.
 */
export async function buildProximoPartido(matches, fetchStadium) {
  const pending = matches.filter((m) => !isFinished(m) && matchHasVetusta(m));

  const dated = pending
    .filter(hasValidDate)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  // In preseason the RFEBM publishes the fixture list before assigning
  // kick-off times, so there is a next match but no date yet. Fall back to
  // the earliest matchday and show "Por definir" rather than hiding the
  // banner entirely.
  let m = dated[0];
  let dateUndefined = false;
  if (!m) {
    m = pending
      .slice()
      .sort((a, b) => (parseInt(a.jornada, 10) || 0) - (parseInt(b.jornada, 10) || 0))[0];
    dateUndefined = true;
  }

  if (!m) return null;

  const esLocal = sideIsVetusta(m, 'local');

  // Venue line: "Stadium Name · City" (or just one of them)
  let venue = null;
  if (m.id_estadio) {
    try {
      venue = sedeDe(await fetchStadium(m.id_estadio));
    } catch (err) {
      console.warn(`   ⚠ Failed to fetch stadium: ${err.message}`);
    }
  }

  return {
    fecha: dateUndefined ? null : m.fecha,
    fecha_display: dateUndefined ? 'Horario por definir' : formatDateForBanner(m.fecha),
    fecha_por_definir: dateUndefined,
    jornada: m.jornada,
    es_local: esLocal,
    local: {
      nombre: sideIsVetusta(m, 'local') ? 'Balonmano Vetusta' : titleCase(m.nombre_local),
      nombre_corto: sideIsVetusta(m, 'local') ? 'BM Vetusta' : shortName(m.nombre_local),
      escudo: m.url_escudo_local || null,
      es_vetusta: sideIsVetusta(m, 'local'),
    },
    visitante: {
      nombre: sideIsVetusta(m, 'visitante') ? 'Balonmano Vetusta' : titleCase(m.nombre_visitante),
      nombre_corto: sideIsVetusta(m, 'visitante') ? 'BM Vetusta' : shortName(m.nombre_visitante),
      escudo: m.url_escudo_visitante || null,
      es_vetusta: sideIsVetusta(m, 'visitante'),
    },
    sede: venue,
    url_streaming: m.url_streaming && m.url_streaming.trim() !== '' ? m.url_streaming.trim() : null,
  };
}

// ── Grupos de liga de un equipo ──────────────────────────────────────────────

// La trayectoria (/ws/equipo) trae todos los partidos de la temporada, de
// cualquier competición. Los de liga son los que no son amistosos, torneos ni
// copa. En cantera la liga va por fases, cada una un grupo distinto: la lista
// sale en orden de calendario y «actual» es el grupo del último partido jugado
// (o el primero por jugar si aún no se ha jugado ninguno), que es lo que se
// enseña por defecto.
const NO_LIGA = /AMISTOS|TORNEO|COPA/i;

export function gruposDeLiga(trayectoria) {
  const grupos = new Map();
  for (const p of trayectoria || []) {
    if (!p.id_grupo || NO_LIGA.test(p.nombre_competicion || '')) continue;
    const id = String(p.id_grupo);
    const g = grupos.get(id) || { id, competicion: p.nombre_competicion || '', desde: '', ultimoJugado: '' };
    const fecha = hasValidDate(p) ? String(p.fecha) : '';
    if (fecha && (!g.desde || fecha < g.desde)) g.desde = fecha;
    if (fecha && isFinished(p) && fecha > g.ultimoJugado) g.ultimoJugado = fecha;
    grupos.set(id, g);
  }
  const lista = [...grupos.values()].sort((a, b) => a.desde.localeCompare(b.desde));
  const jugados = lista.filter((g) => g.ultimoJugado).sort((a, b) => b.ultimoJugado.localeCompare(a.ultimoJugado));
  const actual = jugados[0] || lista[0];
  return lista.map((g) => ({
    id: g.id,
    nombre: nombreFase(g.competicion),
    competicion: competicionBonita(g.competicion),
    actual: g === actual,
  }));
}

// La federación escribe los nombres en mayúsculas y sin acentos:
// «JUEGOS DEPORTIVOS DEL PRINCIPADO CADETE FEMENINO - PRIMERA FASE - 1ª DIVISION»
// → «Juegos Deportivos del Principado Cadete Femenino · Primera Fase · 1ª División».
const ACENTOS = { Division: 'División', Unico: 'Único', Unica: 'Única', Categoria: 'Categoría', Juvenil: 'Juvenil' };
function tramoBonito(s) {
  return titleCase(s.trim())
    .split(' ')
    .map((w) => (ACENTOS[w] || (/^[IVXLC]+$/i.test(w) ? w.toUpperCase() : w)))
    .join(' ');
}
export function competicionBonita(nombre) {
  return String(nombre || '').split(/\s+-\s+/).filter(Boolean).map(tramoBonito).join(' · ');
}

// Para el selector de fase: lo que va después del nombre de la competición
// («Primera Fase · 1ª División»); si no hay nada más, el nombre entero.
export function nombreFase(nombre) {
  const tramos = String(nombre || '').split(/\s+-\s+/).filter(Boolean);
  return (tramos.length > 1 ? tramos.slice(1) : tramos).map(tramoBonito).join(' · ');
}
