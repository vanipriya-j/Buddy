import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import { ensureUploadDir, safeUploadPath } from "@/lib/uploads";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "materials";

export function usingSupabaseStorage(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let client: SupabaseClient | null | undefined;
let bucketReady: Promise<void> | null = null;

function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    client = null;
    return client;
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

async function ensureBucket(storage: SupabaseClient): Promise<void> {
  bucketReady ??= storage.storage.createBucket(BUCKET, { public: false }).then(({ error }) => {
    if (error && !/exist/i.test(error.message)) {
      throw new Error(error.message);
    }
  });
  await bucketReady;
}

export async function putObject(key: string, bytes: Buffer, mimeType: string): Promise<void> {
  const storage = supabase();
  if (!storage) {
    await ensureUploadDir();
    await fs.writeFile(safeUploadPath(key), bytes);
    return;
  }
  await ensureBucket(storage);
  const { error } = await storage.storage.from(BUCKET).upload(key, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(error.message);
}

export async function getObject(key: string): Promise<Buffer> {
  const storage = supabase();
  if (!storage) return fs.readFile(safeUploadPath(key));
  const { data, error } = await storage.storage.from(BUCKET).download(key);
  if (error || !data) throw new Error(error?.message ?? "File missing");
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteObject(key: string): Promise<void> {
  const storage = supabase();
  if (!storage) {
    await fs.unlink(safeUploadPath(key)).catch(() => undefined);
    return;
  }
  await storage.storage.from(BUCKET).remove([key]);
}

export async function copyObject(fromKey: string, toKey: string, mimeType: string): Promise<boolean> {
  try {
    const bytes = await getObject(fromKey);
    await putObject(toKey, bytes, mimeType);
    return true;
  } catch {
    return false;
  }
}
