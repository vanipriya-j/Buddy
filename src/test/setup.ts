import { spawn } from "node:child_process";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const root = path.resolve(__dirname, "../..");
const db = await PGlite.create();
const server = new PGLiteSocketServer({
  db,
  host: "127.0.0.1",
  port: 0,
  maxConnections: 10,
});
await server.start();
const address = server.getServerConn();

const url = `postgresql://postgres:postgres@${address}/postgres?connection_limit=5`;
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.SESSION_SECRET ??= "test-secret-test-secret";

await new Promise<void>((resolve, reject) => {
  const child = spawn(path.join(root, "node_modules", ".bin", "prisma"), ["migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`prisma migrate deploy exited ${code}`));
  });
});
