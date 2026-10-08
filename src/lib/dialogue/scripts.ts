import type { Category } from "@/lib/categories";
import { REFUSAL_LINES } from "@/lib/dialogue/copy";

export interface ScriptInput {
  category: Category;
  title: string;
  minutes: number;
  instructions: string;
  childName: string;
  greet: boolean;
  stepCount: number;
  config: Record<string, unknown>;
  hintIndex?: number;
}

export interface Script {
  intro: string;
  prepare: string;
  steps: string[];
  quiet: string;
  help: string;
  smaller: string;
  doneAsk: string;
  category: Category;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function shortInstruction(instructions: string): string | null {
  const trimmed = instructions.trim();
  if (!trimmed) return null;
  const sentence = trimmed.split(/(?<=[.!])\s/)[0] ?? trimmed;
  if (sentence.length <= 140) return sentence;
  return `${sentence.slice(0, 137)}…`;
}

function fitSteps(lines: string[], count: number): string[] {
  const wanted = Math.min(8, Math.max(1, count));
  const clean = lines.map((line) => line.trim()).filter(Boolean);
  const base = clean.length > 0 ? clean : ["Do one small part."];
  if (base.length >= wanted) return base.slice(0, wanted);
  const filled = [...base];
  while (filled.length < wanted) {
    filled.push("Keep going for a little bit. You can stop for a break.");
  }
  return filled;
}

function intro(input: ScriptInput, detail: string): string {
  const time = `About ${input.minutes} minutes. You don't have to finish everything.`;
  if (input.greet) {
    return `Hi ${input.childName}. I'm Buddy. We'll do one thing at a time. ${detail} ${time}`;
  }
  return `Next is ${input.title}. ${detail} ${time}`;
}

export function buildScript(input: ScriptInput): Script {
  const note = shortInstruction(input.instructions);
  const common = {
    category: input.category,
    smaller: "Let's do just the first tiny part. We can stop after that.",
    doneAsk: "Please ask your parent to check.",
    refusal: REFUSAL_LINES,
  };

  switch (input.category) {
    case "school": {
      const subject = text(input.config.subject, "school work");
      const assignment = text(input.config.assignment, "the work your parent set out");
      return {
        ...common,
        intro: intro(input, `Today is ${subject}.`),
        prepare: `Please get the book and pencil for ${subject}.${note ? ` ${note}` : ""}`,
        steps: fitSteps([
          `Find this work: ${assignment}.`,
          "Start with the first small part.",
          "Carry on while I wait.",
        ], input.stepCount),
        quiet: "I'll wait quietly while you work.",
        help: "I can't see your page, so I won't guess an answer. Try the first part, or ask your parent.",
      };
    }
    case "kumon": {
      const count = numberValue(input.config.worksheetCount, 1);
      const exercise = text(input.config.exercise, "today's worksheet");
      return {
        ...common,
        intro: intro(input, `Kumon today is ${count} worksheet${count === 1 ? "" : "s"}.`),
        prepare: "Get your worksheet and pencil, then sit comfortably.",
        steps: fitSteps([
          `This exercise is ${exercise}.`,
          "Try the first section on your own.",
          count > 1 ? "When you are ready, begin the next worksheet." : "Do a little more, then you can pause.",
        ], input.stepCount),
        quiet: "I'll be quiet. Try it in your own time.",
        help: "Have a go at the next box by yourself. I don't give the answers. Your Kumon instructor checks them.",
      };
    }
    case "paattu": {
      const song = text(input.config.songName, input.title);
      const raga = text(input.config.raga);
      const section = text(input.config.assignedSection, "the part your parent chose");
      const practice = text(input.config.practiceInstructions);
      return {
        ...common,
        intro: intro(input, raga ? `${song}, in ${raga}.` : song),
        prepare: practice || "Sit comfortably. You can listen first, then sing.",
        steps: fitSteps([
          `The section for today is ${section}.`,
          "Sing that part once, in your own time.",
          "If you want, sing it once more.",
        ], input.stepCount),
        quiet: "I'll stay quiet while you practise.",
        help: "We can play the reference your parent added. I won't judge the tune.",
      };
    }
    case "art": {
      const prompt = text(input.config.prompt);
      const invitation = prompt
        ? `You could try: ${prompt}. Or make something else.`
        : "Make anything you like.";
      return {
        ...common,
        intro: intro(input, "It's time to make something."),
        prepare: invitation,
        steps: fitSteps([
          "Choose your paper and colours.",
          "Begin with any mark you like.",
          "Keep going while it feels interesting.",
        ], input.stepCount),
        quiet: "I'll wait. There isn't a right picture.",
        help: "Make whatever you like. There isn't a correct result.",
      };
    }
    case "reading": {
      const book = text(input.config.book, "your book");
      const pages = text(input.config.pages);
      const where = pages ? `${book}, ${pages}.` : `${book}.`;
      return {
        ...common,
        intro: intro(input, `Reading: ${where}`),
        prepare: "You can read with your parent, or read by yourself.",
        steps: fitSteps([
          "Open the book at the right place.",
          "Read a small part.",
          "If a word is tricky, you can ask.",
        ], input.stepCount),
        quiet: "I'll wait while you read.",
        help: readingHelp(input.config.wordHints, input.hintIndex ?? 0),
      };
    }
    case "play": {
      const place = text(input.config.place, "either");
      const where = place === "outdoor" ? "outside" : place === "indoor" ? "inside" : "wherever you like";
      return {
        ...common,
        intro: intro(input, `Go and play ${where}. I'll be quiet. The screen doesn't have games.`),
        prepare: "Buddy will stop talking now.",
        steps: ["Go play."],
        quiet: "Buddy is quiet.",
        help: "Let's find your parent.",
      };
    }
    case "puzzles": {
      const puzzle = text(input.config.puzzle, "today's puzzle");
      return {
        ...common,
        intro: intro(input, puzzle),
        prepare: note ?? "Look at the puzzle with your parent nearby.",
        steps: fitSteps([
          "Look at one small part of the puzzle.",
          "Try an idea.",
          "You can leave a piece and come back.",
        ], input.stepCount),
        quiet: "I'll wait while you think.",
        help: "Stay with one small part. If you want a hint, ask your parent. I won't solve it for you.",
      };
    }
    case "organising": {
      const area = text(input.config.area, "one small spot");
      return {
        ...common,
        intro: intro(input, `We'll tidy ${area}.`),
        prepare: "We'll only do a small spot.",
        steps: fitSteps([
          `Choose ${area}.`,
          "Put a few things back.",
          "Stop when that spot looks a bit better. It doesn't need to be perfect.",
        ], input.stepCount),
        quiet: "I'll wait while you put things away.",
        help: "Pick up just one thing and ask your parent where it lives.",
      };
    }
    default: {
      return {
        ...common,
        intro: intro(input, input.title),
        prepare: note ?? "Let's get ready for one small part.",
        steps: fitSteps([
          note ?? "Do the first small part.",
          "Keep going for a little bit.",
        ], input.stepCount),
        quiet: "I'll wait quietly.",
        help: "Try one small part, or ask your parent to sit with you.",
      };
    }
  }
}

function readingHelp(hints: unknown, hintIndex: number): string {
  const fallback = "Point to the tricky word and ask your parent. I won't guess it.";
  if (!Array.isArray(hints) || hints.length === 0 || hintIndex >= hints.length) return fallback;
  const entry = hints[hintIndex];
  if (!entry || typeof entry !== "object") return fallback;
  const word = text((entry as { word?: string }).word);
  const hint = text((entry as { hint?: string }).hint);
  if (!word || !hint) return fallback;
  return `Your parent left a hint for ${word}: ${hint}`;
}

export function collectChildLines(script: Script): string[] {
  return [script.intro, script.prepare, ...script.steps, script.quiet, script.help, script.smaller, script.doneAsk];
}
