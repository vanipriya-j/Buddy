import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../..");
fs.mkdirSync(path.join(root, "data"), { recursive: true });

execSync("npx prisma migrate deploy", {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
