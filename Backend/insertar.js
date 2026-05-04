import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, "..", "public", "data", "personajes.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const client = new Client(createPgConfig());

function inferirPosicionDesdeIcono(iconoPosicionUrl) {
  if (!iconoPosicionUrl) return null;

  const upper = String(iconoPosicionUrl).toUpperCase();
  if (upper.includes("GK")) return "portero";
  if (upper.includes("DF")) return "defensa";
  if (upper.includes("MF")) return "medio";
  if (upper.includes("FW")) return "delantero";

  return null;
}

function valorTexto(v, fallback) {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length > 0 ? s : fallback;
}

async function run() {
  await client.connect();

const query = `
  INSERT INTO personajes (
    nombre, alias, sprite_url, silueta_url,
    icono_elemento_url, icono_posicion_url,
    icono_club_url, icono_saga_url,
    elemento, posicion, club, saga,
    tiene_espiritu, tiene_miximax,
    genero, genero_url
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
  )
  ON CONFLICT (nombre, saga, club) DO UPDATE SET
    alias = EXCLUDED.alias,
    sprite_url = EXCLUDED.sprite_url,
    silueta_url = EXCLUDED.silueta_url,
    icono_elemento_url = EXCLUDED.icono_elemento_url,
    icono_posicion_url = EXCLUDED.icono_posicion_url,
    icono_club_url = EXCLUDED.icono_club_url,
    icono_saga_url = EXCLUDED.icono_saga_url,
    elemento = EXCLUDED.elemento,
    posicion = EXCLUDED.posicion,
    tiene_espiritu = EXCLUDED.tiene_espiritu,
    tiene_miximax = EXCLUDED.tiene_miximax,
    genero = EXCLUDED.genero,
    genero_url = EXCLUDED.genero_url;
`;

  for (const p of data) {
    const posicionNormalizada = valorTexto(
      p.posicion,
      inferirPosicionDesdeIcono(p.icono_posicion_url) || "desconocido"
    );

    await client.query(query, [
      valorTexto(p.nombre, "desconocido"),
      p.alias,
      valorTexto(p.sprite_url, ""),
      valorTexto(p.silueta_url, ""),
      valorTexto(p.icono_elemento_url, ""),
      valorTexto(p.icono_posicion_url, ""),
      valorTexto(p.icono_club_url, ""),
      p.icono_saga_url,
      valorTexto(p.elemento, "desconocido"),
      posicionNormalizada,
      valorTexto(p.club, "desconocido"),
      valorTexto(p.saga, "desconocido"),
      Boolean(p.tiene_espiritu),
      Boolean(p.tiene_miximax),
      valorTexto(p.genero, "M"),
      valorTexto(p.genero_url, "/genero/M.webp")
    ]);
  }

  await client.end();
  console.log("✔ Importación terminada");
}

run();
