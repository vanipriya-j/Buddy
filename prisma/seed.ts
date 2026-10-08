import { randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import { hashPin } from "../src/lib/auth";
import { prisma } from "../src/lib/db";

const DEMO_PIN = "2468";

async function wipe() {
  await prisma.sessionEvent.deleteMany();
  await prisma.reward.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.session.deleteMany();
  await prisma.material.deleteMany();
  await prisma.dailyInstance.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.weeklyTemplate.deleteMany();
  await prisma.child.deleteMany();
  await prisma.parent.deleteMany();
}

function wavTone(): Buffer {
  const sampleRate = 8000;
  const samples = sampleRate;
  const data = Buffer.alloc(samples);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.sin((Math.PI * index) / samples);
    data[index] = 128 + Math.round(Math.sin((2 * Math.PI * 392 * index) / sampleRate) * envelope * 24);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, data]);
}

interface ActivitySeed {
  title: string;
  category: string;
  sequence: number;
  scheduledTime: string;
  estimatedMinutes: number;
  daily?: boolean;
  days?: number[];
  priority: string;
  stepCount: number;
  breakAfter?: boolean;
  rewardNote: string;
  completionCriteria: string;
  learningNotes: string;
  instructions: string;
  config: Record<string, unknown>;
}

const schoolWeek: ActivitySeed[] = [
  {
    title: "School studies",
    category: "school",
    sequence: 1,
    scheduledTime: "16:00",
    estimatedMinutes: 15,
    days: [1, 2, 3, 4, 5],
    priority: "high",
    stepCount: 3,
    breakAfter: true,
    rewardNote: "A story together at bedtime",
    completionCriteria: "The agreed section, or a smaller part if energy is low.",
    learningNotes: "Maths book, page 12. Buddy must not supply answers.",
    instructions: "Open the maths book at page 12.",
    config: { subject: "Maths", assignment: "Page 12, the first five sums" },
  },
  {
    title: "Kumon",
    category: "kumon",
    sequence: 2,
    scheduledTime: "16:20",
    estimatedMinutes: 15,
    days: [1, 3, 5],
    priority: "high",
    stepCount: 3,
    breakAfter: true,
    rewardNote: "Choose the bedtime story",
    completionCriteria: "The assigned worksheets, or the first section if that is enough.",
    learningNotes: "Two addition worksheets. The instructor checks them.",
    instructions: "The worksheets are on the desk.",
    config: { worksheetCount: 2, exercise: "addition" },
  },
  {
    title: "Paattu practice",
    category: "paattu",
    sequence: 3,
    scheduledTime: "16:20",
    estimatedMinutes: 10,
    days: [2, 4, 6],
    priority: "normal",
    stepCount: 3,
    rewardNote: "Sing it once more with a parent if you want",
    completionCriteria: "Practise the assigned section. Tuning is not scored.",
    learningNotes: "Song and raga are set by the parent. No pitch assessment.",
    instructions: "Sit comfortably and sing the first line.",
    config: {
      songName: "Sri Gananatha",
      raga: "Malahari",
      practiceInstructions: "Sing the first line slowly.",
      assignedSection: "the first line",
    },
  },
  {
    title: "Reading",
    category: "reading",
    sequence: 4,
    scheduledTime: "17:00",
    estimatedMinutes: 10,
    daily: true,
    priority: "normal",
    stepCount: 3,
    rewardNote: "Keep the book out for later",
    completionCriteria: "Read the chosen pages, together or alone.",
    learningNotes: "Hints are parent-written. Buddy does not guess words.",
    instructions: "The book is on the shelf.",
    config: {
      book: "Today's book",
      pages: "the next few pages",
      wordHints: [{ word: "curious", hint: "It starts with the sound k." }],
    },
  },
  {
    title: "Free play",
    category: "play",
    sequence: 5,
    scheduledTime: "17:15",
    estimatedMinutes: 20,
    daily: true,
    priority: "normal",
    stepCount: 1,
    rewardNote: "The play itself",
    completionCriteria: "Time spent playing. There is nothing to finish on the screen.",
    learningNotes: "Outdoor play when the weather is kind.",
    instructions: "Go play. Buddy stays quiet.",
    config: { place: "either" },
  },
  {
    title: "Art",
    category: "art",
    sequence: 6,
    scheduledTime: "16:45",
    estimatedMinutes: 15,
    days: [1, 3],
    priority: "low",
    stepCount: 3,
    rewardNote: "Put the drawing on the fridge if you want",
    completionCriteria: "Make something, or stop when you have had enough.",
    learningNotes: "The prompt is optional.",
    instructions: "Paper and colours are in the drawer.",
    config: { prompt: "Draw your favourite animal" },
  },
  {
    title: "Puzzles",
    category: "puzzles",
    sequence: 7,
    scheduledTime: "10:00",
    estimatedMinutes: 15,
    days: [6],
    priority: "normal",
    stepCount: 3,
    rewardNote: "Talk about one idea you tried",
    completionCriteria: "Spend a little time on one puzzle. Solving it is optional.",
    learningNotes: "A jigsaw or a thinking page.",
    instructions: "The puzzle is on the table.",
    config: { puzzle: "one jigsaw or thinking page" },
  },
  {
    title: "Organising toys",
    category: "organising",
    sequence: 8,
    scheduledTime: "11:00",
    estimatedMinutes: 10,
    days: [0],
    priority: "low",
    stepCount: 3,
    rewardNote: "Then go play",
    completionCriteria: "One small spot looks a bit better.",
    learningNotes: "Only one area.",
    instructions: "Start with the toy shelf.",
    config: { area: "the toy shelf" },
  },
];

