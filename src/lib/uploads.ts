import fs from "fs/promises";
import path from "path";

export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export function safeUploadPath(storageKey: string): string {
  if (!/^[a-f0-9]{32}$/.test(storageKey)) {
    throw new Error("Invalid file key");
  }
  const root = path.resolve(UPLOAD_DIR);
  const full = path.resolve(root, storageKey);
  if (!full.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid file path");
  }
  return full;
}

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}
