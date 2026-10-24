import type {
  Attempt,
  Catalog,
  Preferences,
  Rating,
  Review,
  Session,
  State,
  Unit,
} from "./model";
export const uid = () => crypto.randomUUID();
export const day = (date: string | Date = new Date(), zone = "Asia/Seoul") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function activeEvents(events: Attempt[]) {
  const invalid = new Set(
    events.filter((e) => e.kind === "undo").map((e) => e.targetEvent),
  );
  return events.filter((e) => e.kind !== "undo" && !invalid.has(e.id));
}
export function ratings(events: Attempt[]) {
  return activeEvents(events).filter((e) => e.kind === "rating");
}
export function schedule(
  previous: Review | undefined,
  event: Attempt,
  zone = "Asia/Seoul",
): Review | undefined {
  if (event.kind !== "rating" || event.mode !== "review") return previous;
  const today = day(event.createdAt, zone);
  if (previous && today < previous.due) return previous;
  let stage = previous?.stage ?? 0;
  let interval = 1;
  if (!previous || event.rating === "missed" || event.unknown) stage = 0;
  else if (event.rating === "partial" || event.assistance.length)
    stage = Math.max(0, stage - 1);
  else {
    stage = Math.min(4, stage + 1);
    interval = [1, 3, 7, 14, 30][stage];
  }
  return {
    stage,
    due: addDays(today, interval),
    last: event.createdAt,
    schedulerVersion: 1,
  };
}
export function reviews(events: Attempt[], zone = "Asia/Seoul") {
  const out: Record<string, Review> = {};
  for (const e of ratings(events)) {
    const next = schedule(out[e.unitId], e, zone);
    if (next) out[e.unitId] = next;
  }
  return out;
}
export function shuffle<T>(items: T[], seed: number) {
  const out = [...items];
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function spaced(units: Unit[], limit: number) {
  const out: Unit[] = [];
  const rest = [...units];
  const seen = new Set<string>();
  while (rest.length && out.length < limit) {
    const at = rest.findIndex(
      (u) =>
        !seen.has(u.id) && !out.slice(-3).some((v) => v.family === u.family),
    );
    if (at < 0) break;
    const [u] = rest.splice(at, 1);
    out.push(u);
    seen.add(u.id);
  }
  return out;
}
export function makeQueue(
  c: Catalog,
  s: State,
  seed: number,
  now = new Date(),
) {
  const p = s.prefs;
  let eligible = c.units.filter(
    (u) =>
      u.subject === p.subject &&
      p.chapters.includes(u.chapterId) &&
      u.status === "verified" &&
      u.studyEnabled !== false,
  );
  if (p.mode === "review") {
    const events = ratings(s.events),
      r = reviews(s.events, p.timezone),
      today = day(now, p.timezone);
    const touched = new Set(
      activeEvents(s.events)
        .filter((e) => e.kind === "rating" || e.kind === "exposure")
        .map((e) => e.unitId),
    );
    const used = new Set(
      activeEvents(s.events)
        .filter((e) => day(e.createdAt, p.timezone) === today && e.newUnit)
        .map((e) => e.unitId),
    ).size;
    const due = shuffle(
      eligible.filter((u) => r[u.id] && r[u.id].due <= today),
      seed,
    );
    const introduced = shuffle(
      eligible.filter((u) => !r[u.id] && touched.has(u.id)),
      seed + 1,
    );
    const fresh = shuffle(
      eligible.filter((u) => !touched.has(u.id)),
      seed + 2,
    ).slice(0, Math.max(0, p.dailyNew - used));
    eligible = [...due, ...introduced, ...fresh];
  } else eligible = shuffle(eligible, seed);
  return spaced(eligible, p.batch).map((u) => u.id);
}
export const hasSeen = (events: Attempt[], id: string) =>
  activeEvents(events).some((e) => e.unitId === id);
export function newSession(
  queue: string[],
  p: Preferences,
  version: string,
  events: Attempt[],
  seed: number,
): Session {
  return {
    id: uid(),
    queue,
    index: 0,
    seed,
    phase: queue.length
      ? hasSeen(events, queue[0])
        ? "recall"
        : "reading"
      : "ended",
    attemptId: uid(),
    answers: [],
    assistance: [],
    output: p.output,
    mode: p.mode,
    scope: [...p.chapters],
    packVersion: version,
    responseCommittedAt: null,
    revealedAt: null,
    unknown: false,
    scroll: 0,
    zoom: 1,
    focus: null,
    startedAt: new Date().toISOString(),
  };
}
export const normalize = (x: string) => x.normalize("NFC").trim();
export function compare(answers: string[], u: Unit) {
  return (
    u.targets.length > 0 &&
    u.targets.every(
      (t, i) =>
        !!normalize(answers[i] ?? "") &&
        normalize(answers[i] ?? "") === normalize(t.expectedText),
    )
  );
}
export function reveal(s: Session, unknown = false): Session {
  if (s.phase !== "recall") return s;
  const time = new Date().toISOString();
  return {
    ...s,
    phase: "compare",
    unknown,
    responseCommittedAt: time,
    revealedAt: time,
    assistance: unknown
      ? [...new Set([...s.assistance, "reveal"])]
      : s.assistance,
  };
}
export function applyRating(state: State, u: Unit, rating: Rating): State {
  const s = state.session;
  if (!s || s.phase !== "compare") return state;
  const existing = state.events.some((e) => e.id === s.attemptId);
  const pending = existing && s.pendingEventId === s.attemptId;
  if (existing && !pending) return state;
  const old = state.events.find((e) => e.id === s.attemptId);
  const event: Attempt = {
    ...(s.imageRegion
      ? { imageRegion: [...s.imageRegion] as typeof s.imageRegion }
      : {}),
    id: s.attemptId,
    kind: "rating",
    sessionId: s.id,
    unitId: u.id,
    promptRevision: u.revision,
    packVersion: s.packVersion,
    mode: s.mode,
    output: s.output,
    rating,
    assistance: [...s.assistance],
    answers: [...s.answers],
    literalMatch: s.output === "typed" ? compare(s.answers, u) : null,
    createdAt: old?.createdAt ?? new Date().toISOString(),
    responseCommittedAt: s.responseCommittedAt,
    revealedAt: s.revealedAt,
    unknown: s.unknown,
    newUnit: !hasSeen(state.events, u.id),
  };
  const events = [...state.events.filter((e) => e.id !== event.id), event];
  const index = s.index + 1;
  const next: Session = {
    ...s,
    index,
    phase:
      index >= s.queue.length
        ? "ended"
        : hasSeen(events, s.queue[index])
          ? "recall"
          : "reading",
    attemptId: uid(),
    answers: [],
    assistance: [],
    responseCommittedAt: null,
    revealedAt: null,
    unknown: false,
    scroll: 0,
    zoom: 1,
    focus: null,
    pendingEventId: undefined,
    imageRegion: undefined,
    lastUndo: {
      eventId: event.id,
      session: { ...s, lastUndo: undefined, pendingEventId: undefined },
    },
  };
  return { ...state, events, session: next };
}
export function undo(state: State) {
  const previous = state.session?.lastUndo;
  if (!previous) return state;
  const event = state.events.find((e) => e.id === previous.eventId);
  if (!event) return state;
  return {
    ...state,
    events: [
      ...state.events,
      {
        ...event,
        id: uid(),
        kind: "undo" as const,
        targetEvent: event.id,
        createdAt: new Date().toISOString(),
      },
    ],
    session: { ...previous.session, attemptId: uid(), lastUndo: undefined },
  };
}
export function summary(events: Attempt[]) {
  const e = ratings(events);
  return {
    units: new Set(e.map((x) => x.unitId)).size,
    attempts: e.length,
    independent: e.filter(
      (x) => x.rating === "full" && !x.assistance.length && !x.unknown,
    ).length,
    literal: e.filter((x) => x.literalMatch === true).length,
    exposures: activeEvents(events).filter((x) => x.kind === "exposure").length,
  };
}
export function validBackup(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const s = value as State;
  const regionOK = (box: unknown) =>
    box === undefined ||
    (Array.isArray(box) &&
      box.length === 4 &&
      box.every(
        (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
      ) &&
      box[0] < box[2] &&
      box[1] < box[3]);
  if (
    !s.prefs ||
    !s.installed ||
    typeof s.installed !== "object" ||
    Array.isArray(s.installed) ||
    !Object.values(s.installed).every((v) => typeof v === "string") ||
    typeof s.prefs.motion !== "boolean"
  )
    return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: s.prefs.timezone });
  } catch {
    return false;
  }
  if (s.session) {
    const q = s.session;
    if (
      !regionOK(q.imageRegion) ||
      typeof q.id !== "string" ||
      !Array.isArray(q.queue) ||
      !q.queue.every((id) => typeof id === "string") ||
      !Number.isInteger(q.index) ||
      q.index < 0 ||
      q.index > q.queue.length ||
      !["reading", "recall", "compare", "ended"].includes(q.phase) ||
      !Array.isArray(q.answers) ||
      !q.answers.every((x) => typeof x === "string") ||
      !Array.isArray(q.assistance) ||
      !q.assistance.every((x) => typeof x === "string") ||
      !["quick", "typed"].includes(q.output) ||
      !["random", "review"].includes(q.mode) ||
      typeof q.attemptId !== "string"
    )
      return false;
  }
  return (
    s.schemaVersion === 1 &&
    Number.isInteger(s.revision) &&
    !!s.prefs &&
    ["social", "science"].includes(s.prefs.subject) &&
    Array.isArray(s.prefs.chapters) &&
    s.prefs.chapters.every((x) => typeof x === "string") &&
    ["random", "review"].includes(s.prefs.mode) &&
    ["quick", "typed"].includes(s.prefs.output) &&
    [5, 10, 20].includes(s.prefs.batch) &&
    Number.isFinite(s.prefs.font) &&
    s.prefs.font >= 18 &&
    s.prefs.font <= 28 &&
    Number.isInteger(s.prefs.dailyNew) &&
    s.prefs.dailyNew >= 0 &&
    s.prefs.dailyNew <= 100 &&
    ["light", "dark", "system"].includes(s.prefs.theme) &&
    typeof s.prefs.timezone === "string" &&
    Array.isArray(s.events) &&
    s.events.every(
      (e) =>
        !!e &&
        regionOK(e.imageRegion) &&
        typeof e.id === "string" &&
        typeof e.unitId === "string" &&
        typeof e.sessionId === "string" &&
        ["rating", "undo", "exposure"].includes(e.kind) &&
        ["random", "review"].includes(e.mode) &&
        ["quick", "typed"].includes(e.output) &&
        Array.isArray(e.assistance) &&
        e.assistance.every((x) => typeof x === "string") &&
        Array.isArray(e.answers) &&
        e.answers.every((x) => typeof x === "string") &&
        Number.isFinite(Date.parse(e.createdAt)) &&
        (e.kind !== "rating" ||
          ["missed", "partial", "full"].includes(e.rating!)),
    ) &&
    new Set(s.events.map((e) => e.id)).size === s.events.length
  );
}
export function mergeBackup(current: State, incoming: State) {
  if (!validBackup(incoming)) throw Error("지원하지 않거나 손상된 백업입니다.");
  const map = new Map(current.events.map((e) => [e.id, e]));
  for (const e of incoming.events) {
    const old = map.get(e.id);
    if (old && JSON.stringify(old) !== JSON.stringify(e))
      throw Error("같은 기록 ID의 내용이 달라 가져오기를 중단했습니다.");
    map.set(e.id, e);
  }
  return {
    ...current,
    prefs: incoming.prefs,
    events: [...map.values()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    ),
    session: current.session,
    installed: current.installed,
  };
}

