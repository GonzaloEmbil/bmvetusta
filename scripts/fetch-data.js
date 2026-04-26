#!/usr/bin/env node

/**
 * fetch-data.js — Fetches league data from the RFEBM API and generates
 * static JSON files consumed by the BM Vetusta website.
 *
 * Usage:  node scripts/fetch-data.js
 * Requires: Node 18+ (uses native fetch)
 */

const fs = require('fs');
const path = require('path');

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://balonmano.isquad.es';
const GROUP_ID = '1031242';
const TEAM_ID = '209500';
const TEAM_NAME = 'AUTO-CENTER PRINCIPADO';

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
  'Connection': 'keep-alive',
  'Accept': 'application/json',
  'User-Agent': '6&"7*/5*&,?"->(1483>%1*!("%* 0\'\'>8.38-"?",("2#,!$(1>:64?"?,#?*=\'")*2" =.70IOS',
  'Accept-Language': 'es-ES;q=1.0, en-ES;q=0.9',
};

const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiPost(endpoint, body) {
  const url = `${BASE_URL}${endpoint}`;
  const params = new URLSearchParams(body);

  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`API ${endpoint} returned ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Normalise a team name to allow reliable comparison.
 */
function normaliseName(name) {
  return (name || '').trim().toUpperCase();
}

function isVetusta(name) {
  return normaliseName(name) === normaliseName(TEAM_NAME);
}

/**
 * Title-case a team name, keeping Spanish prepositions lowercase.
 */
function titleCase(str) {
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
function shortName(raw) {
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
function extractCity(address) {
  if (!address) return null;
  // Look for 5-digit postal code followed by city name
  const m = address.match(/\d{5}\s+([^,]+)/);
  return m ? m[1].trim() : null;
}

/**
 * Shorten a stadium name for the banner.
 *   "POLIDEPORTIVO MUNICIPAL FLORIDA ARENA" → "Florida Arena"
 */
function shortVenueName(raw) {
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
function formatDateForBanner(dateStr) {
  if (!dateStr || dateStr.trim() === '') return 'Por definir';
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

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchCalendar() {
  console.log('📅 Fetching calendar …');
  const data = await apiPost('/ws/calendario', { id_grupo: GROUP_ID });
  // Response: { status: "OK", calendarios: [...] }
  const matches = data.calendarios || [];
  console.log(`   → ${matches.length} matches received`);
  return matches;
}

async function fetchActa(matchId) {
  const data = await apiPost('/ws/acta', {
    id_grupo: GROUP_ID,
    id_partido: String(matchId),
  });
  // Response: { status: "OK", acta: { goles: [...], jugadores: [...], ... } }
  return data.acta || null;
}

async function fetchStadium(stadiumId) {
  const data = await apiPost('/ws/estadio', {
    id_estadio: String(stadiumId),
  });
  // Response: { status: "OK", estadio: { nombre_estadio, direccion, ... } }
  return data.estadio || null;
}

// ── Processors ───────────────────────────────────────────────────────────────

/**
 * Build data/calendario.json — next 5 pending Vetusta matches.
 */
function buildCalendario(matches) {
  const pending = matches
    .filter((m) => {
      const isPending = (m.estado_partido || '').toLowerCase() !== 'finalizado';
      const involvesVetusta = isVetusta(m.nombre_local) || isVetusta(m.nombre_visitante);
      return isPending && involvesVetusta;
    })
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .slice(0, 3);

  return pending.map((m) => {
    const esLocal = isVetusta(m.nombre_local);
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
    };
  });
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
 * Build data/clasificacion.json — full standings computed from results.
 */
function buildClasificacion(matches) {
  const teams = {}; // keyed by normalised name

  // Collect all unique team names with their shield URLs
  for (const m of matches) {
    const localNorm = normaliseName(m.nombre_local);
    const visitNorm = normaliseName(m.nombre_visitante);

    if (!teams[localNorm]) {
      teams[localNorm] = {
        nombre: m.nombre_local?.trim(),
        escudo: m.url_escudo_local || null,
        PJ: 0, PG: 0, PE: 0, PP: 0, GF: 0, GC: 0,
      };
    }
    if (!teams[visitNorm]) {
      teams[visitNorm] = {
        nombre: m.nombre_visitante?.trim(),
        escudo: m.url_escudo_visitante || null,
        PJ: 0, PG: 0, PE: 0, PP: 0, GF: 0, GC: 0,
      };
    }
  }

  // Process only finalised matches
  const finished = matches.filter(
    (m) => (m.estado_partido || '').toLowerCase() === 'finalizado'
  );

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
 * Build data/goleadores.json — top scorers of the Vetusta team.
 *
 * Each entry in acta.goles is a single goal event:
 *   { id, nombre, id_equipo, nombre_equipo, minuto, dorsal, bloque, comentario, es_penalti, es_propia }
 * We count individual goal events per player where id_equipo === TEAM_ID.
 */
function buildGoleadores(actas) {
  const scorers = {}; // keyed by player name → total goals
  const matchesByPlayer = {}; // player name → Set of matchIds
  const playerPhotosById = {}; // player id → photo URL

  for (const { matchId, acta } of actas) {
    if (!acta) continue;

    // Collect player photos from jugadores array, keyed by player ID
    if (Array.isArray(acta.jugadores)) {
      for (const j of acta.jugadores) {
        if (String(j.id_equipo) !== TEAM_ID) continue;
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
      if (String(g.id_equipo) !== TEAM_ID) continue;

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
 * Build data/historia.json — season-by-season stats for Vetusta.
 * Past seasons are hardcoded (static). Current season is computed
 * from live calendar data and marked "en_curso" if matches remain.
 */
function buildHistoria(matches) {
  // Historical seasons (complete, won't change)
  const pastSeasons = [
    { temporada: '2012/2013', division: '2ª Nacional', fase: 'Liga Regular', pos: 6, equipos: 10, PJ: 10, PG: 1, PE: 0, PP: 9, puntos: 2, GF: 225, GC: 278, DIF: -53, en_curso: false },
    { temporada: '2013/2014', division: '2ª Nacional', fase: 'Liga Regular', pos: 8, equipos: 10, PJ: 18, PG: 6, PE: 0, PP: 12, puntos: 12, GF: 444, GC: 494, DIF: -50, en_curso: false },
    { temporada: '2014/2015', division: '2ª Nacional', fase: 'Liga Regular', pos: 5, equipos: 8, PJ: 14, PG: 6, PE: 1, PP: 7, puntos: 13, GF: 314, GC: 331, DIF: -17, en_curso: false },
    { temporada: '2015/2016', division: '2ª Nacional', fase: 'Liga Regular', pos: 3, equipos: 8, PJ: 18, PG: 11, PE: 2, PP: 5, puntos: 24, GF: 398, GC: 376, DIF: 22, en_curso: false },
    { temporada: '2016/2017', division: '2ª Nacional', fase: 'Liga Regular', pos: 3, equipos: 8, PJ: 21, PG: 15, PE: 1, PP: 5, puntos: 31, GF: 543, GC: 457, DIF: 86, en_curso: false },
    { temporada: '2017/2018', division: '2ª Nacional', fase: 'Liga Regular', pos: 2, equipos: 9, PJ: 16, PG: 12, PE: 2, PP: 2, puntos: 26, GF: 460, GC: 332, DIF: 128, en_curso: false, sub: true },
    { temporada: '2017/2018', division: '2ª Nacional', fase: 'Fase Final Asturias', pos: 2, equipos: 4, PJ: 3, PG: 1, PE: 1, PP: 1, puntos: 3, GF: 65, GC: 67, DIF: -2, en_curso: false, sub: true },
    { temporada: '2018/2019', division: '2ª Nacional', fase: 'Liga Regular', pos: 7, equipos: 8, PJ: 14, PG: 3, PE: 2, PP: 9, puntos: 8, GF: 284, GC: 334, DIF: -50, en_curso: false },
    { temporada: '2019/2020', division: '2ª Nacional', fase: 'Liga Regular', pos: 2, equipos: 8, PJ: 11, PG: 9, PE: 0, PP: 2, puntos: 18, GF: 289, GC: 231, DIF: 58, en_curso: false },
    { temporada: '2020/2021', division: '2ª Nacional', fase: 'Liga Regular', pos: 1, equipos: 4, PJ: 10, PG: 8, PE: 0, PP: 2, puntos: 16, GF: 293, GC: 219, DIF: 74, en_curso: false, sub: true },
    { temporada: '2020/2021', division: '2ª Nacional', fase: 'Fase de Ascenso', pos: 1, equipos: 4, PJ: 3, PG: 2, PE: 0, PP: 1, puntos: 4, GF: 63, GC: 61, DIF: 2, en_curso: false, sub: true, ascenso: true },
    { temporada: '2021/2022', division: '1ª Nacional', fase: 'Liga Regular', pos: 7, equipos: 15, PJ: 28, PG: 16, PE: 1, PP: 11, puntos: 33, GF: 824, GC: 780, DIF: 44, en_curso: false },
    { temporada: '2022/2023', division: '1ª Nacional', fase: 'Liga Regular', pos: 7, equipos: 16, PJ: 30, PG: 14, PE: 4, PP: 12, puntos: 32, GF: 918, GC: 893, DIF: 25, en_curso: false },
    { temporada: '2023/2024', division: '1ª Nacional', fase: 'Liga Regular', pos: 5, equipos: 16, PJ: 30, PG: 20, PE: 1, PP: 9, puntos: 41, GF: 938, GC: 817, DIF: 121, en_curso: false },
    { temporada: '2024/2025', division: '1ª Nacional', fase: 'Liga Regular', pos: 4, equipos: 16, PJ: 28, PG: 18, PE: 2, PP: 8, puntos: 38, GF: 770, GC: 669, DIF: 101, en_curso: false },
  ];

  // Current season — compute from live data
  const finished = matches.filter(
    (m) => (m.estado_partido || '').toLowerCase() === 'finalizado'
  );
  const pending = matches.filter((m) => {
    const isPending = (m.estado_partido || '').toLowerCase() !== 'finalizado';
    const involvesVetusta = isVetusta(m.nombre_local) || isVetusta(m.nombre_visitante);
    return isPending && involvesVetusta;
  });

  // Build standings using the same Art. 152 tiebreaker rules as buildClasificacion
  const teams = {};
  for (const m of matches) {
    const ln = normaliseName(m.nombre_local), vn = normaliseName(m.nombre_visitante);
    if (!teams[ln]) teams[ln] = { nombre: m.nombre_local?.trim(), PJ: 0, PG: 0, PE: 0, PP: 0, GF: 0, GC: 0 };
    if (!teams[vn]) teams[vn] = { nombre: m.nombre_visitante?.trim(), PJ: 0, PG: 0, PE: 0, PP: 0, GF: 0, GC: 0 };
  }
  for (const m of finished) {
    const gl = parseInt(m.resultado_local, 10), gv = parseInt(m.resultado_visitante, 10);
    if (isNaN(gl) || isNaN(gv)) continue;
    const l = teams[normaliseName(m.nombre_local)], v = teams[normaliseName(m.nombre_visitante)];
    if (!l || !v) continue;
    l.PJ++; v.PJ++; l.GF += gl; l.GC += gv; v.GF += gv; v.GC += gl;
    if (gl > gv) { l.PG++; v.PP++; }
    else if (gl < gv) { v.PG++; l.PP++; }
    else { l.PE++; v.PE++; }
  }

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

  const pos = sorted.findIndex((t) => isVetusta(t.nombre)) + 1;
  const vetustaFinished = finished.filter(
    (m) => isVetusta(m.nombre_local) || isVetusta(m.nombre_visitante)
  );
  let pj = 0, pg = 0, pe = 0, pp = 0, gf = 0, gc = 0;
  for (const m of vetustaFinished) {
    const gl = parseInt(m.resultado_local, 10), gv = parseInt(m.resultado_visitante, 10);
    if (isNaN(gl) || isNaN(gv)) continue;
    pj++;
    const esLocal = isVetusta(m.nombre_local);
    const gVetusta = esLocal ? gl : gv, gRival = esLocal ? gv : gl;
    gf += gVetusta; gc += gRival;
    if (gVetusta > gRival) pg++;
    else if (gVetusta < gRival) pp++;
    else pe++;
  }

  const currentSeason = {
    temporada: '2025/2026',
    division: '1ª Nacional',
    fase: 'Liga Regular',
    pos,
    equipos: sorted.length,
    PJ: pj, PG: pg, PE: pe, PP: pp,
    puntos: pg * 2 + pe,
    GF: gf, GC: gc, DIF: gf - gc,
    en_curso: pending.length > 0,
  };

  return [...pastSeasons, currentSeason];
}

/**
 * Build data/resultados.json — last 3 finished Vetusta matches.
 */
function buildResultados(matches) {
  const finished = matches
    .filter((m) => {
      const isFin = (m.estado_partido || '').toLowerCase() === 'finalizado';
      const involvesVetusta = isVetusta(m.nombre_local) || isVetusta(m.nombre_visitante);
      return isFin && involvesVetusta;
    })
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 3);

  return finished.map((m) => {
    const esLocal = isVetusta(m.nombre_local);
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
 * Build data/proximo-partido.json — next match banner data.
 * Includes stadium info fetched from /ws/estadio.
 */
async function buildProximoPartido(matches) {
  const pending = matches
    .filter((m) => {
      const isPending = (m.estado_partido || '').toLowerCase() !== 'finalizado';
      const involvesVetusta = isVetusta(m.nombre_local) || isVetusta(m.nombre_visitante);
      return isPending && involvesVetusta;
    })
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  if (pending.length === 0) return null;

  const m = pending[0];
  const esLocal = isVetusta(m.nombre_local);

  // Fetch stadium info for venue name and city
  let venueName = null;
  let venueCity = null;
  if (m.id_estadio) {
    try {
      console.log(`   🏟️  Fetching stadium ${m.id_estadio} …`);
      const stadium = await fetchStadium(m.id_estadio);
      if (stadium) {
        venueName = stadium.nombre_estadio || null;
        venueCity = extractCity(stadium.direccion) || null;
      }
    } catch (err) {
      console.warn(`   ⚠ Failed to fetch stadium: ${err.message}`);
    }
  }

  // Build venue line: "Stadium Name · City" or just one of them
  let venue = null;
  const shortVenue = shortVenueName(venueName);
  if (shortVenue && venueCity) {
    venue = `${shortVenue} · ${venueCity}`;
  } else if (shortVenue) {
    venue = shortVenue;
  } else if (venueCity) {
    venue = venueCity;
  }

  return {
    fecha: m.fecha,
    fecha_display: formatDateForBanner(m.fecha),
    jornada: m.jornada,
    es_local: esLocal,
    local: {
      nombre: isVetusta(m.nombre_local) ? 'Balonmano Vetusta' : titleCase(m.nombre_local),
      nombre_corto: isVetusta(m.nombre_local) ? 'BM Vetusta' : shortName(m.nombre_local),
      escudo: m.url_escudo_local || null,
      es_vetusta: isVetusta(m.nombre_local),
    },
    visitante: {
      nombre: isVetusta(m.nombre_visitante) ? 'Balonmano Vetusta' : titleCase(m.nombre_visitante),
      nombre_corto: isVetusta(m.nombre_visitante) ? 'BM Vetusta' : shortName(m.nombre_visitante),
      escudo: m.url_escudo_visitante || null,
      es_vetusta: isVetusta(m.nombre_visitante),
    },
    sede: venue,
    url_streaming: m.url_streaming && m.url_streaming.trim() !== '' ? m.url_streaming.trim() : null,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🏐 BM Vetusta — Data Fetcher\n');

  // 1. Fetch calendar
  const matches = await fetchCalendar();
  if (!matches || matches.length === 0) {
    throw new Error('No matches returned from the API — aborting');
  }

  // 2. Fetch actas for finished Vetusta matches with acta_subida === "1"
  const finishedWithActa = matches.filter(
    (m) =>
      (m.estado_partido || '').toLowerCase() === 'finalizado' &&
      String(m.acta_subida) === '1' &&
      (isVetusta(m.nombre_local) || isVetusta(m.nombre_visitante))
  );

  console.log(`\n📝 Fetching ${finishedWithActa.length} match reports …`);

  const actas = [];
  for (let i = 0; i < finishedWithActa.length; i++) {
    const m = finishedWithActa[i];
    const matchId = m.id;
    try {
      console.log(`   [${i + 1}/${finishedWithActa.length}] Match ${matchId} — ${m.nombre_local} vs ${m.nombre_visitante}`);
      const acta = await fetchActa(matchId);
      actas.push({ matchId, acta });
    } catch (err) {
      console.warn(`   ⚠ Failed to fetch acta for match ${matchId}: ${err.message}`);
      // Continue with the rest — individual error handling
    }
    // Delay between calls (except after the last one)
    if (i < finishedWithActa.length - 1) {
      await sleep(1000);
    }
  }

  // 3. Build JSON data
  console.log('\n🔧 Building JSON files …');

  const calendario = buildCalendario(matches);
  const resultados = buildResultados(matches);
  const historia = buildHistoria(matches);
  const clasificacion = buildClasificacion(matches);
  const goleadores = buildGoleadores(actas);
  const proximoPartido = await buildProximoPartido(matches);

  console.log(`   → calendario.json: ${calendario.length} upcoming matches`);
  console.log(`   → resultados.json: ${resultados.length} recent results`);
  console.log(`   → historia.json: ${historia.length} seasons`);
  console.log(`   → clasificacion.json: ${clasificacion.length} teams`);
  console.log(`   → goleadores.json: ${goleadores.length} scorers`);
  console.log(`   → proximo-partido.json: ${proximoPartido ? 'match found' : 'no upcoming match'}`);

  // 4. Write to data/
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(
    path.join(DATA_DIR, 'calendario.json'),
    JSON.stringify(calendario, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'resultados.json'),
    JSON.stringify(resultados, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'historia.json'),
    JSON.stringify(historia, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'clasificacion.json'),
    JSON.stringify(clasificacion, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'goleadores.json'),
    JSON.stringify(goleadores, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'proximo-partido.json'),
    JSON.stringify(proximoPartido, null, 2),
    'utf-8'
  );

  console.log('\n✅ Data files written to data/');
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
