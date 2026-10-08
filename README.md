# Buddy

Buddy is a parent-supervised, voice-first routine coach for Aaroh. It helps her start activities, move through small steps, take breaks, and hand completion back to a parent.

The parent decides what happens. Buddy explains how to begin, waits while she works, and stops pushing if she does not want to continue. It is not a chatbot, a game, or a measure of ability.

## Run it

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Open http://localhost:3000 and sign in with PIN `2468`. Change that PIN from the parent screen after you sign in.

The database is SQLite at `data/buddy.db`. Uploaded worksheets, lyrics, and reference audio live in `data/uploads`.

## A session

1. On Today, adjust minutes, order, or skip anything that does not fit the day.
2. Confirm you are present, enter your PIN, and start a session. You can choose buttons only.
3. Buddy speaks one step at a time. Aaroh can hold the talk button or press a large button. The microphone is never left on.
4. Buddy waits quietly during the work. It does not invent school or Kumon answers, judge a drawing, or score pitch.
5. You confirm completion, a partial finish, or a skip. Buddy will not mark an activity complete on its own.
6. Between activities, Buddy waits for you. A timer also pauses the session for a check-in. That timer is not a presence sensor.
7. The session ends at the screen limit, or when Stop is pressed. Aaroh can keep doing the real activity with the screen off. She cannot start another session.

Pause and Stop are always on the child screen and do not need the PIN, so the screen can be put down immediately. Approving work, changing the reward, or returning to the parent screen needs the PIN.

## What the parent configures

Each activity has a title, instructions, category, time or order, duration, weekdays, priority, step count, an optional break, a real-world reward, completion criteria, and notes. Files can be worksheets, images, lyrics, or reference audio.

Categories: school studies, Kumon, Paattu practice, art, reading, puzzles, free play, organising, and a custom activity.

Weekly templates can be saved from the current schedule and applied later. Applying a template replaces the standing plan. It keeps history.

Lighten today drops low-priority items that have not started and shortens normal ones. Restore puts those automatic changes back. A skip you chose yourself stays skipped.

## Safety choices in this version

- Parent PIN, stored with scrypt. The session cookie is httpOnly and signed.
- Child mode cannot open the parent screen, edit activities, or start a session.
- An ended session cannot be resumed. A parent starts a new one.
- The server accepts a small set of intents (`ready`, `help`, `break`, `done`, `refusal`). It rejects a transcript field.
- Speech audio and the words Aaroh says are not written to the database.
- Stars are only added, and only after you confirm them. There are no lost stars, streaks, leaderboards, or rewards for talking about feelings.
- Rewards point at real-world time together, not more screen time.
- Progress is a count of what was planned and what happened. It does not diagnose, label, or infer emotion.

### Browser speech

Buddy uses the Web Speech API in the browser.

In Chromium, speech recognition may send audio to the browser vendor's speech service. Buddy does not receive or store that audio. Speech synthesis is typically on the device. If you do not want that third-party processing, start the session with buttons only.

Tamil and Tanglish can be added later through the intent list in `src/lib/speech/intent.ts` and a `ta-IN` voice. The conversation engine itself is deterministic and replaceable. See `deterministicEngine` in `src/lib/dialogue/reduce.ts`.

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

The tests cover PIN checks, recurrence, state transitions, refusal, parent approval, the microphone staying off until a press, time limits, check-ins, and child-mode access.

## Layout

- `src/lib/dialogue` — deterministic coach
- `src/lib/speech` — push-to-talk adapter
- `src/lib/services` — schedule, sessions, templates, progress
- `src/app/parent` — schedule and reports
- `src/app/child` — Aaroh's screen
- `prisma` — SQLite schema, migration, and example week
