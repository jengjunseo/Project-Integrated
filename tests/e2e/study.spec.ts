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
  await page.getByRole("button", { name: "범위 선택", exact: false }).click();
  for (const id of ids) await page.locator(`[data-chapter="${id}"]`).check();
  await page.getByRole("button", { name: "선택한 범위 저장" }).click();
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
  const before = await page.locator(".cloze").first().boundingBox();
  await page.locator("[data-action=hide]").click();
  await expect(page.locator(".phase-tag")).toHaveText("기억에서 꺼내기");
  const hidden = await page.locator(".cloze").first().boundingBox();
  expect(hidden?.width).toBeCloseTo(before!.width, 0);
  const snapshot = await page.locator(".source-content").ariaSnapshot();
  expect(snapshot).toContain("가려진 구간");
  expect(await page.locator(".cloze-text").first().innerText()).toBe("");
  await page.locator("[data-action=reveal]").click();
  await expect(page.locator(".phase-tag")).toHaveText("원문 대조");
  const after = await page.locator(".cloze").first().boundingBox();
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
test("installed pack works after full network cutoff and cold reload", async ({
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
test("failed pack integrity never becomes ready and retry succeeds", async ({
  page,
  context,
}) => {
  await context.route("**/content/pages/social-001.jpg", (route) =>
    route.fulfill({ status: 200, body: "corrupted" }),
  );
  await scope(page);
  await page.locator("[data-action=start]").click();
  await expect(page.getByRole("status")).toContainText("손상");
  let s = await readState(page);
  expect(s.installed.s01).toBeUndefined();
  await context.unroute("**/content/pages/social-001.jpg");
  await start(page);
  s = await readState(page);
  expect(s.installed.s01).toBe(catalog.version);
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
test("table, diagram, image mask, dark and 28px remain usable without page overflow", async ({
  page,
}) => {
  await seed(page, (s) => ({
    ...s,
    prefs: {
      ...s.prefs,
      subject: "science",
      chapters: ["c04", "c11"],
      font: 28,
      theme: "dark",
      batch: 20,
    },
    session: {
      id: "visual",
      queue: catalog.units
        .filter((u: any) => ["image", "diagram", "table"].includes(u.type))
        .map((u: any) => u.id),
      index: 0,
      seed: 1,
      phase: "recall",
      attemptId: "visual-1",
      answers: [],
      assistance: [],
      output: "quick",
      mode: "random",
      scope: ["c04", "c11"],
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
  await expect(page.locator(".table-wrapper")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile-table-dark.png" });
  await page.locator("[data-action=leave-study]").click();
  const imageIndex = catalog.units
    .filter((u: any) => ["image", "diagram", "table"].includes(u.type))
    .findIndex((u: any) => u.type === "image");
  await seed(page, (s) => ({
    ...s,
    session: {
      ...s.session,
      index: imageIndex,
      phase: "recall",
      attemptId: "visual-img",
    },
  }));
  await page.locator("[data-action=resume]").click();
  await page.locator("[data-action=zoom-image]").click();
  await expect(page.locator("dialog .image-mask").first()).toBeVisible();
  const mask = await page.locator("dialog .image-mask").first().boundingBox();
  await page.locator("dialog [data-action=source-plus]").click();
  const larger = await page.locator("dialog .image-mask").first().boundingBox();
  expect(larger!.width).toBeGreaterThan(mask!.width);
  await page.screenshot({ path: "test-results/mobile-image-mask.png" });
  await page.locator("dialog [data-action=close-modal]").click();
  await expect(page.locator(".image-mask").first()).toBeVisible();
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
      queue: [
        ...catalog.units.filter((u: any) => u.type === "image"),
        ...catalog.units.filter((u: any) => u.type !== "image"),
      ]
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

test("empty scope is explicit; interrupted pack remains incomplete and resumes", async ({
  page,
  context,
}) => {
  await page.locator("[data-action=start]").click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.locator("dialog [data-action=close-modal]").click();
  await scope(page);
  await context.route("**/content/pages/social-002.jpg", (route) =>
    route.abort("internetdisconnected"),
  );
  await page.locator("[data-action=start]").click();
  await expect(page.getByRole("status")).toContainText(/중단|실패/);
  expect((await readState(page)).installed.s01).toBeUndefined();
  await context.unroute("**/content/pages/social-002.jpg");
  await start(page);
  expect((await readState(page)).installed.s01).toBe(catalog.version);
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
