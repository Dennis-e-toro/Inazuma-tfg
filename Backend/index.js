import "dotenv/config";
import express from "express";
import cors from "cors";
import pkg from "pg";
import crypto from "crypto";
import { createPgConfig } from "./pg-config.js";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
const { Pool } = pkg;

// Debug: verificar qué DATABASE_URL se recibió
console.log(
  "🔍 DATABASE_URL recibida:",
  process.env.DATABASE_URL ? "SÍ configurada" : "❌ NO configurada",
);
console.log("🔍 NODE_ENV:", process.env.NODE_ENV || "no definido");
console.log("🔍 PORT:", process.env.PORT || "usando default");

const pool = new Pool(createPgConfig());

// Evento de error del Pool para diagnosticar problemas
pool.on("error", (err) => {
  console.error("❌ Error CRÍTICO en Pool:", err.message);
});

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});
const upload = multer({ dest: "tmp/" });
app.use(cors());
app.use(express.json());

const TOKEN_TTL_HOURS = 24 * 7;
const AUTH_SECRET = process.env.AUTH_SECRET || "inazudle-dev-secret-change-me";
const PBKDF2_ITERATIONS = 120000;
let PASSWORD_COLUMN_SQL = '"contraseña"';
const TIMEZONE_MADRID = "Europe/Madrid";
const COINS_INITIAL_BALANCE = 0;

function generarSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512")
    .toString("hex");
}

