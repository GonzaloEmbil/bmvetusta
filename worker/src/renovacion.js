// Quién de la temporada pasada ha renovado. Lo usan la tabla de 2025/2026 del
// panel y los segmentos de las campañas: el mismo cruce en los dos sitios, para
// que nunca digan cosas distintas.
//
// Para saber si un socio de la temporada pasada ha renovado se busca entre las
// altas de la actual: primero por DNI y, si no lo hay —Cluber no se lo pedía a
// los familiares—, por nombre completo. El correo no sirve para esto: en un
// abono familiar varias personas comparten el del titular, y el cruce daría
// por renovada a la persona equivocada.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

export function palabras(nombre) {
  return String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w && !PARTICULAS.has(w));
}

// Mismo nombre si todas las palabras de uno están en el otro y el más corto
// tiene al menos dos: «Mariam Mena» es «Mariam Mena Carballo», pero dos
// personas que sólo coinciden en un «Fernández» no son la misma. Las palabras
// repetidas cuentan cada vez: «Daniel Fernández Fernández» NO está dentro de
// «Daniel Fernández Conde», aunque las dos palabras distintas sí lo estén.
export function mismoNombre(a, b) {
  const [menor, mayor] = a.length <= b.length ? [a, b] : [b, a];
  if (menor.length < 2) return false;
  const quedan = new Map();
  for (const w of mayor) quedan.set(w, (quedan.get(w) || 0) + 1);
  for (const w of menor) {
    if (!quedan.get(w)) return false;
    quedan.set(w, quedan.get(w) - 1);
  }
  return true;
}

/** Nº de abonado actual de quien era socio la temporada pasada, o null. */
export function renovacion(socio, actuales) {
  const dni = String(socio.dni || '').toUpperCase();
  if (dni) {
    const porDni = actuales.find((a) => String(a.dni || '').toUpperCase() === dni);
    if (porDni) return porDni.id;
  }
  const suyo = palabras(socio.nombre);
  const porNombre = actuales.find((a) => mismoNombre(suyo, palabras(a.nombre)));
  return porNombre ? porNombre.id : null;
}
