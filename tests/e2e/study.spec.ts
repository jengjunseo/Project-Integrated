import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(readFileSync("public/content/catalog.json", "utf8"));
async function readState(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const r = indexedDB.open("original-recall", 1);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction("state").objectStore("state").get("current");
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
}
async function seed(page: Page, transform: (state: any) => any) {
  const s = await readState(page);
  const next = transform(
    s ?? {
      schemaVersion: 1,
      revision: 0,
      prefs: {
        subject: "social",
        chapters: ["s01"],
        mode: "random",
        output: "quick",
        batch: 10,
        font: 20,
        theme: "light",
        motion: false,
        timezone: "Asia/Seoul",
        dailyNew: 5,
      },
      events: [],
      session: null,
      installed: {},
      updatedAt: new Date().toISOString(),
    },
  );
  await page.evaluate(
    (next) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("original-recall", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("state", "readwrite");
          tx.objectStore("state").put(next, "current");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    next,
  );
  await page.reload();
  await expect(page.locator(".start-panel")).toBeVisible();
}
async function scope(page: Page, ids = ["s01"]) {
  await page.locator("[data-action=scope]").click();
  for (const el of await page.locator("[data-chapter]").all()) {
    const id = await el.getAttribute("data-chapter");
    await el.setChecked(ids.includes(id!));
  }
  await page.locator("[data-action=scope-done]").click();
}
async function start(page: Page) {
  await page.locator("[data-action=start]").click();
  await expect(page.locator(".recall-card")).toBeVisible({ timeout: 30000 });
}
async function reveal(page: Page) {
  if (await page.locator("[data-action=hide]").isVisible())
    await page.locator("[data-action=hide]").click();
  await page.locator("[data-action=reveal]").click();
  await expect(page.locator(".rating-actions")).toBeVisible();
}
test("exam concepts are searchable and directly studyable with original page links", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".start-panel")).toBeVisible();
  await page.locator("[data-action=library]").click();
  await page.locator("#source-filter").selectOption("exam");
  await page.locator("#search").fill("롤스의 원칙 간 우선순위");
  await expect(page.locator(".unit-row")).toHaveCount(1);
  await page.locator(".unit-row").click();
  await expect(page.locator("dialog")).toContainText("평등한 자유의 원칙");
  await page.locator("dialog [data-action=learn-unit]").click();
  await expect(page.locator(".recall-card h1")).toContainText("우선순위");
  if (await page.locator("[data-action=hide]").isVisible())
    await page.locator("[data-action=hide]").click();
  await expect(page.locator(".cloze-text")).toHaveText("");
  await page.locator("[data-action=source]").click();
  await expect(page.locator("dialog .kicker")).toContainText("PDF 50쪽");
  await page.locator("dialog [data-action=close-modal]").click();
  await page.locator("[data-action=reveal]").click();
  await expect(page.locator(".cloze-text")).toHaveText("평등한 자유의 원칙");
});
test("original page is an optional reference, cached when opened, without scan learning gates", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator(".start-panel")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.locator("[data-action=library]").click();
  await expect(
    page.locator("[data-action=library-tab][data-value=packs]"),
  ).toHaveCount(0);
  await page.locator("[data-action=library-tab][data-value=pages]").click();
  await page.locator("[data-action=page][data-value=social-005]").click();
  await expect(page.locator("dialog .page-concepts")).toContainText(
    "인간의 고유한 기능",
  );
  await expect(page.locator("dialog [data-action=learn-unit]")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator("dialog .source-canvas>img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.locator("dialog [data-action=close-modal]").click();
  await page.locator("[data-action=page][data-value=social-005]").click();
  await expect
    .poll(() =>
      page
        .locator("dialog .source-canvas>img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page.locator("dialog [data-action=source-plus]").click();
  await expect(page.locator("dialog #zoom-value")).toHaveText("150%");
  await context.setOffline(false);
});
test("native statistical chart keeps original values, year and masks on narrow screens", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".start-panel")).toBeVisible();
  await page.locator("[data-action=library]").click();
  await page.locator("#search").fill("국내 거주 외국인 주민 수 추이");
  await page.locator(".unit-row").click();
  await expect(page.locator("dialog .data-chart")).toContainText("2006–2022년");
  await page.locator("dialog [data-action=learn-unit]").click();
  await expect(page.locator(".data-chart li")).toHaveCount(9);
  await page.setViewportSize({ width: 360, height: 780 });
  const tracks = await page
    .locator(".chart-track")
    .evaluateAll((nodes) =>
      nodes.map((el) => el.getBoundingClientRect().width),
    );
  expect(Math.max(...tracks) - Math.min(...tracks)).toBeLessThan(0.5);
  const bars = await page
    .locator(".chart-track > span")
    .evaluateAll((nodes) =>
      nodes.map((el) => el.getBoundingClientRect().width),
    );
  expect(bars[0] / bars[8]).toBeCloseTo(54 / 226, 2);
  if (await page.locator("[data-action=hide]").isVisible())
    await page.locator("[data-action=hide]").click();
  const before = await page.locator(".cloze").first().boundingBox();
  await expect(page.locator(".cloze-text").first()).toHaveText("");
  const hidden = await page.locator(".cloze").first().boundingBox();
  expect(hidden!.width).toBeCloseTo(before!.width, 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/expanded-chart-recall.png" });
  await page.locator("[data-action=reveal]").click();
  await expect(page.locator(".cloze-text").first()).toHaveText("54");
  await expect(page.locator(".data-chart")).toContainText("226");
  const after = await page.locator(".cloze").first().boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 0);
});
test("native sphere relationships mask every occurrence and keep readable text at 360px", async ({
  page,
}) => {
  const u = catalog.units.find((u: any) => u.id === "c05-v014-spheres");
  await page.goto("/");
  await expect(page.locator(".start-panel")).toBeVisible();
  await seed(page, (s) => ({
    ...s,
    prefs: { ...s.prefs, subject: "science" },
    session: {
      id: "spheres",
      queue: [u.id],
      index: 0,
      seed: 1,
      phase: "reading",
      attemptId: "spheres-1",
      answers: [],
      assistance: [],
      output: "quick",
      mode: "random",
      scope: [u.chapterId],
      packVersion: catalog.version,
      responseCommittedAt: null,
      revealedAt: null,
      unknown: false,
      scroll: 0,
      zoom: 1,
      focus: null,
      startedAt: new Date().toISOString(),
    },
  }));
  await page.locator("[data-action=resume]").click();
  await expect(page.locator(".system-map li")).toHaveCount(4);
  await expect(page.locator(".source-content img")).toHaveCount(0);
  await page.locator("[data-action=hide]").click();
  await expect(page.locator(".system-map .cloze")).toHaveCount(4);
  expect(await page.locator(".system-map").ariaSnapshot()).not.toMatch(
    /기권|수권|지권|생물권/,
  );
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("[data-action=reveal]").click();
  await expect(page.locator(".system-map")).toContainText("생물권");
  await page.screenshot({ path: "test-results/native-spheres.png" });
});
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".start-panel")).toBeVisible();
});
test("first run → scope → read → hide → compare → rating, same-position reveal and undo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await scope(page, ["s01", "s02"]);
  await start(page);
  const title = await page.locator(".recall-card h1").innerText();
  const before = await page
    .locator(".cloze,.masked-image")
    .first()
    .boundingBox();
  await page.locator("[data-action=hide]").click();
  await expect(page.locator(".phase-tag")).toHaveText("기억에서 꺼내기");
  const hidden = await page
    .locator(".cloze,.masked-image")
    .first()
    .boundingBox();
  expect(hidden?.width).toBeCloseTo(before!.width, 0);
  const snapshot = await page.locator(".source-content").ariaSnapshot();
  expect(snapshot).toContain("가려진 구간");
  if (await page.locator(".cloze-text").count())
    expect(await page.locator(".cloze-text").first().innerText()).toBe("");
  else await expect(page.locator(".image-mask").first()).toBeVisible();
  await page.locator("[data-action=reveal]").click();
  await expect(page.locator(".phase-tag")).toHaveText("원문 대조");
  const after = await page
    .locator(".cloze,.masked-image")
    .first()
    .boundingBox();
  expect(after?.y).toBeCloseTo(hidden!.y, 0);
  expect(after?.width).toBeCloseTo(hidden!.width, 0);
  await page.locator("[data-action=rate][data-value=full]").click();
  await expect(page.locator(".recall-card h1")).not.toHaveText(title);
  expect(
    (await readState(page)).events.filter((e: any) => e.kind === "rating"),
  ).toHaveLength(1);
  await page.locator("[data-action=undo]").click();
  await expect(page.locator(".recall-card h1")).toHaveText(title);
  await expect(page.locator(".rating-actions")).toBeVisible();
  const s = await readState(page);
  expect(s.events.filter((e: any) => e.kind === "undo")).toHaveLength(1);
  expect(errors).toEqual([]);
});
test("typed answers survive IME composing Enter, reveal, reload, and undo", async ({
  page,
}) => {
  await scope(page);
  await page.locator("[data-action=output][data-value=typed]").click();
  await start(page);
  await page.locator("[data-action=hide]").click();
  const inputs = page.locator("[data-answer]");
  for (const input of await inputs.all()) await input.fill("직접 쓴 한국어");
  await inputs.first().dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    keyCode: 229,
  });
  await expect(page.locator("[data-action=reveal]")).toBeVisible();
  await expect(page.locator(".rating-actions")).toHaveCount(0);
  await page.locator("[data-action=reveal]").click();
  await expect(inputs.first()).toHaveValue("직접 쓴 한국어");
  await page.reload();
  await expect(page.locator(".rating-actions")).toBeVisible();
  await expect(page.locator("[data-answer]").first()).toHaveValue(
    "직접 쓴 한국어",
  );
  await page.locator("[data-action=rate][data-value=partial]").click();
  await page.locator("[data-action=undo]").click();
  await expect(page.locator("[data-answer]").first()).toHaveValue(
    "직접 쓴 한국어",
  );
});
test("unknown is one provisional failure and corrections do not double count", async ({
  page,
}) => {
  await scope(page);
  await start(page);
  await page.locator("[data-action=hide]").click();
  await page.locator("[data-action=unknown]").click();
  let s = await readState(page);
  expect(s.events.filter((e: any) => e.kind === "rating")).toHaveLength(1);
  expect(s.events.find((e: any) => e.kind === "rating").rating).toBe("missed");
  await page.locator("[data-action=rate][data-value=partial]").click();
  s = await readState(page);
  expect(s.events.filter((e: any) => e.kind === "rating")).toHaveLength(1);
  expect(s.events.find((e: any) => e.kind === "rating").rating).toBe("partial");
  expect(s.events.find((e: any) => e.kind === "rating").assistance).toContain(
    "reveal",
  );
});
test("automatic study cache survives network cutoff and cold reload without manual downloads", async ({
  page,
  context,
}) => {
  await scope(page, ["s01", "s02"]);
  await start(page);
  await reveal(page);
  await page.locator("[data-action=rate][data-value=full]").click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator(".recall-card")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.locator("[data-action=source]").click();
  await expect
    .poll(() =>
      page
        .locator("dialog .source-canvas>img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await page.locator("dialog [data-action=close-modal]").click();
  expect(Object.keys((await readState(page)).installed)).toHaveLength(0);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".recall-card")).toBeVisible();
  await page.locator("[data-action=source]").click();
  await expect(page.locator("dialog .source-canvas>img")).toBeVisible();
  expect(
    await page
      .locator("dialog .source-canvas>img")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
  await page.locator("dialog [data-action=close-modal]").click();
  await reveal(page);
  await page.locator("[data-action=rate][data-value=partial]").click();
  expect(
    (await readState(page)).events.filter((e: any) => e.kind === "rating"),
  ).toHaveLength(2);
  await context.setOffline(false);
});
test("first run includes both complete subjects and starts without requesting original page packs", async ({
  page,
  context,
}) => {
  const requested: string[] = [];
  await context.route("**/content/pages/**", (route) => {
    requested.push(route.request().url());
    return route.abort();
  });
  const s = await readState(page);
  expect(s.prefs.chapters).toHaveLength(catalog.chapters.length);
  await expect(page.locator(".scope-summary")).toContainText("전체 범위");
  await page.locator("[data-action=scope]").click();
  await expect(page.locator("[data-chapter]:checked")).toHaveCount(10);
  await expect(page.getByText("선택한 범위 저장", { exact: true })).toHaveCount(
    0,
  );
  await page.locator("[data-action=scope-done]").click();
  await start(page);
  expect(requested).toHaveLength(0);
  expect(Object.keys((await readState(page)).installed)).toHaveLength(0);
  const queue = (await readState(page)).session.queue;
  expect(
    queue.every(
      (id: string) =>
        catalog.units.find((u: any) => u.id === id).studyEnabled !== false,
    ),
  ).toBe(true);
});
test("backup downloaded, import merges twice without duplicate events or settings loss", async ({
  page,
}) => {
  await scope(page);
  await start(page);
  await reveal(page);
  await page.locator("[data-action=rate][data-value=full]").click();
  await page.locator("[data-action=leave-study]").click();
  await page.locator("[data-action=settings]").click();
  const download = page.waitForEvent("download");
  await page.locator("[data-action=backup]").click();
  const file = await download;
  const path = await file.path();
  expect(path).toBeTruthy();
  for (let i = 0; i < 2; i++) {
    await page.locator("#backup-file").setInputFiles(path!);
    await expect(page.getByRole("status")).toContainText("병합");
  }
  const s = await readState(page);
  expect(s.events.filter((e: any) => e.kind === "rating")).toHaveLength(1);
  await page.locator("#backup-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await expect(page.getByRole("status")).toContainText("손상");
  expect(
    (await readState(page)).events.filter((e: any) => e.kind === "rating"),
  ).toHaveLength(1);
});
test("another active tab must refresh before overwriting new state", async ({
  page,
  context,
}) => {
  await scope(page);
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator(".start-panel")).toBeVisible();
  await page.locator("[data-action=output][data-value=typed]").click();
  await expect(second.getByRole("alert")).toContainText("다른 탭");
  await second.locator("[data-action=refresh-state]").click();
  await expect(
    second.locator("[data-action=output][data-value=typed]"),
  ).toHaveClass("selected");
  await second.close();
});
test("native pyramid and inline official illustration work in dark mode at 28px", async ({
  page,
}) => {
  const u = catalog.units.find((u: any) => u.type === "pyramid");
  await seed(page, (s) => ({
    ...s,
    prefs: { ...s.prefs, subject: "science", font: 28, theme: "dark" },
    session: {
      id: "visual",
      queue: [u.id, "official-visual-chains"],
      index: 0,
      seed: 1,
      phase: "reading",
      attemptId: "visual-1",
      answers: [],
      assistance: [],
      output: "quick",
      mode: "random",
      scope: ["c04", "c10"],
      packVersion: catalog.version,
      responseCommittedAt: null,
      revealedAt: null,
      unknown: false,
      scroll: 0,
      zoom: 1,
      focus: null,
      startedAt: new Date().toISOString(),
    },
  }));
  await page.locator("[data-action=resume]").click();
  await expect(page.locator(".energy-pyramid li")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/native-pyramid-dark.png" });
  await reveal(page);
  await page.locator("[data-action=rate][data-value=full]").click();
  await expect(page.locator(".inline-illustration img")).toBeVisible();
  await expect(page.locator(".inline-illustration")).toContainText("CC BY 4.0");
  await page.locator("[data-action=zoom-illustration]").click();
  await page.locator("dialog [data-action=source-plus]").click();
  await expect(page.locator("dialog #zoom-value")).toHaveText("150%");
  await page.locator("dialog [data-action=close-modal]").click();
  await page.locator("[data-action=hide]").click();
  await expect(page.locator(".figure-cover")).toBeVisible();
  await expect(page.locator("[data-action=zoom-illustration]")).toBeDisabled();
  await page.locator("[data-action=reveal]").click();
  await expect(page.locator(".inline-illustration img")).toBeVisible();
});
test("storage failure is visible and can be retried without silent progression", async ({
  page,
}) => {
  await scope(page);
  await start(page);
  await reveal(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    Object.defineProperty(window, "restoreTransaction", {
      value: () => (IDBDatabase.prototype.transaction = original),
    });
    IDBDatabase.prototype.transaction = function (...args: any[]) {
      if (args[1] === "readwrite")
        throw new DOMException(
          "Simulated quota exceeded",
          "QuotaExceededError",
        );
      return original.apply(this, args as any);
    } as any;
  });
  await page.locator("[data-action=rate][data-value=full]").click();
  await expect(page.getByRole("alert")).toContainText(
    "아직 저장되지 않았습니다",
  );
  await page.evaluate(() => (window as any).restoreTransaction());
  await page.locator("[data-action=retry-save]").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    (await readState(page)).events.filter((e: any) => e.kind === "rating"),
  ).toHaveLength(1);
});
test("100 prepared transitions record latency, no fatal errors or duplicated attempts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, (s) => ({
    ...s,
    prefs: { ...s.prefs, motion: false, output: "quick" },
    session: {
      id: "performance",
      queue: Array.from({ length: 20 }, (_, index) =>
        ["text", "table", "diagram", "chart", "network", "pyramid"].map(
          (type) =>
            catalog.units.filter((u: any) => u.type === type)[
              index % catalog.units.filter((u: any) => u.type === type).length
            ],
        ),
      )
        .flat()
        .filter(
          (u: any, index: number, items: any[]) =>
            items.findIndex((other) => other.id === u.id) === index,
        )
        .concat(
          catalog.units.filter(
            (u: any) =>
              u.studyEnabled !== false &&
              !["diagram", "chart"].includes(u.type),
          ),
        )
        .filter(
          (u: any, index: number, items: any[]) =>
            items.findIndex((other) => other.id === u.id) === index,
        )
        .slice(0, 100)
        .map((u: any) => u.id),
      index: 0,
      seed: 1,
      phase: "recall",
      attemptId: "perf-0",
      answers: [],
      assistance: [],
      output: "quick",
      mode: "random",
      scope: catalog.chapters.map((c: any) => c.id),
      packVersion: catalog.version,
      responseCommittedAt: null,
      revealedAt: null,
      unknown: false,
      scroll: 0,
      zoom: 1,
      focus: null,
      startedAt: new Date().toISOString(),
    },
  }));
  await page.locator("[data-action=resume]").click();
  await page.evaluate(() => {
    const w = window as any;
    w.frameSamples = [];
    document.addEventListener(
      "click",
      (e) => {
        if (!(e.target as Element).closest("[data-action=rate]")) return;
        const begin = performance.now();
        const observer = new MutationObserver(() => {
          observer.disconnect();
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              w.frameSamples.push(performance.now() - begin),
            ),
          );
        });
        observer.observe(document.querySelector("#app")!, {
          childList: true,
          subtree: true,
        });
      },
      true,
    );
  });
  const timings: number[] = [];
  for (let i = 0; i < 100; i++) {
    if (await page.locator(".end-screen").isVisible()) break;
    if (await page.locator("[data-action=hide]").isVisible())
      await page.locator("[data-action=hide]").click();
    await page.locator("[data-action=reveal]").click();
    const t = Date.now();
    await page.locator("[data-action=rate][data-value=full]").click();
    await expect(page.locator(".recall-card,.end-screen")).toBeVisible();
    timings.push(Date.now() - t);
    await expect
      .poll(async () => (await readState(page)).session.index)
      .toBe(i + 1);
  }
  const s = await readState(page),
    ratings = s.events.filter((e: any) => e.kind === "rating");
  expect(new Set(ratings.map((e: any) => e.id)).size).toBe(ratings.length);
  expect(errors).toEqual([]);
  await test.info().attach("transition-latencies", {
    body: JSON.stringify({
      metric:
        "Playwright command roundtrip to next visible card (includes automation overhead)",
      samples: timings,
      clickToSecondAnimationFrame: await page.evaluate(
        () => (window as any).frameSamples,
      ),
      navigation: await page.evaluate(() =>
        performance.getEntriesByType("navigation").map((e) => e.toJSON()),
      ),
      userAgent: await page.evaluate(() => navigator.userAgent),
      viewport: page.viewportSize(),
      errors,
    }),
    contentType: "application/json",
  });
});

