import "dotenv/config";
import pkg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CARTAS_DIR = path.resolve(__dirname, "..", "public", "cartas");

function humanizeNombre(nombreArchivo) {
  return String(nombreArchivo)
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function construirCartasDesdeCarpeta() {
  if (!fs.existsSync(CARTAS_DIR)) return [];
  const archivos = fs.readdirSync(CARTAS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(name));

  return archivos.map((archivo) => ({
    nombre: humanizeNombre(archivo),
    rareza: "common",
    club: null,
    imagen: `/cartas/${archivo}`,
  }));
}

async function syncCartasToRemote() {
  const pool = new Pool(createPgConfig());
  const cartas = construirCartasDesdeCarpeta();
  const imagenesDeseadas = new Set(cartas.map((c) => c.imagen));

  try {
    console.log("🔄 Sincronizando cartas a BD remota (Neon)...\n");

    if (cartas.length === 0) {
      console.log(`⚠ No se encontraron imágenes en ${CARTAS_DIR}`);
      return;
    }

    const existentes = await pool.query("SELECT id, nombre, imagen_url FROM cartas");
    const idsACambiar = existentes.rows
      .filter((carta) => !imagenesDeseadas.has(carta.imagen_url))
      .map((carta) => carta.id);

    if (idsACambiar.length > 0) {
      await pool.query("DELETE FROM user_cartas WHERE carta_id = ANY($1::bigint[])", [idsACambiar]);
      const deleted = await pool.query("DELETE FROM cartas WHERE id = ANY($1::bigint[]) RETURNING id", [idsACambiar]);
      console.log(`🧹 Eliminadas ${deleted.rowCount} cartas antiguas que ya no existen en public/cartas`);
    }

    let insertadas = 0;
    for (const carta of cartas) {
      const dataUri = carta.imagen;

      const updateRes = await pool.query(
        `UPDATE cartas
         SET nombre = $1,
             imagen_url = $2,
             rareza = $3,
             club = $4
         WHERE imagen_url = $2
         RETURNING id`,
        [carta.nombre, dataUri, carta.rareza, carta.club]
      );

      if (updateRes.rows.length === 0) {
        const insertRes = await pool.query(
          `INSERT INTO cartas (nombre, imagen_url, rareza, club)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [carta.nombre, dataUri, carta.rareza, carta.club]
        );

        if (insertRes.rows.length > 0) {
          insertadas++;
          console.log(`✓ ${carta.nombre}`);
        }
      } else {
        insertadas++;
        console.log(`✓ ${carta.nombre} (actualizada)`);
      }
    }

    console.log(`\n✅ ${insertadas}/${cartas.length} cartas sincronizadas a Neon`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

syncCartasToRemote();
