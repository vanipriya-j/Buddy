import { describe, expect, it } from "vitest";
import { REFUSAL_LINES, SESSION_GOODBYE } from "@/lib/dialogue/copy";
import { reduceCoach, beginActivity, initialCoachState } from "@/lib/dialogue/reduce";
import { buildScript, collectChildLines, type ScriptInput } from "@/lib/dialogue/scripts";
import type { ChildIntent, CoachContext, CoachState } from "@/lib/dialogue/types";
import { BANNED_CHILD_PATTERNS } from "@/lib/validation";
import { assertCanTransition } from "@/lib/routine/status";
import type { Category } from "@/lib/categories";

function scriptInput(category: Category, extra: Partial<ScriptInput> = {}): ScriptInput {
  return {
    category,
    title: "Practice",
    minutes: 15,
    instructions: "Do the first small part.",
    childName: "Aaroh",
    greet: true,
    stepCount: 3,
    config: {
      subject: "Maths",
      assignment: "Page 12",
      worksheetCount: 2,
      exercise: "addition",
      songName: "Sri Gananatha",
      raga: "Malahari",
      assignedSection: "the first line",
      prompt: "Draw an animal",
      book: "Today's book",
      pages: "three pages",
      wordHints: [{ word: "curious", hint: "It starts with k." }],
      place: "outdoor",
      puzzle: "a jigsaw",
      area: "the shelf",
      detail: "a small job",
    },
    ...extra,
  };
}

function ctx(category: Category, patch: Partial<CoachContext> = {}): CoachContext {
  const script = buildScript(scriptInput(category));
  return {
    category,
    script,
    childName: "Aaroh",
    greet: true,
    hasNext: true,
    breakAfter: false,
    rewardStars: 1,
    hasReferenceAudio: false,
    ...patch,
  };
}

const intents: ChildIntent[] = ["ready", "help", "break", "done", "refusal", "unknown"];