test("range exclusions save immediately on close and survive reload, including empty scope", async ({
  page,
}) => {
  await page.locator("[data-action=scope]").click();
  await page.locator("[data-chapter=s01]").uncheck();
  await page.locator("dialog [data-action=close-modal]").click();
  await expect(page.locator(".scope-summary")).toContainText("9 / 10");
  await page.reload();
  await expect(page.locator(".start-panel")).toBeVisible();
  expect((await readState(page)).prefs.chapters).not.toContain("s01");
  await page.locator("[data-action=scope]").click();
  await page.locator("[data-action=scope-none]").click();
  await page.locator("[data-action=scope-done]").click();
  await page.reload();
  await expect(page.locator(".scope-summary")).toContainText(
    "모든 범위가 해제",
  );
  await page.locator("[data-action=start]").click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.locator("[data-action=scope-all]").click();
  await page.locator("[data-action=scope-done]").click();
  await start(page);
});

test("table horizontal position survives reveal; original assistance stays separate", async ({
  page,
}) => {
  const u = catalog.units.find((u: any) => u.type === "table");
  await seed(page, (s) => ({
    ...s,
    session: {
      id: "table",
      queue: [u.id],
      index: 0,
      seed: 1,
      phase: "recall",
      attemptId: "table-attempt",
      answers: [],
      assistance: [],
      output: "quick",
      mode: "review",
      scope: [u.chapterId],
      packVersion: catalog.version,
      responseCommittedAt: null,
      revealedAt: null,
      unknown: false,
      scroll: 0,
      zoom: 1,
      focus: null,
      startedAt: new Date().toISOString(),
    },
  }));
  await page.locator("[data-action=resume]").click();
  await page
    .locator(".table-wrapper")
    .evaluate((el: HTMLElement) => (el.scrollLeft = 120));
  const left = await page
    .locator(".table-wrapper")
    .evaluate((el: HTMLElement) => el.scrollLeft);
  await page.locator("[data-action=source]").click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.locator("dialog [data-action=close-modal]").click();
  await page.locator("[data-action=reveal]").click();
  await expect(page.locator(".phase-tag")).toHaveText("원문 대조");
  expect(
    await page
      .locator(".table-wrapper")
      .evaluate((el: HTMLElement) => el.scrollLeft),
  ).toBe(left);
  await page.locator("[data-action=rate][data-value=full]").click();
  const s = await readState(page),
    e = s.events.find((e: any) => e.kind === "rating");
  expect(e.assistance).toContain("source");
  await expect(page.locator(".end-screen")).toBeVisible();
});

