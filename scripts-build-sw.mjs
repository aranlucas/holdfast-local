import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function list(path) {
  const files = [];
  for (const e of await readdir(path, { withFileTypes: true })) {
    if (e.isDirectory()) files.push(...(await list(`${path}/${e.name}`)));
    else files.push(`${path}/${e.name}`);
  }
  return files;
}
const assets = (await list("dist"))
  .filter((p) => !p.endsWith("sw.js"))
  .map((p) => "/" + p.slice(5));
const digest = createHash("sha256")
  .update(await readFile("dist/index.html"))
  .digest("hex")
  .slice(0, 12);
await writeFile(
  "dist/sw.js",
  `const CACHE='holdfast-${digest}';const ASSETS=${JSON.stringify(["/", ...assets])};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('holdfast-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).catch(()=>{if(event.request.mode==='navigate')return caches.match('/index.html');throw new Error('Offline asset unavailable');})));});`,
);
console.log(`Precached ${assets.length} local assets for offline use.`);
