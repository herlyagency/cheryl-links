import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import decodeWebp, {
  init as initWebp,
} from "npm:@jsquash/webp@1.5.0/decode.js";
import { decodeAvatar } from "./decode.js";
import { avatarDestination, renderPreview } from "./render.js";

let webpReady: Promise<void> | undefined;
async function webp(bytes: ArrayBuffer) {
  webpReady ??= (async () => {
    const response = await fetch(
      "https://cdn.jsdelivr.net/npm/@jsquash/webp@1.5.0/codec/dec/webp_dec.wasm",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw Error("WebP decoder unavailable");
    await initWebp(await WebAssembly.compile(await response.arrayBuffer()));
  })();
  try {
    await webpReady;
  } catch (error) {
    webpReady = undefined;
    throw error;
  }
  return decodeWebp(bytes);
}
let cached: { bytes: Uint8Array; until: number } | undefined;
Deno.serve(async (request) => {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  try {
    if (!cached || cached.until < Date.now()) {
      const base = Deno.env.get("SUPABASE_URL")!;
      const key = Deno.env.get("SUPABASE_ANON_KEY")!;
      const response = await fetch(`${base}/rest/v1/rpc/get_public_site`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw Error("Published profile unavailable");
      const site = await response.json();
      if (!site?.profile) throw Error("No published profile");
      const url = avatarDestination(site.profile.avatar_url, base);
      const photo = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (
        !photo.ok ||
        Number(photo.headers.get("content-length")) > 3 * 1024 * 1024
      )
        throw Error("Photo unavailable");
      const body = new Uint8Array(await photo.arrayBuffer());
      if (body.length > 3 * 1024 * 1024) throw Error("Photo too large");
      const type = photo.headers.get("content-type") || "";
      const avatar = await decodeAvatar(Image, body, type, webp);
      if (avatar.width > 4096 || avatar.height > 4096)
        throw Error("Photo dimensions too large");
      cached = {
        bytes: await renderPreview(Image, site, avatar),
        until: Date.now() + 60000,
      };
    }
    return new Response(request.method === "HEAD" ? null : cached.bytes, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Sharing preview unavailable:", error.message);
    return Response.redirect("https://cherylxxw.com/social-preview.png", 302);
  }
});
