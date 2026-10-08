"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BuddyElephant } from "@/components/buddy-elephant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

export function PinGate({ mode }: { mode: "login" | "locked" }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ pin }) });
      router.push("/parent");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="child-sky flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-card/95 p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <BuddyElephant mood="wait" size={150} />
          <p className="font-display text-4xl text-primary">Buddy</p>
          <h1 className="mt-2 text-xl font-bold">
            {mode === "locked" ? "Please ask your parent" : "Parent sign in"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Aaroh&apos;s screen opens only after you sign in and start a session.
          </p>
        </div>
        <label className="mt-6 block text-sm font-semibold" htmlFor="pin">Parent PIN</label>
        <Input
          id="pin"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="\d{4,6}"
          maxLength={6}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          className="mt-2 h-14 text-center text-2xl tracking-[0.4em]"
        />
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="mt-4 h-12 w-full text-base" disabled={pending || pin.length < 4}>
          {pending ? "Checking" : "Continue"}
        </Button>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          This install starts with PIN 2468. Change it after you sign in.
        </p>
      </form>
    </main>
  );
}
