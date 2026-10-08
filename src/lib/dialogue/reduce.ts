import {
  activityCompleteLine,
  BREAK_LINE,
  CHECKIN_CHILD,
  OFFER_AGAIN_LINE,
  PARENT_WAIT,
  REFUSAL_LINES,
  RETURN_LINE,
  SCHEDULED_BREAK_LINE,
  SESSION_GOODBYE,
  SKIP_LINE,
  STILL_WORKING_LINE,
  UNKNOWN_INTENT,
} from "@/lib/dialogue/copy";
import type {
  ChildIntent,
  CoachButton,
  CoachContext,
  CoachEffect,
  CoachEvent,
  CoachPhase,
  CoachState,
  PendingReward,
  ReduceResult,
} from "@/lib/dialogue/types";
import type { RewardKind } from "@/lib/rewards";
import { assertCanTransition, isTerminal, type TaskStatus, type TransitionActor } from "@/lib/routine/status";

const READY_BUTTONS: CoachButton[] = [
  { id: "ready", label: "I'm ready", intent: "ready" },
  { id: "refusal", label: "Not now", intent: "refusal" },
];

const WORK_BUTTONS: CoachButton[] = [
  { id: "next", label: "Next step", intent: "ready" },
  { id: "help", label: "I need help", intent: "help" },
  { id: "break", label: "Break", intent: "break" },
  { id: "done", label: "I'm done", intent: "done" },
];

const QUIET_BUTTONS: CoachButton[] = [
  { id: "working", label: "I'm still working", intent: "ready" },
  { id: "help", label: "I need help", intent: "help" },
  { id: "break", label: "Break", intent: "break" },
  { id: "done", label: "I'm done", intent: "done" },
];

const BREAK_BUTTONS: CoachButton[] = [
  { id: "back", label: "I'm back", intent: "ready" },
];

const SMALLER_BUTTONS: CoachButton[] = [
  { id: "try", label: "I'll try a tiny step", intent: "ready" },
  { id: "refusal", label: "Not now", intent: "refusal" },
];

const PARENT_HELP_BUTTONS: CoachButton[] = [
  { id: "try", label: "I'll try", intent: "ready" },
  { id: "help", label: "I need my parent", intent: "help" },
];

export function initialCoachState(): CoachState {
  return {
    phase: "intro",
    taskStatus: "ready",
    stepIndex: 0,
    refusalCount: 0,
    helpRequests: 0,
    breakCount: 0,
    promptStopped: false,
    playSilence: false,
    pausedFrom: null,
    quietCheckins: 0,
    quietToken: "q1",
    tookScheduledBreak: false,
    smallerStep: false,
    unknownPrompts: 0,
    pendingRewards: [],
    utteranceSeq: 0,
    utteranceId: "u0",
    lastSay: null,
  };
}

export function beginActivity(ctx: CoachContext, from: TaskStatus = "scheduled"): ReduceResult {
  const base = initialCoachState();
  if (from !== "ready") {
    assertCanTransition(from, "ready", "system");
  }
  return speak(base, ctx.script.intro, {
    buttons: READY_BUTTONS,
    listen: true,
    elephant: "talk",
  });
}

export function reduceCoach(state: CoachState, event: CoachEvent, ctx: CoachContext): ReduceResult {
  switch (event.type) {
    case "session_limit":
      return speak(state, SESSION_GOODBYE, {
        buttons: [],
        listen: false,
        elephant: "done",
        advance: "end_session",
        showParentGate: false,
      }, { phase: "session_goodbye", promptStopped: true });
    case "check_in_due":
      return pauseForParent(state, CHECKIN_CHILD);
    case "parent_pause":
      return pauseForParent(state, "We'll pause.");
    case "parent_resume":
      return resume(state);
    case "parent_present":
      return parentPresent(state, ctx);
    case "parent_approve":
      return approve(state, event.outcome, ctx);
    case "parent_skip":
      return skip(state, ctx);
    case "parent_offer_again":
      return offerAgain(state, ctx);
    case "quiet_elapsed":
      return quietElapsed(state, event.token);
    case "child_intent":
      return onChild(state, event.intent, ctx);
    default:
      return silent(state);
  }
}

