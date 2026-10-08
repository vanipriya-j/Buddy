"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { todayString } from "@/lib/utils";
import type { TemplateView } from "@/lib/views";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setTemplates(await api<TemplateView[]>("/api/templates"));
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, []);

  async function save() {
    setError(null);
    await api("/api/templates", { method: "POST", body: JSON.stringify({ name }) });
    setName("");
    setMessage("Template saved from the current schedule.");
    await load();
  }

  async function apply(id: string) {
    setError(null);
    await api(`/api/templates/${id}`, {
      method: "POST",
      body: JSON.stringify({ action: "apply", date: todayString() }),
    });
    setMessage("Template applied. Today's unfinished planned items were rebuilt. Past notes stay.");
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Weekly templates</h1>
      <p className="text-sm text-muted-foreground">Applying a template replaces the standing schedule. It does not erase what already happened.</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm">{message}</p> : null}
      <div className="flex gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Template name" />
        <Button onClick={() => void save().catch((err: Error) => setError(err.message))}>Save current</Button>
      </div>
      {templates.map((template) => (
        <Card key={template.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{template.name}</h2>
              <Button variant="outline" onClick={() => void apply(template.id).catch((err: Error) => setError(err.message))}>Apply</Button>
            </div>
            <p className="text-sm text-muted-foreground">{template.description}</p>
            <ul className="text-sm">
              {template.activities.map((activity) => (
                <li key={`${template.id}-${activity.title}`}>
                  {activity.title} · {CATEGORY_LABELS[activity.category as Category] ?? activity.category} · {activity.estimatedMinutes} min
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
