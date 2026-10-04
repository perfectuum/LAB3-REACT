import { createApp } from "./app.js";
import { query, withTransaction } from "./db.js";

const port = Number(process.env.API_PORT || 3001);
createApp(query, withTransaction).listen(port, "127.0.0.1", () => {
  console.log(`API: http://127.0.0.1:${port}/api`);
});
