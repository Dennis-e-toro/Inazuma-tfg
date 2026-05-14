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
      // Config conservadora para planes con limite bajo de conexiones
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 30000),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
      max: Number(process.env.PGPOOL_MAX || 5),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 60000),
      keepAlive: true,
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