function onChild(state: CoachState, intent: ChildIntent, ctx: CoachContext): ReduceResult {
  if (state.phase === "session_goodbye" || state.phase === "await_parent_approval" || state.phase === "parent_checkpoint" || state.phase === "session_paused_parent") {
    return silent(state);
  }
  if (state.promptStopped || state.phase === "refusal_stopped") {
    return silent({ ...state, promptStopped: true, phase: "refusal_stopped" });
  }
  if (state.playSilence && intent !== "help") {
    return silent(state);
  }
  if (intent === "unknown") {
    if (state.unknownPrompts >= 1) return silent(state);
    return speak(state, UNKNOWN_INTENT, currentPresentation(state), { unknownPrompts: state.unknownPrompts + 1 });
  }
  if (state.phase === "on_break" || state.phase === "between_break") {
    if (intent === "ready") return returnFromBreak(state);
    if (intent === "help" && !isTerminal(state.taskStatus)) return askHelp(state, ctx);
    return silent(state);
  }
  if (intent === "refusal") return refuse(state);
  if (intent === "help") return askHelp(state, ctx);
  if (intent === "break") return requestBreak(state);
  if (intent === "done") return askParentToCheck(state, ctx);
  return accept(state, ctx);
}

function accept(state: CoachState, ctx: CoachContext): ReduceResult {
  if (state.phase === "intro" || state.phase === "refusal_smaller" || state.phase === "refusal_parent") {
    const rewards = startingRewards(state);
    if (ctx.category === "play" && state.phase === "intro") {
      return speak(beginWorking(state, {
        playSilence: true,
        phase: "quiet_work",
        pendingRewards: mergeRewards(state.pendingRewards, rewards),
      }), "Go and play. I'll be quiet now.", {
        buttons: [{ id: "help", label: "I need my parent", intent: "help" }],
        listen: false,
        dim: true,
        elephant: "rest",
        rewards,
      });
    }
    if (state.phase === "refusal_smaller" || state.smallerStep) {
      return speak(beginWorking(state, {
        phase: "step",
        stepIndex: 0,
        smallerStep: true,
        pendingRewards: mergeRewards(state.pendingRewards, rewards),
      }), `${ctx.script.smaller} ${ctx.script.steps[0]}`, {
        buttons: WORK_BUTTONS,
        listen: true,
        elephant: "talk",
        rewards,
      });
    }
    return speak(move(state, "started", "child", {
      phase: "prepare",
      pendingRewards: mergeRewards(state.pendingRewards, rewards),
    }), ctx.script.prepare, {
      buttons: WORK_BUTTONS,
      listen: true,
      elephant: "talk",
      rewards,
    });
  }

  if (state.phase === "prepare" || state.phase === "step") {
    const finishingSmaller = state.smallerStep && state.phase === "step";
    const lastStep = state.stepIndex >= ctx.script.steps.length - 1;
    if (state.phase === "step" && (finishingSmaller || lastStep)) {
      const rewards = rewardDelta(state, [{ kind: "step", stars: 1 }]);
      return speak(move(state, "working", "child", {
        phase: "quiet_work",
        quietCheckins: 0,
        quietToken: nextToken(state.quietToken),
        pendingRewards: mergeRewards(state.pendingRewards, rewards),
      }), ctx.script.quiet, {
        buttons: QUIET_BUTTONS,
        listen: true,
        dim: true,
        elephant: "rest",
        rewards,
      });
    }
    const nextIndex = state.phase === "prepare" ? 0 : state.stepIndex + 1;
    const enteringWork = state.taskStatus !== "working";
    const stepReward = state.phase === "step" ? rewardDelta(state, [{ kind: "step", stars: 1 }]) : [];
    const nextStatus: TaskStatus = enteringWork ? "working" : state.taskStatus;
    return speak(move(state, nextStatus, enteringWork ? "child" : "system", {
      phase: "step",
      stepIndex: nextIndex,
      pendingRewards: mergeRewards(state.pendingRewards, stepReward),
    }), ctx.script.steps[nextIndex] ?? ctx.script.steps[0], {
      buttons: WORK_BUTTONS,
      listen: true,
      elephant: "talk",
      rewards: stepReward,
    });
  }

  if (state.phase === "quiet_work" || state.phase === "check_help") {
    return speak(move(state, "working", "system", { phase: "quiet_work" }), STILL_WORKING_LINE, {
      buttons: QUIET_BUTTONS,
      listen: true,
      dim: true,
      elephant: "rest",
    });
  }

  return silent(state);
}

