import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activeEvents,
  addDays,
  applyRating,
  compare,
  day,
  makeQueue,
  mergeBackup,
  newSession,
  ratings,
  reveal,
  reviews,
  schedule,
  shuffle,
  spaced,
  summary,
  undo,
  validBackup,
} from "../src/domain.ts";
import { emptyState } from "../src/model.ts";
import type { Attempt, Catalog, Unit } from "../src/model.ts";
const catalog = JSON.parse(
  readFileSync("public/content/catalog.json", "utf8"),
) as Catalog;
const event = (over: Partial<Attempt> = {}): Attempt => ({
  id: crypto.randomUUID(),
  kind: "rating",
  sessionId: "test",
  unitId: "s01-u001",
  promptRevision: 1,
  packVersion: catalog.version,
  mode: "review",
  output: "quick",
  rating: "full",
  assistance: [],
  answers: [],
  literalMatch: null,
  createdAt: "2026-10-22T03:00:00Z",
  responseCommittedAt: "2026-10-22T02:59:59Z",
  revealedAt: "2026-10-22T02:59:59Z",
  ...over,
});
test("scope and unique units stay within one subject and selected chapters", () => {
  const s = emptyState();
  s.prefs.chapters = ["s01", "s04", "c01"];
  const ids = makeQueue(catalog, s, 42);
  assert(ids.length > 0);
  assert.equal(ids.length, new Set(ids).size);
  assert(
    ids.every((id) => {
      const u = catalog.units.find((u) => u.id === id)!;
      return u.subject === "social" && ["s01", "s04"].includes(u.chapterId);
    }),
  );
  assert.deepEqual(ids, makeQueue(catalog, s, 42));
});
test("family spacing holds; scarce families end rather than repeat", () => {
  const units = Array.from(
    { length: 40 },
    (_, i) => ({ id: "u" + i, family: "f" + (i % 5) }) as Unit,
  );
  const q = spaced(shuffle(units, 42), 40);
  for (let i = 0; i < q.length; i++)
    assert(
      !q.slice(Math.max(0, i - 3), i).some((u) => u.family === q[i].family),
    );
  assert.equal(
    spaced(
      units.filter((u) => u.family === "f1"),
      10,
    ).length,
    1,
  );
});
test("transparent scheduler: first next day, first due full three days, caps 30 days", () => {
  const first = schedule(undefined, event())!;
  assert.equal(first.stage, 0);
  assert.equal(first.due, "2026-10-23");
  const second = schedule(first, event({ createdAt: "2026-10-23T03:00:00Z" }))!;
  assert.equal(second.stage, 1);
  assert.equal(second.due, "2026-10-26");
  const cap = schedule(
    { stage: 4, due: "2026-10-22", last: "", schedulerVersion: 1 },
    event(),
  )!;
  assert.equal(cap.stage, 4);
  assert.equal(cap.due, "2026-11-21");
});
test("missed resets; partial/help lower stage and always tomorrow", () => {
  const old = {
    stage: 3,
    due: "2026-10-22",
    last: "",
    schedulerVersion: 1,
  } as const;
  for (const rating of ["missed", "partial"] as const) {
    const next = schedule(old, event({ rating }))!;
    assert.equal(next.stage, rating === "missed" ? 0 : 2);
    assert.equal(next.due, "2026-10-23");
  }
  const help = schedule(old, event({ assistance: ["hint"] }))!;
  assert.equal(help.stage, 2);
  assert.equal(help.due, "2026-10-23");
});
test("random, exposure and practice before due do not move official schedule", () => {
  const old = {
    stage: 2,
    due: "2026-10-25",
    last: "2026-10-18",
    schedulerVersion: 1,
  } as const;
  assert.deepEqual(schedule(old, event()), old);
  assert.deepEqual(
    schedule(old, event({ mode: "random", rating: "missed" })),
    old,
  );
  assert.deepEqual(schedule(old, event({ kind: "exposure" })), old);
});
test("Seoul midnight, month, year and leap boundaries", () => {
  assert.equal(day("2026-10-22T14:59:59Z"), "2026-10-22");
  assert.equal(day("2026-10-22T15:00:00Z"), "2026-10-23");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("new-unit limit is shared across both subjects, no missed-day accumulation", () => {
  const s = emptyState();
  s.prefs.mode = "review";
  s.prefs.chapters = ["s01", "s02", "s04"];
  s.prefs.dailyNew = 5;
  assert(makeQueue(catalog, s, 42, new Date("2026-10-22T03:00Z")).length <= 5);
  s.events = Array.from({ length: 5 }, (_, i) =>
    event({ unitId: "science-other-" + i, newUnit: true }),
  );
  assert.equal(
    makeQueue(catalog, s, 42, new Date("2026-10-22T03:00Z")).length,
    0,
  );
  assert(makeQueue(catalog, s, 42, new Date("2026-10-24T03:00Z")).length <= 5);
});
test("rating is idempotent and undo reconstructs schedule and exact answer snapshot", () => {
  let s = emptyState();
  s.prefs.mode = "review";
  s.session = newSession(
    ["s01-u001", "s01-u002"],
    s.prefs,
    catalog.version,
    [],
    42,
  );
  s.session.phase = "compare";
  s.session.answers = ["입력한 답"];
  const first = applyRating(s, catalog.units[0], "full");
  const duplicate = applyRating(first, catalog.units[0], "full");
  assert.equal(ratings(duplicate.events).length, 1);
  assert.equal(summary(duplicate.events).independent, 1);
  assert.equal(Object.keys(reviews(first.events)).length, 1);
  const reverted = undo(first);
  assert.equal(summary(reverted.events).attempts, 0);
  assert.equal(Object.keys(reviews(reverted.events)).length, 0);
  assert.deepEqual(reverted.session?.answers, ["입력한 답"]);
  assert.equal(reverted.session?.phase, "compare");
  const corrected = applyRating(reverted, catalog.units[0], "partial");
  assert.equal(summary(corrected.events).attempts, 1);
});
test("normal compare reveal does not retroactively mark assistance; unknown does", () => {
  const s = emptyState();
  const session = newSession(["s01-u001"], s.prefs, catalog.version, [], 3);
  session.phase = "recall";
  assert.deepEqual(reveal(session).assistance, []);
  assert(reveal(session, true).assistance.includes("reveal"));
});
test("self-ratings, literal matching, exposures, and helped successes are separate", () => {
  const values = [
    event({ mode: "random" }),
    event({ assistance: ["source"] }),
    event({ kind: "exposure", rating: null }),
    event({ output: "typed", literalMatch: true, rating: "partial" }),
  ];
  const result = summary(values);
  assert.equal(result.independent, 1);
  assert.equal(result.attempts, 3);
  assert.equal(result.literal, 1);
  assert.equal(result.exposures, 1);
});
test("literal matching preserves signs, case, units and is not semantic grading", () => {
  const u = catalog.units.find((u) =>
    u.targets.some((t) => t.expectedText === "kg/m³"),
  )!;
  const correct = u.targets.map((t) => t.expectedText);
  assert(compare(correct, u));
  assert(!compare([], u));
  const incorrect = correct.map((x) => x.replace("kg/m³", "KG/M3"));
  assert(!compare(incorrect, u));
});
test("backup roundtrip and repeat import are idempotent; conflict rejects before write", () => {
  const s = emptyState();
  s.events = [event()];
  assert(validBackup(JSON.parse(JSON.stringify(s))));
  const loaded = mergeBackup(emptyState(), s);
  assert.equal(mergeBackup(loaded, s).events.length, 1);
  const conflict = structuredClone(s);
  conflict.events[0].rating = "missed";
  assert.throws(() => mergeBackup(loaded, conflict));
  assert.equal(loaded.events[0].rating, "full");
  assert(!validBackup({ schemaVersion: 999 }));
  assert(!validBackup({ ...s, prefs: { ...s.prefs, font: 900 } }));
});
test("undo leaves unrelated exposures and backup records untouched", () => {
  const s = emptyState();
  s.session = newSession(["s01-u001"], s.prefs, catalog.version, [], 1);
  s.session.phase = "compare";
  const rated = applyRating(s, catalog.units[0], "missed");
  rated.events.push(
    event({ kind: "exposure", unitId: "unrelated", rating: null }),
  );
  assert(
    activeEvents(undo(rated).events).some((e) => e.unitId === "unrelated"),
  );
});

test("first exposure consumes one new-unit slot; subsequent rating is not new again", () => {
  const s = emptyState();
  s.prefs.mode = "review";
  s.prefs.chapters = ["s01"];
  s.prefs.dailyNew = 1;
  s.events = [event({ kind: "exposure", rating: null, newUnit: true })];
  const queue = makeQueue(catalog, s, 1, new Date("2026-10-22T03:00Z"));
  assert.deepEqual(queue, ["s01-u001"]);
  s.session = newSession(queue, s.prefs, catalog.version, s.events, 1);
  s.session.phase = "compare";
  const next = applyRating(
    s,
    catalog.units.find((u) => u.id === "s01-u001")!,
    "full",
  );
  assert.equal(next.events.find((e) => e.kind === "rating")!.newUnit, false);
});

test("malformed backup events, session, and time zone are rejected without mutation", () => {
  const s = emptyState();
  assert(!validBackup({ ...s, events: [null] }));
  assert(
    !validBackup({ ...s, prefs: { ...s.prefs, timezone: "invalid/zone" } }),
  );
  assert(
    !validBackup({ ...s, session: { id: "broken", queue: [], index: 4 } }),
  );
  assert.deepEqual(s.events, []);
});
