import "dotenv/config";
import pkg from "pg";
import { createPgConfig } from "./pg-config.js";
const { Pool } = pkg;

const pool = new Pool(createPgConfig());

async function inspectDB() {
  try {
    console.log("\n=== INSPECCIÓN DE BASE DE DATOS ===\n");

    // 1. Listar todas las tablas
    const tablesResult = await pool.query(`
      SELECT 
        tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);

    console.log(`✓ TABLAS ENCONTRADAS: ${tablesResult.rows.length}\n`);

    for (const { tablename } of tablesResult.rows) {
      console.log(`📋 ${tablename.toUpperCase()}`);
      console.log("─".repeat(60));

      // Obtener información de columnas
      const columnsResult = await pool.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
      `, [tablename]);

      for (const col of columnsResult.rows) {
        const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
        const defaultVal = col.column_default ? ` = ${col.column_default}` : '';
        console.log(`  • ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      }

      // Contar filas
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${tablename}`);
      console.log(`  📊 Filas: ${countResult.rows[0].count}\n`);
    }

    // 2. Listar vistas
    const viewsResult = await pool.query(`
      SELECT 
        viewname 
      FROM pg_views 
      WHERE schemaname = 'public' 
      ORDER BY viewname
    `);

    if (viewsResult.rows.length > 0) {
      console.log(`\n=== VISTAS (${viewsResult.rows.length}) ===\n`);
      for (const { viewname } of viewsResult.rows) {
        console.log(`👁️  ${viewname}`);
      }
    }

    // 3. Resumen de la BD
    console.log("\n=== RESUMEN ===\n");
    console.log(`Total de tablas: ${tablesResult.rows.length}`);
    console.log(`Total de vistas: ${viewsResult.rows.length}`);

    const totalRowsResult = await pool.query(
      `SELECT sum(n_live_tup) as total FROM pg_stat_user_tables WHERE schemaname = 'public'`
    );
    console.log(`Total de registros en tablas: ${totalRowsResult.rows[0].total || 0}`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error("   → PostgreSQL no está corriendo en localhost:5432");
    }
  } finally {
    await pool.end();
    process.exit(0);
  }
}

inspectDB();