function askHelp(state: CoachState, ctx: CoachContext): ReduceResult {
  const rewards = rewardDelta(state, [{ kind: "help", stars: 1 }]);
  const from = state.taskStatus;
  const to: TaskStatus = from === "ready" || from === "paused" ? "needs_help" : from === "needs_help" ? "needs_help" : "needs_help";
  return speak(move(state, to, "child", {
    phase: "check_help",
    playSilence: false,
    helpRequests: state.helpRequests + 1,
    pendingRewards: mergeRewards(state.pendingRewards, rewards),
  }), ctx.category === "play" ? ctx.script.help : ctx.script.help, {
    buttons: [
      { id: "ready", label: "I'll try again", intent: "ready" },
      { id: "help", label: "I need my parent", intent: "help" },
    ],
    listen: true,
    showParentGate: true,
    elephant: "wait",
    rewards,
  });
}

function requestBreak(state: CoachState): ReduceResult {
  return speak(move(state, "paused", "child", {
    phase: "on_break",
    pausedFrom: state.phase,
    breakCount: state.breakCount + 1,
    playSilence: false,
  }), BREAK_LINE, {
    buttons: BREAK_BUTTONS,
    listen: true,
    elephant: "rest",
    dim: true,
  });
}

function returnFromBreak(state: CoachState): ReduceResult {
  const scheduled = state.phase === "between_break";
  if (scheduled) {
    return speak({ ...state, phase: "parent_checkpoint" }, PARENT_WAIT, {
      buttons: [],
      listen: false,
      showParentGate: true,
      parentCheckpoint: true,
      elephant: "wait",
    });
  }
  const rewards = rewardDelta(state, [{ kind: "return", stars: 1 }]);
  const back = state.pausedFrom === "quiet_work" || state.pausedFrom === "check_help" ? "quiet_work" : "step";
  return speak(move(state, "working", "child", {
    phase: back,
    pausedFrom: null,
    pendingRewards: mergeRewards(state.pendingRewards, rewards),
  }), RETURN_LINE, {
    buttons: back === "quiet_work" ? QUIET_BUTTONS : WORK_BUTTONS,
    listen: true,
    elephant: "talk",
    rewards,
    dim: back === "quiet_work",
  });
}

function refuse(state: CoachState): ReduceResult {
  const refusalCount = state.refusalCount + 1;
  if (refusalCount === 1) {
    return speak({ ...state, refusalCount, phase: "refusal_smaller" }, REFUSAL_LINES[0], {
      buttons: SMALLER_BUTTONS,
      listen: true,
      elephant: "wait",
    });
  }
  if (refusalCount === 2) {
    return speak({ ...state, refusalCount, phase: "refusal_parent" }, REFUSAL_LINES[1], {
      buttons: PARENT_HELP_BUTTONS,
      listen: true,
      showParentGate: true,
      elephant: "wait",
    });
  }
  return speak(move(state, state.taskStatus === "scheduled" ? "ready" : "paused", state.taskStatus === "paused" ? "system" : "child", {
    refusalCount,
    phase: "refusal_stopped",
    promptStopped: true,
  }), REFUSAL_LINES[2], {
    buttons: [],
    listen: false,
    showParentGate: true,
    elephant: "wait",
  });
}

function askParentToCheck(state: CoachState, ctx: CoachContext): ReduceResult {
  if (state.taskStatus === "ready") {
    return speak(state, ctx.script.doneAsk, {
      ...currentPresentation(state),
      showParentGate: true,
    });
  }
  return speak({ ...state, phase: "await_parent_approval" }, ctx.script.doneAsk, {
    buttons: [],
    listen: false,
    showParentGate: true,
    elephant: "wait",
  });
}

