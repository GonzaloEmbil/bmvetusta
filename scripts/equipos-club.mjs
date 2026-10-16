#!/usr/bin/env node
/**
 * Localiza los equipos del Balonmano Vetusta en la federación para una
 * temporada, para la lista EQUIPOS de worker/src/resultados.js.
 *
 * La API de la federación no tiene una consulta de «equipos de un club», pero
 * cada partido trae el escudo de los dos equipos, y la ruta del escudo lleva el
 * número de club (afiliacion_clubs/2898/ es el Vetusta). El script recorre un
 * tramo de grupos y lista los equipos que llevan ese escudo.
 *
 *   node scripts/equipos-club.mjs 1039000 1041000
 *
 * Los grupos de una temporada tienen números consecutivos: el de Primera
 * Nacional de 2026/27 es el 1038396 y los de la Federación Asturiana van
 * detrás (Copa Principado, Juegos Deportivos, Segunda Nacional…). Va despacio
 * a propósito (tres consultas a la vez y una pausa) para no cargar la API.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLUB = '2898';
const dir = path.dirname(fileURLToPath(import.meta.url));
// La misma cabecera que usa fetch-data.js: la API sólo responde a la app oficial.
const fuente = fs.readFileSync(path.join(dir, 'fetch-data.js'), 'utf8');
const UA = Function(`return ${fuente.match(/'User-Agent':\s*('(?:[^'\\]|\\.)*')/)[1]}`)();

const [desde, hasta] = process.argv.slice(2).map(Number);
if (!desde || !hasta || hasta < desde) {
  console.error('Uso: node scripts/equipos-club.mjs <primer grupo> <último grupo>');
  process.exit(1);
}

async function calendario(grupo) {
  try {
    const r = await fetch('https://balonmano.isquad.es/ws/calendario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Accept: 'application/json', 'User-Agent': UA },
      body: new URLSearchParams({ id_grupo: String(grupo) }).toString(),
    });
    return (await r.json()).calendarios || [];
  } catch {
    return [];
  }
}

const pendientes = [];
for (let g = desde; g <= hasta; g++) pendientes.push(g);
const equipos = new Map();

async function trabajador() {
  while (pendientes.length) {
    const grupo = pendientes.shift();
    for (const partido of await calendario(grupo)) {
      for (const e of [partido.equipo_local, partido.equipo_visitante]) {
        if (!e || !String(e.imagen || '').includes(`afiliacion_clubs/${CLUB}/`)) continue;
        if (!equipos.has(e.id)) equipos.set(e.id, { ...e, grupos: new Set() });
        equipos.get(e.id).grupos.add(grupo);
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

await Promise.all([trabajador(), trabajador(), trabajador()]);
for (const e of [...equipos.values()].sort((a, b) => a.categoria.localeCompare(b.categoria))) {
  console.log(`${e.id}  ${e.categoria.padEnd(18)}  ${e.nombre}  (grupos ${[...e.grupos].join(', ')})`);
}
if (!equipos.size) console.log('Ningún equipo del club en ese tramo.');
