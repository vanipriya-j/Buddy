"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/client-api";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { WEEKDAY_LABELS } from "@/lib/utils";
import type { ActivityView } from "@/lib/views";

export default function ActivitiesPage() {
  const [items, setItems] = useState<ActivityView[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(await api<ActivityView[]>("/api/activities"));
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, []);

  async function move(id: string, direction: "up" | "down") {
    await api("/api/activities/reorder", { method: "POST", body: JSON.stringify({ id, direction }) });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Activities</h1>
        <Button asChild><Link href="/parent/activities/new">New activity</Link></Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-52 flex-1">
              <Link href={`/parent/activities/${item.id}`} className="font-semibold hover:underline">{item.title}</Link>
              <p className="text-sm text-muted-foreground">
                {CATEGORY_LABELS[item.category as Category] ?? item.category}
                {" · "}
                {item.daily ? "Every day" : item.recurrenceDays.map((day) => WEEKDAY_LABELS[day]).join(", ") || "One date"}
                {" · "}
                {item.estimatedMinutes} min
              </p>
            </div>
            <Badge>{item.priority}</Badge>
            <Button variant="outline" size="sm" onClick={() => void move(item.id, "up")}>Up</Button>
            <Button variant="outline" size="sm" onClick={() => void move(item.id, "down")}>Down</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
