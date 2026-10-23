export type Subject = "social" | "science";
export type Rating = "missed" | "partial" | "full";
export type Mode = "random" | "review";
export type Output = "quick" | "typed";
export type Box = [number, number, number, number];
export interface Page {
  id: string;
  documentId: Subject;
  pdfPage: number;
  printedPage: string | null;
  image: string;
  thumbnail: string;
  width: number;
  height: number;
  chapterId: string;
  classification: "concept" | "exercise" | "reference" | "uncertain";
  status: string;
  rotation: number;
  unitIds?: string[];
  relatedUnitIds?: string[];
  duplicateOf?: string;
}
export interface Target {
  id: string;
  expectedText: string;
  blockId: string;
  startUtf16: number;
  endUtf16: number;
  box?: Box;
  boxes?: Box[];
}
export interface Block {
  id: string;
  type: "text" | "table" | "diagram" | "image" | "chart";
  text: string;
  headers?: string[];
  rows?: string[][];
  nodes?: string[];
  image?: string;
  bbox?: Box;
  caption?: string;
  chartUnit?: string;
  chartYear?: string;
}
export interface Unit {
  id: string;
  revision: number;
  subject: Subject;
  chapterId: string;
  family: string;
  title: string;
  type: string;
  page: number;
  printedPage: string | null;
  sourceBox: Box;
  blocks: Block[];
  targets: Target[];
  status: "verified";
  origin: "pdf" | "official";
  sourceRole?:
    "concept" | "exam-concept" | "reference" | "exam-source" | "source-page";
  sourceUrl?: string;
  sourceLabel?: string;
  verifiedAt: string;
}
export interface Chapter {
  id: string;
  subject: Subject;
  title: string;
  parent: string;
  pages: number[];
}
export interface Asset {
  url: string;
  bytes: number;
  sha256: string;
}
export interface Pack {
  id: string;
  version: string;
  title: string;
  chapterId: string;
  bytes: number;
  assets: Asset[];
  units: string[];
}
export interface Catalog {
  schemaVersion: 1;
  version: string;
  documents: {
    id: Subject;
    file: string;
    sha256: string;
    bytes: number;
    pages: number;
    edition: string;
  }[];
  chapters: Chapter[];
  pages: Page[];
  units: Unit[];
  packs: Pack[];
  audit: { verifiedUnits: number; pendingPages: number; notes: string[] };
}
export interface Preferences {
  subject: Subject;
  chapters: string[];
  mode: Mode;
  output: Output;
  batch: 5 | 10 | 20;
  font: number;
  theme: "light" | "dark" | "system";
  motion: boolean;
  timezone: string;
  dailyNew: number;
}
export interface Attempt {
  imageRegion?: Box;
  id: string;
  kind: "rating" | "undo" | "exposure";
  sessionId: string;
  unitId: string;
  promptRevision: number;
  packVersion: string;
  mode: Mode;
  output: Output;
  rating: Rating | null;
  assistance: string[];
  answers: string[];
  literalMatch: boolean | null;
  createdAt: string;
  responseCommittedAt: string | null;
  revealedAt: string | null;
  targetEvent?: string;
  unknown?: boolean;
  newUnit?: boolean;
}
export interface Session {
  imageRegion?: Box;
  id: string;
  queue: string[];
  index: number;
  seed: number;
  phase: "reading" | "recall" | "compare" | "ended";
  attemptId: string;
  answers: string[];
  assistance: string[];
  output: Output;
  mode: Mode;
  scope: string[];
  packVersion: string;
  responseCommittedAt: string | null;
  revealedAt: string | null;
  unknown: boolean;
  scroll: number;
  zoom: number;
  focus: string | null;
  startedAt: string;
  lastUndo?: { eventId: string; session: Session };
  pendingEventId?: string;
}
export interface Review {
  stage: number;
  due: string;
  last: string;
  schedulerVersion: 1;
}
export interface State {
  schemaVersion: 1;
  revision: number;
  prefs: Preferences;
  events: Attempt[];
  session: Session | null;
  installed: Record<string, string>;
  updatedAt: string;
}
export const defaults: Preferences = {
  subject: "social",
  chapters: [],
  mode: "random",
  output: "quick",
  batch: 10,
  font: 20,
  theme: "light",
  motion: true,
  timezone: "Asia/Seoul",
  dailyNew: 5,
};
export const emptyState = (): State => ({
  schemaVersion: 1,
  revision: 0,
  prefs: { ...defaults },
  events: [],
  session: null,
  installed: {},
  updatedAt: new Date().toISOString(),
});
