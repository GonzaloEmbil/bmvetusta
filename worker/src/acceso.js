// Comprobación del testigo de Cloudflare Access.
//
// Access ya filtra por delante: quien no esté en la lista de correos no llega
// hasta aquí. Esto es la segunda cerradura, y existe por un motivo concreto:
// si algún día alguien borra la aplicación de Access, le cambia el dominio o
// se equivoca en la política, sin esta comprobación el panel quedaría abierto
// a cualquiera que supiera la dirección, y nadie se enteraría. Con ella, el
// fallo se manifiesta como «no se puede entrar», que es la forma correcta de
// fallar.
//
// Access firma un JWT con RS256 y lo entrega en una cookie (o en una cabecera
// si la petición viene de una máquina). Para darlo por bueno hay que
// comprobar cuatro cosas: que la firma es de nuestro equipo, que el testigo
// es para ESTA aplicación, que no ha caducado, y —ya que lo tenemos— que el
// correo sigue estando en la lista.

// Con guion BAJO: es como la escribe Cloudflare. Con guion medio no existe,
// y buscarla así deja fuera a todo el mundo sin decir por qué.
const COOKIE = 'CF_Authorization';
const CABECERA = 'Cf-Access-Jwt-Assertion';

// Las claves públicas del equipo se guardan en memoria: cambian muy de tarde
// en tarde y pedirlas en cada visita sería un viaje de red por gusto.
let clavesCache = { equipo: '', hasta: 0, claves: null };

function base64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const comoTexto = (s) => new TextDecoder().decode(base64url(s));

const emisoresDe = (env) =>
  String(env.ACCESS_EQUIPO || '').split(',').map((s) => s.trim()).filter(Boolean);

function galleta(request, nombre) {
  const crudo = request.headers.get('Cookie') || '';
  for (const trozo of crudo.split(';')) {
    const i = trozo.indexOf('=');
    if (i > 0 && trozo.slice(0, i).trim() === nombre) return trozo.slice(i + 1).trim();
  }
  return '';
}

async function clavesDe(equipo) {
  const ahora = Date.now();
  if (clavesCache.claves && clavesCache.equipo === equipo && clavesCache.hasta > ahora) {
    return clavesCache.claves;
  }
  const r = await fetch(`https://${equipo}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('certs ' + r.status);
  const { keys } = await r.json();
  clavesCache = { equipo, hasta: ahora + 3600e3, claves: keys || [] };
  return clavesCache.claves;
}

/**
 * Devuelve el correo de quien entra, o null si el testigo no vale.
 * Falla cerrado: cualquier duda —falta configuración, firma rara, red caída—
 * se resuelve negando el paso.
 */
export async function accesoValido(request, env) {
  // ACCESS_EQUIPO admite varios nombres separados por comas. Hace falta porque
  // al renombrar el equipo, Cloudflare sigue firmando con el nombre anterior
  // los testigos ya emitidos: rechazarlos deja a la gente fuera sin motivo.
  // Las claves públicas se piden siempre al primero.
  const equipos = emisoresDe(env);
  const equipo = equipos[0];
  const aud = env.ACCESS_AUD;
  if (!equipo || !aud) return null;   // sin configurar, no se entra

  const testigo = galleta(request, COOKIE) || request.headers.get(CABECERA) || '';
  const partes = testigo.split('.');
  if (partes.length !== 3) return null;

  let cabecera, cuerpo;
  try {
    cabecera = JSON.parse(comoTexto(partes[0]));
    cuerpo = JSON.parse(comoTexto(partes[1]));
  } catch { return null; }

  if (cabecera.alg !== 'RS256') return null;

  // Caducidad, con un minuto de margen por si los relojes no van finos.
  const ahora = Math.floor(Date.now() / 1000);
  if (!cuerpo.exp || cuerpo.exp + 60 < ahora) return null;
  if (cuerpo.nbf && cuerpo.nbf - 60 > ahora) return null;

  // El testigo tiene que ser para ESTA aplicación. Sin esta comprobación,
  // cualquier otra aplicación del mismo equipo serviría para entrar aquí.
  const auds = Array.isArray(cuerpo.aud) ? cuerpo.aud : [cuerpo.aud];
  if (!auds.includes(aud)) return null;

  if (cuerpo.iss && !equipos.some((e) => cuerpo.iss === `https://${e}`)) return null;

  let claves;
  try { claves = await clavesDe(equipo); } catch { return null; }
  const jwk = claves.find((k) => k.kid === cabecera.kid);
  if (!jwk) return null;

  let clave;
  try {
    clave = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  } catch { return null; }

  const firmado = new TextEncoder().encode(partes[0] + '.' + partes[1]);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', clave, base64url(partes[2]), firmado
  );
  if (!ok) return null;

  const correo = String(cuerpo.email || '').toLowerCase();
  if (!correo) return null;

  // Segunda lista, la nuestra. Si Access se configurase mal y dejase pasar a
  // quien no debe, aquí se para.
  const permitidos = String(env.ACCESS_CORREOS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (permitidos.length && !permitidos.includes(correo)) return null;

  return correo;
}

