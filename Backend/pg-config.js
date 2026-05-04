function isRemoteDatabaseUrl(databaseUrl) {
  return Boolean(databaseUrl) && !databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1");
}

export function createPgConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const isProduction = process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT_NAME;

  // En producción (Railway), DATABASE_URL es OBLIGATORIO
  if (isProduction && !isRemoteDatabaseUrl(databaseUrl)) {
    console.error("❌ ERROR CRÍTICO: En production se requiere DATABASE_URL válida");
    console.error("   DATABASE_URL actual:", databaseUrl ? `"${databaseUrl}"` : "NO DEFINIDA");
    throw new Error("DATABASE_URL no configurada correctamente para production");
  }

  if (isRemoteDatabaseUrl(databaseUrl)) {
    console.log("✅ Conectando a BD remota (Neon)");
    return {
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
      // Aumentar timeouts para Railway/Neon que puede ser lento
      connectionTimeoutMillis: 60000,
      idleTimeoutMillis: 60000,
      max: 20,
      statement_timeout: 60000,
      application_name: "Inazuma-Backend",
    };
  }

  console.log("✅ Conectando a BD local (desarrollo)");
  return {
    user: process.env.PGUSER || "postgres",
    host: process.env.PGHOST || "localhost",
    database: process.env.DATABASE_NAME || "Inazuma-tfg",
    password: process.env.PGPASSWORD || "root",
    port: Number(process.env.PGPORT || 5432),
  };
}
