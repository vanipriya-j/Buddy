"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";
import { WEEKDAY_LABELS } from "@/lib/utils";
import type { ActivityView } from "@/lib/views";

const emptyConfig: Record<Category, Record<string, unknown>> = {
  school: { subject: "", assignment: "" },
  kumon: { worksheetCount: 1, exercise: "" },
  paattu: { songName: "", raga: "", practiceInstructions: "", assignedSection: "" },
  art: { prompt: "" },
  reading: { book: "", pages: "", wordHints: [] },
  puzzles: { puzzle: "" },
  play: { place: "either" },
  organising: { area: "" },
  custom: { detail: "" },
};

export function ActivityForm({ initial }: { initial?: ActivityView }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [category, setCategory] = useState<Category>((initial?.category as Category) ?? "school");
  const [config, setConfig] = useState<Record<string, unknown>>(initial?.config ?? emptyConfig.school);
  const [time, setTime] = useState(initial?.scheduledTime ?? "");
  const [minutes, setMinutes] = useState(initial?.estimatedMinutes ?? 15);
  const [daily, setDaily] = useState(initial?.daily ?? false);
  const [days, setDays] = useState<number[]>(initial?.recurrenceDays ?? [1, 2, 3, 4, 5]);
  const [priority, setPriority] = useState(initial?.priority ?? "normal");
  const [steps, setSteps] = useState(initial?.stepCount ?? 3);
  const [breakAfter, setBreakAfter] = useState(initial?.breakAfter ?? false);
  const [breakMinutes, setBreakMinutes] = useState(initial?.breakMinutes ?? 5);
  const [stars, setStars] = useState(initial?.rewardStars ?? 1);
  const [rewardNote, setRewardNote] = useState(initial?.rewardNote ?? "");
  const [criteria, setCriteria] = useState(initial?.completionCriteria ?? "");
  const [notes, setNotes] = useState(initial?.learningNotes ?? "");
  const [hints, setHints] = useState(hintsToText(initial?.config.wordHints));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [materials, setMaterials] = useState(initial?.materials ?? []);

  function changeCategory(next: Category) {
    setCategory(next);
    setConfig(initial?.category === next && initial.config ? initial.config : emptyConfig[next]);
  }

  function setField(key: string, value: unknown) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const nextConfig = { ...config };
    if (category === "reading") {
      nextConfig.wordHints = hints.split("\n").map((line) => {
        const [word, ...rest] = line.split(":");
        if (!word?.trim() || rest.join(":").trim().length === 0) return null;
        return { word: word.trim(), hint: rest.join(":").trim() };
      }).filter(Boolean);
    }
    const body = {
      title,
      instructions,
      category,
      scheduledTime: time || null,
      estimatedMinutes: minutes,
      daily,
      recurrenceDays: daily ? [] : days,
      priority,
      stepCount: steps,
      breakAfter,
      breakMinutes,
      rewardStars: stars,
      rewardNote,
      completionCriteria: criteria,
      learningNotes: notes,
      config: nextConfig,
    };
    try {
      const saved = initial
        ? await api<ActivityView>(`/api/activities/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await api<ActivityView>("/api/activities", { method: "POST", body: JSON.stringify(body) });
      router.push(`/parent/activities/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  async function upload(file: File, kind: string) {
    if (!initial) return;
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    const saved = await api<ActivityView>(`/api/activities/${initial.id}/materials`, { method: "POST", body: form });
    setMaterials(saved.materials);
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
        <Field label="Category">
          <select className="h-10 w-full rounded-md border bg-card px-3 text-sm" value={category} onChange={(event) => changeCategory(event.target.value as Category)}>
            {CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}
          </select>
        </Field>
      </div>
      <CategoryFields category={category} config={config} setField={setField} hints={hints} setHints={setHints} />
      <Field label="Instructions">
        <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Time"><Input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
        <Field label="Minutes"><Input type="number" min={1} max={120} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></Field>
        <Field label="Steps"><Input type="number" min={1} max={8} value={steps} onChange={(event) => setSteps(Number(event.target.value))} /></Field>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="daily">Every day</Label>
        <Switch id="daily" checked={daily} onCheckedChange={setDaily} />
      </div>
      {!daily ? (
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, index) => (
            <button
              type="button"
              key={label}
              className={`rounded-full border px-3 py-1 text-sm ${days.includes(index) ? "bg-primary text-primary-foreground" : "bg-card"}`}
              onClick={() => setDays((current) => current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort())}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priority">
          <select className="h-10 w-full rounded-md border bg-card px-3 text-sm" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Stars for finishing, 0 to 3"><Input type="number" min={0} max={3} value={stars} onChange={(event) => setStars(Number(event.target.value))} /></Field>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="break">Break after this activity</Label>
        <Switch id="break" checked={breakAfter} onCheckedChange={setBreakAfter} />
      </div>
      {breakAfter ? <Field label="Break minutes"><Input type="number" min={1} max={30} value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))} /></Field> : null}
      <Field label="Real-world reward"><Input value={rewardNote} onChange={(event) => setRewardNote(event.target.value)} placeholder="A story together at bedtime" /></Field>
      <Field label="Completion"><Textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="The agreed section, or a smaller part if energy is low" /></Field>
      <Field label="Learning material notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save activity"}</Button>
      {initial ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Files</h2>
          <p className="text-sm text-muted-foreground">Worksheets, images, lyrics, or reference audio. Nothing is played on its own.</p>
          <Input type="file" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file, file.type.startsWith("audio/") ? "audio" : "reference").catch((err: Error) => setError(err.message));
          }} />
          <ul className="text-sm">
            {materials.map((material) => (
              <li key={material.id} className="flex items-center justify-between gap-2 py-1">
                <span>{material.filename}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => void api(`/api/materials/${material.id}`, { method: "DELETE" }).then(() => setMaterials((current) => current.filter((item) => item.id !== material.id)))}>Remove</Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="destructive" onClick={() => void api(`/api/activities/${initial.id}`, { method: "DELETE" }).then(() => router.push("/parent/activities"))}>
            Remove activity
          </Button>
        </div>
      ) : <p className="text-sm text-muted-foreground">Save first, then you can add files.</p>}
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm font-semibold">
      <span>{label}</span>
      {children}
    </label>
  );
}

