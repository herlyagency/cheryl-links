// Export the published site and its media into dist/ so visitors never touch Supabase Storage.
//
// Supabase egress is spent only when something actually changed:
//  - Uploaded objects are immutable (random UUID paths), so each source URL is downloaded
//    once, optimised to WebP, and reused from the cached snapshot on every later deploy.
//  - The sharing preview is re-rendered only when the published content changes.
// Fail before deployment if a complete public snapshot cannot be produced.
import { mkdir, writeFile, readFile, cp, rm, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const origin = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!origin || !key) throw Error("Missing public Supabase configuration");

const SNAPSHOT = ".public-snapshot";
const PUBLIC_ORIGIN = "https://cherylxxw.com";
const MANIFEST = "media-manifest.json";
// Longest edge in px. Displayed sizes: avatar ≤172px, featured thumbnail ≤480px, backgrounds full-bleed.
const MAX_EDGE = { avatar: 480, thumbnail: 1000, background: 1600 };
const MAX_DOWNLOAD = 5 * 1024 * 1024;

const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );
const sha = (data) => createHash("sha256").update(data).digest("hex");

async function fetchChecked(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error(`Snapshot request failed: ${r.status}`);
  return r;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

// Lazily load the image codecs (devDependencies, already used by the share-preview tests).
let codecs;
async function loadCodecs() {
  if (codecs) return codecs;
  const require = createRequire(import.meta.url);
  const { Image } = await import(require.resolve("imagescript"));
  const encPath = require.resolve("@jsquash/webp/encode.js");
  const decPath = require.resolve("@jsquash/webp/decode.js");
  const enc = await import(encPath);
  const dec = await import(decPath);
  await enc.init(
    await WebAssembly.compile(
      await readFile(new URL("./codec/enc/webp_enc.wasm", `file://${encPath}`)),
    ),
  );
  await dec.init(
    await WebAssembly.compile(
      await readFile(new URL("./codec/dec/webp_dec.wasm", `file://${decPath}`)),
    ),
  );
  return (codecs = { Image, encode: enc.default, decode: dec.default });
}

// Resize to the field's display budget and re-encode as WebP. Returns null when the
// original is already smaller (or cannot be decoded), so the original is kept.
async function optimise(bytes, type, maxEdge) {
  if (type === "image/svg+xml") return null;
  try {
    const { Image, encode, decode } = await loadCodecs();
    let image;
    if (type === "image/webp") {
      const decoded = await decode(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
      image = new Image(decoded.width, decoded.height);
      image.bitmap.set(decoded.data);
    } else image = await Image.decode(bytes);
    if (Math.max(image.width, image.height) > maxEdge)
      image.width >= image.height
        ? image.resize(maxEdge, Image.RESIZE_AUTO)
        : image.resize(Image.RESIZE_AUTO, maxEdge);
    const { bitmap, width, height } = image;
    const out = Buffer.from(
      await encode(
        {
          data: new Uint8ClampedArray(
            bitmap.buffer,
            bitmap.byteOffset,
            bitmap.byteLength,
          ),
          width,
          height,
        },
        { quality: 80 },
      ),
    );
    return out.length < bytes.length ? out : null;
  } catch (error) {
    console.warn(`Image optimisation skipped: ${error.message}`);
    return null;
  }
}

try {
  const site = await (
    await fetchChecked(`${origin}/rest/v1/rpc/get_public_site`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: "{}",
    })
  ).json();
  if (!site?.profile || !Array.isArray(site.links))
    throw Error("No published site");
  const contentKey = sha(JSON.stringify(site));

  await mkdir("dist/media", { recursive: true });
  // { "<supabase url>|<variant>": "<file name in media/>" }
  const previous = await readJson(`${SNAPSHOT}/${MANIFEST}`, {});
  const manifest = {};
  let downloads = 0,
    reused = 0;

  async function image(url, variant) {
    if (!url || !url.startsWith(`${origin}/storage/v1/object/public/`))
      return url;
    const id = `${url}|${variant}`;
    if (manifest[id]) return `${PUBLIC_ORIGIN}/media/${manifest[id]}`;
    const cached = previous[id];
    if (cached && (await exists(`${SNAPSHOT}/media/${cached}`))) {
      await cp(`${SNAPSHOT}/media/${cached}`, `dist/media/${cached}`);
      manifest[id] = cached;
      reused++;
      return `${PUBLIC_ORIGIN}/media/${cached}`;
    }
    const r = await fetchChecked(url);
    const type = r.headers.get("content-type")?.split(";")[0];
    const ext = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    }[type];
    if (!ext) throw Error("Unexpected image format");
    let bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD)
      throw Error("Image exceeds export size limit");
    downloads++;
    const small = await optimise(bytes, type, MAX_EDGE[variant]);
    const name = small ? `${sha(small)}.webp` : `${sha(bytes)}.${ext}`;
    await writeFile(`dist/media/${name}`, small ?? bytes);
    manifest[id] = name;
    return `${PUBLIC_ORIGIN}/media/${name}`;
  }

  site.profile.avatar_url = await image(site.profile.avatar_url, "avatar");
  site.theme.backgroundImage = await image(
    site.theme.backgroundImage,
    "background",
  );
  for (const link of site.links) {
    link.thumbnail = await image(link.thumbnail, "thumbnail");
    link.backgroundImage = await image(link.backgroundImage, "background");
  }
  await writeFile("dist/site.json", JSON.stringify(site));
  await writeFile(`dist/${MANIFEST}`, JSON.stringify(manifest));

  // Sharing crawlers also use a locally hosted image. Re-render only when content changed.
  const previousKey = await readFile(`${SNAPSHOT}/content-key`, "utf8").catch(
    () => "",
  );
  if (
    previousKey === contentKey &&
    (await exists(`${SNAPSHOT}/social-preview.png`))
  ) {
    await cp(`${SNAPSHOT}/social-preview.png`, "dist/social-preview.png");
    console.log("Sharing preview unchanged; reused cached copy.");
  } else {
    const preview = await fetchChecked(`${origin}/functions/v1/share-preview`);
    if (!preview.headers.get("content-type")?.startsWith("image/png"))
      throw Error("Invalid sharing preview");
    await writeFile(
      "dist/social-preview.png",
      Buffer.from(await preview.arrayBuffer()),
    );
  }
  console.log(
    `Media: ${downloads} downloaded from Supabase, ${reused} reused from cache.`,
  );

  await rm(SNAPSHOT, { recursive: true, force: true });
  await mkdir(SNAPSHOT, { recursive: true });
  for (const name of ["site.json", "media", "social-preview.png", MANIFEST])
    await cp(`dist/${name}`, `${SNAPSHOT}/${name}`, { recursive: true });
  await writeFile(`${SNAPSHOT}/content-key`, contentKey);
} catch (error) {
  console.warn(`Export failed (${error.message}).`);
  let backup = SNAPSHOT;
  let raw;
  try {
    raw = await readFile(`${backup}/site.json`, "utf8");
  } catch {
    backup = "public-backup";
    raw = await readFile(`${backup}/site.json`, "utf8");
  }
  const previous = JSON.parse(raw);
  if (!previous?.profile || !Array.isArray(previous.links))
    throw Error("Invalid backup snapshot");
  for (const name of ["site.json", "media", "social-preview.png"])
    await cp(`${backup}/${name}`, `dist/${name}`, { recursive: true });
  console.warn(
    "Supabase export unavailable; deploying the last successful public snapshot.",
  );
}

for (const file of [
  "dist/index.html",
  "dist/admin/index.html",
  "dist/404.html",
]) {
  try {
    const html = await readFile(file, "utf8");
    await writeFile(
      file,
      html.replaceAll(
        `${origin}/functions/v1/share-preview`,
        `${PUBLIC_ORIGIN}/social-preview.png`,
      ),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
