import type { ChildIntent } from "@/lib/dialogue/types";

export interface IntentRule {
  pattern: RegExp;
  intent: ChildIntent;
}

/** English plus a small Tanglish seed list. Add Tamil phrases here later. */
export const INTENT_RULES: IntentRule[] = [
  { pattern: /\b(not now|don't want|do not want|no thanks|leave it|later|vendam|vendaam|venda|illa)\b/i, intent: "refusal" },
  { pattern: /\b(help|stuck|don't know|do not know|help pannu|help pan|theriyala|theriyadhu)\b/i, intent: "help" },
  { pattern: /\b(break|tired|rest|pause|pause pannu)\b/i, intent: "break" },
  { pattern: /\b(done|finished|finish|all done|mudinjachu|mudinchu|mudinchiruchu)\b/i, intent: "done" },
  { pattern: /\b(ready|yes|yeah|okay|ok|start|let's go|lets go|aam|aama|sari|seri)\b/i, intent: "ready" },
  { pattern: /^(no|nope)$/i, intent: "refusal" },
];

export const FUTURE_SPEECH_LOCALES = ["en-US", "ta-IN"] as const;

export function parseIntent(transcript: string, rules: IntentRule[] = INTENT_RULES): ChildIntent {
  const text = transcript.toLowerCase().replace(/[!.?,]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "unknown";
  for (const rule of rules) {
    if (rule.pattern.test(text)) return rule.intent;
  }
  return "unknown";
}