function approve(state: CoachState, outcome: "completed" | "partial", ctx: CoachContext): ReduceResult {
  const rewards = outcome === "completed" && ctx.rewardStars > 0
    ? rewardDelta(state, [{ kind: "completion", stars: ctx.rewardStars }])
    : [];
  const next = move(state, outcome, "parent", {
    pendingRewards: mergeRewards(state.pendingRewards, rewards),
    playSilence: false,
  });
  const line = activityCompleteLine(outcome === "partial");
  if (ctx.breakAfter && !state.tookScheduledBreak) {
    return speak({ ...next, phase: "between_break", tookScheduledBreak: true }, `${line} ${SCHEDULED_BREAK_LINE}`, {
      buttons: BREAK_BUTTONS,
      listen: true,
      elephant: "rest",
      rewards,
      dim: true,
    });
  }
  if (!ctx.hasNext) {
    return speak({ ...next, phase: "session_goodbye" }, `${line} ${SESSION_GOODBYE}`, {
      buttons: [],
      listen: false,
      elephant: "done",
      advance: "end_session",
      rewards,
    });
  }
  return speak({ ...next, phase: "parent_checkpoint" }, `${line} ${PARENT_WAIT}`, {
    buttons: [],
    listen: false,
    showParentGate: true,
    parentCheckpoint: true,
    elephant: "wait",
    rewards,
  });
}

function skip(state: CoachState, ctx: CoachContext): ReduceResult {
  const next = move(state, "skipped", "parent", { playSilence: false });
  if (!ctx.hasNext) {
    return speak({ ...next, phase: "session_goodbye" }, `${SKIP_LINE} ${SESSION_GOODBYE}`, {
      buttons: [],
      listen: false,
      elephant: "done",
      advance: "end_session",
    });
  }
  return speak({ ...next, phase: "parent_checkpoint" }, `${SKIP_LINE} ${PARENT_WAIT}`, {
    buttons: [],
    listen: false,
    showParentGate: true,
    parentCheckpoint: true,
    elephant: "wait",
  });
}

function offerAgain(state: CoachState, ctx: CoachContext): ReduceResult {
  if (state.taskStatus === "paused" || state.taskStatus === "needs_help" || state.taskStatus === "ready") {
    const to: TaskStatus = "ready";
    return speak(move(state, to, state.taskStatus === "ready" ? "system" : "parent", {
      phase: "intro",
      promptStopped: false,
      smallerStep: true,
      playSilence: false,
    }), OFFER_AGAIN_LINE, {
      buttons: READY_BUTTONS,
      listen: true,
      elephant: "talk",
    });
  }
  if (state.taskStatus === "working" || state.taskStatus === "started") {
    return speak({
      ...state,
      phase: "step",
      stepIndex: 0,
      smallerStep: true,
      promptStopped: false,
      playSilence: false,
    }, `${OFFER_AGAIN_LINE} ${ctx.script.steps[0] ?? ctx.script.smaller}`, {
      buttons: WORK_BUTTONS,
      listen: true,
      elephant: "talk",
    });
  }
  return silent(state);
}

function parentPresent(state: CoachState, ctx: CoachContext): ReduceResult {
  if (state.phase === "parent_checkpoint") {
    if (!ctx.hasNext) {
      return speak({ ...state, phase: "session_goodbye" }, SESSION_GOODBYE, {
        buttons: [],
        listen: false,
        elephant: "done",
        advance: "end_session",
      });
    }
    return {
      state,
      effect: effectFrom(state, {
        say: null,
        buttons: [],
        listen: false,
        advance: "next",
        elephant: "talk",
        showParentGate: false,
        parentCheckpoint: false,
      }),
    };
  }
  if (state.phase === "session_paused_parent") {
    return resume(state);
  }
  return silent(state);
}

