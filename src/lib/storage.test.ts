import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import { getObject, putObject, usingSupabaseStorage } from "@/lib/storage";

describe("material storage", () => {
  it("keeps files on this computer when Supabase is not configured", async () => {
    expect(usingSupabaseStorage()).toBe(false);
    const key = randomBytes(16).toString("hex");
    await putObject(key, Buffer.from("first line"), "text/plain");
    expect((await getObject(key)).toString()).toBe("first line");
  });
});
