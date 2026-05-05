import "dotenv/config";
import pkg from 'pg';
import { createPgConfig } from './pg-config.js';
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function run() {
  try {
    console.log('Insertando sobres de prueba...');
    const res = await pool.query(
      `INSERT INTO sobres (nombre, precio_monedas, contenido_json, portada_url, activo)
       VALUES
       ($1, $2, $3, $4, TRUE),
       ($5, $6, $7, $8, TRUE)
       RETURNING id, nombre, portada_url`,
      [
        'Sobre Aiden y Shawn', 100, JSON.stringify({ common: 3, rare: 1 }), '/sobres/aiden_y_shawn.png',
        'Sobre Haizaki', 120, JSON.stringify({ common: 3, rare: 1 }), '/sobres/haizaki.png',
      ],
    );
    console.log('Insertados:', res.rows);
  } catch (err) {
    console.error('Error insertando sobres:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

run();