/** One-time scope upgrade; later explicit deselections, including none, persist. */
export function upgradeScope(state: State, catalog: Catalog): State {
  if (state.prefs.scopeVersion === 2) return state;
  return {
    ...state,
    prefs: {
      ...state.prefs,
      scopeVersion: 2,
      chapters: catalog.chapters.map((chapter) => chapter.id),
    },
  };
}

/** Preserve past attempts while replacing unplayed scan cards with linked native passages. */
export function upgradeStudySession(state: State, catalog: Catalog): State {
  const session = state.session;
  if (!session || session.phase === "ended") return state;
  const units = new Map(catalog.units.map((unit) => [unit.id, unit]));
  const remaining = session.queue.slice(session.index);
  if (!remaining.some((id) => units.get(id)?.studyEnabled === false))
    return state;
  const prefix = session.queue.slice(0, session.index);
  const used = new Set([
    ...prefix,
    ...remaining.filter((id) => units.get(id)?.studyEnabled !== false),
  ]);
  const next: string[] = [];
  for (const id of remaining) {
    const unit = units.get(id);
    if (unit?.studyEnabled !== false) {
      next.push(id);
      continue;
    }
    const page = catalog.pages.find(
      (page) => page.documentId === unit.subject && page.pdfPage === unit.page,
    );
    const replacement = page?.relatedUnitIds?.find(
      (id) => units.get(id)?.studyEnabled !== false && !used.has(id),
    );
    if (replacement) {
      next.push(replacement);
      used.add(replacement);
    }
  }
  const changedCurrent = next[0] !== remaining[0];
  return {
    ...state,
    session: {
      ...session,
      queue: [...prefix, ...next],
      packVersion: catalog.version,
      ...(changedCurrent
        ? {
            phase: next.length ? "reading" : "ended",
            answers: [],
            assistance: [],
            imageRegion: undefined,
            attemptId: uid(),
            pendingEventId: undefined,
            unknown: false,
            responseCommittedAt: null,
            revealedAt: null,
            scroll: 0,
          }
        : {}),
    },
  };
}
