-- Base de datos de altas de abonado/a (Cloudflare D1)
-- El id autoincremental hace de N.º DE ABONADO/A, el campo que en la ficha
-- de papel quedaba "a rellenar por el club".

CREATE TABLE IF NOT EXISTS abonados (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  temporada     TEXT    NOT NULL DEFAULT '2026/2027',
  creado        TEXT    NOT NULL,              -- ISO 8601 UTC
  modalidad     TEXT    NOT NULL,
  pago          TEXT    NOT NULL DEFAULT '',   -- Transferencia | Presencial
  importe       INTEGER NOT NULL,              -- en euros
  nombre        TEXT    NOT NULL,
  apellidos     TEXT    NOT NULL,
  dni           TEXT    NOT NULL,
  nacimiento    TEXT    NOT NULL,
  telefono      TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  localidad     TEXT    NOT NULL,
  provincia     TEXT    NOT NULL DEFAULT '',
  imagen        TEXT    NOT NULL,              -- consentimiento: Sí / No
  comunicaciones TEXT   NOT NULL,              -- consentimiento: Sí / No
  incluidas     TEXT    NOT NULL DEFAULT '[]', -- JSON
  tutor         TEXT,                          -- JSON o NULL
  pagado        INTEGER NOT NULL DEFAULT 0,    -- lo marca el club al ver la transferencia
  ip_pais       TEXT,
  -- Cada persona de un abono Matrimonio o Familiar es un socio con su propio
  -- número. La fila del titular lleva titular_id NULL y parentesco 'Titular';
  -- las personas incluidas apuntan al número del titular y no llevan importe.
  titular_id    INTEGER,
  parentesco    TEXT    NOT NULL DEFAULT ''
);

-- Un DNI no puede darse de alta dos veces en la misma temporada.
CREATE UNIQUE INDEX IF NOT EXISTS abonados_dni_temporada
  ON abonados (dni, temporada);

-- Para agrupar en el panel cada abono con las personas que incluye.
CREATE INDEX IF NOT EXISTS abonados_titular ON abonados (titular_id);

-- La numeración de socios arranca en el 101: el primer alta será el 101.
INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES ('abonados', 100);

-- Socios de temporadas anteriores, importados de Cluber, el sistema que se
-- usaba antes del formulario propio. Es un histórico de sólo lectura: el panel
-- lo muestra en su propia pestaña y lo cruza con las altas de la temporada en
-- curso para ver quién ha renovado. Se carga con scripts/importar-cluber.py,
-- que lee la exportación de Cluber; los datos nunca pasan por el repositorio.
CREATE TABLE IF NOT EXISTS socios_anteriores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  temporada      TEXT    NOT NULL,             -- '2025/2026'
  numero         INTEGER,                      -- nº de socio en Cluber (a veces falta)
  nombre         TEXT    NOT NULL,             -- nombre y apellidos
  dni            TEXT    NOT NULL DEFAULT '',  -- Cluber no lo pedía a los familiares
  telefono       TEXT    NOT NULL DEFAULT '',
  email          TEXT    NOT NULL DEFAULT '',
  titular        TEXT    NOT NULL DEFAULT '',  -- si iba en el abono de otra persona, su nombre
  cuota          TEXT    NOT NULL DEFAULT '',
  alta           TEXT    NOT NULL DEFAULT '',  -- fecha de alta o renovación, AAAA-MM-DD
  pago           TEXT    NOT NULL DEFAULT '',
  localidad      TEXT    NOT NULL DEFAULT '',
  imagen         TEXT    NOT NULL DEFAULT '',
  comunicaciones TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS socios_anteriores_temporada ON socios_anteriores (temporada);

-- Control de abuso. Se guarda un HASH de la IP, no la IP: sirve para contar
-- intentos sin conservar un dato personal identificable, y las filas se
-- borran solas al cabo de una hora.
CREATE TABLE IF NOT EXISTS limites (
  ip_hash TEXT NOT NULL,
  ruta    TEXT NOT NULL,
  ts      INTEGER NOT NULL          -- epoch en segundos
);

CREATE INDEX IF NOT EXISTS limites_busqueda ON limites (ruta, ip_hash, ts);
