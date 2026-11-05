#!/usr/bin/env node

/**
 * fetch-data.js — Fetches league data from the RFEBM API and generates
 * static JSON files consumed by the BM Vetusta website.
 *
 * Usage:  node scripts/fetch-data.js
 * Requires: Node 18+ (uses native fetch)
 *
 * The processing (standings with tiebreakers, scorers, results, next match)
 * lives in worker/src/liga.js, shared with the Cloudflare Worker that serves
 * the same JSON live at balonmanovetusta.com/api. The files written here are
 * the static fallback the website uses when the Worker can't be reached, so
 * both must produce identical output — hence one implementation.
 */

const fs = require('fs');
const path = require('path');

// ── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://balonmano.isquad.es';

// Administrative corrections that the raw match data doesn't reflect
// (e.g. federative point deductions). Keyed by season code; merged onto
// the computed historia row. 2024/25: −4 pts sanction left Vetusta 6th/34
// despite an 18-2-8 record (which arithmetically is 38).
const HISTORIA_OVERRIDES = {
  '2425': { pos: 6, puntos: 34 },
};

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
  'Connection': 'keep-alive',
  'Accept': 'application/json',
  'User-Agent': '6&"7*/5*&,?"->(1483>%1*!("%* 0\'\'>8.38-"?",("2#,!$(1>:64?"?,#?*=\'")*2" =.70IOS',
  'Accept-Language': 'es-ES;q=1.0, en-ES;q=0.9',
};

const DATA_DIR = path.join(__dirname, '..', 'data');

// Shared processing module (ESM); loaded in main() since this file is CJS.
let liga;

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

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchCalendar(grupo) {
  console.log(`📅 Fetching calendar (grupo ${grupo}) …`);
  const data = await apiPost('/ws/calendario', { id_grupo: grupo });
  // Response: { status: "OK", calendarios: [...] }
  const matches = data.calendarios || [];
  console.log(`   → ${matches.length} matches received`);
  return matches;
}

async function fetchActa(grupo, matchId) {
  const data = await apiPost('/ws/acta', {
    id_grupo: grupo,
    id_partido: String(matchId),
  });
  // Response: { status: "OK", acta: { goles: [...], jugadores: [...], ... } }
  return data.acta || null;
}

async function fetchStadium(stadiumId) {
  console.log(`   🏟️  Fetching stadium ${stadiumId} …`);
  const data = await apiPost('/ws/estadio', {
    id_estadio: String(stadiumId),
  });
  // Response: { status: "OK", estadio: { nombre_estadio, direccion, ... } }
  return data.estadio || null;
}

/**
 * Build data/historia.json — season-by-season stats for Vetusta.
 *
 * The 2ª Nacional era (2012/13–2020/21) predates the data we can fetch,
 * so those rows stay hardcoded. The Primera Nacional era (2021/22 →
 * current) is derived from each season's already-generated
 * data/<code>/clasificacion.json (so the History table and the season
 * selector always agree and the Art. 152 tiebreakers are applied once),
 * with HISTORIA_OVERRIDES layered on top for administrative corrections.
 */
