import "dotenv/config";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function deletePopeyeInventory() {
  try {
    console.log("🗑️ Borrando inventario del usuario popeye...\n");

    // Encontrar el usuario popeye
    const userRes = await pool.query('SELECT id, username FROM usuarios WHERE username = $1', ['popeye']);
    if (userRes.rowCount === 0) {
      console.log("ℹ️ Usuario 'popeye' no encontrado.");
      await pool.end();
      process.exit(0);
    }

    const userId = userRes.rows[0].id;
    console.log(`✓ Usuario encontrado: popeye (ID: ${userId})`);

    // Borrar inventario
    const delRes = await pool.query('DELETE FROM inventario WHERE usuario_id = $1', [userId]);
    console.log(`✓ Inventario borrado: ${delRes.rowCount} fila(s) eliminada(s)`);

    console.log("\n✅ Inventario de popeye eliminado correctamente");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

deletePopeyeInventory();
