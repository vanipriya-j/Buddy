"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { BuddyElephant } from "@/components/buddy-elephant";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

const links = [
  { href: "/parent", label: "Today" },
  { href: "/parent/activities", label: "Activities" },
  { href: "/parent/templates", label: "Templates" },
  { href: "/parent/progress", label: "Progress" },
];

export function ParentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function lock() {
    await api("/api/auth/lock", { method: "POST" });
    router.push("/locked");
    router.refresh();
  }

  async function changePin(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await api("/api/auth/pin", {
        method: "POST",
        body: JSON.stringify({ currentPin, nextPin }),
      });
      setCurrentPin("");
      setNextPin("");
      setMessage("PIN updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Try again");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/parent" className="flex items-center gap-2">
            <BuddyElephant size={46} mood="wait" className="buddy-float" />
            <span>
              <span className="block font-display text-xl leading-none text-primary">Buddy</span>
              <span className="text-xs text-muted-foreground">Parent</span>
            </span>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-semibold",
                    active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">Change PIN</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change parent PIN</DialogTitle>
              </DialogHeader>
              <form onSubmit={changePin} className="space-y-3">
                <div>
                  <Label htmlFor="current-pin">Current PIN</Label>
                  <Input id="current-pin" inputMode="numeric" value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="next-pin">New PIN</Label>
                  <Input id="next-pin" inputMode="numeric" value={nextPin} onChange={(event) => setNextPin(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-1" />
                </div>
                {message ? <p className="text-sm">{message}</p> : null}
                <Button type="submit">Save PIN</Button>
              </form>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => void lock()}>Lock</Button>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
