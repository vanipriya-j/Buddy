import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ParentShell } from "@/components/parent-shell";
import { readAuth } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const auth = await readAuth();
  if (!auth) redirect("/");
  if (auth.mode === "locked") redirect("/locked");
  if (auth.mode === "child" && auth.sessionId) redirect(`/child/${auth.sessionId}`);
  return <ParentShell>{children}</ParentShell>;
}