function empaquetarPasswordHash(password) {
  const salt = generarSalt();
  const hash = hashPassword(password, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

function validarPasswordHash(password, hashEmpaquetado) {
  const partes = String(hashEmpaquetado || "").split("$");
  if (partes.length !== 4 || partes[0] !== "pbkdf2") return false;

  const iter = Number(partes[1]);
  const salt = partes[2];
  const hashGuardado = partes[3];
  if (!Number.isFinite(iter) || iter <= 0 || !salt || !hashGuardado)
    return false;

  const hash = crypto
    .pbkdf2Sync(password, salt, iter, 64, "sha512")
    .toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(hashGuardado, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function isoDias(offset, isoBase) {
  const base = new Date(`${isoBase}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}

function obtenerFechaMadrid(fecha = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_MADRID,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(fecha).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  const fechaIso = `${parts.year}-${parts.month}-${parts.day}`;
  const hora = Number(parts.hour || 0);
  if (Number.isNaN(hora)) return fechaIso;
  return hora < 9 ? isoDias(-1, fechaIso) : fechaIso;
}

function hashTexto(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i += 1) {
    hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function parseNumero(valor, fallback = 0) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : fallback;
}

function crearTokenAuth(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const firma = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${firma}`;
}

function leerTokenAuth(token) {
  const partes = String(token || "").split(".");
  if (partes.length !== 3) return null;

  const [headerB64, payloadB64, firma] = partes;
  const firmaEsperada = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  const a = Buffer.from(firma);
  const b = Buffer.from(firmaEsperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (!payload?.sub || !payload?.username || !payload?.exp) return null;
    if (Date.now() >= Number(payload.exp) * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

async function validarAuthSchema() {
  try {
    console.log("Validando esquema auth con timeout de 30s...");

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout conectando a la BD")), 30000),
    );

    await Promise.race([
      pool.query("SELECT id, username, email FROM usuarios LIMIT 1"),
      timeoutPromise,
    ]);

    const columnas = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'usuarios'
      `,
    );

    const disponibles = new Set(columnas.rows.map((r) => r.column_name));
    if (disponibles.has("password_hash")) {
      PASSWORD_COLUMN_SQL = "password_hash";
      console.log("✓ Schema validado: password_hash");
      return;
    }
    if (disponibles.has("contrasena")) {
      PASSWORD_COLUMN_SQL = "contrasena";
      console.log("✓ Schema validado: contrasena");
      return;
    }
    if (disponibles.has("contraseña")) {
      PASSWORD_COLUMN_SQL = '"contraseña"';
      console.log("✓ Schema validado: contraseña");
      return;
    }

    throw new Error(
      "Falta columna de contraseña en usuarios (password_hash, contrasena o contraseña)",
    );
  } catch (error) {
    console.error("⚠ Error en validarAuthSchema:", error.message);
    console.error(
      "El servidor iniciará de todas formas, pero auth puede no funcionar",
    );
    PASSWORD_COLUMN_SQL = "password_hash"; // fallback
  }
}

async function asegurarSistemaMonedas() {
  try {
    await pool.query(
      "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS monedas INTEGER NOT NULL DEFAULT 0",
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS recompensas_diarias (
        id BIGSERIAL PRIMARY KEY,
        usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        dia DATE NOT NULL,
        modo_clave TEXT NOT NULL,
        premio INTEGER NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (usuario_id, dia, modo_clave)
      )`,
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS monedas_movimientos (
        id BIGSERIAL PRIMARY KEY,
        usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        cambio INTEGER NOT NULL,
        motivo TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );
    console.log("✓ Sistema de monedas validado");
  } catch (error) {
    console.error("⚠ Error en asegurarSistemaMonedas:", error.message);
  }
}

async function asegurarInventario() {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS inventario (
        id BIGSERIAL PRIMARY KEY,
        usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        item_tipo TEXT NOT NULL,
        item_key TEXT NOT NULL,
        nombre TEXT NOT NULL,
        imagen_url TEXT,
        rareza TEXT,
        cantidad INTEGER NOT NULL DEFAULT 1,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (usuario_id, item_tipo, item_key),
        CONSTRAINT inventario_cantidad_chk CHECK (cantidad > 0)
      )`,
    );
    await pool.query("CREATE INDEX IF NOT EXISTS idx_inventario_usuario ON inventario (usuario_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_inventario_tipo ON inventario (usuario_id, item_tipo)");
    console.log("✓ Inventario validado");
  } catch (error) {
    console.error("⚠ Error en asegurarInventario:", error.message);
  }
}

async function migrarCartasLegadoAInventario() {
  try {
    const res = await pool.query(
      `INSERT INTO inventario (usuario_id, item_tipo, item_key, nombre, imagen_url, rareza, cantidad, metadata)
       SELECT
         uc.usuario_id,
         'carta' AS item_tipo,
         uc.carta_id::text AS item_key,
         c.nombre,
         c.imagen_url,
         c.rareza,
         uc.cantidad,
         jsonb_build_object('cartaId', c.id, 'club', c.club)
       FROM user_cartas uc
       JOIN cartas c ON c.id = uc.carta_id
       WHERE NOT EXISTS (
         SELECT 1
         FROM inventario i
         WHERE i.usuario_id = uc.usuario_id
           AND i.item_tipo = 'carta'
           AND i.item_key = uc.carta_id::text
       )`,
    );
    console.log(`✓ Inventario legado migrado: ${res.rowCount || 0} cartas`);
  } catch (error) {
    console.error("⚠ Error en migrarCartasLegadoAInventario:", error.message);
  }
}

async function guardarEnInventario(db, { usuarioId, itemTipo, itemKey, nombre, imagenUrl = null, rareza = null, cantidad = 1, metadata = {} }) {
  const cantidadNormalizada = Math.max(1, parseNumero(cantidad, 1));
  await db.query(
    `INSERT INTO inventario (usuario_id, item_tipo, item_key, nombre, imagen_url, rareza, cantidad, metadata, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
     ON CONFLICT (usuario_id, item_tipo, item_key)
     DO UPDATE SET
       nombre = COALESCE(EXCLUDED.nombre, inventario.nombre),
       imagen_url = COALESCE(EXCLUDED.imagen_url, inventario.imagen_url),
       rareza = COALESCE(EXCLUDED.rareza, inventario.rareza),
       cantidad = inventario.cantidad + EXCLUDED.cantidad,
       metadata = inventario.metadata || EXCLUDED.metadata,
       actualizado_en = NOW()`,
    [
      usuarioId,
      itemTipo,
      String(itemKey),
      String(nombre || itemKey),
      imagenUrl,
      rareza,
      cantidadNormalizada,
      JSON.stringify(metadata || {}),
    ],
  );
}

async function authDesdeToken(req, db = pool) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const payload = leerTokenAuth(token);
  if (!payload) return null;

  const result = await db.query(
    "SELECT id, username, COALESCE(monedas, 0) AS monedas FROM usuarios WHERE id = $1 AND username = $2 LIMIT 1",
    [payload.sub, payload.username],
  );

  return result.rows[0] || null;
}

async function obtenerModoJuegoId(clave) {
  const result = await pool.query(
    "SELECT id, clave, nombre FROM modos_juego WHERE clave = $1 AND activo = TRUE LIMIT 1",
    [clave],
  );
  return result.rows[0] || null;
}

async function obtenerPersonajesOrdenados() {
  const result = await pool.query("SELECT * FROM personajes ORDER BY id ASC");
  return result.rows;
}

async function obtenerPersonajeDiarioFallback(modoClave, dia) {
  const personajes = await obtenerPersonajesOrdenados();
  if (!personajes.length) return null;

  const indice = hashTexto(`${dia}:${modoClave}`) % personajes.length;
  return personajes[indice] || null;
}

function serializarPersonajeDiarioFallback(personaje, modoClave, dia) {
  if (!personaje) return null;

  return {
    id: null,
    dia,
    modo_juego_id: null,
    personaje_id: personaje.id,
    nombre: personaje.nombre,
    alias: personaje.alias,
    sprite_url: personaje.sprite_url,
    silueta_url: personaje.silueta_url,
    icono_elemento_url: personaje.icono_elemento_url,
    icono_posicion_url: personaje.icono_posicion_url,
    icono_club_url: personaje.icono_club_url,
    icono_saga_url: personaje.icono_saga_url,
    elemento: personaje.elemento,
    posicion: personaje.posicion,
    club: personaje.club,
    saga: personaje.saga,
    tiene_espiritu: personaje.tiene_espiritu,
    tiene_miximax: personaje.tiene_miximax,
    genero: personaje.genero,
    genero_url: personaje.genero_url,
    modo_clave: modoClave,
    fallback: true,
    persistido: false,
  };
}

async function obtenerODesbloquearPersonajeDiario(modoJuegoId, dia) {
  const existe = await pool.query(
    `SELECT pd.id, pd.dia, pd.modo_juego_id, pd.personaje_id, p.nombre, p.alias, p.sprite_url, p.silueta_url, p.icono_elemento_url, p.icono_posicion_url, p.icono_club_url, p.icono_saga_url, p.elemento, p.posicion, p.club, p.saga, p.tiene_espiritu, p.tiene_miximax, p.genero, p.genero_url
     FROM personaje_diario pd
     JOIN personajes p ON p.id = pd.personaje_id
     WHERE pd.modo_juego_id = $1 AND pd.dia = $2
     LIMIT 1`,
    [modoJuegoId, dia],
  );

  if (existe.rowCount > 0) return existe.rows[0];

  const personajes = await obtenerPersonajesOrdenados();
  if (!personajes.length) return null;

  const indice = hashTexto(`${dia}:${modoJuegoId}`) % personajes.length;
  const personaje = personajes[indice];

  await pool.query(
    `INSERT INTO personaje_diario (dia, modo_juego_id, personaje_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (dia, modo_juego_id) DO NOTHING`,
    [dia, modoJuegoId, personaje.id],
  );

  const creado = await pool.query(
    `SELECT pd.id, pd.dia, pd.modo_juego_id, pd.personaje_id, p.nombre, p.alias, p.sprite_url, p.silueta_url, p.icono_elemento_url, p.icono_posicion_url, p.icono_club_url, p.icono_saga_url, p.elemento, p.posicion, p.club, p.saga, p.tiene_espiritu, p.tiene_miximax, p.genero, p.genero_url
     FROM personaje_diario pd
     JOIN personajes p ON p.id = pd.personaje_id
     WHERE pd.modo_juego_id = $1 AND pd.dia = $2
     LIMIT 1`,
    [modoJuegoId, dia],
  );

  return creado.rows[0] || null;
}

async function registrarIntentoDiario({
  userId,
  modoJuegoId,
  dia,
  personajeDiarioId,
  intentosUsados,
  pistasUsadas,
  completado,
  acertado,
  inicio,
  fin,
  tiempoMs,
  puntuacion,
  adivinanzas,
}) {
  try {
    console.log('[REGISTRAR_INTENTO] Inicio registro intento:', {
      userId,
      modoJuegoId,
      dia,
      personajeDiarioId,
      intentosUsados,
      pistasUsadas,
      completado,
      acertado,
      inicio,
      fin,
      tiempoMs,
      puntuacion,
      adivinanzasCount: Array.isArray(adivinanzas) ? adivinanzas.length : 0,
    });
  } catch (e) {
    // noop logging
  }
  const existenteResult = await pool.query(
    `SELECT id, usuario_id, modo_juego_id, personaje_diario_id, dia, intentos_usados, pistas_usadas, completado, acertado, inicio, fin, tiempo_ms, puntuacion
     FROM intentos_diarios
     WHERE usuario_id = $1 AND modo_juego_id = $2 AND dia = $3
     LIMIT 1`,
    [userId, modoJuegoId, dia],
  );

  const existente = existenteResult.rows[0] || null;
  if (existente?.completado && existente?.acertado) {
    return existente;
  }

  const result = await pool.query(
    `INSERT INTO intentos_diarios (
      usuario_id, modo_juego_id, personaje_diario_id, dia,
      intentos_usados, pistas_usadas, completado, acertado,
      inicio, fin, tiempo_ms, puntuacion, actualizado_en
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, NOW()), $10, $11, $12, NOW())
    ON CONFLICT (usuario_id, modo_juego_id, dia) DO UPDATE SET
      personaje_diario_id = EXCLUDED.personaje_diario_id,
      intentos_usados = GREATEST(intentos_diarios.intentos_usados, EXCLUDED.intentos_usados),
      pistas_usadas = GREATEST(intentos_diarios.pistas_usadas, EXCLUDED.pistas_usadas),
      completado = EXCLUDED.completado OR intentos_diarios.completado,
      acertado = EXCLUDED.acertado OR intentos_diarios.acertado,
      inicio = COALESCE(intentos_diarios.inicio, EXCLUDED.inicio),
      fin = COALESCE(EXCLUDED.fin, intentos_diarios.fin),
      tiempo_ms = COALESCE(EXCLUDED.tiempo_ms, intentos_diarios.tiempo_ms),
      puntuacion = GREATEST(intentos_diarios.puntuacion, EXCLUDED.puntuacion),
      actualizado_en = NOW()
    RETURNING id, usuario_id, modo_juego_id, personaje_diario_id, dia, intentos_usados, pistas_usadas, completado, acertado, inicio, fin, tiempo_ms, puntuacion`,
    [
      userId,
      modoJuegoId,
      personajeDiarioId,
      dia,
      parseNumero(intentosUsados, 0),
      parseNumero(pistasUsadas, 0),
      Boolean(completado),
      Boolean(acertado),
      inicio || null,
      fin || null,
      tiempoMs === null || tiempoMs === undefined
        ? null
        : parseNumero(tiempoMs, null),
      parseNumero(puntuacion, 0),
    ],
  );

  const intento = result.rows[0];

  try {
    console.log('[REGISTRAR_INTENTO] Insert/Update result:', intento ? { id: intento.id, usuario_id: intento.usuario_id, dia: intento.dia, puntuacion: intento.puntuacion } : null);
  } catch (e) {
    // noop: si falla el logging, no interrumpe el flujo
  }

  if (Array.isArray(adivinanzas) && adivinanzas.length > 0) {
    await pool.query(
      "DELETE FROM adivinanzas_diarias WHERE intento_diario_id = $1",
      [intento.id],
    );

    for (const item of adivinanzas) {
      const personajeId = item?.personajeId ?? item?.personaje_id ?? item?.id;
      if (!personajeId) continue;

      await pool.query(
        `INSERT INTO adivinanzas_diarias (intento_diario_id, personaje_adivinado_id, es_correcta)
         VALUES ($1, $2, $3)`,
        [
          intento.id,
          personajeId,
          Boolean(item?.esCorrecta ?? item?.es_correcta),
        ],
      );
    }
    try {
      console.log('[REGISTRAR_INTENTO] Adivinanzas registradas:', adivinanzas.length);
    } catch (e) {
      // noop: fallos en logging no deben interrumpir flujo
    }
  }

  return intento;
}

async function obtenerRankingDiario(modoClave, dia, limite = 10) {
  const modo = await obtenerModoJuegoId(modoClave).catch(() => null);
  if (!modo) {
    return { modo: null, ranking: [], persistido: false, fallback: true };
  }

  const maximo = Math.min(Math.max(parseNumero(limite, 10), 1), 10);
  // All modes: rank by time (who completed fastest = best). Puntuacion as tiebreaker.
  // (Less time = more puntos, because puntos penalize time: 1000 - floor(tiempoMs/1000))
  const sql = `SELECT u.username, i.tiempo_ms, i.puntuacion, i.fin
               FROM intentos_diarios i
               JOIN usuarios u ON u.id = i.usuario_id
               WHERE i.modo_juego_id = $1
                 AND i.dia = $2
                 AND i.completado = TRUE
                 AND i.acertado = TRUE
               ORDER BY i.tiempo_ms ASC NULLS LAST, i.puntuacion DESC, i.fin ASC NULLS LAST, u.username ASC
               LIMIT $3`;
  const params = [modo.id, dia, maximo];
  const result = await pool.query(sql, params);

  return {
    modo,
    ranking: result.rows.map((row, index) => ({
      posicion: index + 1,
      username: row.username,
      tiempoMs: parseNumero(row.tiempo_ms, null),
      puntuacion: parseNumero(row.puntuacion, 0),
      fin: row.fin,
    })),
    persistido: true,
    fallback: false,
  };
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = String(req.body?.username || "")
      .trim()
      .toLowerCase();
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");

    if (!username || !email || !password) {
      return res.status(400).json({
        ok: false,
        error: "Usuario, email y contraseña son obligatorios",
      });
    }
    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({
        ok: false,
        error: "El usuario debe tener entre 3 y 24 caracteres",
      });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ ok: false, error: "Email no válido" });
    }
    if (password.length < 4) {
      return res.status(400).json({
        ok: false,
        error: "La contraseña debe tener al menos 4 caracteres",
      });
    }

    const existe = await pool.query(
      "SELECT id FROM usuarios WHERE username = $1 OR email = $2 LIMIT 1",
      [username, email],
    );
    if (existe.rowCount > 0) {
      return res
        .status(409)
        .json({ ok: false, error: "Usuario o email ya existente" });
    }

    const passwordHash = empaquetarPasswordHash(password);
    const creado = await pool.query(
      `INSERT INTO usuarios (username, email, ${PASSWORD_COLUMN_SQL}, ultimo_login, monedas) VALUES ($1, $2, $3, NOW(), $4) RETURNING id, username, email, COALESCE(monedas, 0) AS monedas`,
      [username, email, passwordHash, COINS_INITIAL_BALANCE],
    );

    const user = creado.rows[0];
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_HOURS * 60 * 60;
    const token = crearTokenAuth({
      sub: user.id,
      username: user.username,
      exp,
    });

    return res.status(201).json({
      ok: true,
      user: { id: user.id, username: user.username, email: user.email, monedas: parseNumero(user.monedas, 0) },
      token,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Usuario y contraseña son obligatorios" });
    }

    const result = await pool.query(
      `SELECT id, username, email, COALESCE(monedas, 0) AS monedas, ${PASSWORD_COLUMN_SQL} AS password_hash FROM usuarios WHERE username = $1 OR email = $1 LIMIT 1`,
      [username],
    );

    if (result.rowCount === 0) {
      return res
        .status(401)
        .json({ ok: false, error: "Usuario o contraseña incorrectos" });
    }

    const user = result.rows[0];
    const valida = validarPasswordHash(password, user.password_hash);
    if (!valida) {
      return res
        .status(401)
        .json({ ok: false, error: "Usuario o contraseña incorrectos" });
    }

    await pool.query("UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1", [
      user.id,
    ]);

    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_HOURS * 60 * 60;
    const token = crearTokenAuth({
      sub: user.id,
      username: user.username,
      exp,
    });

    return res.json({
      ok: true,
      user: { id: user.id, username: user.username, email: user.email, monedas: parseNumero(user.monedas, 0) },
      token,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await authDesdeToken(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Sesion no valida" });
    }
    return res.json({ ok: true, user: { ...user, monedas: parseNumero(user.monedas, 0) } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/coins/recompensa-diaria', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const user = await authDesdeToken(req, client);
    if (!user) return res.status(401).json({ ok: false, error: 'Sesion no valida' });

    const modoClave = String(req.body?.modoClave || req.body?.modo || '').trim().toLowerCase();
    const dia = String(req.body?.dia || obtenerFechaMadrid()).slice(0, 10);
    const premio = Math.max(0, parseNumero(req.body?.premio, 0));

    if (!modoClave) return res.status(400).json({ ok: false, error: 'modoClave requerido' });
    if (premio <= 0) return res.status(400).json({ ok: false, error: 'premio inválido' });

    await client.query('BEGIN');

    const yaOtorgada = await client.query(
      'SELECT id FROM recompensas_diarias WHERE usuario_id = $1 AND dia = $2 AND modo_clave = $3 LIMIT 1',
      [user.id, dia, modoClave],
    );

    if (yaOtorgada.rowCount > 0) {
        const row = await client.query('SELECT premio FROM recompensas_diarias WHERE usuario_id = $1 AND dia = $2 AND modo_clave = $3 LIMIT 1', [user.id, dia, modoClave]);
        const premioRegistrado = row.rows[0]?.premio ?? null;
        const saldoActual = await client.query('SELECT COALESCE(monedas, 0) AS monedas FROM usuarios WHERE id = $1 LIMIT 1', [user.id]);
        await client.query('COMMIT');
        return res.json({ ok: true, otorgado: false, premio: premioRegistrado, monedas: parseNumero(saldoActual.rows[0]?.monedas, 0) });
    }

    await client.query(
      'INSERT INTO recompensas_diarias (usuario_id, dia, modo_clave, premio) VALUES ($1, $2, $3, $4)',
      [user.id, dia, modoClave, premio],
    );

    const saldo = await client.query(
      'UPDATE usuarios SET monedas = COALESCE(monedas, 0) + $1 WHERE id = $2 RETURNING COALESCE(monedas, 0) AS monedas',
      [premio, user.id],
    );

    await client.query(
      `INSERT INTO monedas_movimientos (usuario_id, cambio, motivo, metadata)
       VALUES ($1, $2, 'recompensa_diaria', $3::jsonb)`,
      [user.id, premio, JSON.stringify({ dia, modoClave })],
    );

    await client.query('COMMIT');
    return res.json({ ok: true, otorgado: true, premio, monedas: parseNumero(saldo.rows[0]?.monedas, 0) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ ok: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

app.get('/api/coins/recompensa-diaria', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const user = await authDesdeToken(req, client);
    if (!user) return res.status(401).json({ ok: false, error: 'Sesion no valida' });

    const modoClave = String(req.query.modoClave || req.query.modo || '').trim().toLowerCase();
    const dia = String(req.query.dia || obtenerFechaMadrid()).slice(0, 10);
    if (!modoClave) return res.status(400).json({ ok: false, error: 'modoClave requerido' });

    const row = await client.query('SELECT premio, creado_en FROM recompensas_diarias WHERE usuario_id = $1 AND dia = $2 AND modo_clave = $3 LIMIT 1', [user.id, dia, modoClave]);
    if (row.rowCount === 0) {
      return res.json({ ok: true, exists: false });
    }
    const premio = Number(row.rows[0].premio) || 0;
    const saldoRes = await client.query('SELECT COALESCE(monedas, 0) AS monedas FROM usuarios WHERE id = $1 LIMIT 1', [user.id]);
    const monedas = parseNumero(saldoRes.rows[0]?.monedas, 0);
    return res.json({ ok: true, exists: true, premio, monedas });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/coins/spend', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const user = await authDesdeToken(req, client);
    if (!user) return res.status(401).json({ ok: false, error: 'Sesion no valida' });

    const amount = Math.max(0, parseNumero(req.body?.amount, 0));
    const reason = String(req.body?.reason || 'gasto').trim().toLowerCase();
    if (amount <= 0) return res.status(400).json({ ok: false, error: 'amount inválido' });

    await client.query('BEGIN');
    const saldoRes = await client.query('SELECT COALESCE(monedas, 0) AS monedas FROM usuarios WHERE id = $1 FOR UPDATE', [user.id]);
    if (saldoRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const saldoActual = parseNumero(saldoRes.rows[0]?.monedas, 0);
    if (saldoActual < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Monedas insuficientes', monedas: saldoActual });
    }

    const updateRes = await client.query(
      'UPDATE usuarios SET monedas = COALESCE(monedas, 0) - $1 WHERE id = $2 RETURNING COALESCE(monedas, 0) AS monedas',
      [amount, user.id],
    );

    await client.query(
      `INSERT INTO monedas_movimientos (usuario_id, cambio, motivo, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [user.id, -amount, reason, JSON.stringify(req.body?.metadata || {})],
    );

    if (reason === 'compra_avatar' && req.body?.metadata?.avatarId) {
      await guardarEnInventario(client, {
        usuarioId: user.id,
        itemTipo: 'avatar',
        itemKey: req.body.metadata.avatarId,
        nombre: req.body.metadata.nombre || req.body.metadata.avatarNombre || req.body.metadata.avatarId,
        imagenUrl: req.body.metadata.imagenUrl || req.body.metadata.src || null,
        rareza: req.body.metadata.rareza || null,
        cantidad: 1,
        metadata: req.body?.metadata || {},
      });
    }

    await client.query('COMMIT');
    return res.json({ ok: true, monedas: parseNumero(updateRes.rows[0]?.monedas, 0) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ ok: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/shop/comprar-avatar', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const user = await authDesdeToken(req, client);
    if (!user) return res.status(401).json({ ok: false, error: 'Sesion no valida' });

    const avatarId = String(req.body?.avatarId || '').trim();
    const price = Math.max(0, parseNumero(req.body?.price, 0));
    const nombre = String(req.body?.nombre || '').trim();
    const imagenUrl = req.body?.imagenUrl || null;

    if (!avatarId || price <= 0) return res.status(400).json({ ok: false, error: 'avatarId y price requeridos' });

    await client.query('BEGIN');

    const saldoRes = await client.query('SELECT COALESCE(monedas, 0) AS monedas FROM usuarios WHERE id = $1 FOR UPDATE', [user.id]);
    const saldo = parseNumero(saldoRes.rows[0]?.monedas, 0);
    if (saldo < price) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Monedas insuficientes' });
    }

    await client.query(
      `INSERT INTO inventario (usuario_id, item_tipo, item_key, nombre, imagen_url, cantidad, creado_en, actualizado_en)
       VALUES ($1, 'avatar', $2, $3, $4, 1, NOW(), NOW())
       ON CONFLICT (usuario_id, item_tipo, item_key) DO UPDATE SET cantidad = inventario.cantidad + 1, actualizado_en = NOW()`,
      [user.id, avatarId, nombre || avatarId, imagenUrl],
    );

    const updated = await client.query('UPDATE usuarios SET monedas = COALESCE(monedas, 0) - $1 WHERE id = $2 RETURNING COALESCE(monedas,0) AS monedas', [price, user.id]);

    await client.query(
      `INSERT INTO monedas_movimientos (usuario_id, cambio, motivo, metadata)
       VALUES ($1, $2, 'compra_avatar', $3::jsonb)`,
      [user.id, -price, JSON.stringify({ avatarId, price })],
    );

    await client.query('COMMIT');

    return res.json({ ok: true, monedas: parseNumero(updated.rows[0]?.monedas, 0) });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ ok: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

app.get('/api/profile', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const user = await authDesdeToken(req, client);
    if (!user) return res.status(401).json({ ok: false, error: 'Sesion no valida' });

    const perfilesRow = await client.query('SELECT perfiles FROM user_profiles WHERE usuario_id = $1 LIMIT 1', [user.id]);
    const rows = await client.query('SELECT dia, modo_clave FROM recompensas_diarias WHERE usuario_id = $1', [user.id]);
    const dailyCompletions = {};
    for (const r of rows.rows) {
      const dia = String(r.dia).slice(0, 10);
      const modo = r.modo_clave || 'desconocido';
      if (!dailyCompletions[dia]) dailyCompletions[dia] = {};
      dailyCompletions[dia][modo] = true;
    }

    const perfilesGuardados = perfilesRow.rowCount > 0 ? (perfilesRow.rows[0].perfiles || {}) : {};
    const perfiles = {
      ...perfilesGuardados,
      dailyCompletions: {
        ...(perfilesGuardados.dailyCompletions || {}),
        ...dailyCompletions,
      },
    };

    if (Array.isArray(perfilesGuardados.ownedAvatarIds) || perfilesGuardados.equippedAvatarId) {
      perfiles.ownedAvatarIds = Array.from(new Set([...(perfilesGuardados.ownedAvatarIds || [])]));
      if (perfilesGuardados.equippedAvatarId) {
        perfiles.equippedAvatarId = perfilesGuardados.equippedAvatarId;
      }
    }

    const inv = await client.query("SELECT item_key, nombre, imagen_url, cantidad FROM inventario WHERE usuario_id = $1 AND item_tipo = 'avatar'", [user.id]);
    const owned = inv.rows.map((r) => r.item_key);

    perfiles.ownedAvatarIds = Array.from(new Set([...(perfiles.ownedAvatarIds || []), ...owned]));
    if (!perfiles.equippedAvatarId && perfiles.ownedAvatarIds.length > 0) {
      perfiles.equippedAvatarId = perfiles.ownedAvatarIds[0];
    }

    return res.json({ ok: true, profile: { perfiles, avatars: inv.rows, derived: perfilesRow.rowCount === 0 } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/profile', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const user = await authDesdeToken(req, client);
    if (!user) return res.status(401).json({ ok: false, error: 'Sesion no valida' });

    const perfiles = req.body?.perfiles ?? null;
    if (!perfiles || typeof perfiles !== 'object') return res.status(400).json({ ok: false, error: 'perfiles es requerido' });

    await client.query(
      `INSERT INTO user_profiles (usuario_id, perfiles, actualizado_en)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (usuario_id) DO UPDATE SET perfiles = EXCLUDED.perfiles, actualizado_en = NOW()`,
      [user.id, JSON.stringify(perfiles)],
    );

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    // Stateless JWT: logout real se hace en cliente borrando token.
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend de Inazuma activo",
    endpoints: [
      "/api/personajes",
      "/api/diarios/estado",
      "/api/diarios/intentos",
      "/health",
      "/diagnostico",
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/me",
      "/api/auth/logout",
    ],
  });
});

app.get("/diagnostico", async (req, res) => {
  try {
    const diagnostico = {
      servidor: {
        puerto: PORT,
        host: HOST,
        node_env: process.env.NODE_ENV || "no definido",
      },
      base_datos: {
        database_url_configurada: Boolean(process.env.DATABASE_URL),
        es_remota:
          process.env.DATABASE_URL &&
          !process.env.DATABASE_URL.includes("localhost"),
      },
      intentar_conexion: null,
      error: null,
    };

    // Intentar una conexión simple con timeout más largo
    try {
      const result = await Promise.race([
        pool.query("SELECT NOW() as ahora, VERSION() as version"),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("Timeout de 15s excedido")), 15000),
        ),
      ]);
      diagnostico.intentar_conexion = {
        exito: true,
        hora_servidor: result.rows[0]?.ahora,
        db_version: result.rows[0]?.version,
      };
    } catch (e) {
      diagnostico.intentar_conexion = {
        exito: false,
        error: e.message,
      };
      diagnostico.error = e.message;
    }

    return res.json(diagnostico);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/health", (req, res) => {
  // Health check sin conectar a la BD, solo verificar que el servidor está corriendo
  res.json({
    ok: true,
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// Admin debug endpoint to view latest intentos_diarios — enabled when DEBUG_ADMIN=1
app.get('/api/admin/last-intentos', async (req, res) => {
  if (String(process.env.DEBUG_ADMIN || '').trim() !== '1') {
    return res.status(403).json({ ok: false, error: 'Admin debug disabled' });
  }
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 200);
    const result = await pool.query('SELECT * FROM intentos_diarios ORDER BY creado_en DESC LIMIT $1', [limit]);
    return res.json({ ok: true, count: result.rowCount, rows: result.rows });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/personajes", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM personajes ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// --- Shop / Sobres endpoints ---

async function obtenerSobresDisponibles() {
  const result = await pool.query("SELECT id, nombre, precio_monedas, contenido_json, portada_url, activo FROM sobres WHERE activo = TRUE ORDER BY id ASC");
  return result.rows;
}

async function obtenerCartasPorRareza(rareza, limite = 100) {
  const res = await pool.query("SELECT id, nombre, imagen_url, rareza, club FROM cartas WHERE rareza = $1 ORDER BY id ASC LIMIT $2", [rareza, limite]);
  return res.rows;
}

async function obtenerCartaAleatoria() {
  const res = await pool.query("SELECT id, nombre, imagen_url, rareza, club FROM cartas ORDER BY RANDOM() LIMIT 1");
  return res.rows[0] || null;
}

function elegirAleatorias(array, count) {
  if (!Array.isArray(array) || array.length === 0) return [];
  const copy = array.slice();
  const out = [];
  for (let i = 0; i < Math.min(count, copy.length); i += 1) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

app.get('/api/shop/sobres', async (req, res) => {
  try {
    const sobres = await obtenerSobresDisponibles();
    return res.json({ ok: true, sobres });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

async function obtenerInventarioUsuario(req, res) {
  try {
    const user = await authDesdeToken(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Sesion no valida' });

    const result = await pool.query(
      `SELECT
        item_tipo,
        item_key,
        nombre,
        imagen_url,
        rareza,
        cantidad,
        metadata,
        actualizado_en
       FROM inventario
       WHERE usuario_id = $1
       ORDER BY cantidad DESC, item_tipo ASC, nombre ASC`,
      [user.id],
    );

    return res.json({ ok: true, inventario: result.rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

app.get('/api/inventario', obtenerInventarioUsuario);
app.get('/api/shop/inventario', obtenerInventarioUsuario);

// Admin: subir carta (usa Cloudinary) - requiere ADMIN_KEY header 'x-admin-key'
app.post('/api/admin/upload-card', upload.single('file'), async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ ok: false, error: 'Admin key invalid' });
    }

    const nombre = String(req.body?.nombre || '').trim();
    const rareza = String(req.body?.rareza || 'common').trim().toLowerCase();
    const club = String(req.body?.club || '').trim();

    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });

    const uploadResult = await cloudinary.uploader.upload(req.file.path, { folder: 'inazuma/cards' });

    const creado = await pool.query(
      'INSERT INTO cartas (nombre, imagen_url, rareza, club) VALUES ($1, $2, $3, $4) RETURNING id, nombre, imagen_url, rareza, club',
      [nombre || uploadResult.public_id, uploadResult.secure_url, rareza, club],
    );

    return res.status(201).json({ ok: true, carta: creado.rows[0] });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Abrir sobre: genera cartas según configuración y guarda en user_cartas
app.post('/api/shop/abrir-sobre', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const user = await authDesdeToken(req, client);
    if (!user) return res.status(401).json({ ok: false, error: 'Sesion no valida' });

    const sobreId = parseNumero(req.body?.sobreId, null);
    if (!sobreId) return res.status(400).json({ ok: false, error: 'sobreId requerido' });

    await client.query('BEGIN');

    const sobreRes = await client.query('SELECT id, nombre, precio_monedas FROM sobres WHERE id = $1 AND activo = TRUE LIMIT 1', [sobreId]);
    if (sobreRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Sobre no encontrado' });
    }
    const sobre = sobreRes.rows[0];

    const saldoRes = await client.query('SELECT COALESCE(monedas, 0) AS monedas FROM usuarios WHERE id = $1 FOR UPDATE', [user.id]);
    const saldoActual = parseNumero(saldoRes.rows[0]?.monedas, 0);
    const precioSobre = Math.max(0, parseNumero(sobre.precio_monedas, 0));
    if (saldoActual < precioSobre) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Monedas insuficientes', monedas: saldoActual });
    }

    const cartaAleatoria = await obtenerCartaAleatoria();
    if (!cartaAleatoria) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'No hay cartas disponibles para abrir sobres' });
    }
    const cartasSeleccionadas = [cartaAleatoria];

    const saldoNuevoRes = await client.query(
      'UPDATE usuarios SET monedas = COALESCE(monedas, 0) - $1 WHERE id = $2 RETURNING COALESCE(monedas, 0) AS monedas',
      [precioSobre, user.id],
    );
    const saldoNuevo = parseNumero(saldoNuevoRes.rows[0]?.monedas, 0);

    await client.query(
      `INSERT INTO monedas_movimientos (usuario_id, cambio, motivo, metadata)
       VALUES ($1, $2, 'compra_sobre', $3::jsonb)`,
      [user.id, -precioSobre, JSON.stringify({ sobreId: sobre.id, nombre: sobre.nombre })],
    );

    // Guardar en user_cartas (upsert)
    for (const c of cartasSeleccionadas) {
      await client.query(
        `INSERT INTO user_cartas (usuario_id, carta_id, cantidad, creado_en)
         VALUES ($1, $2, 1, NOW())
         ON CONFLICT (usuario_id, carta_id) DO UPDATE SET cantidad = user_cartas.cantidad + 1`,
        [user.id, c.id],
      );

      await guardarEnInventario(client, {
        usuarioId: user.id,
        itemTipo: 'carta',
        itemKey: String(c.id),
        nombre: c.nombre,
        imagenUrl: c.imagen_url,
        rareza: c.rareza,
        cantidad: 1,
        metadata: { cartaId: c.id, club: c.club || null },
      });
    }

    await client.query('COMMIT');

    console.log(`[ABRIR-SOBRE] Usuario ${user.username} abrió sobre ${sobre.id}`);
    console.log(`[ABRIR-SOBRE] Cartas seleccionadas: ${cartasSeleccionadas.length}`);
    if (cartasSeleccionadas.length > 0) {
      console.log(`[ABRIR-SOBRE] Primera carta:`, {
        id: cartasSeleccionadas[0].id,
        nombre: cartasSeleccionadas[0].nombre,
        rareza: cartasSeleccionadas[0].rareza,
        imagen_url_preview: String(cartasSeleccionadas[0].imagen_url).substring(0, 50) + '...',
      });
    }

    return res.json({ ok: true, cartas: cartasSeleccionadas, monedas_restantes: saldoNuevo });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ ok: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

app.get("/api/diarios/estado", async (req, res) => {
  try {
    const modoClave = String(
      req.query?.modo || req.query?.modoClave || "normal",
    )
      .trim()
      .toLowerCase();
    const dia = obtenerFechaMadrid();
    let personaje = null;
    let intento = null;
    let modo = null;

    try {
      modo = await obtenerModoJuegoId(modoClave);
    } catch {
      modo = null;
    }

    if (modo) {
      try {
        personaje = await obtenerODesbloquearPersonajeDiario(modo.id, dia);
        const user = await authDesdeToken(req);
        if (user) {
          const intentoResult = await pool.query(
            `SELECT * FROM intentos_diarios WHERE usuario_id = $1 AND modo_juego_id = $2 AND dia = $3 LIMIT 1`,
            [user.id, modo.id, dia],
          );
          intento = intentoResult.rows[0] || null;
        }
      } catch {
        personaje = null;
      }
    }

    if (!personaje) {
      const fallbackPersonaje = await obtenerPersonajeDiarioFallback(
        modoClave,
        dia,
      );
      if (fallbackPersonaje) {
        return res.json({
          ok: true,
          dia,
          modo: modo || { clave: modoClave, nombre: modoClave },
          personaje: serializarPersonajeDiarioFallback(
            fallbackPersonaje,
            modoClave,
            dia,
          ),
          intento,
          persistido: false,
          fallback: true,
        });
      }

      return res.json({
        ok: true,
        dia,
        modo: modo || { clave: modoClave, nombre: modoClave },
        personaje: null,
        intento,
        persistido: false,
        fallback: true,
      });
    }

    return res.json({
      ok: true,
      dia,
      modo: modo || { clave: modoClave, nombre: modoClave },
      personaje,
      intento,
      persistido: Boolean(modo),
      fallback: !modo,
    });
  } catch (error) {
    const modoClave = String(
      req.query?.modo || req.query?.modoClave || "normal",
    )
      .trim()
      .toLowerCase();
    const dia = obtenerFechaMadrid();
    const personaje = await obtenerPersonajeDiarioFallback(
      modoClave,
      dia,
    ).catch(() => null);
    return res.json({
      ok: true,
      dia,
      modo: { clave: modoClave, nombre: modoClave },
      personaje: personaje
        ? serializarPersonajeDiarioFallback(personaje, modoClave, dia)
        : null,
      intento: null,
      persistido: false,
      fallback: true,
      warning: error.message,
    });
  }
});

app.post("/api/diarios/intentos", async (req, res) => {
  try {
    try {
      console.log('[API] /api/diarios/intentos body:', JSON.stringify(req.body).slice(0, 2000));
    } catch (e) {
      // noop: logging best-effort
    }
    const user = await authDesdeToken(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "Sesion no valida" });
    }

    const modoClave = String(req.body?.modo || req.body?.modoClave || "normal")
      .trim()
      .toLowerCase();
    const dia = String(req.body?.dia || obtenerFechaMadrid()).slice(0, 10);
    const modo = await obtenerModoJuegoId(modoClave);
    if (!modo) {
      console.warn('[API] /api/diarios/intentos modo no encontrado:', modoClave);
      return res.status(404).json({ ok: false, error: 'Modo de juego no encontrado', persistido: false });
    }

    const personajeDiario = await obtenerODesbloquearPersonajeDiario(modo.id, dia);
    if (!personajeDiario) {
      console.warn('[API] /api/diarios/intentos sin personaje diario:', { modoClave, dia, modoId: modo.id });
      return res.status(404).json({ ok: false, error: 'No se pudo obtener el personaje diario', persistido: false });
    }

    const intento = await registrarIntentoDiario({
      userId: user.id,
      modoJuegoId: modo.id,
      dia,
      personajeDiarioId: personajeDiario.id,
      intentosUsados: req.body?.intentosUsados ?? req.body?.intentos_usados,
      pistasUsadas: req.body?.pistasUsadas ?? req.body?.pistas_usadas,
      completado: req.body?.completado,
      acertado: req.body?.acertado,
      inicio: req.body?.inicio,
      fin: req.body?.fin,
      tiempoMs: req.body?.tiempoMs ?? req.body?.tiempo_ms,
      puntuacion: req.body?.puntuacion,
      adivinanzas: req.body?.adivinanzas || [],
    });

    try {
      console.log('[API] registrarIntentoDiario returned:', intento ? { id: intento.id, usuario_id: intento.usuario_id, dia: intento.dia } : null);
    } catch (e) {
      // noop: logging best-effort
    }

    return res.json({ ok: true, intento, persistido: true });
  } catch (error) {
    console.error('[API] /api/diarios/intentos error:', error);
    return res.status(500).json({
      ok: false,
      intento: null,
      persistido: false,
      error: error.message,
    });
  }
});

app.get("/api/diarios/ranking", async (req, res) => {
  try {
    const modoClave = String(
      req.query?.modo || req.query?.modoClave || "normal",
    )
      .trim()
      .toLowerCase();
    const dia = String(req.query?.dia || obtenerFechaMadrid()).slice(0, 10);
    const limite = parseNumero(req.query?.limite, 10);

    let ranking = [];
    let modo = null;
    let persistido = false;
    let fallback = true;

    try {
      const resultado = await obtenerRankingDiario(modoClave, dia, limite);
      ranking = resultado.ranking;
      modo = resultado.modo;
      persistido = resultado.persistido;
      fallback = resultado.fallback;
    } catch {
      ranking = [];
      modo = null;
      persistido = false;
      fallback = true;
    }

    return res.json({
      ok: true,
      dia,
      modo: modo || { clave: modoClave, nombre: modoClave },
      ranking,
      persistido,
      fallback,
    });
  } catch (error) {
    const modoClave = String(
      req.query?.modo || req.query?.modoClave || "normal",
    )
      .trim()
      .toLowerCase();
    const dia = String(req.query?.dia || obtenerFechaMadrid()).slice(0, 10);
    return res.json({
      ok: true,
      dia,
      modo: { clave: modoClave, nombre: modoClave },
      ranking: [],
      persistido: false,
      fallback: true,
      warning: error.message,
    });
  }
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("REQ FILE:", req.file);
    console.log("BODY:", req.body);
    const result = await cloudinary.uploader.upload(req.file.path);

    return res.json({
      ok: true,
      url: result.secure_url,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});
// Start server immediately without waiting for schema validation
const servidor = app.listen(PORT, HOST, () => {
  console.log(`✅ Servidor iniciado en http://${HOST}:${PORT}`);
  console.log("🔄 Validando esquema en background...");
});

// Manejo de errores del servidor
servidor.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Puerto ${PORT} ya está en uso`);
  } else if (err.code === "EACCES") {
    console.error(`❌ Permisos insuficientes para usar puerto ${PORT}`);
  } else {
    console.error(`❌ Error del servidor:`, err.message);
  }
  process.exit(1);
});

// Validate schema in background
validarAuthSchema().catch((error) => {
  console.error("⚠️ Advertencia - Schema validation falló:", error.message);
  console.error(
    "   El servidor está corriendo pero algunas funciones pueden no funcionar",
  );
});

asegurarSistemaMonedas().catch((error) => {
  console.error("⚠️ Advertencia - Monedas setup falló:", error.message);
});

asegurarInventario().catch((error) => {
  console.error("⚠️ Advertencia - Inventario setup falló:", error.message);
});

migrarCartasLegadoAInventario().catch((error) => {
  console.error("⚠️ Advertencia - Migración de inventario falló:", error.message);
});

// Manejo global de errores no capturados
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Promesa rechazada no manejada:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Excepción no capturada:", error);
  process.exit(1);
});
