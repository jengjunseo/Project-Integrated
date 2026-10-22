import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

test("new worker waits during a session and preserves records when explicitly applied", async ({
  page,
}) => {
  let generation = 1;
  const root = resolve("dist");
  const server = createServer(async (req, res) => {
    const path = resolve(
      root,
      "." + decodeURIComponent(new URL(req.url!, "http://localhost").pathname),
    );
    if (!path.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const file = path === root ? resolve(root, "index.html") : path;
      let data = await readFile(file);
      if (file.endsWith("sw.js"))
        data = Buffer.concat([
          data,
          Buffer.from(`\n// test generation ${generation}`),
        ]);
      res.setHeader(
        "Content-Type",
        (
          {
            ".js": "text/javascript",
            ".html": "text/html",
            ".css": "text/css",
            ".json": "application/json",
            ".jpg": "image/jpeg",
            ".webp": "image/webp",
            ".png": "image/png",
            ".webmanifest": "application/manifest+json",
          } as Record<string, string>
        )[extname(file)] ?? "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-cache");
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await expect(page.locator(".start-panel")).toBeVisible();
    await page.locator("[data-action=scope]").click();
    await page.locator("[data-chapter=s01]").check();
    await page.locator("[data-action=scope-done]").click();
    await page.locator("[data-action=start]").click();
    await expect(page.locator(".recall-card")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    generation = 2;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.waiting,
        ),
      )
      .toBe(true);
    await page.locator("[data-action=leave-study]").click();
    await page.locator("[data-action=settings]").click();
    await page.locator("[data-action=update]").click();
    await expect(page.getByRole("status")).toContainText("묶음을 마친");
    await page.locator("button[data-action=home]").click();
    await page.locator("[data-action=resume]").click();
    await expect(page.locator(".recall-card")).toBeVisible();
    const total = Number(
      (await page.locator(".study-header b").innerText())
        .replace("/", "")
        .trim(),
    );
    for (let i = 0; i < total; i++) {
      if (await page.locator("[data-action=hide]").isVisible())
        await page.locator("[data-action=hide]").click();
      await page.locator("[data-action=reveal]").click();
      await page.locator("[data-action=rate][data-value=full]").click();
      if (i === total - 1)
        await expect(page.locator(".end-screen")).toBeVisible();
      else
        await expect(page.locator(".study-header>div>span")).toHaveText(
          `${i + 2} / ${total}`,
        );
    }
    await page.locator("[data-action=finish]").click();
    await page.locator("[data-action=settings]").click();
    await page.locator("[data-action=update]").click();
    await expect(page.locator(".start-panel")).toBeVisible();
    const count = await page.evaluate(
      () =>
        new Promise<number>((r) => {
          const open = indexedDB.open("original-recall", 1);
          open.onsuccess = () => {
            const db = open.result;
            const request = db
              .transaction("state")
              .objectStore("state")
              .get("current");
            request.onsuccess = () => {
              r(
                request.result.events.filter((e: any) => e.kind === "rating")
                  .length,
              );
              db.close();
            };
          };
        }),
    );
    expect(count).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    ).toBe(false);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
