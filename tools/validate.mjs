import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
const c = JSON.parse(await readFile("public/content/catalog.json", "utf8"));
let assets = 0;
const ids = new Set();
for (const u of c.units) {
  if (ids.has(u.id)) throw Error("Duplicate unit " + u.id);
  ids.add(u.id);
  if (u.status !== "verified") throw Error("Unverified unit shipped");
  if (!c.chapters.some((ch) => ch.id === u.chapterId))
    throw Error("Chapter missing");
  if (
    u.origin === "pdf" &&
    !c.pages.some((p) => p.documentId === u.subject && p.pdfPage === u.page)
  )
    throw Error("Page missing");
  for (const t of u.targets) {
    const b = u.blocks.find((b) => b.id === t.blockId);
    if (
      !b ||
      b.text.slice(t.startUtf16, t.endUtf16) !== t.expectedText ||
      !t.expectedText
    )
      throw Error("Target mismatch " + u.id);
    if (
      t.box &&
      !(
        t.box.every((n) => n >= 0 && n <= 1) &&
        t.box[0] < t.box[2] &&
        t.box[1] < t.box[3]
      )
    )
      throw Error("Box invalid");
  }
  if (u.origin === "official" && !/^https:\/\//.test(u.sourceUrl))
    throw Error("Official source missing");
}
for (const p of c.packs) {
  for (const id of p.units) if (!ids.has(id)) throw Error("Missing unit");
  let bytes = 0;
  for (const a of p.assets) {
    const b = await readFile("public/" + a.url.replace(/^\.\//, ""));
    if (
      b.length !== a.bytes ||
      createHash("sha256").update(b).digest("hex") !== a.sha256
    )
      throw Error("Asset integrity failed " + a.url);
    bytes += b.length;
    assets++;
  }
  if (p.bytes !== bytes) throw Error("Pack size invalid");
}
for (const p of c.pages) {
  await stat("public/" + p.image.replace(/^\.\//, ""));
  await stat("public/" + p.thumbnail.replace(/^\.\//, ""));
}
console.log(
  `Content valid: ${c.documents.length} PDFs, ${c.pages.length} pages, ${ids.size} verified units, ${c.packs.length} packs, ${assets} asset references.`,
);