async function writeDemoFiles() {
  const dir = path.join(process.cwd(), "data", "uploads");
  await fs.mkdir(dir, { recursive: true });
  const audioKey = randomBytes(16).toString("hex");
  const lyricsKey = randomBytes(16).toString("hex");
  const worksheetKey = randomBytes(16).toString("hex");
  await fs.writeFile(path.join(dir, audioKey), wavTone());
  await fs.writeFile(path.join(dir, lyricsKey), "Sri Gananatha — practise the first line slowly.\n");
  await fs.writeFile(path.join(dir, worksheetKey), "Kumon note: two addition worksheets. The instructor checks the answers.\n");
  return { audioKey, lyricsKey, worksheetKey };
}

export async function seedDatabase() {
  await wipe();
  const pinHash = await hashPin(DEMO_PIN);
  const parent = await prisma.parent.create({
    data: { name: "Aaroh's parent", pinHash, child: { create: { name: "Aaroh" } } },
  });
  const school = await prisma.weeklyTemplate.create({
    data: {
      parentId: parent.id,
      name: "School week",
      description: "Studies, music, reading, and play across the week.",
    },
  });
  const weekend = await prisma.weeklyTemplate.create({
    data: {
      parentId: parent.id,
      name: "Light weekend",
      description: "Play, reading, puzzles, and a little tidying.",
    },
  });
  const files = await writeDemoFiles();
  for (const item of schoolWeek) {
    await createActivity(parent.id, null, true, item);
    await createActivity(parent.id, school.id, false, item);
  }
  for (const item of schoolWeek.filter((entry) => ["Free play", "Reading", "Puzzles", "Organising toys", "Art"].includes(entry.title))) {
    await createActivity(parent.id, weekend.id, false, item);
  }
  const paattu = await prisma.activity.findFirst({ where: { parentId: parent.id, isLive: true, title: "Paattu practice" } });
  const kumon = await prisma.activity.findFirst({ where: { parentId: parent.id, isLive: true, title: "Kumon" } });
  if (paattu) {
    await prisma.material.create({
      data: { activityId: paattu.id, filename: "reference-tone.wav", mimeType: "audio/wav", kind: "audio", storageKey: files.audioKey },
    });
    await prisma.material.create({
      data: { activityId: paattu.id, filename: "first-line.txt", mimeType: "text/plain", kind: "lyrics", storageKey: files.lyricsKey },
    });
  }
  if (kumon) {
    await prisma.material.create({
      data: { activityId: kumon.id, filename: "kumon-note.txt", mimeType: "text/plain", kind: "worksheet", storageKey: files.worksheetKey },
    });
  }
}

async function createActivity(parentId: string, templateId: string | null, isLive: boolean, item: ActivitySeed) {
  return prisma.activity.create({
    data: {
      parentId,
      templateId,
      isLive,
      active: true,
      title: item.title,
      instructions: item.instructions,
      category: item.category,
      sequence: item.sequence,
      scheduledTime: item.scheduledTime,
      estimatedMinutes: item.estimatedMinutes,
      daily: Boolean(item.daily),
      recurrenceDays: JSON.stringify(item.daily ? [] : item.days ?? []),
      priority: item.priority,
      stepCount: item.stepCount,
      breakAfter: Boolean(item.breakAfter),
      breakMinutes: 5,
      rewardStars: 1,
      rewardNote: item.rewardNote,
      completionCriteria: item.completionCriteria,
      learningNotes: item.learningNotes,
      configJson: JSON.stringify(item.config),
    },
  });
}

if (process.argv[1]?.includes("seed.ts")) {
  seedDatabase()
    .then(async () => {
      await prisma.$disconnect();
      console.log(`Seeded Buddy. Parent PIN: ${DEMO_PIN}`);
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
