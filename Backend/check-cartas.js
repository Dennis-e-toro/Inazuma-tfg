import "dotenv/config";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function checkCartas() {
  try {
    console.log("\n=== CONTENIDO DE TABLA CARTAS ===\n");
    const res = await pool.query("SELECT id, nombre, imagen_url, rareza, club FROM cartas LIMIT 10");
    
    if (res.rows.length === 0) {
      console.log("❌ No hay cartas en la BD");
    } else {
      console.log(`✓ Encontradas ${res.rows.length} cartas:\n`);
      res.rows.forEach((c, idx) => {
        console.log(`${idx + 1}. ID: ${c.id}`);
        console.log(`   Nombre: ${c.nombre}`);
        console.log(`   Rareza: ${c.rareza}`);
        console.log(`   Imagen: ${c.imagen_url || '(null)'}`);
        console.log(`   Club: ${c.club || '(null)'}`);
        console.log("---");
      });
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkCartas();
