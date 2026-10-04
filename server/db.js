import sql from "mssql";

const config = {
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_NAME || "ShopLab3",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    ...(process.env.DB_INSTANCE ? { instanceName: process.env.DB_INSTANCE } : {}),
  },
  ...(!process.env.DB_INSTANCE ? { port: Number(process.env.DB_PORT || 1433) } : {}),
};

const pool = new sql.ConnectionPool(config);
pool.on("error", error => console.error(error.message));

export async function query(text, parameters = {}) {
  await pool.connect();
  const request = pool.request();
  for (const [name, value] of Object.entries(parameters)) request.input(name, value);
  const result = await request.query(text);
  return result.recordset || [];
}

export async function withTransaction(callback) {
  await pool.connect();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const result = await callback(async (text, parameters = {}) => {
      const request = new sql.Request(transaction);
      for (const [name, value] of Object.entries(parameters)) request.input(name, value);
      const response = await request.query(text);
      return response.recordset || [];
    });
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Transaction may already be aborted. */ }
    throw error;
  }
}
