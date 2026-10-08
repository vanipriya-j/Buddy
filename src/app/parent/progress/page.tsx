"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/client-api";
import { formatMinutes, formatShortDate, startOfWeek, todayString } from "@/lib/utils";

interface ProgressResponse {
  childName: string;
  summary: {
    consistency: string;
    disclaimer: string;
    days: Array<{
      date: string;
      planned: number;
      attempted: number;
      completed: number;
      partial: number;
      needsSupport: number;
      activeSeconds: number;
      breaksRequested: number;
      lines: string[];
    }>;
  };
  starsValidated: number;
  starsWaiting: number;
  observations: Array<{ date: string; note: string }>;
}

export default function ProgressPage() {
  const [anchor, setAnchor] = useState(todayString());
  const [report, setReport] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<ProgressResponse>(`/api/progress?date=${anchor}`)
      .then(setReport)
      .catch((err: Error) => setError(err.message));
  }, [anchor]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">This week</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAnchor(shift(anchor, -7))}>Previous</Button>
          <Button variant="outline" onClick={() => setAnchor(shift(anchor, 7))}>Next</Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {report ? (
        <>
          <p>{report.summary.consistency}</p>
          <p className="text-sm">Stars confirmed by you: {report.starsValidated}. Waiting: {report.starsWaiting}.</p>
          {report.summary.days.map((day) => (
            <Card key={day.date}>
              <CardContent className="space-y-2 p-4">
                <h2 className="font-semibold">{formatShortDate(day.date)}</h2>
                <p className="text-sm text-muted-foreground">
                  Planned {day.planned} · attempted {day.attempted} · completed {day.completed} · partly done {day.partial}
                  {" · "}support {day.needsSupport} · time {formatMinutes(day.activeSeconds)} · breaks {day.breaksRequested}
                </p>
                <ul className="text-sm">
                  {day.lines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </CardContent>
            </Card>
          ))}
          {report.observations.length > 0 ? (
            <Card>
              <CardContent className="space-y-1 p-4">
                <h2 className="font-semibold">Observations</h2>
                {report.observations.map((note) => (
                  <p key={`${note.date}-${note.note}`} className="text-sm">{formatShortDate(note.date)}: {note.note}</p>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <p className="text-sm text-muted-foreground">{report.summary.disclaimer}</p>
        </>
      ) : <p>Loading the week…</p>}
      <p className="sr-only">{startOfWeek(anchor)}</p>
    </div>
  );
}

function shift(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year, month - 1, day + days);
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${m}-${d}`;
}
