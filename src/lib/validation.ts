import { z } from "zod";
import { CATEGORIES } from "@/lib/categories";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);

const schoolConfig = z.object({
  subject: z.string().trim().min(1).max(60),
  assignment: z.string().trim().min(1).max(300),
}).strict();

const kumonConfig = z.object({
  worksheetCount: z.coerce.number().int().min(1).max(20),
  exercise: z.string().trim().min(1).max(200),
}).strict();

const paattuConfig = z.object({
  songName: z.string().trim().min(1).max(80),
  raga: z.string().trim().max(80).default(""),
  practiceInstructions: z.string().trim().max(300).default(""),
  assignedSection: z.string().trim().max(120).default(""),
}).strict();

const artConfig = z.object({
  prompt: z.string().trim().max(200).default(""),
}).strict();

const readingConfig = z.object({
  book: z.string().trim().min(1).max(120),
  pages: z.string().trim().max(80).default(""),
  wordHints: z.array(z.object({
    word: z.string().trim().min(1).max(40),
    hint: z.string().trim().min(1).max(160),
  }).strict()).max(20).default([]),
}).strict();

const playConfig = z.object({
  place: z.enum(["indoor", "outdoor", "either"]).default("either"),
}).strict();

const puzzlesConfig = z.object({
  puzzle: z.string().trim().max(200).default(""),
}).strict();

const organisingConfig = z.object({
  area: z.string().trim().max(80).default(""),
}).strict();

const customConfig = z.object({
  detail: z.string().trim().max(300).default(""),
}).strict();

export const configSchemas = {
  school: schoolConfig,
  kumon: kumonConfig,
  paattu: paattuConfig,
  art: artConfig,
  reading: readingConfig,
  puzzles: puzzlesConfig,
  play: playConfig,
  organising: organisingConfig,
  custom: customConfig,
} as const;

export const activityInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  instructions: z.string().trim().max(2000).default(""),
  category: z.enum(CATEGORIES),
  sequence: z.coerce.number().int().min(0).max(99).optional(),
  scheduledTime: z.union([timeSchema, z.null()]).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(120),
  daily: z.boolean().default(false),
  recurrenceDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  stepCount: z.coerce.number().int().min(1).max(8).default(3),
  breakAfter: z.boolean().default(false),
  breakMinutes: z.coerce.number().int().min(1).max(30).default(5),
  rewardStars: z.coerce.number().int().min(0).max(3).default(1),
  rewardNote: z.string().trim().max(200).default(""),
  completionCriteria: z.string().trim().max(500).default(""),
  learningNotes: z.string().trim().max(2000).default(""),
  onlyDate: z.union([dateSchema, z.null()]).optional(),
  config: z.record(z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  if (!value.daily && value.recurrenceDays.length === 0 && !value.onlyDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Choose daily, weekdays, or a single date",
      path: ["recurrenceDays"],
    });
  }
  const parsed = configSchemas[value.category].safeParse(value.config);
  if (!parsed.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Activity details are incomplete",
      path: ["config"],
    });
  }
});

export type ActivityInput = z.infer<typeof activityInputSchema>;

export function parseActivityInput(input: unknown): ActivityInput {
  const parsed = activityInputSchema.parse(input);
  const config = configSchemas[parsed.category].parse(parsed.config);
  return { ...parsed, config };
}

const childIntent = z.object({
  action: z.literal("child_intent"),
  intent: z.enum(["ready", "help", "break", "done", "refusal", "unknown"]),
}).strict();

const quietElapsed = z.object({
  action: z.literal("quiet_elapsed"),
  token: z.string().min(1).max(40),
}).strict();

const sessionTick = z.object({
  action: z.literal("session_tick"),
}).strict();

const parentPause = z.object({ action: z.literal("parent_pause") }).strict();
const parentStop = z.object({ action: z.literal("parent_stop") }).strict();

const pin = z.string().regex(/^\d{4,6}$/);

const parentPresent = z.object({
  action: z.literal("parent_present"),
  pin,
}).strict();

const parentApprove = z.object({
  action: z.literal("parent_approve"),
  pin,
  outcome: z.enum(["completed", "partial"]),
}).strict();

const parentSkip = z.object({
  action: z.literal("parent_skip"),
  pin,
}).strict();

const parentOffer = z.object({
  action: z.literal("parent_offer_again"),
  pin,
}).strict();

const parentRewards = z.object({
  action: z.literal("parent_validate_rewards"),
  pin,
}).strict();

const parentObservation = z.object({
  action: z.literal("parent_observation"),
  pin,
  note: z.string().trim().min(1).max(500),
}).strict();

const parentExit = z.object({
  action: z.literal("parent_exit"),
  pin,
}).strict();

export const sessionActionSchema = z.discriminatedUnion("action", [
  childIntent,
  quietElapsed,
  sessionTick,
  parentPause,
  parentStop,
  parentPresent,
  parentApprove,
  parentSkip,
  parentOffer,
  parentRewards,
  parentObservation,
  parentExit,
]);

export type SessionAction = z.infer<typeof sessionActionSchema>;

export const startSessionSchema = z.object({
  pin,
  limitMinutes: z.coerce.number().int().min(5).max(40),
  confirmPresent: z.literal(true),
  buttonsOnly: z.boolean().default(false),
  checkInIntervalMinutes: z.coerce.number().int().min(5).max(30).default(10),
  date: dateSchema,
}).strict();

export const todayActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reorder"),
    date: dateSchema,
    id: z.string().min(1),
    direction: z.enum(["up", "down"]),
  }).strict(),
  z.object({
    action: z.literal("patch"),
    date: dateSchema,
    id: z.string().min(1),
    estimatedMinutes: z.coerce.number().int().min(1).max(120).optional(),
    included: z.boolean().optional(),
  }).strict(),
  z.object({ action: z.literal("lighten"), date: dateSchema }).strict(),
  z.object({ action: z.literal("restore"), date: dateSchema }).strict(),
  z.object({
    action: z.literal("move"),
    date: dateSchema,
    id: z.string().min(1),
    toDate: dateSchema,
  }).strict(),
  z.object({
    action: z.literal("note"),
    date: dateSchema,
    note: z.string().trim().min(1).max(500),
  }).strict(),
]);

export type TodayAction = z.infer<typeof todayActionSchema>;

export const ALLOWED_MATERIAL_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "text/plain",
] as const;

export const MAX_MATERIAL_BYTES = 8 * 1024 * 1024;

export function materialKindFor(mime: string, requested?: string): string {
  const allowed = ["worksheet", "image", "lyrics", "audio", "reference"];
  if (requested && allowed.includes(requested)) return requested;
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "lyrics";
  return "worksheet";
}

export const BANNED_REPORT_PATTERNS = [
  /adhd/i,
  /intelligence/i,
  /wellbeing/i,
  /well-being/i,
  /diagnose/i,
  /gifted/i,
  /defiant/i,
  /emotional state/i,
];

export const BANNED_CHILD_PATTERNS = [
  /shame/i,
  /disappointed/i,
  /you must/i,
  /or else/i,
  /streak/i,
  /punish/i,
  /lose a star/i,
  /lost a star/i,
  /leaderboard/i,
  /the answer is/i,
  /worksheet answers/i,
  /bad girl/i,
  /everyone else/i,
  /talented/i,
  /beautiful picture/i,
];