describe("coaching state machine", () => {
  it("refuses a direct child completion", () => {
    expect(() => assertCanTransition("working", "completed", "child")).toThrow(/Illegal/);
    expect(() => assertCanTransition("working", "completed", "parent")).not.toThrow();
    expect(() => assertCanTransition("skipped", "scheduled", "child")).toThrow(/Illegal/);
    expect(() => assertCanTransition("skipped", "scheduled", "parent")).not.toThrow();
  });

  it("starts with a greeting and does not complete from the child's done button", () => {
    const start = beginActivity(ctx("school"), "scheduled");
    expect(start.state.taskStatus).toBe("ready");
    expect(start.effect.say).toMatch(/Hi Aaroh/);
    const ready = reduceCoach(start.state, { type: "child_intent", intent: "ready" }, ctx("school"));
    expect(ready.state.taskStatus).toBe("started");
    expect(ready.state.pendingRewards.map((reward) => reward.kind)).toEqual(["trying", "starting"]);
    const done = reduceCoach(ready.state, { type: "child_intent", intent: "done" }, ctx("school"));
    expect(done.state.taskStatus).not.toBe("completed");
    expect(done.state.phase).toBe("await_parent_approval");
    const approved = reduceCoach(done.state, { type: "parent_approve", outcome: "completed" }, ctx("school"));
    expect(approved.state.taskStatus).toBe("completed");
    expect(approved.effect.rewards.map((reward) => reward.kind)).toContain("completion");
  });

  it("stops prompting after repeated refusal and does not shame", () => {
    let state = initialCoachState();
    const context = ctx("kumon");
    for (let count = 0; count < 3; count += 1) {
      state = reduceCoach(state, { type: "child_intent", intent: "refusal" }, context).state;
    }
    expect(state.promptStopped).toBe(true);
    expect(state.phase).toBe("refusal_stopped");
    const again = reduceCoach(state, { type: "child_intent", intent: "ready" }, context);
    expect(again.effect.say).toBeNull();
    expect(again.state.phase).toBe("refusal_stopped");
    expect(REFUSAL_LINES.join(" ")).not.toMatch(/must|shame|disappointed/i);
  });

  it("keeps play quiet after the introduction", () => {
    const start = beginActivity(ctx("play"), "scheduled");
    const playing = reduceCoach(start.state, { type: "child_intent", intent: "ready" }, ctx("play"));
    expect(playing.state.playSilence).toBe(true);
    expect(playing.effect.dim).toBe(true);
    expect(playing.effect.listen).toBe(false);
    const later = reduceCoach(playing.state, { type: "quiet_elapsed", token: playing.state.quietToken }, ctx("play"));
    expect(later.effect.say).toBeNull();
    const nag = reduceCoach(playing.state, { type: "child_intent", intent: "ready" }, ctx("play"));
    expect(nag.effect.say).toBeNull();
  });

  it("does not let a run of child intents finish or skip the task", () => {
    for (const category of ["school", "kumon", "art", "reading"] as Category[]) {
      let state: CoachState = beginActivity(ctx(category), "scheduled").state;
      for (let index = 0; index < 24; index += 1) {
        state = reduceCoach(state, { type: "child_intent", intent: intents[index % intents.length] }, ctx(category)).state;
        expect(["completed", "partial", "skipped"]).not.toContain(state.taskStatus);
      }
    }
  });

  it("asks for a parent between activities and can take a scheduled break", () => {
    let state = beginActivity(ctx("school", { breakAfter: true }), "scheduled").state;
    state = reduceCoach(state, { type: "child_intent", intent: "ready" }, ctx("school", { breakAfter: true })).state;
    const approved = reduceCoach(state, { type: "parent_approve", outcome: "partial" }, ctx("school", { breakAfter: true }));
    expect(approved.state.taskStatus).toBe("partial");
    expect(approved.state.phase).toBe("between_break");
    expect(approved.effect.rewards.find((reward) => reward.kind === "completion")).toBeUndefined();
    const back = reduceCoach(approved.state, { type: "child_intent", intent: "ready" }, ctx("school", { breakAfter: true }));
    expect(back.state.phase).toBe("parent_checkpoint");
    const next = reduceCoach(back.state, { type: "parent_present" }, ctx("school", { breakAfter: true }));
    expect(next.effect.advance).toBe("next");
  });

  it("ends the screen without marking the activity complete", () => {
    const start = beginActivity(ctx("reading"), "scheduled");
    const ended = reduceCoach(start.state, { type: "session_limit" }, ctx("reading"));
    expect(ended.state.taskStatus).toBe("ready");
    expect(ended.effect.advance).toBe("end_session");
    expect(ended.effect.say).toBe(SESSION_GOODBYE);
  });

  it("rewards a return from a break and caps help stars", () => {
    let state = beginActivity(ctx("puzzles"), "scheduled").state;
    state = reduceCoach(state, { type: "child_intent", intent: "ready" }, ctx("puzzles")).state;
    state = reduceCoach(state, { type: "child_intent", intent: "break" }, ctx("puzzles")).state;
    const back = reduceCoach(state, { type: "child_intent", intent: "ready" }, ctx("puzzles"));
    expect(back.effect.rewards.map((reward) => reward.kind)).toContain("return");
    state = back.state;
    for (let index = 0; index < 6; index += 1) {
      state = reduceCoach(state, { type: "child_intent", intent: "help" }, ctx("puzzles")).state;
    }
    expect(state.pendingRewards.filter((reward) => reward.kind === "help").length).toBeLessThanOrEqual(3);
  });
});

describe("activity scripts", () => {
  it("does not invent answers, judge art, or pressure the child", () => {
    const lines = (["school", "kumon", "paattu", "art", "reading", "play", "puzzles", "organising", "custom"] as Category[])
      .flatMap((category) => collectChildLines(buildScript(scriptInput(category))));
    const text = lines.join("\n");
    for (const pattern of BANNED_CHILD_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
    expect(text).toMatch(/won't guess an answer/);
    expect(text).toMatch(/I don't give the answers/);
    expect(text).toMatch(/There isn't a right picture/);
    expect(text).toMatch(/I won't judge the tune/);
  });
});
