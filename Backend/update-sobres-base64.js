import "dotenv/config";
import pkg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPgConfig } from "./pg-config.js";

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool(createPgConfig());

async function updateSobresWithBase64() {
  try {
    console.log("🖼️  Actualizando sobres con portadas en base64...\n");

    const colors = {
      1: "FF6B6B", // Rojo para Aiden y Shawn
      2: "4ECDC4", // Cyan para Haizaki
    };

    const sobres = await pool.query("SELECT id, nombre FROM sobres WHERE activo = TRUE");

    for (const sobre of sobres.rows) {
      const color = colors[sobre.id] || "4A90E2";
      
      // Generar un SVG simple con gradiente y texto
      const svg = `<svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#${color};stop-opacity:1" />
            <stop offset="100%" style="stop-color:#${color}AA;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="300" height="200" fill="url(#grad)"/>
        <text x="150" y="100" font-size="32" font-weight="bold" fill="white" text-anchor="middle" dy=".3em">
          ${sobre.nombre}
        </text>
        <text x="150" y="140" font-size="16" fill="rgba(255,255,255,0.8)" text-anchor="middle">
          Sobre especial
        </text>
      </svg>`;

      const base64 = Buffer.from(svg).toString("base64");
      const dataUri = `data:image/svg+xml;base64,${base64}`;

      await pool.query(
        "UPDATE sobres SET portada_url = $1 WHERE id = $2",
        [dataUri, sobre.id]
      );

      console.log(`✓ ${sobre.nombre} → SVG base64`);
    }

    console.log("\n✅ Actualización completada");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

updateSobresWithBase64();
