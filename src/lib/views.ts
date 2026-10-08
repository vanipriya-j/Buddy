import type { CoachButton } from "@/lib/dialogue/types";

export interface MaterialView {
  id: string;
  filename: string;
  mimeType: string;
  kind: string;
}

export interface ActivityView {
  id: string;
  title: string;
  instructions: string;
  category: string;
  sequence: number;
  scheduledTime: string | null;
  estimatedMinutes: number;
  daily: boolean;
  recurrenceDays: number[];
  priority: string;
  stepCount: number;
  breakAfter: boolean;
  breakMinutes: number;
  rewardStars: number;
  rewardNote: string;
  completionCriteria: string;
  learningNotes: string;
  onlyDate: string | null;
  config: Record<string, unknown>;
  materials: MaterialView[];
}

export interface TodayItemView {
  id: string;
  activityId: string;
  title: string;
  category: string;
  scheduledTime: string | null;
  estimatedMinutes: number;
  baselineMinutes: number;
  sequence: number;
  included: boolean;
  status: string;
  priority: string;
  breakAfter: boolean;
  breakMinutes: number;
  autoSkipped: boolean;
  helpCount: number;
  breakCount: number;
  refusalCount: number;
  activeSeconds: number;
  completionCriteria: string;
  rewardNote: string;
}

export interface ObservationView {
  id: string;
  date: string;
  note: string;
  createdAt: string;
}

export interface TodayView {
  date: string;
  childName: string;
  session: { id: string; status: string } | null;
  items: TodayItemView[];
  observations: ObservationView[];
}

export interface TemplateView {
  id: string;
  name: string;
  description: string;
  activities: Array<{ title: string; category: string; estimatedMinutes: number; daily: boolean; recurrenceDays: number[] }>;
}

export interface PlanItemView {
  id: string;
  title: string;
  minutes: number;
  breakAfter: boolean;
  place: "done" | "now" | "later" | "skipped";
}

export interface ChildSessionView {
  sessionId: string;
  status: "active" | "paused" | "ended";
  childName: string;
  say: string | null;
  utteranceId: string;
  buttons: CoachButton[];
  dim: boolean;
  listen: boolean;
  buttonsOnly: boolean;
  autoOpenParent: boolean;
  parentCheckpoint: boolean;
  elephant: "talk" | "wait" | "rest" | "done";
  remainingSec: number;
  phase: string;
  taskStatus: string;
  quietAfterMs: number | null;
  quietToken: string | null;
  activity: {
    instanceId: string;
    title: string;
    category: string;
    minutes: number;
    stepIndex: number;
    stepCount: number;
    referenceAudioUrl: string | null;
    rewardNote: string;
  } | null;
  plan: PlanItemView[];
  pendingRewards: Array<{ kind: string; stars: number }>;
  ended: boolean;
  presenceNote: string;
}

export interface SessionActionResponse {
  view: ChildSessionView;
  nextMode: "child" | "parent" | "locked";
  redirect: string;
}

export const PRESENCE_NOTE =
  "Buddy cannot detect whether you are in the room. Confirming here is your own check, not a sensor.";
