import "./style.css";
import type {
  Attempt,
  Block,
  Catalog,
  Pack,
  Rating,
  Session,
  State,
  Subject,
  Unit,
} from "./model";
import {
  applyRating,
  compare,
  day,
  hasSeen,
  makeQueue,
  mergeBackup,
  newSession,
  ratings,
  reveal,
  reviews,
  summary,
  uid,
  undo,
  validBackup,
} from "./domain";
import { channel, openDB, readState, writeState } from "./persistence";
import { installPack, registerWorker, removePack, verifyPack } from "./offline";
import { validateCatalog } from "./data";

const root = document.querySelector<HTMLDivElement>("#app")!;
let catalog: Catalog,
  state: State,
  screen: "home" | "library" | "records" | "settings" | "study" = "home";
let busy = false,
  saveError = "",
  notice = "",
  search = "",
  filter = "all",
  libraryTab = "units",
  modal: HTMLDialogElement | null = null;
let conflict = false,
  draftTimer: ReturnType<typeof setTimeout>,
  registration: ServiceWorkerRegistration | null = null;
const downloads = new Map<string, { progress: number; error?: string }>();
const names = { social: "통합사회", science: "통합과학" };
const icons = {
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a5 5 0 0 0-5-3H4zM13 7a3 3 0 0 1 3-3h5v14h-4a5 5 0 0 0-4 3"/>',
  play: '<path d="m9 5 11 7-11 7z"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  chart: '<path d="M4 3v18h18M9 17v-6M14 17V7M19 17V4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  settings:
    '<circle cx="12" cy="12" r="4"/><path d="m10 2-1 3-3 1-3-1-1 4 2 2v3l-2 2 2 4 3-1 3 1 1 3 4-1 1-3 3-1 3 1 1-4-2-2v-3l2-2-2-4-3 1-3-1-1-3z"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  undo: '<path d="M4 10h10a6 6 0 0 1 0 12M4 10l6-6M4 10l6 6"/>',
  zoom: '<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7M10 6v8M6 10h8"/>',
};
const icon = (name: keyof typeof icons) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const esc = (x: unknown) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const button = (label: string, action: string, cls = "", extra = "") =>
  `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const chapter = (id: string) => catalog.chapters.find((c) => c.id === id);
const unitNow = () =>
  catalog.units.find((u) => u.id === state.session?.queue[state.session.index]);
function applyTheme() {
  const p = state.prefs;
  document.documentElement.dataset.theme = p.theme;
  document.documentElement.style.setProperty("--body-font", p.font + "px");
  document.documentElement.dataset.motion = String(p.motion);
}
function header() {
  return `<header class="app-header"><a class="brand" href="#" data-action="home"><span class="brand-mark">${icon("book")}</span><span>원문 복원기<small>통사 · 통과</small></span></a><div class="header-right"><span class="connection">${navigator.onLine ? "기기 안에 남는 공부" : "오프라인"}</span>${button(icon("settings"), "settings", "icon-button", 'aria-label="설정"')}</div></header>`;
}
function navigation() {
  return `<nav class="main-nav" aria-label="주 메뉴">${[
    ["home", "학습", "book"],
    ["library", "자료", "layers"],
    ["records", "기록", "chart"],
  ]
    .map(([id, label, ico]) =>
      button(
        `${icon(ico as keyof typeof icons)}<span>${label}</span>`,
        id,
        screen === id ? "active" : "",
        screen === id ? 'aria-current="page"' : "",
      ),
    )
    .join("")}</nav>`;
}
function message() {
  return `${saveError ? `<div class="error-banner" role="alert"><strong>아직 저장되지 않았습니다.</strong><p>${esc(saveError)}</p>${button("저장 재시도", "retry-save")}${button("현재 기록 백업", "backup")}</div>` : ""}${conflict ? `<div class="error-banner" role="alert">다른 탭에서 기록이 변경되었습니다. ${button("최신 기록 불러오기", "refresh-state")}</div>` : ""}${notice ? `<div class="notice" role="status">${esc(notice)}${button("×", "dismiss", "icon-button", 'aria-label="알림 닫기"')}</div>` : ""}`;
}
function render() {
  if (!state || !catalog) return;
  applyTheme();
  const horizontal = [
    ...document.querySelectorAll<HTMLElement>(".table-wrapper"),
  ].map((el) => el.scrollLeft);
  const scroll =
    document.querySelector(".reading-area")?.scrollTop ??
    state.session?.scroll ??
    0;
  root.innerHTML =
    screen === "study"
      ? studyHTML()
      : `${header()}<div class="app-layout">${navigation()}<main id="main" class="main-content">${screen === "home" ? homeHTML() : screen === "library" ? libraryHTML() : screen === "records" ? recordsHTML() : settingsHTML()}</main></div>`;
  if (screen === "study") {
    const area = document.querySelector<HTMLElement>(".reading-area");
    if (area) area.scrollTop = scroll;
    prepareClozes();
    document
      .querySelectorAll<HTMLElement>(".table-wrapper")
      .forEach((el, i) => (el.scrollLeft = horizontal[i] ?? 0));
  }
  bindInputs();
  if ((saveError || conflict) && screen === "study") {
    const region = document.createElement("div");
    region.id = "status";
    region.innerHTML = message();
    root.prepend(region);
  }
  preload();
}
function subjectControl() {
  return `<div class="subject-switch" role="group" aria-label="과목">${(["social", "science"] as Subject[]).map((s) => button(`${s === "social" ? "社" : "科"} <span>${names[s]}</span>`, "subject", state.prefs.subject === s ? "selected" : "", `data-value="${s}" aria-pressed="${state.prefs.subject === s}"`)).join("")}</div>`;
}
function homeHTML() {
  const p = state.prefs,
    selected = catalog.chapters.filter(
      (c) => p.chapters.includes(c.id) && c.subject === p.subject,
    ),
    units = catalog.units.filter((u) =>
      selected.some((c) => c.id === u.chapterId),
    ),
    s = state.session,
    canResume = s && s.phase !== "ended";
  const ready = selected.filter(
    (c) => state.installed[c.id] === catalog.version,
  ).length;
  return `${message()}<div class="page-eyebrow">나의 작은 학습실 <span>READ · RECALL · RESTORE</span></div><section class="home-intro"><div><p class="kicker">한 구절씩, 내 기억으로.</p><h1>읽은 문장을<br>꺼낼 수 있는 문장으로.</h1><p class="intro-text">읽고, 가리고, 스스로 복원해 보세요.<br>원문은 언제나 같은 자리에 있습니다.</p></div><div class="paper-art" aria-hidden="true"><div class="paper-back"></div><div class="paper-front"><i></i><i></i><b>기억에서</b><span></span><b>꺼내는 연습</b><i></i><i></i><em>↗</em></div></div></section><section class="start-panel"><div class="section-top"><h2>지금, 이어지는 공부</h2><span class="tiny">로그인 없이 · 기기 내 저장</span></div>${subjectControl()}<div class="scope-summary"><span class="label">선택한 학습 범위</span><strong>${selected.length ? selected.map((c) => esc(c.title)).join(" · ") : "아직 선택한 소단원이 없습니다"}</strong><span class="tiny">검수 원문 ${units.length}개 ${selected.length ? `· 오프라인 준비 ${ready}/${selected.length}` : ""}</span>${button("범위 선택 " + icon("arrow"), "scope", "text-button")}</div>${button(`${canResume ? "이어서 하기" : "랜덤으로 시작"} ${icon("arrow")}`, canResume ? "resume" : "start", "primary start-button", busy ? "disabled" : "")}${canResume ? `<p class="micro">${esc(names[catalog.units.find((u) => u.id === s.queue[s.index])?.subject ?? p.subject])} · ${s.index + 1}/${s.queue.length} · 입력과 가림 상태가 저장되어 있습니다.</p>` : ""}<div class="session-options"><fieldset><legend>복원 방식</legend><div class="segmented">${button("빠른 복원", "output", p.output === "quick" ? "selected" : "", 'data-value="quick"')}${button("직접 복원", "output", p.output === "typed" ? "selected" : "", 'data-value="typed"')}</div></fieldset><fieldset><legend>출제 방식</legend><select aria-label="출제 방식" id="mode"><option value="random" ${p.mode === "random" ? "selected" : ""}>자유 랜덤</option><option value="review" ${p.mode === "review" ? "selected" : ""}>오늘 복습</option></select></fieldset><fieldset><legend>한 묶음</legend><select aria-label="한 묶음" id="batch">${[5, 10, 20].map((n) => `<option ${p.batch === n ? "selected" : ""} value="${n}">${n}개</option>`).join("")}</select></fieldset></div><p class="micro">${p.mode === "review" ? `기한이 된 원문부터 복습합니다. 새 원문은 두 과목 합쳐 하루 ${p.dailyNew}개까지.` : "선택한 범위 안에서 섞어 출제합니다. 자유 랜덤은 복습 날짜를 바꾸지 않습니다."}</p></section><section class="quiet-footer"><span>${icon("check")} 원문과 출처를 함께</span><span>${icon("download")} 선택한 범위만 오프라인으로</span></section>`;
}
function scopeHTML() {
  return `<div class="dialog-head"><div><p class="kicker">학습할 만큼만</p><h2>범위 선택</h2></div>${button(icon("close"), "close-modal", "icon-button", 'aria-label="닫기"')}</div>${subjectControl()}<p class="muted">소단원을 선택하고 자료를 내려받으세요. 첫 다운로드에는 연결이 필요합니다.</p><div class="chapter-list">${catalog.chapters
    .filter((c) => c.subject === state.prefs.subject)
    .map((c) => {
      const pack = catalog.packs.find((p) => p.id === c.id)!,
        count = pack.units.length;
      return `<label class="chapter-option"><input type="checkbox" data-chapter="${c.id}" ${state.prefs.chapters.includes(c.id) ? "checked" : ""}><span><small>${esc(c.parent)}</small><strong>${esc(c.title)}</strong><small>원문 ${count}개 · ${mb(pack.bytes)} · ${state.installed[c.id] === pack.version ? "오프라인 준비됨" : "다운로드 필요"}</small></span></label>`;
    })
    .join(
      "",
    )}</div>${button("선택한 범위 저장", "scope-done", "primary full")}`;
}
function studyHTML() {
  const s = state.session;
  if (!s) return "";
  if (s.phase === "ended") return endHTML();
  const u = unitNow();
  if (!u)
    return `<main class="empty"><h1>이 자료 버전을 찾을 수 없습니다.</h1><p>기록은 보존되어 있습니다. 자료를 다시 내려받아 주세요.</p>${button("자료로 이동", "library", "primary")}</main>`;
  const phase = {
    reading: "읽기",
    recall: "기억에서 꺼내기",
    compare: "원문 대조",
    ended: "마침",
  }[s.phase];
  const hidden = s.phase === "recall";
  return `<div class="study-shell"><header class="study-header">${button(icon("back"), "leave-study", "icon-button", 'aria-label="학습 홈으로"')}<div><small>${names[u.subject]} · ${esc(chapter(u.chapterId)?.title)}</small><span>${s.index + 1} <b>/ ${s.queue.length}</b></span></div>${button("원본 " + icon("zoom"), "source", "source-button")}</header><div class="progress-track"><div style="width:${(s.index / s.queue.length) * 100}%"></div></div><main class="reading-area" tabindex="-1"><article class="recall-card"><div class="card-meta"><span class="phase-tag">${phase}</span><span>${u.origin === "official" ? "공식 자료 보완" : `PDF ${u.page}쪽${u.printedPage ? ` · 책 ${esc(u.printedPage)}쪽` : ""}`}</span><span>${s.output === "typed" ? "직접 복원" : "빠른 복원"}</span></div><h1>${esc(u.title)}</h1>${s.phase === "reading" ? '<p class="reading-guide">원문을 읽은 뒤, 가리고 기억에서 꺼내 보세요.</p>' : hidden ? '<p class="reading-guide">가려진 구간을 떠올려 보세요.</p>' : '<p class="reading-guide">원래 자리의 원문과 대조하고 스스로 평가하세요.</p>'}<div class="source-content">${u.blocks.map((b) => blockHTML(b, u, hidden)).join("")}</div>${s.output === "typed" ? `<div class="answer-group"><h2>내가 복원한 구절</h2>${u.targets.map((t, i) => `<label class="answer-field"><span><b>${i + 1}</b> 가려진 구간 ${i + 1}</span><input id="answer-${i}" type="text" aria-label="가려진 구간 ${i + 1} 답" data-answer="${i}" value="${esc(s.answers[i] ?? "")}" autocomplete="off" autocorrect="off" spellcheck="false" ${s.phase === "compare" ? "readonly" : ""}>${s.phase === "compare" ? `<small class="match">${(s.answers[i] ?? "").normalize("NFC").trim() === t.expectedText.normalize("NFC").trim() && (s.answers[i] ?? "").trim() ? "원문 표기 일치" : "원문과 표기가 다릅니다"}</small>` : ""}</label>`).join("")}</div>` : ""}${s.assistance.length ? '<p class="assistance-note">원문 도움을 사용한 시도입니다.</p>' : ""}${u.origin === "official" ? `<p class="official-source">공식 자료를 바탕으로 구성한 보완 자료입니다. <a href="${esc(u.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(u.sourceLabel)} ↗</a></p>` : ""}</article></main><footer class="study-footer"><div class="study-tools">${button(icon("undo") + " 되돌리기", "undo", "text-button", s.lastUndo ? "" : "disabled")}${button(s.output === "typed" ? "빠른 복원으로" : "직접 입력으로", "toggle-output", "text-button")}${hidden ? button("원문 일부 보기", "hint", "text-button") : ""}</div><div class="primary-actions">${s.phase === "reading" ? button("읽고 가리기 " + icon("arrow"), "hide", "primary full") : s.phase === "recall" ? `${button("모르겠음", "unknown", "secondary")}${button(s.output === "typed" ? "입력 완료 · 원문 확인" : "원문 확인", "reveal", "primary")}` : `<div class="rating-actions">${button("<span>놓침</span><small>다시 볼게요</small>", "rate", "rating missed", 'data-value="missed"')}${button("<span>일부</span><small>빠진 구절이 있어요</small>", "rate", "rating partial", 'data-value="partial"')}${button("<span>전부</span><small>스스로 떠올렸어요</small>", "rate", "rating full-rating", 'data-value="full"')}</div>`}</div><p class="footer-note">${s.phase === "compare" ? "자기평가입니다. 원문 표기 일치와 따로 기록합니다." : s.phase === "recall" ? "본문을 눌러도 원문은 공개되지 않습니다." : "새 원문은 읽기부터, 복습은 가린 상태부터."}</p></footer></div>`;
}
function clozeText(text: string, b: Block, u: Unit, hidden: boolean) {
  const targets = u.targets.filter((t) => t.blockId === b.id);
  let items: { start: number; end: number; index: number }[] = [];
  for (const t of targets) {
    const i = u.targets.indexOf(t);
    let at = text.indexOf(t.expectedText);
    if (at >= 0)
      items.push({ start: at, end: at + t.expectedText.length, index: i });
  }
  items = items.sort((a, b) => a.start - b.start);
  let offset = 0,
    out = "";
  for (const t of items) {
    if (t.start < offset) continue;
    out += esc(text.slice(offset, t.start));
    const expected = text.slice(t.start, t.end);
    out += `<span class="cloze ${hidden ? "concealed" : "revealed"}" data-target="${t.index}" ${hidden ? `role="img" aria-label="가려진 구간 ${t.index + 1}"` : ""}><span class="cloze-text" ${hidden ? 'aria-hidden="true"' : ""}>${hidden ? "" : esc(expected)}</span><span class="cloze-number" aria-hidden="true">${t.index + 1}</span></span>`;
    offset = t.end;
  }
  return out + esc(text.slice(offset));
}
function blockHTML(b: Block, u: Unit, hidden: boolean) {
  if (b.type === "table")
    return `<div class="table-wrapper" tabindex="0" role="region" aria-label="${esc(u.title)} 표"><table><caption>${esc(b.caption ?? u.title)}</caption><thead><tr>${b.headers!.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows!.map((row) => `<tr>${row.map((cell, i) => `<${i === 0 ? 'th scope="row"' : "td"}>${clozeText(cell, b, u, hidden)}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  if (b.type === "diagram")
    return `<figure class="flow-figure"><ol>${b.nodes!.map((n) => `<li>${clozeText(n, b, u, hidden)}</li>`).join("")}</ol><figcaption>${esc(b.caption ?? "원문 순서")}</figcaption></figure>`;
  if (b.type === "image")
    return `<figure><button class="image-button" data-action="zoom-image"><span class="masked-image"><img src="${esc(b.image)}" alt="${hidden ? "가림이 적용된 교재 시각자료" : esc(b.caption ?? u.title)}" draggable="false">${
      hidden
        ? u.targets
            .filter((t) => t.box)
            .map(
              (t, i) =>
                `<span class="image-mask" role="img" aria-label="가려진 구간 ${i + 1}" style="left:${t.box![0] * 100}%;top:${t.box![1] * 100}%;width:${(t.box![2] - t.box![0]) * 100}%;height:${(t.box![3] - t.box![1]) * 100}%">${i + 1}</span>`,
            )
            .join("")
        : ""
    }</span><span class="image-zoom-label">${icon("zoom")} 확대</span></button><figcaption>${esc(b.caption ?? "교재 원본 영역")}</figcaption></figure>`;
  return `<p class="original-text">${clozeText(b.text, b, u, hidden)}</p>`;
}
const clozeSizes = new Map<
  string,
  { width: number; height: number; font: number }
>();
function prepareClozes() {
  const u = unitNow(),
    s = state.session;
  if (!u || !s) return;
  document.querySelectorAll<HTMLElement>(".cloze").forEach((el) => {
    const index = Number(el.dataset.target),
      t = u.targets[index],
      key = `${u.id}-${index}-${state.prefs.font}-${window.innerWidth}`,
      max = el.closest("td,th,.original-text,li")?.clientWidth ?? 300;
    let size = clozeSizes.get(key);
    if (!size) {
      const m = document.createElement("span");
      m.className = "cloze measure";
      m.style.width =
        Math.min(
          max,
          Math.max(
            state.prefs.font * 6,
            t.expectedText.length * state.prefs.font * 0.92,
          ),
        ) + "px";
      m.textContent = t.expectedText;
      document.body.append(m);
      const rect = m.getBoundingClientRect();
      size = { width: rect.width, height: rect.height, font: state.prefs.font };
      m.remove();
      clozeSizes.set(key, size);
    }
    el.style.width = size.width + "px";
    el.style.minHeight = size.height + "px";
    el.style.height = size.height + "px";
  });
}
function endHTML() {
  const s = state.session!,
    events = state.events.filter((e) => e.sessionId === s.id),
    v = summary(events);
  return `<main class="end-screen"><div class="end-symbol">${icon("check")}</div><p class="kicker">한 묶음을 마쳤습니다</p><h1>꺼내 본 만큼,<br>기억에 남도록.</h1><div class="result-grid"><div><b>${v.units}</b><span>고유 원문</span></div><div><b>${v.attempts}</b><span>복원 시도</span></div><div><b>${v.independent}</b><span>도움 없는 전부</span></div></div><p class="muted">‘전부’는 스스로 평가한 결과입니다.<br>다음 복습에서도 다시 꺼내 보세요.</p>${button("마치기", "finish", "primary full")}${button("더 하기", "more", "secondary full")}${button(icon("undo") + " 마지막 평가 되돌리기", "undo", "text-button", s.lastUndo ? "" : "disabled")}</main>`;
}
function libraryHTML() {
  const p = state.prefs,
    events = ratings(state.events);
  let units = catalog.units.filter(
    (u) =>
      u.subject === p.subject &&
      (!search ||
        `${u.title} ${u.blocks.map((b) => b.text).join(" ")}`.includes(search)),
  );
  if (filter === "new")
    units = units.filter((u) => !hasSeen(state.events, u.id));
  if (filter === "missed")
    units = units.filter((u) =>
      events.some((e) => e.unitId === u.id && e.rating !== "full"),
    );
  return `${message()}<div class="page-eyebrow">나의 교재 <span>LIBRARY</span></div><h1 class="page-title">원문을, 있는 그대로.</h1><p class="muted">검수한 학습 원문과 PDF 전체 페이지를 함께 보관합니다.</p>${subjectControl()}<div class="library-tabs">${button("학습 원문", "library-tab", libraryTab === "units" ? "selected" : "", 'data-value="units"')}${button("전체 PDF · 자료 상태", "library-tab", libraryTab === "pages" ? "selected" : "", 'data-value="pages"')}${button("오프라인 자료 팩", "library-tab", libraryTab === "packs" ? "selected" : "", 'data-value="packs"')}</div>${libraryTab === "units" ? `<div class="library-controls"><input type="search" id="search" aria-label="원문 검색" placeholder="제목이나 원문에서 찾기" value="${esc(search)}"><select id="filter" aria-label="원문 필터"><option value="all">전체 원문</option><option value="new" ${filter === "new" ? "selected" : ""}>미학습</option><option value="missed" ${filter === "missed" ? "selected" : ""}>헷갈림</option></select></div><div class="units-list">${units.length ? units.map((u) => `<button class="unit-row" data-action="preview-unit" data-value="${u.id}"><span class="unit-kind">${u.type === "table" ? "표" : u.type === "image" ? "그림" : u.type === "diagram" ? "흐름" : "문장"}</span><span><small>${esc(chapter(u.chapterId)?.title)}</small><strong>${esc(u.title)}</strong><small>${u.origin === "pdf" ? `PDF ${u.page}쪽` : "공식 자료 보완"} · ${hasSeen(state.events, u.id) ? "접촉한 원문" : "미학습"}</small></span>${icon("arrow")}</button>`).join("") : '<div class="empty">일치하는 원문이 없습니다. 검색어나 필터를 바꿔 보세요.</div>'}</div>` : libraryTab === "packs" ? packsHTML() : pagesHTML()}`;
}
function packsHTML() {
  return `<p class="micro">체크섬 확인이 끝난 자료만 준비 완료로 표시합니다. 팩을 삭제해도 학습 기록은 남습니다.</p>${catalog.packs
    .filter((p) => chapter(p.chapterId)?.subject === state.prefs.subject)
    .map((p) => {
      const d = downloads.get(p.id),
        installed = state.installed[p.id] === p.version;
      return `<section class="pack-card"><div><small>${esc(chapter(p.id)?.parent)}</small><h2>${esc(p.title)}</h2><p class="tiny">원문 ${p.units.length}개 · ${mb(p.bytes)} · ${p.version}</p><p class="pack-state">${d?.error ? esc(d.error) : d ? `다운로드 및 검증 ${Math.round(d.progress * 100)}%` : installed ? "✓ 오프라인 준비됨" : "온라인 · 다운로드 필요"}</p>${d && !d.error ? `<progress max="1" value="${d.progress}"></progress>` : ""}</div><div>${button(installed ? "다시 확인" : "다운로드", "install-pack", "secondary", `data-value="${p.id}" ${d && !d.error ? "disabled" : ""}`)}${installed ? button("팩 삭제", "delete-pack", "text-button", `data-value="${p.id}"`) : ""}</div></section>`;
    })
    .join("")}`;
}
function pagesHTML() {
  const pages = catalog.pages.filter(
    (p) => p.documentId === state.prefs.subject,
  );
  return `<div class="audit-summary"><strong>${names[state.prefs.subject]} ${pages.length}쪽 전체</strong><p>개념·문제·참고를 분리했습니다. ‘부분 검수’는 해당 페이지의 모든 문장이 학습 문제로 변환되었다는 뜻이 아닙니다.</p></div><div class="pages-grid">${pages.map((p) => `<button class="page-thumb" data-action="page" data-value="${p.id}"><img src="${esc(p.thumbnail)}" loading="lazy" alt="PDF ${p.pdfPage}쪽 미리보기"><strong>PDF ${p.pdfPage}쪽</strong><span>${{ concept: "개념", exercise: "문제·해설", reference: "참고 자료", uncertain: "확인 대기" }[p.classification]}</span><small>${esc(p.status)}</small></button>`).join("")}</div>`;
}
function recordsHTML() {
  const v = summary(state.events),
    r = reviews(state.events, state.prefs.timezone),
    today = day(new Date(), state.prefs.timezone),
    due = Object.entries(r).filter(([, x]) => x.due <= today);
  const daily = new Map<string, Attempt[]>();
  for (const e of ratings(state.events)) {
    const d = day(e.createdAt, state.prefs.timezone);
    daily.set(d, [...(daily.get(d) ?? []), e]);
  }
  const missed = new Map<string, number>();
  for (const e of ratings(state.events))
    if (e.rating === "missed")
      missed.set(e.unitId, (missed.get(e.unitId) ?? 0) + 1);
  return `${message()}<div class="page-eyebrow">꺼내 본 흔적 <span>MY RECORDS</span></div><h1 class="page-title">차곡차곡, 남은 기록.</h1><p class="muted">읽기, 복원 시도, 자기평가를 구분합니다.</p><div class="stats-grid">${[
    [v.units, "복원해 본 고유 원문"],
    [v.attempts, "복원 시도"],
    [v.independent, "도움 없는 전부"],
    [v.literal, "입력 표기 일치"],
    [v.exposures, "원문 접촉"],
    [due.length, "오늘까지 복습 기한"],
  ]
    .map(([n, t]) => `<div><b>${n}</b><span>${t}</span></div>`)
    .join("")}</div><section class="record-section"><h2>날짜별 복원</h2>${
    daily.size
      ? [...daily]
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, 30)
          .map(
            ([d, e]) =>
              `<div class="date-row"><time>${d}</time><div class="bar-track"><span style="width:${Math.min(100, e.length * 5)}%"></span></div><b>${e.length}회</b></div>`,
          )
          .join("")
      : '<p class="empty-inline">아직 복원 기록이 없습니다. 첫 원문부터 시작해 보세요.</p>'
  }</section><section class="record-section"><h2>다시 볼 원문</h2>${
    [...missed]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([id, n]) => {
        const u = catalog.units.find((u) => u.id === id);
        return u
          ? `<div class="review-row">${button(esc(u.title), "preview-unit", "text-button", `data-value="${u.id}"`)}<span>놓침 ${n}회 · ${r[id]?.due ?? "자유 랜덤"}</span></div>`
          : "";
      })
      .join("") || '<p class="empty-inline">놓친 원문은 여기에 모입니다.</p>'
  }</section>`;
}
function settingsHTML() {
  const p = state.prefs;
  return `${message()}<div class="page-eyebrow">공부의 속도 <span>SETTINGS</span></div><h1 class="page-title">나에게 맞게.</h1><section class="settings-section"><h2>읽기 환경</h2><label class="setting-row"><span>본문 크기 <small>18–28px · 현재 ${p.font}px</small></span><input type="range" min="18" max="28" id="font-size" value="${p.font}"></label><label class="setting-row"><span>화면 테마</span><select id="theme">${[
    ["light", "밝게"],
    ["dark", "어둡게"],
    ["system", "시스템"],
  ]
    .map(
      ([id, t]) =>
        `<option value="${id}" ${p.theme === id ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="setting-row"><span>짧은 화면 전환 효과</span><input type="checkbox" id="motion" ${p.motion ? "checked" : ""}></label><label class="setting-row"><span>하루 새 원문 <small>두 과목 합산 · 오늘 복습에 적용</small></span><input type="number" min="0" max="100" id="daily-new" value="${p.dailyNew}"></label><p class="micro">학습일 기준: Asia/Seoul 자정. 복습 간격은 1·3·7·14·30일입니다.</p></section><section class="settings-section"><h2>기록과 저장 공간</h2><p class="muted">기록은 이 브라우저에 보관됩니다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업하세요.</p><div class="button-row">${button("기록 내보내기", "backup", "secondary")}${button("백업 가져오기", "import", "secondary")}${button("지속 저장 요청", "persist", "text-button")}${button("저장 공간 확인", "storage", "text-button")}</div><p class="micro">가져오기는 기록 ID로 병합합니다. 설정은 백업 값을 적용하며 현재 진행 중인 세션과 내려받은 팩은 유지합니다.</p><input hidden type="file" id="backup-file" accept="application/json,.json"></section><section class="settings-section"><h2>자료 상태</h2><p>PDF 2개 · ${catalog.pages.length}쪽 · 검수 학습 원문 ${catalog.units.length}개</p><p class="micro">${catalog.audit.notes.map(esc).join("<br>")}</p>${button("전체 페이지 상태 보기", "audit", "text-button")}${registration?.waiting ? button("새 버전 적용", "update", "secondary") : ""}</section>`;
}
function bindInputs() {
  document.querySelectorAll<HTMLImageElement>("img").forEach(
    (img) =>
      (img.onerror = () => {
        if (img.nextElementSibling?.classList.contains("image-error")) return;
        const error = document.createElement("p");
        error.className = "image-error";
        error.setAttribute("role", "status");
        error.textContent =
          "이미지를 불러오지 못했습니다. 연결 후 자료 화면에서 해당 소단원 팩을 다시 다운로드해 주세요.";
        img.insertAdjacentElement("afterend", error);
      }),
  );
  document.querySelectorAll<HTMLInputElement>("[data-chapter]").forEach(
    (el) =>
      (el.onchange = () => {
        const id = el.dataset.chapter!;
        state.prefs.chapters = el.checked
          ? [...new Set([...state.prefs.chapters, id])]
          : state.prefs.chapters.filter((c) => c !== id);
        void saveDraft();
      }),
  );
  for (const [id, handler] of Object.entries({
    mode: (v: string) => (state.prefs.mode = v as "random" | "review"),
    batch: (v: string) => (state.prefs.batch = Number(v) as 5 | 10 | 20),
    theme: (v: string) =>
      (state.prefs.theme = v as "light" | "dark" | "system"),
    "font-size": (v: string) => (state.prefs.font = Number(v)),
    "daily-new": (v: string) =>
      (state.prefs.dailyNew = Math.min(100, Math.max(0, Number(v) || 0))),
  })) {
    const el = document.getElementById(id) as
      HTMLInputElement | HTMLSelectElement | null;
    if (el)
      el.onchange = () => {
        handler(el.value);
        void saveDraft().then(render);
      };
  }
  const motion = document.querySelector<HTMLInputElement>("#motion");
  if (motion)
    motion.onchange = () => {
      state.prefs.motion = motion.checked;
      void saveDraft().then(render);
    };
  const find = document.querySelector<HTMLInputElement>("#search");
  if (find)
    find.oninput = () => {
      search = find.value;
      const start = find.selectionStart;
      render();
      const next = document.querySelector<HTMLInputElement>("#search");
      next?.focus();
      next?.setSelectionRange(start, start);
    };
  const f = document.querySelector<HTMLSelectElement>("#filter");
  if (f)
    f.onchange = () => {
      filter = f.value;
      render();
    };
  document.querySelectorAll<HTMLInputElement>("[data-answer]").forEach((el) => {
    el.oninput = () => {
      if (!state.session) return;
      state.session.answers[Number(el.dataset.answer)] = el.value;
      state.session.focus = el.id;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => void saveDraft(), 180);
    };
    el.onkeydown = (e) => {
      if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (state.session?.phase === "recall") void action("reveal");
      }
    };
  });
  const backup = document.querySelector<HTMLInputElement>("#backup-file");
  if (backup) backup.onchange = () => void importFile(backup.files?.[0]);
  document.querySelector(".reading-area")?.addEventListener(
    "scroll",
    () => {
      if (state.session) {
        state.session.scroll =
          document.querySelector(".reading-area")!.scrollTop;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => void saveDraft(), 250);
      }
    },
    { passive: true },
  );
}
let saving: Promise<void> = Promise.resolve();
function saveDraft() {
  clearTimeout(draftTimer);
  const operation = saving.then(async () => {
    if (conflict) throw Error("다른 탭의 변경을 먼저 불러와 주세요.");
    const next = await writeState(state, state.revision);
    state.revision = next.revision;
    state.updatedAt = next.updatedAt;
    saveError = "";
  });
  saving = operation.catch((e) => {
    saveError = (e as Error).message;
    render();
  });
  return saving;
}
async function commit(next: State) {
  await saving;
  try {
    const saved = await writeState(next, state.revision);
    state = saved;
    saveError = "";
    return true;
  } catch (e) {
    state = next;
    saveError = (e as Error).message;
    render();
    return false;
  }
}
function showDialog(html: string, wide = false) {
  closeDialog(false);
  const focus = document.activeElement as HTMLElement | null;
  modal = document.createElement("dialog");
  modal.className = wide ? "modal wide" : "modal";
  modal.innerHTML = html;
  document.body.append(modal);
  modal.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDialog();
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeDialog();
  });
  modal.addEventListener("close", () => focus?.focus());
  modal.showModal();
  bindInputs();
}
function closeDialog(pop = true) {
  if (modal) {
    modal.close();
    modal.remove();
    modal = null;
  }
  if (pop && location.hash === "#viewer") history.back();
}
async function ensurePack(p: Pack) {
  if (state.installed[p.id] === p.version && (await verifyPack(p))) return;
  downloads.set(p.id, { progress: 0 });
  render();
  try {
    await installPack(p, (n) => {
      downloads.set(p.id, { progress: n });
      if (screen === "library" && libraryTab === "packs") render();
    });
    state.installed[p.id] = p.version;
    await saveDraft();
    downloads.delete(p.id);
    render();
  } catch (e) {
    downloads.set(p.id, {
      progress: downloads.get(p.id)?.progress ?? 0,
      error: (e as Error).message,
    });
    throw e;
  }
}
async function start() {
  if (busy || saveError || conflict) return;
  busy = true;
  try {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0],
      queue = makeQueue(catalog, state, seed);
    if (
      !state.prefs.chapters.some(
        (id) => chapter(id)?.subject === state.prefs.subject,
      )
    ) {
      busy = false;
      showDialog(scopeHTML());
      return;
    }
    if (!queue.length) {
      notice =
        state.prefs.mode === "review"
          ? "선택한 범위에서 지금 복습할 원문이 없습니다. 범위나 새 원문 한도를 확인하세요."
          : "선택한 범위에 검수한 원문이 없습니다. 범위를 바꿔 주세요.";
      render();
      return;
    }
    for (const id of new Set(
      queue.map((id) => catalog.units.find((u) => u.id === id)!.chapterId),
    ))
      await ensurePack(catalog.packs.find((p) => p.id === id)!);
    const session = newSession(
      queue,
      state.prefs,
      catalog.version,
      state.events,
      seed,
    );
    if (await commit({ ...state, session })) {
      screen = "study";
      history.pushState({ study: true }, "", "#study");
      render();
    }
  } catch (e) {
    notice = (e as Error).message;
    render();
  } finally {
    busy = false;
    render();
  }
}
function exposure(u: Unit) {
  const s = state.session;
  const event: Attempt = {
    id: uid(),
    kind: "exposure",
    sessionId: s?.id ?? "library",
    unitId: u.id,
    promptRevision: u.revision,
    packVersion: catalog.version,
    mode: s?.mode ?? state.prefs.mode,
    output: s?.output ?? state.prefs.output,
    rating: null,
    assistance: [],
    answers: [],
    literalMatch: null,
    createdAt: new Date().toISOString(),
    responseCommittedAt: null,
    revealedAt: null,
    newUnit: !hasSeen(state.events, u.id),
  };
  state.events.push(event);
}
async function sourceView(pageId?: string) {
  const u = unitNow(),
    page = pageId
      ? catalog.pages.find((p) => p.id === pageId)
      : catalog.pages.find(
          (p) => p.documentId === u?.subject && p.pdfPage === u.page,
        );
  if (!page) return;
  if (!pageId && state.session?.phase === "recall") {
    state.session.assistance = [
      ...new Set([...state.session.assistance, "source"]),
    ];
    await saveDraft();
  }
  if (!pageId && u) exposure(u);
  await saveDraft();
  const box = !pageId ? u?.sourceBox : null;
  showDialog(
    `<div class="dialog-head"><div><p class="kicker">${names[page.documentId]} · PDF ${page.pdfPage}쪽</p><h2>${page.printedPage ? "책 " + esc(page.printedPage) + "쪽" : "원본 페이지"}</h2></div>${button(icon("close"), "close-modal", "icon-button", 'aria-label="원본 닫기"')}</div><p class="micro">${esc(page.status)} · PDF 전체 파일은 앱에 저장하지 않습니다. 이 페이지 이미지를 제공합니다.</p><div class="zoom-controls">${button("−", "source-minus", "secondary", 'aria-label="축소"')}<span id="zoom-value">100%</span>${button("+", "source-plus", "secondary", 'aria-label="확대"')}${button("화면에 맞추기", "source-reset", "text-button")}</div><div class="source-viewport" tabindex="0"><div class="source-canvas" style="width:100%"><img src="${esc(page.image)}" alt="교재 PDF ${page.pdfPage}쪽 원본">${box ? `<span class="source-outline" style="left:${box[0] * 100}%;top:${box[1] * 100}%;width:${(box[2] - box[0]) * 100}%;height:${(box[3] - box[1]) * 100}%"></span>` : ""}</div></div>`,
    true,
  );
  history.pushState({ viewer: true }, "", "#viewer");
}
function zoomImage() {
  const u = unitNow(),
    s = state.session;
  if (!u || !s) return;
  const b = u.blocks.find((b) => b.type === "image");
  if (!b) return;
  showDialog(
    `<div class="dialog-head"><h2>시각자료 확대</h2>${button(icon("close"), "close-modal", "icon-button", 'aria-label="확대 닫기"')}</div><p class="micro">가림 상태를 유지합니다. 두 번 누르거나 + 버튼으로 확대할 수 있습니다.</p><div class="zoom-controls">${button("−", "source-minus", "secondary", 'aria-label="축소"')}<span id="zoom-value">100%</span>${button("+", "source-plus", "secondary", 'aria-label="확대"')}</div><div class="source-viewport"><div class="source-canvas">${blockHTML(b, u, s.phase === "recall")}</div></div>`,
    true,
  );
  history.pushState({ viewer: true }, "", "#viewer");
  modal?.querySelector(".image-button")?.removeAttribute("data-action");
  modal
    ?.querySelector(".source-canvas")
    ?.addEventListener("dblclick", () => zoom(1));
}
function zoom(change: number, reset = false) {
  const canvas = modal?.querySelector<HTMLElement>(".source-canvas");
  if (!canvas) return;
  const previous = Number(canvas.dataset.zoom ?? 1);
  const next = reset ? 1 : Math.min(4, Math.max(1, previous + change * 0.5));
  canvas.dataset.zoom = String(next);
  canvas.style.width = `${next * 100}%`;
  const label = modal?.querySelector("#zoom-value");
  if (label) label.textContent = `${Math.round(next * 100)}%`;
  if (state.session) state.session.zoom = next;
}
async function backup() {
  await saving;
  const payload = {
    format: "original-recall-backup",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    packs: catalog.packs
      .filter((p) => state.installed[p.id])
      .map((p) => ({ id: p.id, version: p.version })),
    data: state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `원문복원기-백업-${day()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice =
    "백업 파일 다운로드를 시작했습니다. 파일이 저장되었는지 확인해 주세요.";
  render();
}
async function importFile(file?: File) {
  if (!file) return;
  try {
    if (file.size > 50 * 1024 * 1024) throw Error("백업 파일이 너무 큽니다.");
    const payload = JSON.parse(await file.text());
    if (
      payload.format !== "original-recall-backup" ||
      payload.formatVersion !== 1 ||
      !validBackup(payload.data)
    )
      throw Error("지원하지 않거나 손상된 백업입니다. 기존 기록을 유지합니다.");
    const merged = mergeBackup(state, payload.data);
    if (await commit(merged)) {
      notice = "백업을 병합했습니다. 같은 기록은 중복 집계하지 않습니다.";
      render();
    }
  } catch (e) {
    notice = (e as Error).message;
    render();
  }
}
async function action(name: string, value?: string) {
  if (
    saveError &&
    !["retry-save", "backup", "refresh-state", "dismiss"].includes(name)
  )
    return;
  if (conflict && !["refresh-state", "backup"].includes(name)) return;
  if (name === "close-modal") {
    closeDialog();
    return;
  }
  if (name.startsWith("source-")) {
    zoom(name === "source-plus" ? 1 : -1, name === "source-reset");
    return;
  }
  if (["home", "library", "records", "settings"].includes(name)) {
    closeDialog();
    screen = name as typeof screen;
    render();
    return;
  }
  switch (name) {
    case "subject":
      state.prefs.subject = value as Subject;
      await saveDraft();
      render();
      if (modal) showDialog(scopeHTML());
      break;
    case "output":
      state.prefs.output = value as "quick" | "typed";
      await saveDraft();
      render();
      break;
    case "scope":
      showDialog(scopeHTML());
      break;
    case "scope-done":
      await saveDraft();
      closeDialog();
      render();
      break;
    case "start":
      await start();
      break;
    case "resume":
      if (state.session) {
        try {
          for (const id of new Set(
            state.session.queue
              .map((id) => catalog.units.find((u) => u.id === id)?.chapterId)
              .filter(Boolean),
          )) {
            const p = catalog.packs.find((p) => p.id === id);
            if (p && state.installed[p.id]) await ensurePack(p);
          }
        } catch (e) {
          notice = (e as Error).message;
          render();
          break;
        }
        screen = "study";
        history.pushState({ study: true }, "", "#study");
        render();
      }
      break;
    case "hide":
      if (state.session?.phase === "reading") {
        const u = unitNow();
        if (u) exposure(u);
        state.session.phase = "recall";
        await saveDraft();
        render();
      }
      break;
    case "reveal":
    case "unknown": {
      const s = state.session,
        u = unitNow();
      if (!s || !u || s.phase !== "recall") return;
      if (
        name === "reveal" &&
        s.output === "typed" &&
        u.targets.some((_, i) => !s.answers[i]?.trim())
      ) {
        notice = "모든 입력칸에 답을 적거나 모르겠음을 선택해 주세요.";
        showDialog(
          `<h2>아직 빈 입력칸이 있습니다.</h2><p>답을 적거나 ‘모르겠음’으로 건너뛸 수 있습니다.</p>${button("계속 입력하기", "close-modal", "primary")}`,
        );
        return;
      }
      state.session = reveal(s, name === "unknown");
      if (name === "unknown") {
        const temporary = applyRating(state, u, "missed");
        const ev = temporary.events.find((e) => e.id === s.attemptId)!;
        state.events = temporary.events;
        state.session.pendingEventId = ev.id;
      }
      exposure(u);
      await saveDraft();
      (document.activeElement as HTMLElement)?.blur();
      render();
      break;
    }
    case "rate":
      if (busy || state.session?.phase !== "compare") return;
      {
        const u = unitNow();
        if (!u) return;
        busy = true;
        const next = applyRating(state, u, value as Rating);
        if (await commit(next)) {
          const area = document.querySelector(".reading-area");
          if (area) area.scrollTop = 0;
          render();
        }
        busy = false;
      }
      break;
    case "undo":
      if (await commit(undo(state))) {
        screen = "study";
        render();
      }
      break;
    case "toggle-output":
      if (state.session) {
        state.session.output =
          state.session.output === "quick" ? "typed" : "quick";
        await saveDraft();
        render();
      }
      break;
    case "hint": {
      const s = state.session,
        u = unitNow();
      if (s && u && s.phase === "recall") {
        s.assistance = [...new Set([...s.assistance, "hint"])];
        await saveDraft();
        showDialog(
          `<h2>원문 일부</h2><p class="hint-text">${esc(u.targets[0].expectedText)}</p>${button("다시 복원하기", "close-modal", "primary")}`,
        );
        render();
      }
      break;
    }
    case "source": {
      const u = unitNow();
      if (u?.origin === "official") {
        if (state.session?.phase === "recall") {
          state.session.assistance.push("source");
          await saveDraft();
        }
        showDialog(
          `<h2>공식 보완 자료 출처</h2><a href="${esc(u.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(u.sourceLabel)} ↗</a><p class="micro">외부 원문 페이지는 연결이 필요합니다. 보완 학습 내용은 오프라인 팩에 포함됩니다.</p>${button("닫기", "close-modal", "secondary")}`,
        );
      } else await sourceView();
      break;
    }
    case "zoom-image":
      zoomImage();
      break;
    case "leave-study":
      await saveDraft();
      screen = "home";
      render();
      if (location.hash === "#study") history.back();
      break;
    case "finish":
      state.session = null;
      await saveDraft();
      screen = "home";
      render();
      break;
    case "more":
      await start();
      break;
    case "library-tab":
      libraryTab = value!;
      render();
      break;
    case "install-pack":
      try {
        await ensurePack(catalog.packs.find((p) => p.id === value)!);
      } catch (e) {
        notice = (e as Error).message;
        render();
      }
      break;
    case "delete-pack": {
      const p = catalog.packs.find((p) => p.id === value)!;
      if (
        state.session &&
        state.session.phase !== "ended" &&
        state.session.queue.some((id) => p.units.includes(id))
      ) {
        notice =
          "진행 중인 학습이 사용하는 팩입니다. 묶음을 마친 뒤 삭제할 수 있습니다.";
        render();
        return;
      }
      await removePack(p);
      delete state.installed[p.id];
      await saveDraft();
      render();
      break;
    }
    case "preview-unit": {
      const u = catalog.units.find((u) => u.id === value)!;
      exposure(u);
      await saveDraft();
      showDialog(
        `<div class="dialog-head"><div><p class="kicker">${names[u.subject]} · ${u.origin === "pdf" ? `PDF ${u.page}쪽` : "공식 보완 자료"}</p><h2>${esc(u.title)}</h2></div>${button(icon("close"), "close-modal", "icon-button", 'aria-label="닫기"')}</div><div class="preview-content">${u.blocks.map((b) => blockHTML(b, u, false)).join("")}</div><p class="micro">열람은 원문 접촉으로 기록하며 복원 성공으로 집계하지 않습니다.</p>${button("이 소단원 학습 범위에 추가", "add-scope", "primary full", `data-value="${u.chapterId}"`)}`,
        true,
      );
      break;
    }
    case "add-scope":
      state.prefs.chapters = [...new Set([...state.prefs.chapters, value!])];
      await saveDraft();
      closeDialog();
      notice = "학습 범위에 추가했습니다.";
      render();
      break;
    case "page":
      await sourceView(value);
      break;
    case "audit":
      screen = "library";
      libraryTab = "pages";
      render();
      break;
    case "backup":
      await backup();
      break;
    case "import":
      document.querySelector<HTMLInputElement>("#backup-file")?.click();
      break;
    case "persist":
      notice = (await navigator.storage?.persist?.())
        ? "지속 저장이 허용되었습니다. 별도 백업도 보관해 주세요."
        : "브라우저가 지속 저장을 허용하지 않았습니다. 백업을 이용해 주세요.";
      render();
      break;
    case "storage": {
      const estimate = await navigator.storage.estimate();
      notice = `사용 ${mb(estimate.usage ?? 0)} / 브라우저 한도 ${mb(estimate.quota ?? 0)}`;
      render();
      break;
    }
    case "dismiss":
      notice = "";
      render();
      break;
    case "retry-save":
      await saveDraft();
      render();
      break;
    case "refresh-state":
      state = await readState();
      conflict = false;
      saveError = "";
      screen = "home";
      render();
      break;
    case "update":
      if (!state.session || state.session.phase === "ended") {
        if (registration?.waiting) {
          await saveDraft();
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => location.reload(),
            { once: true },
          );
          registration.waiting.postMessage("APPLY_UPDATE");
        } else {
          await registration?.update();
          notice = registration?.waiting
            ? "새 버전을 받았습니다. 업데이트 적용을 눌러 주세요."
            : "현재 최신 버전입니다.";
          render();
        }
      } else {
        notice = "진행 중인 묶음을 마친 뒤 업데이트할 수 있습니다.";
        render();
      }
      break;
  }
}
root.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!b) return;
  e.preventDefault();
  void action(b.dataset.action!, b.dataset.value).catch((e) => {
    notice = (e as Error).message;
    render();
  });
});
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(
    "dialog [data-action]",
  );
  if (b) {
    e.preventDefault();
    void action(b.dataset.action!, b.dataset.value).catch((e) => {
      notice = (e as Error).message;
      render();
    });
  }
});
window.addEventListener("popstate", () => {
  if (modal) {
    closeDialog(false);
    return;
  }
  if (screen === "study" && location.hash !== "#study") {
    screen = "home";
    void saveDraft();
    render();
  }
});
window.addEventListener("resize", () => {
  if (screen === "study") prepareClozes();
});
window.addEventListener("online", () => render());
window.addEventListener("offline", () => render());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && state) void saveDraft();
});
window.addEventListener("pagehide", () => {
  if (state) void saveDraft();
});
channel?.addEventListener("message", (e) => {
  if (state && e.data.revision > state.revision) {
    conflict = true;
    render();
  }
});
function preload() {
  const s = state.session;
  if (!s || screen !== "study") return;
  for (const id of s.queue.slice(s.index, s.index + 4)) {
    const u = catalog.units.find((u) => u.id === id);
    for (const b of u?.blocks ?? [])
      if (b.image) {
        const img = new Image();
        img.src = b.image;
        void img.decode().catch(() => {});
      }
  }
}
async function boot() {
  try {
    [state, catalog] = await Promise.all([
      openDB(),
      fetch(new URL("./content/catalog.json", document.baseURI)).then(
        async (r) => {
          if (!r.ok)
            throw Error(
              "자료 목록을 불러올 수 없습니다. 연결 후 다시 시도해 주세요.",
            );
          return validateCatalog(await r.json());
        },
      ),
    ]);
    if (!validBackup(state))
      throw Error(
        "저장된 기록 형식을 확인할 수 없습니다. 브라우저 데이터를 지우지 말고 백업을 보관해 주세요.",
      );
    registration = await registerWorker().catch(() => null);
    if (location.hash === "#study" && state.session) screen = "study";
    render();
  } catch (e) {
    root.innerHTML = `<main class="boot-error"><h1>학습 공간을 열지 못했습니다.</h1><p>${esc((e as Error).message)}</p>${button("다시 시도", "reload", "primary")}</main>`;
    root
      .querySelector("button")
      ?.addEventListener("click", () => location.reload());
  }
}
void boot();