function CategoryFields({
  category,
  config,
  setField,
  hints,
  setHints,
}: {
  category: Category;
  config: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  hints: string;
  setHints: (value: string) => void;
}) {
  const text = (key: string) => String(config[key] ?? "");
  if (category === "school") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject"><Input value={text("subject")} onChange={(event) => setField("subject", event.target.value)} /></Field>
        <Field label="Assignment"><Input value={text("assignment")} onChange={(event) => setField("assignment", event.target.value)} /></Field>
      </div>
    );
  }
  if (category === "kumon") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Worksheets"><Input type="number" min={1} max={20} value={Number(config.worksheetCount ?? 1)} onChange={(event) => setField("worksheetCount", Number(event.target.value))} /></Field>
        <Field label="Exercise"><Input value={text("exercise")} onChange={(event) => setField("exercise", event.target.value)} /></Field>
      </div>
    );
  }
  if (category === "paattu") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Song"><Input value={text("songName")} onChange={(event) => setField("songName", event.target.value)} /></Field>
        <Field label="Raga"><Input value={text("raga")} onChange={(event) => setField("raga", event.target.value)} /></Field>
        <Field label="Section"><Input value={text("assignedSection")} onChange={(event) => setField("assignedSection", event.target.value)} /></Field>
        <Field label="Practice note"><Input value={text("practiceInstructions")} onChange={(event) => setField("practiceInstructions", event.target.value)} /></Field>
      </div>
    );
  }
  if (category === "art") return <Field label="Optional prompt"><Input value={text("prompt")} onChange={(event) => setField("prompt", event.target.value)} /></Field>;
  if (category === "reading") {
    return (
      <div className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Book"><Input value={text("book")} onChange={(event) => setField("book", event.target.value)} /></Field>
          <Field label="Pages"><Input value={text("pages")} onChange={(event) => setField("pages", event.target.value)} /></Field>
        </div>
        <Field label="Word hints, one per line as word: hint">
          <Textarea value={hints} onChange={(event) => setHints(event.target.value)} />
        </Field>
      </div>
    );
  }
  if (category === "play") {
    return (
      <Field label="Place">
        <select className="h-10 w-full rounded-md border bg-card px-3 text-sm" value={text("place") || "either"} onChange={(event) => setField("place", event.target.value)}>
          <option value="either">Either</option>
          <option value="indoor">Indoor</option>
          <option value="outdoor">Outdoor</option>
        </select>
      </Field>
    );
  }
  if (category === "puzzles") return <Field label="Puzzle"><Input value={text("puzzle")} onChange={(event) => setField("puzzle", event.target.value)} /></Field>;
  if (category === "organising") return <Field label="Area"><Input value={text("area")} onChange={(event) => setField("area", event.target.value)} /></Field>;
  return <Field label="Detail"><Input value={text("detail")} onChange={(event) => setField("detail", event.target.value)} /></Field>;
}

function hintsToText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((hint) => {
    if (!hint || typeof hint !== "object") return "";
    const row = hint as { word?: string; hint?: string };
    return row.word && row.hint ? `${row.word}: ${row.hint}` : "";
  }).filter(Boolean).join("\n");
}