function pauseForParent(state: CoachState, say: string): ReduceResult {
  if (state.phase === "session_paused_parent") return silent(state);
  if (state.phase === "session_goodbye" || state.phase === "parent_checkpoint") {
    return speak(state, say, {
      buttons: [],
      listen: false,
      showParentGate: true,
      parentCheckpoint: state.phase === "parent_checkpoint",
      elephant: "wait",
    });
  }
  const terminal = state.taskStatus === "completed" || state.taskStatus === "partial" || state.taskStatus === "skipped";
  const nextStatus: TaskStatus = terminal ? state.taskStatus : state.taskStatus === "paused" ? "paused" : "paused";
  const actor: TransitionActor = state.taskStatus === "paused" || terminal ? "system" : "child";
  return speak(move(state, nextStatus, actor, {
    phase: "session_paused_parent",
    pausedFrom: state.phase,
  }), say, {
    buttons: [],
    listen: false,
    showParentGate: true,
    elephant: "wait",
  });
}

function resume(state: CoachState): ReduceResult {
  if (state.phase !== "session_paused_parent") return silent(state);
  if (state.promptStopped || state.pausedFrom === "refusal_stopped") {
    return speak(move(state, "paused", "system", {
      phase: "refusal_stopped",
      pausedFrom: null,
      promptStopped: true,
    }), null, {
      buttons: [],
      listen: false,
      showParentGate: true,
      elephant: "wait",
    });
  }
  const phase = state.pausedFrom ?? "intro";
  const status: TaskStatus = phase === "intro" || phase === "refusal_smaller" || phase === "refusal_parent"
    ? "ready"
    : state.taskStatus === "paused"
      ? "working"
      : state.taskStatus;
  const actor: TransitionActor = status === state.taskStatus ? "system" : "parent";
  return speak(move(state, status, actor, { phase, pausedFrom: null }), "We can continue.", {
    ...presentationFor(phase, { ...state, phase }),
    elephant: "talk",
  });
}

function quietElapsed(state: CoachState, token: string): ReduceResult {
  if (state.playSilence || state.phase !== "quiet_work") return silent(state);
  if (token !== state.quietToken) return silent(state);
  if (state.quietCheckins >= 2) return silent(state);
  return speak({
    ...state,
    phase: "check_help",
    quietCheckins: state.quietCheckins + 1,
    quietToken: nextToken(state.quietToken),
  }, "Do you need help, or are you still working?", {
    buttons: QUIET_BUTTONS,
    listen: true,
    elephant: "wait",
    dim: false,
  });
}

function startingRewards(state: CoachState): PendingReward[] {
  const rewards: PendingReward[] = [{ kind: "trying", stars: 1 }];
  if (state.refusalCount === 0 && state.helpRequests === 0) {
    rewards.push({ kind: "starting", stars: 1 });
  }
  return rewardDelta(state, rewards);
}

function rewardDelta(state: CoachState, rewards: PendingReward[]): PendingReward[] {
  const counts = new Map<RewardKind, number>();
  for (const reward of state.pendingRewards) {
    counts.set(reward.kind, (counts.get(reward.kind) ?? 0) + 1);
  }
  const accepted: PendingReward[] = [];
  for (const reward of rewards) {
    if (reward.stars <= 0) continue;
    const cap = reward.kind === "help" || reward.kind === "return" ? 3 : reward.kind === "step" ? 8 : 1;
    const count = counts.get(reward.kind) ?? 0;
    if (count >= cap) continue;
    counts.set(reward.kind, count + 1);
    accepted.push(reward);
  }
  return accepted;
}

function mergeRewards(existing: PendingReward[], extra: PendingReward[]): PendingReward[] {
  return [...existing, ...extra];
}

function nextToken(token: string): string {
  const value = Number(token.replace(/\D/g, "")) || 0;
  return `q${value + 1}`;
}

function beginWorking(state: CoachState, patch: Partial<CoachState>): CoachState {
  if (state.taskStatus === "ready") {
    assertCanTransition("ready", "started", "child");
    assertCanTransition("started", "working", "system");
    return { ...state, ...patch, taskStatus: "working" };
  }
  if (state.taskStatus === "started") {
    return move(state, "working", "child", patch);
  }
  if (state.taskStatus === "working" || state.taskStatus === "needs_help") {
    return move(state, "working", state.taskStatus === "working" ? "system" : "child", patch);
  }
  return move(state, "working", "child", patch);
}

