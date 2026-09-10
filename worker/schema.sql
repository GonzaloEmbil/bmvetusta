-- Base de datos de altas de abonado/a (Cloudflare D1)
-- El id autoincremental hace de N.º DE ABONADO/A, el campo que en la ficha
-- de papel quedaba "a rellenar por el club".

CREATE TABLE IF NOT EXISTS abonados (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  temporada     TEXT    NOT NULL DEFAULT '2026/2027',
  creado        TEXT    NOT NULL,              -- ISO 8601 UTC
  modalidad     TEXT    NOT NULL,
  importe       INTEGER NOT NULL,              -- en euros
  nombre        TEXT    NOT NULL,
  apellidos     TEXT    NOT NULL,
  dni           TEXT    NOT NULL,
  nacimiento    TEXT    NOT NULL,
  telefono      TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  localidad     TEXT    NOT NULL,
  imagen        TEXT    NOT NULL,              -- consentimiento: Sí / No
  comunicaciones TEXT   NOT NULL,              -- consentimiento: Sí / No
  incluidas     TEXT    NOT NULL DEFAULT '[]', -- JSON
  tutor         TEXT,                          -- JSON o NULL
  pagado        INTEGER NOT NULL DEFAULT 0,    -- lo marca el club al ver la transferencia
  ip_pais       TEXT
);

-- Un DNI no puede darse de alta dos veces en la misma temporada.
CREATE UNIQUE INDEX IF NOT EXISTS abonados_dni_temporada
  ON abonados (dni, temporada);
