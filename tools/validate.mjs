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
    for (const box of [...(t.box ? [t.box] : []), ...(t.boxes ?? [])])
      if (
        box.length !== 4 ||
        !box.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
        box[0] >= box[2] ||
        box[1] >= box[3]
      )
        throw Error("Box invalid " + u.id);
    if (b.type === "image" && !t.box && !t.boxes?.length)
      throw Error("Image mask missing " + u.id);
    const overlaps = u.targets.some(
      (other) =>
        other !== t &&
        other.blockId === t.blockId &&
        Math.max(t.startUtf16, other.startUtf16) <
          Math.min(t.endUtf16, other.endUtf16),
    );
    if (overlaps) throw Error("Overlapping answer spans " + u.id);
  }
  for (const b of u.blocks) {
    if (b.illustration) {
      if (
        !b.illustration.credit ||
        !b.illustration.license ||
        !/^https:\/\//.test(b.illustration.sourceUrl)
      )
        throw Error("Illustration attribution missing");
      await stat("public/" + b.illustration.image.replace(/^\.\//, ""));
    }
    if (u.studyEnabled !== false && b.type === "image")
      throw Error("Scan card remains in default study: " + u.id);

    if (
      ![
        "text",
        "table",
        "diagram",
        "image",
        "chart",
        "network",
        "pyramid",
      ].includes(b.type)
    )
      throw Error("Unsupported block " + u.id);
    if (
      b.type === "chart" &&
      (!b.chartUnit ||
        !b.chartYear ||
        !b.rows?.length ||
        b.rows.some(
          (row) =>
            row.length !== 2 ||
            !Number.isFinite(Number(row[1])) ||
            Number(row[1]) < 0,
        ))
    )
      throw Error("Invalid chart " + u.id);
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
  if (!p.unitIds?.length && !p.relatedUnitIds?.length)
    throw Error("Page has no learning link: " + p.id);
  if (![...p.unitIds, ...p.relatedUnitIds].every((id) => ids.has(id)))
    throw Error("Invalid page crosswalk: " + p.id);
  if (p.classification === "exercise" && !p.relatedUnitIds.length)
    throw Error("Question concepts omitted: " + p.id);
  await stat("public/" + p.image.replace(/^\.\//, ""));
  await stat("public/" + p.thumbnail.replace(/^\.\//, ""));
}
console.log(
  `Content valid: ${c.documents.length} PDFs, ${c.pages.length} pages, ${ids.size} verified units, ${c.packs.length} packs, ${assets} asset references.`,
);
