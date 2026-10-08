import { redirect } from "next/navigation";
import { PinGate } from "@/components/pin-gate";
import { readAuth } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const auth = await readAuth();
  if (auth?.mode === "parent") redirect("/parent");
  if (auth?.mode === "child" && auth.sessionId) redirect(`/child/${auth.sessionId}`);
  if (auth?.mode === "locked") redirect("/locked");
  return <PinGate mode="login" />;
}
