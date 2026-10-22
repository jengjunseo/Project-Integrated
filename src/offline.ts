import type { Pack } from "./model";
export const packCache = (pack: Pack) =>
  `recall-pack-${pack.id}-${pack.version}`;
export async function digest(buffer: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function installPack(pack: Pack, progress: (n: number) => void) {
  const name = packCache(pack),
    cache = await caches.open(name);
  let n = 0;
  try {
    for (const a of pack.assets) {
      const prior = await cache.match(new URL(a.url, document.baseURI));
      if (prior) {
        const b = await prior.clone().arrayBuffer();
        if ((await digest(b)) === a.sha256) {
          progress(++n / pack.assets.length);
          continue;
        }
      }
      const r = await fetch(new URL(a.url, document.baseURI), {
        cache: "no-store",
      }).catch(() => {
        throw Error(
          "자료 다운로드가 중단되었습니다. 연결을 확인한 뒤 재시도해 주세요.",
        );
      });
      if (!r.ok)
        throw Error(
          "자료 다운로드에 실패했습니다. 연결을 확인하고 재시도해 주세요.",
        );
      const b = await r.clone().arrayBuffer();
      if (b.byteLength !== a.bytes || (await digest(b)) !== a.sha256)
        throw Error(
          "자료가 손상되어 설치를 중단했습니다. 다시 다운로드해 주세요.",
        );
      await cache.put(new URL(a.url, document.baseURI), r);
      progress(++n / pack.assets.length);
    }
    const manifest = new Response(
      JSON.stringify({ id: pack.id, version: pack.version, verified: true }),
    );
    await cache.put(new URL(`./__pack/${pack.id}`, document.baseURI), manifest);
  } catch (e) {
    throw e;
  }
}
export async function verifyPack(pack: Pack) {
  const c = await caches.open(packCache(pack));
  if (!(await c.match(new URL(`./__pack/${pack.id}`, document.baseURI))))
    return false;
  for (const a of pack.assets)
    if (!(await c.match(new URL(a.url, document.baseURI)))) return false;
  return true;
}
export async function removePack(pack: Pack) {
  await caches.delete(packCache(pack));
}
export async function registerWorker() {
  if ("serviceWorker" in navigator)
    return navigator.serviceWorker.register(
      new URL("./sw.js", document.baseURI),
      { scope: "./" },
    );
  return null;
}
