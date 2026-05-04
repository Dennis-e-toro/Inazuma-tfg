-- Esquema PostgreSQL del juego. Todo el backend escribe en esta base.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS configuracion_app (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracion_app (clave, valor)
VALUES
  ('zona_horaria', 'Europe/Madrid'),
  ('hora_cambio_diario', '09:00:00')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  "contraseña" VARCHAR(255) NOT NULL,
  foto_perfil VARCHAR(255),
  fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultimo_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS personajes (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  alias TEXT,
  sprite_url TEXT NOT NULL,
  silueta_url TEXT NOT NULL,
  icono_elemento_url TEXT NOT NULL,
  icono_posicion_url TEXT NOT NULL,
  icono_club_url TEXT NOT NULL,
  icono_saga_url TEXT,
  genero_url TEXT,
  genero TEXT,
  elemento TEXT NOT NULL,
  posicion TEXT NOT NULL,
  club TEXT NOT NULL,
  saga TEXT NOT NULL,
  tiene_espiritu BOOLEAN NOT NULL DEFAULT FALSE,
  tiene_miximax BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (nombre, saga, club)
);

CREATE INDEX IF NOT EXISTS idx_personajes_nombre ON personajes (nombre);
CREATE INDEX IF NOT EXISTS idx_personajes_saga ON personajes (saga);
CREATE INDEX IF NOT EXISTS idx_personajes_club ON personajes (club);
CREATE INDEX IF NOT EXISTS idx_personajes_elemento ON personajes (elemento);
CREATE INDEX IF NOT EXISTS idx_personajes_posicion ON personajes (posicion);

CREATE TABLE IF NOT EXISTS modos_juego (
  id SMALLSERIAL PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO modos_juego (clave, nombre, descripcion)
VALUES
  ('normal', 'Normal', 'Adivina el personaje con pistas de atributos.'),
  ('silueta', 'Silueta', 'Adivina el personaje usando su silueta.'),
  ('cuadricula', 'Cuadriculas', 'Modo de puntuacion basado en popularidad y aciertos.')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS personaje_diario (
  id BIGSERIAL PRIMARY KEY,
  dia DATE NOT NULL,
  modo_juego_id SMALLINT NOT NULL REFERENCES modos_juego(id) ON DELETE RESTRICT,
  personaje_id BIGINT NOT NULL REFERENCES personajes(id) ON DELETE RESTRICT,
  publicado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dia, modo_juego_id)
);

CREATE INDEX IF NOT EXISTS idx_personaje_diario_dia ON personaje_diario (dia);
CREATE INDEX IF NOT EXISTS idx_personaje_diario_modo ON personaje_diario (modo_juego_id);

CREATE TABLE IF NOT EXISTS intentos_diarios (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  modo_juego_id SMALLINT NOT NULL REFERENCES modos_juego(id) ON DELETE RESTRICT,
  personaje_diario_id BIGINT REFERENCES personaje_diario(id) ON DELETE CASCADE,
  dia DATE NOT NULL,
  intentos_usados SMALLINT NOT NULL DEFAULT 0,
  pistas_usadas SMALLINT NOT NULL DEFAULT 0,
  completado BOOLEAN NOT NULL DEFAULT FALSE,
  acertado BOOLEAN NOT NULL DEFAULT FALSE,
  inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin TIMESTAMPTZ,
  tiempo_ms BIGINT,
  puntuacion INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, modo_juego_id, dia),
  CONSTRAINT intentos_diarios_intentos_chk CHECK (intentos_usados >= 0),
  CONSTRAINT intentos_diarios_pistas_chk CHECK (pistas_usadas >= 0),
  CONSTRAINT intentos_diarios_tiempo_chk CHECK (tiempo_ms IS NULL OR tiempo_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_intentos_diarios_usuario ON intentos_diarios (usuario_id);
CREATE INDEX IF NOT EXISTS idx_intentos_diarios_dia_modo ON intentos_diarios (dia, modo_juego_id);
CREATE INDEX IF NOT EXISTS idx_intentos_diarios_puntuacion ON intentos_diarios (dia, modo_juego_id, puntuacion DESC);
CREATE INDEX IF NOT EXISTS idx_intentos_diarios_tiempo ON intentos_diarios (dia, modo_juego_id, tiempo_ms ASC NULLS LAST);

CREATE TABLE IF NOT EXISTS adivinanzas_diarias (
  id BIGSERIAL PRIMARY KEY,
  intento_diario_id BIGINT NOT NULL REFERENCES intentos_diarios(id) ON DELETE CASCADE,
  personaje_adivinado_id BIGINT NOT NULL REFERENCES personajes(id) ON DELETE RESTRICT,
  es_correcta BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adivinanzas_intento ON adivinanzas_diarias (intento_diario_id);
CREATE INDEX IF NOT EXISTS idx_adivinanzas_personaje ON adivinanzas_diarias (personaje_adivinado_id);
CREATE INDEX IF NOT EXISTS idx_adivinanzas_creado_en ON adivinanzas_diarias (creado_en DESC);

CREATE OR REPLACE VIEW vw_ranking_diario AS
SELECT
  i.id,
  i.usuario_id,
  u.username,
  i.modo_juego_id,
  m.clave AS modo_clave,
  m.nombre AS modo_nombre,
  i.dia,
  i.intentos_usados,
  i.pistas_usadas,
  i.completado,
  i.acertado,
  i.inicio,
  i.fin,
  i.tiempo_ms,
  i.puntuacion,
  ROW_NUMBER() OVER (
    PARTITION BY i.dia, i.modo_juego_id
    ORDER BY i.puntuacion DESC, i.tiempo_ms ASC NULLS LAST, i.intentos_usados ASC, i.fin ASC NULLS LAST, i.id ASC
  ) AS posicion
FROM intentos_diarios i
JOIN usuarios u ON u.id = i.usuario_id
JOIN modos_juego m ON m.id = i.modo_juego_id
WHERE i.completado = TRUE;

CREATE OR REPLACE VIEW vw_estadisticas_personajes AS
SELECT
  p.id AS personaje_id,
  p.nombre,
  p.alias,
  p.saga,
  p.club,
  COUNT(a.id) AS veces_adivinado,
  COALESCE(
    ROUND(100.0 * COUNT(a.id) / NULLIF(SUM(COUNT(a.id)) OVER (), 0), 2),
    0
  ) AS porcentaje_global,
  MAX(a.creado_en) AS ultima_adivinanza
FROM personajes p
LEFT JOIN adivinanzas_diarias a ON a.personaje_adivinado_id = p.id
GROUP BY p.id, p.nombre, p.alias, p.saga, p.club;

CREATE OR REPLACE VIEW vw_ranking_puntos_diario AS
SELECT
  dia,
  modo_juego_id,
  modo_clave,
  modo_nombre,
  usuario_id,
  username,
  puntuacion,
  intentos_usados,
  tiempo_ms,
  posicion
FROM vw_ranking_diario;
