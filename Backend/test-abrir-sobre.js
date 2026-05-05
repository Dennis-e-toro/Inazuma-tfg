import "dotenv/config";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function testAbrirSobre() {
  try {
    console.log("\n=== TEST: ABRIR SOBRE ===\n");

    // 1. Obtener un sobre
    const sobreRes = await pool.query("SELECT id, nombre, contenido_json FROM sobres WHERE activo = TRUE LIMIT 1");
    if (sobreRes.rows.length === 0) {
      console.log("❌ No hay sobres");
      return;
    }
    const sobre = sobreRes.rows[0];
    console.log(`✓ Sobre: ${sobre.nombre}`);
    console.log(`  Contenido: ${JSON.stringify(sobre.contenido_json)}`);

    // 2. Simular lo que hace el backend
    const config = sobre.contenido_json || {};
    const rarezas = Object.keys(config);
    const cartasSeleccionadas = [];

    for (const r of rarezas) {
      const count = config[r] || 0;
      if (count <= 0) continue;
      
      const cartasRes = await pool.query(
        "SELECT id, nombre, imagen_url, rareza, club FROM cartas WHERE rareza = $1 ORDER BY id ASC LIMIT $2",
        [r, 1000]
      );
      
      const cartas = cartasRes.rows;
      console.log(`\n  Rareza ${r}: ${cartas.length} cartas disponibles`);
      
      if (cartas.length > 0) {
        console.log(`    Primera carta:`);
        console.log(`      - Nombre: ${cartas[0].nombre}`);
        console.log(`      - Rareza: ${cartas[0].rareza}`);
        console.log(`      - imagen_url (primeros 100 chars): ${String(cartas[0].imagen_url).substring(0, 100)}...`);
        cartasSeleccionadas.push(cartas[0]);
      }
    }

    console.log(`\n✓ Cartas seleccionadas: ${cartasSeleccionadas.length}`);
    console.log("\n📋 Response que enviaría el backend:");
    console.log(JSON.stringify({ ok: true, cartas: cartasSeleccionadas }, null, 2).substring(0, 500) + "...");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testAbrirSobre();