function buildHistoria(currentMatches) {
  // 2ª Nacional era — not available through our group IDs, kept static.
  const olderSeasons = [
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
  ];

  // Whether the current season still has pending Vetusta matches.
  const currentHasPending = (currentMatches || []).some(
    (m) => (m.estado_partido || '').toLowerCase() !== 'finalizado' && liga.matchHasVetusta(m)
  );

  // Primera Nacional era — derived from each season's clasificacion.json.
  const primeraSeasons = [];
  for (const s of liga.TEMPORADAS) {
    const file = path.join(DATA_DIR, s.code, 'clasificacion.json');
    let clasif;
    try {
      clasif = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (err) {
      console.warn(`   ⚠ historia: falta ${s.code}/clasificacion.json — se omite`);
      continue;
    }
    const v = clasif.find((t) => t.es_vetusta);
    if (!v) continue;
    // Skip seasons that haven't started yet (no matches played) so an
    // all-zeros row doesn't appear in the history table.
    if (!v.PJ) continue;

    const row = {
      temporada: s.label,
      division: '1ª Nacional',
      fase: 'Liga Regular',
      pos: v.posicion,
      equipos: clasif.length,
      PJ: v.PJ, PG: v.PG, PE: v.PE, PP: v.PP,
      puntos: v.puntos,
      GF: v.GF, GC: v.GC, DIF: v.DIF,
      en_curso: s.code === liga.TEMPORADA_ACTUAL ? currentHasPending : false,
    };
    if (HISTORIA_OVERRIDES[s.code]) Object.assign(row, HISTORIA_OVERRIDES[s.code]);
    primeraSeasons.push(row);
  }

  return [...olderSeasons, ...primeraSeasons];
}

// ── Main ─────────────────────────────────────────────────────────────────────

function writeJson(dir, name, data) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Fetch the match reports (actas) of every finished Vetusta match of a
 * group whose acta has been uploaded. Used to build the scorers list.
 */
async function fetchVetustaActas(matches, grupo) {
  const finishedWithActa = liga.matchesWithActa(matches);
  console.log(`   📝 ${finishedWithActa.length} actas de partidos del Vetusta …`);

  const actas = [];
  for (let i = 0; i < finishedWithActa.length; i++) {
    const m = finishedWithActa[i];
    try {
      const acta = await fetchActa(grupo, m.id);
      actas.push({ matchId: m.id, acta });
    } catch (err) {
      console.warn(`   ⚠ acta ${m.id}: ${err.message}`);
    }
    if (i < finishedWithActa.length - 1) await sleep(1000);
  }
  return actas;
}

/**
 * Generate the per-season data files under data/<code>/. The current
 * season additionally writes calendario.json and drives the global
 * historia.json + proximo-partido.json (banner shared across pages).
 */
async function buildSeason(season, isCurrent) {
  console.log(`\n=== Temporada ${season.label} (grupo ${season.grupo})${isCurrent ? ' · ACTUAL' : ''} ===`);

  const matches = await fetchCalendar(season.grupo);
  if (!matches || matches.length === 0) {
    throw new Error(`Sin partidos para ${season.label} (grupo ${season.grupo})`);
  }
  const actas = await fetchVetustaActas(matches, season.grupo);

  const clasificacion = liga.buildClasificacion(matches);
  const resultados = liga.buildResultados(matches);
  const goleadores = liga.buildGoleadores(actas);

  const dir = path.join(DATA_DIR, season.code);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeJson(dir, 'clasificacion.json', clasificacion);
  writeJson(dir, 'resultados.json', resultados);
  writeJson(dir, 'goleadores.json', goleadores);

  if (isCurrent) {
    const calendario = liga.buildCalendario(matches);
    writeJson(dir, 'calendario.json', calendario);

    const historia = buildHistoria(matches);
    const proximoPartido = await liga.buildProximoPartido(matches, fetchStadium);
    writeJson(DATA_DIR, 'historia.json', historia);
    writeJson(DATA_DIR, 'proximo-partido.json', proximoPartido);

    console.log(`   → ${clasificacion.length} equipos · ${resultados.length} resultados · ${goleadores.length} goleadores · ${calendario.length} próximos · próximo-partido: ${proximoPartido ? 'sí' : 'no'}`);
  } else {
    console.log(`   → ${clasificacion.length} equipos · ${resultados.length} resultados · ${goleadores.length} goleadores`);
  }
}

async function main() {
  console.log('🏐 BM Vetusta — Data Fetcher\n');

  liga = await import('../worker/src/liga.js');

  // Past seasons are immutable: only (re)generated with --backfill or when
  // their folder is missing. The current season is refreshed every run.
  const backfill = process.argv.includes('--backfill');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  for (const season of liga.TEMPORADAS) {
    const isCurrent = season.code === liga.TEMPORADA_ACTUAL;
    const dir = path.join(DATA_DIR, season.code);
    if (!isCurrent && !backfill && fs.existsSync(dir)) {
      console.log(`\n=== Temporada ${season.label}: sin cambios (usa --backfill para regenerar) ===`);
      continue;
    }
    await buildSeason(season, isCurrent);
  }

  console.log('\n✅ Datos escritos en data/<temporada>/ (historia.json y proximo-partido.json globales)');
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
