import "dotenv/config";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function checkSobres() {
  try {
    console.log("\n=== CONTENIDO DE TABLA SOBRES ===\n");
    const res = await pool.query("SELECT id, nombre, precio_monedas, contenido_json, portada_url, activo FROM sobres ORDER BY id");
    
    if (res.rows.length === 0) {
      console.log("❌ No hay sobres en la BD");
    } else {
      console.log(`✓ Encontrados ${res.rows.length} sobres:\n`);
      res.rows.forEach((s) => {
        console.log(`ID: ${s.id}`);
        console.log(`Nombre: ${s.nombre}`);
        console.log(`Precio: ${s.precio_monedas}`);
        console.log(`Portada URL: ${s.portada_url || '(null)'}`);
        console.log(`Contenido: ${JSON.stringify(s.contenido_json)}`);
        console.log(`Activo: ${s.activo}`);
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

checkSobres();
