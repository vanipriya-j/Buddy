export const MIC_DENIED_MESSAGE = "The microphone isn't available. The big buttons work just as well.";

export const SPEECH_PROCESSING_NOTE =
  "Buddy uses the browser Web Speech API. In Chromium, speech recognition may send audio to the browser vendor's speech service. Buddy does not receive or store that audio, and it does not save what Aaroh says. Buttons-only mode skips the microphone.";

export interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
}

export function configureRecognition<T extends RecognitionLike>(recognition: T, lang = "en-US"): T {
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = lang;
  if (recognition.continuous) {
    throw new Error("Microphone must not run continuously");
  }
  return recognition;
}

export class PushToTalkController {
  private recognition: RecognitionLike | null = null;
  private mode: "idle" | "hold" | "tap" = "idle";
  started = 0;
  stopped = 0;

  constructor(
    private readonly factory: () => RecognitionLike,
    private readonly lang = "en-US",
  ) {}

  get isListening(): boolean {
    return this.mode !== "idle";
  }

  press(): void {
    if (this.mode !== "idle") this.finish();
    const recognition = configureRecognition(this.factory(), this.lang);
    if (recognition.continuous) {
      throw new Error("Microphone must not run continuously");
    }
    this.recognition = recognition;
    this.mode = "hold";
    this.started += 1;
    recognition.start();
  }

  release(shortPress: boolean): void {
    if (this.mode !== "hold") return;
    if (shortPress) {
      this.mode = "tap";
      return;
    }
    this.finish();
  }

  finishTap(): void {
    if (this.mode === "tap") this.finish();
  }

  private finish(): void {
    if (this.recognition) {
      if (this.recognition.continuous) {
        throw new Error("Microphone must not run continuously");
      }
      this.recognition.stop();
    }
    this.stopped += 1;
    this.recognition = null;
    this.mode = "idle";
  }
}

export type ListenResult =
  | { ok: true; transcript: string }
  | { ok: false; reason: "unsupported" | "denied" | "no-speech" | "error" };

export interface SpeechEngine {
  readonly continuous: false;
  speak(text: string, lang?: string): Promise<void>;
  cancel(): void;
  listenOnce(lang?: string): Promise<ListenResult>;
}

interface BrowserRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => BrowserRecognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const browser = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

export function createWebSpeechEngine(): SpeechEngine {
  return {
    continuous: false,
    cancel() {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    speak(text: string, lang = "en-US") {
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          resolve();
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.92;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    },
    listenOnce(lang = "en-US") {
      const Ctor = recognitionCtor();
      if (!Ctor) return Promise.resolve({ ok: false, reason: "unsupported" });
      const recognition = configureRecognition(new Ctor(), lang);
      return new Promise((resolve) => {
        let settled = false;
        const finish = (result: ListenResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        let transcript = "";
        recognition.onresult = (event) => {
          transcript = event.results?.[0]?.[0]?.transcript ?? "";
        };
        recognition.onerror = (event) => {
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            finish({ ok: false, reason: "denied" });
          } else if (event.error === "no-speech") {
            finish({ ok: false, reason: "no-speech" });
          } else {
            finish({ ok: false, reason: "error" });
          }
        };
        recognition.onend = () => {
          if (transcript.trim()) finish({ ok: true, transcript });
          else finish({ ok: false, reason: "no-speech" });
        };
        try {
          recognition.start();
        } catch {
          finish({ ok: false, reason: "error" });
          return;
        }
        setTimeout(() => {
          try {
            recognition.stop();
          } catch {
            finish({ ok: false, reason: "error" });
          }
        }, 5000);
      });
    },
  };
}
