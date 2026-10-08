"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ActivityForm } from "@/components/activity-form";
import { api } from "@/lib/client-api";
import type { ActivityView } from "@/lib/views";

export default function EditActivityPage() {
  const params = useParams<{ id: string }>();
  const [activity, setActivity] = useState<ActivityView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<ActivityView>(`/api/activities/${params.id}`)
      .then(setActivity)
      .catch((err: Error) => setError(err.message));
  }, [params.id]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!activity) return <p>Loading activity…</p>;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">{activity.title}</h1>
      <ActivityForm initial={activity} />
    </div>
  );
}
