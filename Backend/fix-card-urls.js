import "dotenv/config";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function fixCardUrls() {
  try {
    console.log("🔧 Actualizando rutas de cartas en la BD...\n");

    const updates = [
      { nombre: "UR - Aiden & Shawn", newUrl: "/cartas/Aiden_y_Shawn.png" },
      { nombre: "UR - Haizaki", newUrl: "/cartas/Haizaki.png" },
      { nombre: "UR - Axel", newUrl: "/cartas/Axel.png" },
    ];

    for (const update of updates) {
      const result = await pool.query(
        "UPDATE cartas SET imagen_url = $1 WHERE nombre = $2",
        [update.newUrl, update.nombre]
      );
      console.log(`✓ ${update.nombre}: ${result.rowCount} fila(s) actualizada(s)`);
    }

    // También actualizar en el inventario
    console.log("\nActualizando inventario...");
    const invResult = await pool.query(
      `UPDATE inventario 
       SET imagen_url = CASE 
         WHEN nombre = 'UR - Aiden & Shawn' THEN '/cartas/Aiden_y_Shawn.png'
         WHEN nombre = 'UR - Haizaki' THEN '/cartas/Haizaki.png'
         WHEN nombre = 'UR - Axel' THEN '/cartas/Axel.png'
         ELSE imagen_url
       END
       WHERE nombre IN ('UR - Aiden & Shawn', 'UR - Haizaki', 'UR - Axel')`
    );
    console.log(`✓ Inventario: ${invResult.rowCount} fila(s) actualizada(s)`);

    console.log("\n✅ Rutas de cartas actualizadas correctamente");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

fixCardUrls();
