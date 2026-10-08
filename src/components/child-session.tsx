"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BuddyElephant } from "@/components/buddy-elephant";
import { api } from "@/lib/client-api";
import { parseIntent } from "@/lib/speech/intent";
import { configureRecognition, createWebSpeechEngine, MIC_DENIED_MESSAGE, type SpeechEngine } from "@/lib/speech/web-speech";
import { REWARD_LABELS, type RewardKind } from "@/lib/rewards";
import type { ChildSessionView, SessionActionResponse } from "@/lib/views";

export function ChildSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [view, setView] = useState<ChildSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState(false);
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [micNote, setMicNote] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const spoken = useRef<string | null>(null);
  const engine = useRef<SpeechEngine | null>(null);
  const recognition = useRef<{ stop: () => void } | null>(null);
  const pressStarted = useRef(0);

  async function refresh() {
    const result = await api<SessionActionResponse>(`/api/sessions/${sessionId}`);
    setView(result.view);
    if (result.nextMode === "locked") router.push("/locked");
    if (result.nextMode === "parent") router.push("/parent");
  }

  useEffect(() => {
    engine.current = createWebSpeechEngine();
    void refresh().catch((err: Error) => setError(err.message));
    const poll = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 15000);
    return () => {
      clearInterval(poll);
      engine.current?.cancel();
      recognition.current?.stop();
    };
    // refresh identity changes, session id is the stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!view?.say || !view.utteranceId) return;
    const key = `${view.sessionId}:${view.utteranceId}`;
    if (spoken.current === key) return;
    if (typeof window !== "undefined" && sessionStorage.getItem("buddy-said") === key) {
      spoken.current = key;
      return;
    }
    spoken.current = key;
    sessionStorage.setItem("buddy-said", key);
    void engine.current?.speak(view.say);
  }, [view?.say, view?.utteranceId, view?.sessionId]);

  useEffect(() => {
    if (view?.autoOpenParent) setGate(true);
  }, [view?.phase, view?.autoOpenParent]);

  useEffect(() => {
    if (!view || view.ended || view.remainingSec <= 0) return;
    const timer = setTimeout(() => {
      void send({ action: "session_tick" });
    }, view.remainingSec * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.remainingSec, view?.sessionId, view?.ended]);

  useEffect(() => {
    if (!view?.quietAfterMs || !view.quietToken) return;
    const timer = setTimeout(() => {
      void send({ action: "quiet_elapsed", token: view.quietToken });
    }, view.quietAfterMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.quietToken, view?.quietAfterMs]);

  async function send(body: unknown) {
    setError(null);
    try {
      const result = await api<SessionActionResponse>(`/api/sessions/${sessionId}/actions`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setView(result.view);
      if (result.nextMode === "locked") {
        if (result.view.say) await engine.current?.speak(result.view.say);
        router.push("/locked");
        router.refresh();
      } else if (result.nextMode === "parent") {
        router.push("/parent");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Try again");
    }
  }

  function startMic() {
    if (!view?.listen || holding) return;
    const browser = window as Window & {
      SpeechRecognition?: new () => RecognitionHandle;
      webkitSpeechRecognition?: new () => RecognitionHandle;
    };
    const Ctor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Ctor) {
      setMicNote("This browser has no speech recognition. The big buttons work.");
      return;
    }
    const rec = configureRecognition(new Ctor());
    let transcript = "";
    rec.onresult = (event) => {
      transcript = event.results?.[0]?.[0]?.transcript ?? "";
    };
    rec.onerror = (event) => {
      setHolding(false);
      setMicNote(event.error === "not-allowed" ? MIC_DENIED_MESSAGE : "Speaking didn't work. You can press a button.");
    };
    rec.onend = () => {
      setHolding(false);
      recognition.current = null;
      if (!transcript.trim()) return;
      const intent = parseIntent(transcript);
      transcript = "";
      void send({ action: "child_intent", intent });
    };
    try {
      rec.start();
    } catch {
      setMicNote("Speaking didn't work. You can press a button.");
      return;
    }
    recognition.current = rec;
    pressStarted.current = Date.now();
    setHolding(true);
    setMicNote(null);
  }

  function stopMic() {
    const held = Date.now() - pressStarted.current;
    if (held < 300) {
      setTimeout(() => recognition.current?.stop(), 4000);
      return;
    }
    recognition.current?.stop();
  }

  if (!view) {
    return <main className="child-sky flex min-h-screen items-center justify-center"><p>Buddy is getting ready.</p></main>;
  }

  const minutesLeft = Math.ceil(view.remainingSec / 60);

  return (
    <main className={`child-sky min-h-screen px-4 py-4 ${view.dim ? "opacity-80" : ""}`}>
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
        <button type="button" className="rounded-full bg-card px-4 py-3 text-base font-bold shadow-sm" onClick={() => void send({ action: "parent_pause" })}>
          Pause
        </button>
        <p className="text-sm text-muted-foreground">Screen time left: {minutesLeft} min</p>
        <button type="button" className="rounded-full bg-card px-4 py-3 text-base font-bold shadow-sm" onClick={() => void send({ action: "parent_stop" })}>
          Stop
        </button>
      </div>
      <section className="mx-auto mt-4 flex max-w-xl flex-col items-center text-center">
        <BuddyElephant mood={view.elephant} size={210} />
        <p className="font-display text-3xl text-primary">Buddy</p>
        {view.activity ? (
          <p className="mt-1 text-lg font-semibold">{view.activity.title} · about {view.activity.minutes} min</p>
        ) : null}
        <p data-testid="buddy-line" className="mt-4 max-w-md text-2xl font-bold leading-snug" aria-live="polite">
          {view.say ?? (view.dim ? "Buddy is waiting quietly." : "Buddy is here.")}
        </p>
        {view.dim ? <p className="mt-2 text-sm text-muted-foreground">You can turn the screen away and keep going.</p> : null}
        {micNote ? <p className="mt-3 text-sm">{micNote}</p> : null}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-6 grid w-full gap-3">
          {view.buttons.map((button) => (
            <button
              key={button.id}
              type="button"
              className="child-button bg-card shadow-sm"
              onClick={() => void send({ action: "child_intent", intent: button.intent })}
            >
              {button.label}
            </button>
          ))}
          {view.listen ? (
            <button
              type="button"
              className="child-button bg-primary text-primary-foreground shadow-sm"
              onPointerDown={startMic}
              onPointerUp={stopMic}
              onPointerLeave={() => { if (holding) stopMic(); }}
            >
              {holding ? "Listening…" : "Hold to talk"}
            </button>
          ) : null}
          {view.activity?.referenceAudioUrl ? <ReferenceAudio url={view.activity.referenceAudioUrl} /> : null}
        </div>
        <ol className="mt-8 w-full space-y-2 text-left">
          {view.plan.map((item, index) => (
            <li key={item.id} className={`rounded-2xl px-4 py-2 text-sm ${item.place === "now" ? "bg-card font-bold" : "text-muted-foreground"}`}>
              {index + 1}. {item.title} — {item.minutes} min
              {item.place === "done" ? " · done" : ""}
              {item.place === "skipped" ? " · later" : ""}
              {item.breakAfter && item.place !== "skipped" ? " · then a break" : ""}
            </li>
          ))}
        </ol>
        <button type="button" className="mt-6 text-sm font-semibold underline" onClick={() => setGate(true)}>
          Parent
        </button>
      </section>
      {gate ? (
        <section className="mx-auto mt-4 max-w-xl rounded-3xl bg-card p-5 text-left shadow-sm">
          <h2 className="text-lg font-bold">Parent</h2>
          <p className="mt-1 text-sm text-muted-foreground">{view.presenceNote}</p>
          <label className="mt-3 block text-sm font-semibold" htmlFor="parent-pin">PIN</label>
          <input
            id="parent-pin"
            inputMode="numeric"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-1 h-12 w-full rounded-xl border px-3 text-lg"
          />
          <div className="mt-3 grid gap-2">
            <GateButton label="I am here" onClick={() => void send({ action: "parent_present", pin })} />
            <GateButton label="Mark complete" onClick={() => void send({ action: "parent_approve", pin, outcome: "completed" })} />
            <GateButton label="Mark partly done" onClick={() => void send({ action: "parent_approve", pin, outcome: "partial" })} />
            <GateButton label="Skip this activity" onClick={() => void send({ action: "parent_skip", pin })} />
            <GateButton label="Try one small step together" onClick={() => void send({ action: "parent_offer_again", pin })} />
            <GateButton label="Confirm stars" onClick={() => void send({ action: "parent_validate_rewards", pin })} />
            <GateButton label="Back to parent screen" onClick={() => void send({ action: "parent_exit", pin })} />
          </div>
          {view.pendingRewards.length > 0 ? (
            <ul className="mt-3 text-sm">
              {view.pendingRewards.map((reward, index) => (
                <li key={`${reward.kind}-${index}`}>{REWARD_LABELS[reward.kind as RewardKind] ?? reward.kind}</li>
              ))}
            </ul>
          ) : null}
          {view.activity?.rewardNote ? <p className="mt-2 text-sm">Real-world reward: {view.activity.rewardNote}</p> : null}
          <label className="mt-3 block text-sm font-semibold" htmlFor="obs">Observation</label>
          <input id="obs" value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 h-12 w-full rounded-xl border px-3" />
          <button
            type="button"
            className="mt-2 text-sm font-semibold underline"
            onClick={() => void send({ action: "parent_observation", pin, note }).then(() => setNote(""))}
          >
            Save observation
          </button>
          <button type="button" className="mt-4 block text-sm" onClick={() => setGate(false)}>Close</button>
        </section>
      ) : null}
    </main>
  );
}

function GateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="rounded-2xl border px-4 py-3 text-left font-semibold" onClick={onClick}>{label}</button>;
}

function ReferenceAudio({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  return (
    <>
      <button type="button" className="child-button bg-secondary" onClick={() => void audio.current?.play()}>
        Hear the song
      </button>
      <audio ref={audio} src={url} preload="none" />
    </>
  );
}

interface RecognitionHandle {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
