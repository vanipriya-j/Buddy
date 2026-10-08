export const SESSION_GOODBYE =
  "Our screen time is finished. You can keep going without Buddy. Bye for now.";

export const CHECKIN_CHILD = "Let's pause so your parent can check in.";

export const UNKNOWN_INTENT = "You can press a big button.";

export const PARENT_WAIT = "I'll wait for your parent.";

export const REFUSAL_LINES = [
  "That's okay. We can try one tiny step, or we can leave it.",
  "We can ask your parent to sit with you. We won't keep pushing.",
  "Okay. I'll stop asking. Your parent can decide what we do next.",
] as const;

export const RETURN_LINE = "Welcome back. We'll continue from here.";

export const BREAK_LINE = "A break is okay. Rest, then come back when you want.";

export const SCHEDULED_BREAK_LINE = "Let's take a short break before the next thing.";

export const SKIP_LINE = "We'll leave this one for another time.";

export const OFFER_AGAIN_LINE = "Your parent is here. We can try one small step whenever you want.";

export const STILL_WORKING_LINE = "Okay. I'll wait.";

export const PLAY_HELP_LINE = "Let's find your parent.";

export function activityCompleteLine(partial: boolean): string {
  if (partial) return "We did some of it. That can be enough.";
  return "That's the end of this activity.";
}
