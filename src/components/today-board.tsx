"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/client-api";
import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import { STATUS_LABELS, type TaskStatus } from "@/lib/routine/status";
import { SPEECH_PROCESSING_NOTE } from "@/lib/speech/web-speech";
import { formatLongDate, todayString } from "@/lib/utils";
import type { SessionActionResponse, TodayView } from "@/lib/views";

export function TodayBoard() {
  const router = useRouter();
  const [date, setDate] = useState(todayString());
  const [today, setToday] = useState<TodayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [limit, setLimit] = useState(20);
  const [present, setPresent] = useState(false);
  const [buttonsOnly, setButtonsOnly] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function load(next = date) {
    const view = await api<TodayView>(`/api/today?date=${next}`);
    setToday(view);
  }

  useEffect(() => {
    void load(date).catch((err: Error) => setError(err.message));
    // load is recreated each render; date is the trigger we care about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function act(body: unknown) {
    setError(null);
    const view = await api<TodayView>("/api/today/actions", { method: "POST", body: JSON.stringify(body) });
    setToday(view);
  }

  async function start() {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ view: { sessionId: string } }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          pin,
          limitMinutes: limit,
          confirmPresent: true,
          buttonsOnly,
          checkInIntervalMinutes: 10,
          date,
        }),
      });
      router.push(`/child/${result.view.sessionId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
    } finally {
      setPending(false);
    }
  }

  const included = today?.items.filter((item) => item.included && !["completed", "partial", "skipped"].includes(item.status)) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Today&apos;s plan for {today?.childName ?? "Aaroh"}</p>
          <h1 className="font-display text-3xl">{formatLongDate(date)}</h1>
        </div>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-44" />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void act({ action: "lighten", date }).catch((err: Error) => setError(err.message))}>Lighten today</Button>
        <Button variant="outline" onClick={() => void act({ action: "restore", date }).catch((err: Error) => setError(err.message))}>Restore plan</Button>
        {today?.session ? (
          <Button onClick={() => void api<SessionActionResponse>(`/api/sessions/${today.session?.id}/enter`, { method: "POST" }).then((result) => {
            router.push(result.redirect);
            router.refresh();
          }).catch((err: Error) => setError(err.message))}>Return to session</Button>
        ) : null}
      </div>
      <div className="space-y-3">
        {today?.items.length === 0 ? <p>Nothing is planned. Add an activity, or enjoy the free time.</p> : null}
        {today?.items.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-48 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{item.title}</h2>
                  <Badge>{CATEGORY_LABELS[item.category as Category] ?? item.category}</Badge>
                  <Badge variant="outline">{STATUS_LABELS[item.status as TaskStatus] ?? item.status}</Badge>
                  {!item.included ? <Badge variant="outline">Left out</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.scheduledTime ? `${item.scheduledTime} · ` : ""}about {item.estimatedMinutes} min
                  {item.breakAfter ? ` · break after` : ""}
                  {item.helpCount > 0 ? ` · support ${item.helpCount}` : ""}
                </p>
              </div>
              <Input
                type="number"
                min={1}
                max={120}
                value={item.estimatedMinutes}
                className="w-20"
                aria-label={`${item.title} minutes`}
                onChange={(event) => void act({
                  action: "patch",
                  date,
                  id: item.id,
                  estimatedMinutes: Number(event.target.value),
                }).catch((err: Error) => setError(err.message))}
              />
              <Button variant="outline" size="sm" onClick={() => void act({ action: "reorder", date, id: item.id, direction: "up" })}>Up</Button>
              <Button variant="outline" size="sm" onClick={() => void act({ action: "reorder", date, id: item.id, direction: "down" })}>Down</Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void act({ action: "patch", date, id: item.id, included: !item.included }).catch((err: Error) => setError(err.message))}
              >
                {item.included ? "Skip today" : "Put back"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void act({ action: "move", date, id: item.id, toDate: shift(date) }).catch((err: Error) => setError(err.message))}>
                Move to tomorrow
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">Start a supervised session</h2>
          <p className="text-sm text-muted-foreground">{SPEECH_PROCESSING_NOTE}</p>
          <p className="text-sm">Buddy cannot tell whether you stay nearby. Starting means you are confirming that you are present.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="limit">Screen limit, minutes</Label>
              <Input id="limit" type="number" min={5} max={40} value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="start-pin">Parent PIN</Label>
              <Input id="start-pin" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-1" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="present">I am physically present with Aaroh</Label>
            <Switch id="present" checked={present} onCheckedChange={setPresent} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="buttons-only">Buttons only, no microphone</Label>
            <Switch id="buttons-only" checked={buttonsOnly} onCheckedChange={setButtonsOnly} />
          </div>
          <Button disabled={!present || pin.length < 4 || pending || included.length === 0 || Boolean(today?.session)} onClick={() => void start()}>
            {pending ? "Starting" : "Start session"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">Observation</h2>
          <p className="text-sm text-muted-foreground">A neutral note about the day. Buddy does not interpret mood or ability.</p>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What happened" />
          <Button
            variant="outline"
            onClick={() => void act({ action: "note", date, note }).then(() => setNote("")).catch((err: Error) => setError(err.message))}
            disabled={!note.trim()}
          >
            Save note
          </Button>
          <ul className="space-y-1 text-sm">
            {today?.observations.map((item) => <li key={item.id}>{item.note}</li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function shift(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year, month - 1, day + 1);
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${m}-${d}`;
}
