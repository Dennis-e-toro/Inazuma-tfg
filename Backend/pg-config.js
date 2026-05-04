function isRemoteDatabaseUrl(databaseUrl) {
  return Boolean(databaseUrl) && !databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1");
}

export function createPgConfig() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (isRemoteDatabaseUrl(databaseUrl)) {
    return {
      connectionString: databaseUrl,
      ssl: true,
    };
  }

  return {
    user: process.env.PGUSER || "postgres",
    host: process.env.PGHOST || "localhost",
    database: process.env.DATABASE_NAME || "Inazuma-tfg",
    password: process.env.PGPASSWORD || "root",
    port: Number(process.env.PGPORT || 5432),
  };
}
