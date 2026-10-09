import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const LOCAL_PORT = 54329;

function loadEnvFile(): void {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function isRemoteDatabase(url: string | undefined): boolean {
  if (!url?.startsWith("postgres")) return false;
  try {
    const host = new URL(url).hostname;
    return host !== "127.0.0.1" && host !== "localhost";
  } catch {
    return false;
  }
}

function bin(name: string): string {
  return path.join(process.cwd(), "node_modules", ".bin", name);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  loadEnvFile();
  const mode = process.argv[2];
  let server: PGLiteSocketServer | null = null;

  if (!isRemoteDatabase(process.env.DATABASE_URL)) {
    const dir = path.join(process.cwd(), "data", "pglite");
    fs.mkdirSync(dir, { recursive: true });
    const db = await PGlite.create(dir);
    server = new PGLiteSocketServer({
      db,
      host: "127.0.0.1",
      port: LOCAL_PORT,
      maxConnections: 10,
    });
    await server.start();
    const url = `postgresql://postgres:postgres@127.0.0.1:${LOCAL_PORT}/postgres?connection_limit=5`;
    process.env.DATABASE_URL = url;
    process.env.DIRECT_URL = url;
  }
  if (!process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;

  const steps: Array<[string, string[]]> = [];
  if (mode === "dev") {
    steps.push([bin("prisma"), ["migrate", "deploy"]], [bin("next"), ["dev"]]);
  } else if (mode === "start") {
    steps.push([bin("prisma"), ["migrate", "deploy"]], [bin("next"), ["start"]]);
  } else if (mode === "migrate") {
    steps.push([bin("prisma"), ["migrate", "deploy"]]);
  } else if (mode === "seed") {
    steps.push([bin("tsx"), ["prisma/seed.ts"]]);
  } else if (mode === "setup") {
    steps.push([bin("prisma"), ["migrate", "deploy"]], [bin("tsx"), ["prisma/seed.ts"]]);
  } else {
    console.error("Use dev, start, migrate, seed, or setup");
    process.exit(1);
  }

  let code = 0;
  try {
    for (const [command, args] of steps) {
      code = await run(command, args, process.env);
      if (code !== 0) break;
    }
  } finally {
    await server?.stop();
  }
  process.exit(code);
}

void main();