test("360px and landscape retain usable controls and no document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await scope(page);
  await start(page);
  for (const size of [
    { width: 360, height: 780 },
    { width: 915, height: 412 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const action = page.locator("[data-action=hide]");
    await expect(action).toBeVisible();
    const r = await action.boundingBox();
    expect(r!.height).toBeGreaterThanOrEqual(56);
    expect(r!.y + r!.height).toBeLessThanOrEqual(size.height);
  }
});

test("all official illustrations are automatically available offline before opening any chapter", async ({
  page,
  context,
}) => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.locator("[data-action=library]").click();
  await page.locator("[data-action=subject][data-value=science]").click();
  const figures = catalog.units.filter((u: any) =>
    u.blocks.some((b: any) => b.illustration),
  );
  expect(figures).toHaveLength(5);
  for (const u of figures) {
    await page.locator("#search").fill(u.title);
    await page.locator(`.unit-row[data-value="${u.id}"]`).click();
    await expect
      .poll(() =>
        page
          .locator("dialog .inline-illustration img")
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await expect(
      page.locator("dialog .inline-illustration figcaption a").first(),
    ).toHaveAttribute("href", /^https:/);
    await page.locator("dialog [data-action=close-modal]").click();
  }
  expect(Object.keys((await readState(page)).installed)).toHaveLength(0);
  await context.setOffline(false);
});
