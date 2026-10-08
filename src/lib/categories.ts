export const CATEGORIES = [
  "school",
  "kumon",
  "paattu",
  "art",
  "reading",
  "puzzles",
  "play",
  "organising",
  "custom",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  school: "School studies",
  kumon: "Kumon",
  paattu: "Paattu practice",
  art: "Art and drawing",
  reading: "Reading",
  puzzles: "Puzzles and thinking",
  play: "Free play and outdoor",
  organising: "Organising",
  custom: "Other",
};

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}
