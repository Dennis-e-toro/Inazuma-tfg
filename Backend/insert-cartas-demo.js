import "dotenv/config";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function insertarCartasDemo() {
  try {
    console.log("🎴 Insertando cartas de demo con imágenes SVG base64...\n");

    const cartas = [
      { nombre: "UR - Aiden & Shawn", rareza: "ur", club: "Raimon", imagen: "/cartas/Aiden_y_Shawn.png" },
      { nombre: "UR - Axel", rareza: "ur", club: "Raimon", imagen: "/cartas/Axel.png" },
      { nombre: "UR - Haizaki", rareza: "ur", club: "Demonio", imagen: "/cartas/Haizaki.png" }
    ];

    for (const carta of cartas) {
      const dataUri = carta.imagen;

      await pool.query(
        "INSERT INTO cartas (nombre, imagen_url, rareza, club) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [carta.nombre, dataUri, carta.rareza, carta.club]
      );

      console.log(`✓ ${carta.nombre} (${carta.rareza}) insertada`);
    }

    console.log("\n✅ Cartas insertadas");

    // Verificar
    const countRes = await pool.query("SELECT COUNT(*) as total FROM cartas");
    console.log(`📊 Total de cartas en BD: ${countRes.rows[0].total}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

insertarCartasDemo();