function move(
  state: CoachState,
  to: TaskStatus,
  by: TransitionActor,
  patch: Partial<CoachState>,
): CoachState {
  assertCanTransition(state.taskStatus, to, by);
  return { ...state, ...patch, taskStatus: to };
}

function speak(state: CoachState, say: string | null, partial: Partial<CoachEffect>, patch: Partial<CoachState> = {}): ReduceResult {
  const utteranceSeq = say ? state.utteranceSeq + 1 : state.utteranceSeq;
  const utteranceId = say ? `u${utteranceSeq}` : state.utteranceId;
  const next: CoachState = {
    ...state,
    ...patch,
    utteranceSeq,
    utteranceId,
    lastSay: say ?? state.lastSay,
  };
  return { state: next, effect: effectFrom(next, { ...partial, say, utteranceId }) };
}

function silent(state: CoachState): ReduceResult {
  return {
    state,
    effect: effectFrom(state, {
      say: null,
      ...currentPresentation(state),
    }),
  };
}

function currentPresentation(state: CoachState): Partial<CoachEffect> {
  return presentationFor(state.phase, state);
}

function presentationFor(phase: CoachPhase, state: CoachState): Partial<CoachEffect> {
  if (state.playSilence && phase === "quiet_work") {
    return {
      buttons: [{ id: "help", label: "I need my parent", intent: "help" }],
      listen: false,
      dim: true,
      elephant: "rest",
    };
  }
  switch (phase) {
    case "intro":
    case "refusal_smaller":
      return { buttons: phase === "refusal_smaller" ? SMALLER_BUTTONS : READY_BUTTONS, listen: true, elephant: "talk" };
    case "refusal_parent":
      return { buttons: PARENT_HELP_BUTTONS, listen: true, showParentGate: true, elephant: "wait" };
    case "prepare":
    case "step":
      return { buttons: WORK_BUTTONS, listen: true, elephant: "talk" };
    case "quiet_work":
      return { buttons: QUIET_BUTTONS, listen: true, dim: true, elephant: "rest" };
    case "check_help":
      return { buttons: QUIET_BUTTONS, listen: true, showParentGate: true, elephant: "wait" };
    case "on_break":
    case "between_break":
      return { buttons: BREAK_BUTTONS, listen: true, dim: true, elephant: "rest" };
    case "await_parent_approval":
    case "parent_checkpoint":
    case "session_paused_parent":
    case "refusal_stopped":
      return {
        buttons: [],
        listen: false,
        showParentGate: true,
        parentCheckpoint: phase === "parent_checkpoint",
        elephant: "wait",
      };
    case "session_goodbye":
      return { buttons: [], listen: false, elephant: "done" };
    default:
      return { buttons: [], listen: false, elephant: "wait" };
  }
}

function effectFrom(state: CoachState, partial: Partial<CoachEffect>): CoachEffect {
  return {
    say: partial.say ?? null,
    buttons: partial.buttons ?? [],
    dim: partial.dim ?? false,
    listen: partial.listen ?? false,
    showParentGate: partial.showParentGate ?? false,
    parentCheckpoint: partial.parentCheckpoint ?? false,
    elephant: partial.elephant ?? "wait",
    advance: partial.advance ?? "stay",
    rewards: partial.rewards ?? [],
    utteranceId: partial.utteranceId ?? state.utteranceId,
  };
}

export function projectCoach(state: CoachState): CoachEffect {
  return effectFrom(state, {
    say: state.lastSay,
    utteranceId: state.utteranceId,
    ...currentPresentation(state),
  });
}

export interface DialogueEngine {
  begin(ctx: CoachContext, from?: TaskStatus): ReduceResult;
  reduce(state: CoachState, event: CoachEvent, ctx: CoachContext): ReduceResult;
}

export const deterministicEngine: DialogueEngine = {
  begin: beginActivity,
  reduce: reduceCoach,
};
