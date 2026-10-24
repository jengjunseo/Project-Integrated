import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function list(dir, prefix = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + e.name;
    if (e.isDirectory() && e.name !== "content")
      out.push(...(await list(`${dir}/${e.name}`, `${name}/`)));
    else if (e.isFile() && !["sw.js", "vercel.json"].includes(e.name))
      out.push("./" + name);
  }
  return out;
}
const catalog = JSON.parse(await readFile("dist/content/catalog.json", "utf8"));
const shell = await list("dist");
shell.push("./content/catalog.json");
for (const u of catalog.units.filter((u) => u.studyEnabled !== false))
  for (const b of u.blocks)
    for (const image of [b.image, b.illustration?.image])
      if (image && !shell.includes(image)) shell.push(image);
const files = [];
const digest = createHash("sha256");
for (const url of [...shell].sort()) {
  const data = await readFile("dist/" + url.slice(2));
  digest.update(data);
  files.push({
    url,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}
const version = digest.digest("hex").slice(0, 12);
const references = Object.fromEntries(
  catalog.packs.flatMap((p) => p.assets).map((a) => [a.url, a]),
);
await writeFile(
  "dist/sw.js",
  `
const SHELL='recall-shell-${version}';
const FILES=${JSON.stringify(files)};
const REFERENCES=${JSON.stringify(references)};
const REFERENCE_CACHE='recall-reference-${catalog.version}';
const absolute=p=>new URL(p,self.registration.scope).href;
async function checked(response,asset){
  if(!response.ok)throw Error('Download failed');
  const bytes=await response.clone().arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==asset.bytes||hash!==asset.sha256)throw Error('Integrity check failed');
  return response;
}
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  for(const asset of FILES){
    const url=absolute(asset.url);
    await cache.put(url,await checked(await fetch(url,{cache:'no-store'}),asset));
  }
})()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{if(e.data==='APPLY_UPDATE')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith((async()=>{
    const shell=await caches.open(SHELL);
    const own=await shell.match(e.request,{ignoreVary:true});if(own)return own;
    if(e.request.mode==='navigate')return await shell.match(absolute('./index.html'));
    const path='./'+new URL(e.request.url).pathname.slice(new URL(self.registration.scope).pathname.length);
    const asset=REFERENCES[path];
    if(asset){
      const cache=await caches.open(REFERENCE_CACHE);
      const prior=await cache.match(e.request);if(prior)return prior;
      // Older manually installed originals remain readable after the upgrade.
      for(const key of (await caches.keys()).filter(k=>k.startsWith('recall-pack-'))){
        const old=await (await caches.open(key)).match(e.request);
        if(old){try{await checked(old,asset);return old}catch{}}
      }
      try{
        const response=await checked(await fetch(e.request),asset);
        try{await cache.put(e.request,response.clone())}catch{}
        return response;
      }catch{return new Response('연결되면 원본을 자동 저장합니다.',{status:503})}
    }
    try{return await fetch(e.request)}catch{return new Response('오프라인 자료가 없습니다.',{status:503})}
  })());
});
`,
);
console.log(
  `Service worker ${version}: ${files.length} automatically cached study files; originals cached only when opened.`,
);
