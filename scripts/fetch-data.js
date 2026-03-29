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
    .slice(0, 5);

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

  // Sort by points desc, then goal difference desc, then goals for desc
  const sorted = Object.values(teams)
    .map((t) => ({
      ...t,
      DIF: t.GF - t.GC,
      puntos: t.PG * 2 + t.PE,
    }))
    .sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      if (b.DIF !== a.DIF) return b.DIF - a.DIF;
      return b.GF - a.GF;
    })
    .map((t, i) => ({
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

  return sorted;
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
  const clasificacion = buildClasificacion(matches);
  const goleadores = buildGoleadores(actas);
  const proximoPartido = await buildProximoPartido(matches);

  console.log(`   → calendario.json: ${calendario.length} upcoming matches`);
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
