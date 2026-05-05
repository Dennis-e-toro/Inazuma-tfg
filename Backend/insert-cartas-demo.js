import "dotenv/config";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function insertarCartasDemo() {
  try {
    console.log("🎴 Insertando cartas de demo con imágenes SVG base64...\n");

    const cartas = [
      {
        nombre: "UR - Aiden & Shawn",
        rareza: "ur",
        club: "Raimon",
        color: "FF6B6B"
      },
      {
        nombre: "Rare - Kazemaru",
        rareza: "rare",
        club: "Raimon",
        color: "4ECDC4"
      },
      {
        nombre: "Rare - Tachimukai",
        rareza: "rare",
        club: "Raimon",
        color: "95E1D3"
      },
      {
        nombre: "Common - Ichinose",
        rareza: "common",
        club: "Zeus",
        color: "F38181"
      },
      {
        nombre: "Common - Kariya",
        rareza: "common",
        club: "Raimon",
        color: "AA96DA"
      },
      {
        nombre: "Common - Kido",
        rareza: "common",
        club: "Raimon",
        color: "FCBAD3"
      }
    ];

    for (const carta of cartas) {
      const svg = `<svg width="300" height="400" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad${carta.color}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#${carta.color};stop-opacity:1" />
            <stop offset="100%" style="stop-color:#${carta.color}CC;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="300" height="400" fill="url(#grad${carta.color})"/>
        <rect x="10" y="10" width="280" height="380" fill="none" stroke="white" stroke-width="2" rx="8"/>
        <text x="150" y="80" font-size="24" font-weight="bold" fill="white" text-anchor="middle">
          ${carta.nombre}
        </text>
        <text x="150" y="130" font-size="16" fill="rgba(255,255,255,0.9)" text-anchor="middle">
          ${carta.rareza.toUpperCase()}
        </text>
        <text x="150" y="200" font-size="20" fill="white" text-anchor="middle" font-weight="bold">
          ⚡
        </text>
        <text x="150" y="240" font-size="14" fill="rgba(255,255,255,0.8)" text-anchor="middle">
          Equipo: ${carta.club}
        </text>
        <circle cx="150" cy="320" r="30" fill="rgba(255,255,255,0.2)" stroke="white" stroke-width="2"/>
        <text x="150" y="330" font-size="36" text-anchor="middle" dominant-baseline="central">
          ${carta.rareza === 'ur' ? '★★' : carta.rareza === 'rare' ? '★' : '•'}
        </text>
      </svg>`;

      const base64 = Buffer.from(svg).toString("base64");
      const dataUri = `data:image/svg+xml;base64,${base64}`;

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
