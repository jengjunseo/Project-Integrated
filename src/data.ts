import type { Catalog } from "./model";
export function validateCatalog(value: unknown): Catalog {
  const c = value as Catalog;
  if (
    !c ||
    c.schemaVersion !== 1 ||
    typeof c.version !== "string" ||
    !Array.isArray(c.units) ||
    !Array.isArray(c.packs) ||
    !Array.isArray(c.pages) ||
    !Array.isArray(c.chapters)
  )
    throw Error("지원하지 않는 자료 형식입니다.");
  const ids = new Set<string>();
  for (const u of c.units) {
    if (
      typeof u.id !== "string" ||
      ids.has(u.id) ||
      u.status !== "verified" ||
      !c.chapters.some((ch) => ch.id === u.chapterId) ||
      !Array.isArray(u.blocks) ||
      !Array.isArray(u.targets) ||
      !u.targets.length
    )
      throw Error("검수 원문 참조가 올바르지 않습니다.");
    ids.add(u.id);
    for (const t of u.targets) {
      const b = u.blocks.find((b) => b.id === t.blockId);
      if (
        !b ||
        !Number.isInteger(t.startUtf16) ||
        !Number.isInteger(t.endUtf16) ||
        t.startUtf16 < 0 ||
        t.endUtf16 <= t.startUtf16 ||
        b.text.slice(t.startUtf16, t.endUtf16) !== t.expectedText
      )
        throw Error("가림 구간이 원문과 다릅니다.");
      for (const box of [...(t.box ? [t.box] : []), ...(t.boxes ?? [])])
        if (
          box.length !== 4 ||
          !box.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
          box[0] >= box[2] ||
          box[1] >= box[3]
        )
          throw Error("가림 좌표가 올바르지 않습니다.");
    }
    for (const b of u.blocks) {
      if (!["text", "table", "diagram", "image", "chart"].includes(b.type))
        throw Error("자료 표시 형식이 올바르지 않습니다.");
      if (
        b.type === "chart" &&
        (!b.rows?.length ||
          b.rows.some(
            (row) =>
              row.length !== 2 ||
              !Number.isFinite(Number(row[1])) ||
              Number(row[1]) < 0,
          ))
      )
        throw Error("그래프 수치가 올바르지 않습니다.");
      if (b.image && !/^\.\/content\/[\w/.-]+$/.test(b.image))
        throw Error("허용되지 않은 자료 경로입니다.");
    }
  }
  for (const p of c.packs) {
    if (
      !p.assets.every(
        (a) =>
          /^\.\/content\/[\w/.-]+$/.test(a.url) &&
          /^[a-f0-9]{64}$/.test(a.sha256) &&
          Number.isFinite(a.bytes) &&
          a.bytes > 0,
      ) ||
      !p.units.every((id) => ids.has(id))
    )
      throw Error("자료 팩의 참조 또는 체크섬이 올바르지 않습니다.");
  }
  return c;
}
