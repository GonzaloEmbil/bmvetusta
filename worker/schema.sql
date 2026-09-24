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
  comunicaciones TEXT    NOT NULL DEFAULT '',
  -- Del informe de cargos de Cluber: qué cuota pagó, cuánto y cuándo.
  modalidad      TEXT    NOT NULL DEFAULT '',  -- Adulto | Matrimonio | Familiar | Sub 18
  importe        INTEGER NOT NULL DEFAULT 0,   -- en euros, sólo en el titular
  pagado         INTEGER NOT NULL DEFAULT 0,
  fecha_pago     TEXT    NOT NULL DEFAULT ''   -- AAAA-MM-DD
);
-- En una base ya creada, esas cuatro columnas se añadieron con
--   ALTER TABLE socios_anteriores ADD COLUMN modalidad TEXT NOT NULL DEFAULT '';
--   (y lo mismo con importe, pagado y fecha_pago)

CREATE INDEX IF NOT EXISTS socios_anteriores_temporada ON socios_anteriores (temporada);

-- Contactos sueltos para campañas que no son abonados de ninguna temporada
-- (lista «Otros»): por ejemplo, quien empezó el alta en Cluber sin llegar a
-- pagar. Siguen la misma regla que los abonados: sólo reciben campañas si
-- aceptaron comunicaciones, y una baja les llega igual.
CREATE TABLE IF NOT EXISTS contactos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  lista          TEXT    NOT NULL DEFAULT 'otros',
  nombre         TEXT    NOT NULL DEFAULT '',
  email          TEXT    NOT NULL,             -- en minúsculas
  comunicaciones TEXT    NOT NULL DEFAULT 'No',-- Sí / No
  origen         TEXT    NOT NULL DEFAULT '',  -- de dónde salió el contacto
  creado         TEXT    NOT NULL              -- ISO UTC
);

CREATE UNIQUE INDEX IF NOT EXISTS contactos_lista_email ON contactos (lista, email);

-- Campañas de correo del área privada. Un borrador se puede editar; al
-- programarla o enviarla queda fijada. Los contadores se guardan al terminar
-- el envío para que el historial no tenga que recalcularlos.
CREATE TABLE IF NOT EXISTS campanas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  creada         TEXT    NOT NULL,             -- ISO 8601 UTC
  autor          TEXT    NOT NULL DEFAULT '',  -- correo de quien la creó (Access)
  asunto         TEXT    NOT NULL DEFAULT '',
  texto          TEXT    NOT NULL DEFAULT '',  -- con **negrita** y [enlaces](https://…)
  imagen         TEXT    NOT NULL DEFAULT '',  -- clave de la imagen en R2
  boton_texto    TEXT    NOT NULL DEFAULT '',
  boton_url      TEXT    NOT NULL DEFAULT '',
  listas         TEXT    NOT NULL DEFAULT '[]',-- JSON: ["actuales","anteriores"]
  estado         TEXT    NOT NULL DEFAULT 'borrador', -- borrador | programada | enviando | enviada | error
  programada     TEXT,                         -- ISO UTC, si está programada
  enviada        TEXT,                         -- ISO UTC, al terminar el envío
  destinatarios  INTEGER NOT NULL DEFAULT 0,
  enviados       INTEGER NOT NULL DEFAULT 0,
  fallidos       INTEGER NOT NULL DEFAULT 0,
  error          TEXT
);

-- Un registro por persona y campaña: a quién salió y si Resend lo aceptó.
CREATE TABLE IF NOT EXISTS campana_envios (
  campana_id  INTEGER NOT NULL,
  email       TEXT    NOT NULL,
  estado      TEXT    NOT NULL,                -- enviado | fallido
  resend_id   TEXT,
  PRIMARY KEY (campana_id, email)
);

-- Bajas pedidas desde el enlace de los correos. Además de apagar la casilla
-- de comunicaciones, se guardan aquí: así una reimportación de Cluber con
-- datos viejos no puede volver a dar de alta a quien pidió la baja.
CREATE TABLE IF NOT EXISTS bajas (
  email       TEXT    NOT NULL,                -- en minúsculas
  fecha       TEXT    NOT NULL,                -- ISO UTC
  campana_id  INTEGER
);

CREATE INDEX IF NOT EXISTS bajas_email ON bajas (email);

-- Control de abuso. Se guarda un HASH de la IP, no la IP: sirve para contar
-- intentos sin conservar un dato personal identificable, y las filas se
-- borran solas al cabo de una hora.
CREATE TABLE IF NOT EXISTS limites (
  ip_hash TEXT NOT NULL,
  ruta    TEXT NOT NULL,
  ts      INTEGER NOT NULL          -- epoch en segundos
);

CREATE INDEX IF NOT EXISTS limites_busqueda ON limites (ruta, ip_hash, ts);
