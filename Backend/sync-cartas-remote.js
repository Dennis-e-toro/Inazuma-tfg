import "dotenv/config";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

// Las cartas que queremos insertar
const cartas = [
  { nombre: "UR - Aiden & Shawn", rareza: "ur", club: "Raimon", imagen: "/cartas/aiden_y_shawn.svg" },
  { nombre: "UR - Haizaki", rareza: "ur", club: "Demonio", imagen: "/cartas/haizaki.svg" },
  { nombre: "Rare - Kazemaru", rareza: "rare", club: "Raimon", imagen: "/cartas/kazemaru.svg" },
  { nombre: "Rare - Tachimukai", rareza: "rare", club: "Raimon", imagen: "/cartas/tachimukai.svg" },
  { nombre: "Common - Ichinose", rareza: "common", club: "Zeus", imagen: "/cartas/ichinose.svg" },
  { nombre: "Common - Kariya", rareza: "common", club: "Raimon", imagen: "/cartas/kariya.svg" },
  { nombre: "Common - Kido", rareza: "common", club: "Raimon", imagen: "/cartas/kido.svg" }
];

async function syncCartasToRemote() {
  const pool = new Pool(createPgConfig());

  try {
    console.log("🔄 Sincronizando cartas a BD remota (Neon)...\n");

    let insertadas = 0;
    for (const carta of cartas) {
      const dataUri = carta.imagen;

      const updateRes = await pool.query(
        `UPDATE cartas
         SET imagen_url = $2,
             rareza = $3,
             club = $4
         WHERE nombre = $1
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
