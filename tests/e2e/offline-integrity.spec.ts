import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

test("corrupt automatic figure cache never becomes ready; a fresh load retries without blocking study", async ({
  page,
}) => {
  const root = resolve("dist");
  const catalog = JSON.parse(
    await readFile(resolve(root, "content/catalog.json"), "utf8"),
  );
  const figure = catalog.units
    .flatMap((u: any) => u.blocks)
    .find((b: any) => b.illustration).illustration.image;
  let corrupt = true,
    requested = false;
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url!, "http://localhost").pathname;
    const path = resolve(root, "." + decodeURIComponent(pathname));
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const file = path === root ? resolve(root, "index.html") : path;
      let data = await readFile(file);
      if (pathname === "/" + figure.slice(2) && corrupt) {
        requested = true;
        data = Buffer.from("corrupt figure");
      }
      res.setHeader(
        "Content-Type",
        (
          {
            ".js": "text/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".json": "application/json",
            ".png": "image/png",
            ".webp": "image/webp",
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
  const { port } = server.address() as { port: number };
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator(".start-panel")).toBeVisible();
    await page.locator("[data-action=start]").click();
    await expect(page.locator(".recall-card")).toBeVisible();
    await expect.poll(() => requested).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const regs = await navigator.serviceWorker.getRegistrations();
          return regs.every((reg) => !reg.installing && !reg.active);
        }),
      )
      .toBe(true);
    corrupt = false;
    await page.reload();
    await expect(page.locator(".recall-card")).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    const cached = await page.evaluate(async (figure) => {
      for (const key of await caches.keys())
        if (key.startsWith("recall-shell-")) {
          const cache = await caches.open(key),
            response = await cache.match(new URL(figure, document.baseURI));
          if (response) return (await response.arrayBuffer()).byteLength;
        }
      return 0;
    }, figure);
    expect(cached).toBeGreaterThan(1000);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
