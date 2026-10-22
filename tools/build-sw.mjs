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
const shell = await list("dist");
shell.push("./content/catalog.json");
const digest = createHash("sha256");
for (const file of [...shell].sort())
  digest.update(await readFile("dist/" + file.slice(2)));
const version = digest.digest("hex").slice(0, 12);
await writeFile(
  "dist/sw.js",
  `const SHELL='recall-shell-${version}';const FILES=${JSON.stringify(shell)};
self.addEventListener('install',e=>e.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{if(e.data==='APPLY_UPDATE')self.skipWaiting()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
e.respondWith((async()=>{const shell=await caches.open(SHELL);const own=await shell.match(e.request,{ignoreVary:true});if(own)return own;
const keys=(await caches.keys()).filter(k=>k.startsWith('recall-pack-'));for(const key of keys){const c=await caches.open(key);const marker=new URL('./__pack/'+key.slice(12).replace(/-v[^-]+$/,''),self.registration.scope);if(!await c.match(marker))continue;const r=await c.match(e.request,{ignoreVary:true});if(r)return r}
try{return await fetch(e.request)}catch{if(e.request.mode==='navigate')return await shell.match(new URL('./index.html',self.registration.scope));return new Response('오프라인 자료가 없습니다.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}})())});`,
);
console.log(
  `Service worker ${version}: ${shell.length} shell files; packs downloaded explicitly.`,
);
