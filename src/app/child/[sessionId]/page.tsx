import { redirect } from "next/navigation";
import { ChildSession } from "@/components/child-session";
import { readAuth } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function ChildPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const auth = await readAuth();
  if (!auth || auth.mode === "locked") redirect("/locked");
  if (auth.mode === "parent") redirect("/parent");
  if (auth.mode === "child" && auth.sessionId !== sessionId) redirect("/locked");
  return <ChildSession sessionId={sessionId} />;
}
