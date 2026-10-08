import type { Category } from "@/lib/categories";
import type { Script } from "@/lib/dialogue/scripts";
import type { TaskStatus } from "@/lib/routine/status";
import type { RewardKind } from "@/lib/rewards";

export const COACH_PHASES = [
  "intro",
  "prepare",
  "step",
  "quiet_work",
  "check_help",
  "on_break",
  "between_break",
  "refusal_smaller",
  "refusal_parent",
  "refusal_stopped",
  "await_parent_approval",
  "parent_checkpoint",
  "session_paused_parent",
  "session_goodbye",
] as const;

export type CoachPhase = (typeof COACH_PHASES)[number];

export type ChildIntent = "ready" | "help" | "break" | "done" | "refusal" | "unknown";

export interface PendingReward {
  kind: RewardKind;
  stars: number;
}

export interface CoachState {
  phase: CoachPhase;
  taskStatus: TaskStatus;
  stepIndex: number;
  refusalCount: number;
  helpRequests: number;
  breakCount: number;
  promptStopped: boolean;
  playSilence: boolean;
  pausedFrom: CoachPhase | null;
  quietCheckins: number;
  quietToken: string;
  tookScheduledBreak: boolean;
  smallerStep: boolean;
  unknownPrompts: number;
  pendingRewards: PendingReward[];
  utteranceSeq: number;
  utteranceId: string;
  lastSay: string | null;
}

export interface CoachButton {
  id: string;
  label: string;
  intent: ChildIntent;
}

export interface CoachEffect {
  say: string | null;
  buttons: CoachButton[];
  dim: boolean;
  listen: boolean;
  showParentGate: boolean;
  parentCheckpoint: boolean;
  elephant: "talk" | "wait" | "rest" | "done";
  advance: "stay" | "next" | "end_session";
  rewards: PendingReward[];
  utteranceId: string;
}

export interface CoachContext {
  category: Category;
  script: Script;
  childName: string;
  greet: boolean;
  hasNext: boolean;
  breakAfter: boolean;
  rewardStars: number;
  hasReferenceAudio: boolean;
}

export type CoachEvent =
  | { type: "child_intent"; intent: ChildIntent }
  | { type: "quiet_elapsed"; token: string }
  | { type: "parent_pause" }
  | { type: "parent_resume" }
  | { type: "parent_present" }
  | { type: "parent_approve"; outcome: "completed" | "partial" }
  | { type: "parent_skip" }
  | { type: "parent_offer_again" }
  | { type: "session_limit" }
  | { type: "check_in_due" };

export interface ReduceResult {
  state: CoachState;
  effect: CoachEffect;
}
