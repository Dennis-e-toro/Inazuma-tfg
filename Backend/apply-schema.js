import "dotenv/config";
import fs from 'fs';
import pkg from 'pg';
import { createPgConfig } from './pg-config.js';
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function apply() {
  try {
    console.log('Leyendo schema.sql...');
    const sql = fs.readFileSync('./schema.sql', 'utf8');

    // Simple split en statements por ';' — ignorar bloques vacíos
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`Encontradas ${statements.length} sentencias (aprox). Ejecutando...`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await pool.query(stmt + ';');
      } catch (err) {
        console.error(`ERROR en sentencia ${i + 1}:`, err.message);
        // continuar con las siguientes
      }
    }

    console.log('Schema aplicado (o ya existente).');
  } catch (err) {
    console.error('Fallo leyendo o aplicando schema:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

apply();
