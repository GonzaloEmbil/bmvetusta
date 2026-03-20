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

  for (const { matchId, acta } of actas) {
    if (!acta || !Array.isArray(acta.goles)) continue;

    for (const g of acta.goles) {
      // Only count goals from our team
      if (String(g.id_equipo) !== TEAM_ID) continue;

      // Skip own goals (propia) — they count for the other team
      if (String(g.es_propia) === '1') continue;

      const name = (g.nombre || '').trim();
      if (!name) continue;

      if (!scorers[name]) {
        scorers[name] = 0;
        matchesByPlayer[name] = new Set();
      }
      scorers[name]++;
      matchesByPlayer[name].add(matchId);
    }
  }

  return Object.entries(scorers)
    .map(([nombre, goles]) => {
      const partidos = matchesByPlayer[nombre]?.size || 0;
      return {
        nombre,
        goles,
        partidos,
        media: partidos > 0 ? Math.round((goles / partidos) * 10) / 10 : 0,
      };
    })
    .sort((a, b) => b.goles - a.goles);
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

  console.log(`   → calendario.json: ${calendario.length} upcoming matches`);
  console.log(`   → clasificacion.json: ${clasificacion.length} teams`);
  console.log(`   → goleadores.json: ${goleadores.length} scorers`);

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

  console.log('\n✅ Data files written to data/');
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
