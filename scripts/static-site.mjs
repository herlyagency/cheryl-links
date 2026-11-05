// Fail before deployment if a complete public snapshot cannot be produced.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const origin = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!origin || !key) throw Error('Missing public Supabase configuration');
async function fetchChecked(url, options = {}) {
 const r = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
 if (!r.ok) throw Error(`Snapshot request failed: ${r.status}`);
 return r;
}
const site = await (await fetchChecked(`${origin}/rest/v1/rpc/get_public_site`, {method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}'})).json();
if (!site?.profile || !Array.isArray(site.links)) throw Error('No published site');
await mkdir('dist/media', {recursive:true});
const downloaded = new Map();
async function image(url) {
 if (!url || !url.startsWith(`${origin}/storage/v1/object/public/`)) return url;
 if (downloaded.has(url)) return downloaded.get(url);
 const r = await fetchChecked(url);
 const type = r.headers.get('content-type')?.split(';')[0];
 const ext = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg'}[type];
 if (!ext) throw Error('Unexpected image format');
 const bytes = Buffer.from(await r.arrayBuffer());
 if (bytes.length > 5*1024*1024) throw Error('Image exceeds export size limit');
 const name = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
 await writeFile(`dist/media/${name}`, bytes);
 const local = `https://cherylxxw.com/media/${name}`;
 downloaded.set(url,local); return local;
}
site.profile.avatar_url = await image(site.profile.avatar_url);
site.theme.backgroundImage = await image(site.theme.backgroundImage);
for (const link of site.links) for (const field of ['thumbnail','backgroundImage']) link[field] = await image(link[field]);
await writeFile('dist/site.json', JSON.stringify(site));
// Sharing crawlers also use a locally hosted image.
const preview = await fetchChecked(`${origin}/functions/v1/share-preview`);
if (!preview.headers.get('content-type')?.startsWith('image/png')) throw Error('Invalid sharing preview');
await writeFile('dist/social-preview.png', Buffer.from(await preview.arrayBuffer()));
for (const file of ['dist/index.html','dist/admin/index.html','dist/404.html']) {
 try { const html = await readFile(file,'utf8'); await writeFile(file,html.replaceAll(`${origin}/functions/v1/share-preview`,'https://cherylxxw.com/social-preview.png')); }
 catch(e) { if(e.code !== 'ENOENT') throw e; }
}
