const encoder = new TextEncoder();
function base64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function unbase64(s) {
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) throw Error("Invalid token");
  return Uint8Array.from(
    atob(s.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
async function key(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function hash(value, secret) {
  return base64(
    await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(value)),
  );
}
export async function signSession(payload, secret) {
  const data = base64(encoder.encode(JSON.stringify(payload)));
  return data + "." + (await hash(data, secret));
}
export async function verifySession(token, secret, now = Date.now()) {
  try {
    if (typeof token !== "string" || token.length > 2500) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      unbase64(sig),
      encoder.encode(data),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(unbase64(data)));
    return Number.isInteger(payload.expires) &&
      payload.expires > now &&
      payload.expires <= now + 3600000
      ? payload
      : null;
  } catch {
    return null;
  }
}
export const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
export { LIVE_LINK_ID } from "../_shared/youtube-live.js";
const int = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;
export function validEvent(data) {
  if (!uuid(data.event_id)) return false;
  switch (data.event_type) {
    case "page_view":
    case "share":
      return data.link_id == null;
    case "link_click":
      return uuid(data.link_id);
    case "engagement":
      return (
        data.link_id == null &&
        int(data.duration, 0, 1800) &&
        int(data.scroll, 0, 100)
      );
    default:
      return false;
  }
}
/** A UUID-shaped ID derived from an HMAC, so it fits the visitor column. */
export function hashUuid(hashed) {
  const hex = [...unbase64(hashed)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${"89ab"[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
/** Coarse operating system and in-app browser, parsed from the User-Agent. */
export function platform(ua = "") {
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  const app = /Instagram/.test(ua)
    ? "Instagram"
    : /FBAN|FBAV|FB_IAB/.test(ua)
      ? "Facebook"
      : /musical_ly|BytedanceWebview|TikTok/i.test(ua)
        ? "TikTok"
        : /Snapchat/.test(ua)
          ? "Snapchat"
          : /Twitter/.test(ua)
            ? "X"
            : /LinkedInApp/.test(ua)
              ? "LinkedIn"
              : /Edg\//.test(ua)
                ? "Edge"
                : /SamsungBrowser/.test(ua)
                  ? "Samsung Internet"
                  : /Firefox|FxiOS/.test(ua)
                    ? "Firefox"
                    : /CriOS|Chrome\//.test(ua)
                      ? "Chrome"
                      : /Safari\//.test(ua)
                        ? "Safari"
                        : "";
  return { os, app };
}
/** Trusted geography: a shared-secret proxy (Cloudflare Worker) or Cloudflare's own country header. */
export function geography(headers, proxySecret = "") {
  const proxied = Boolean(
    proxySecret && headers.get("x-geo-secret") === proxySecret,
  );
  const raw = proxied
    ? headers.get("x-geo-country")
    : headers.get("cf-ipcountry");
  const country =
    raw && /^[A-Z]{2}$/.test(raw) && !["XX", "T1"].includes(raw) ? raw : null;
  let city = null;
  if (proxied && country) {
    try {
      city =
        clean(decodeURIComponent(headers.get("x-geo-city") || ""), 80) || null;
    } catch {}
  }
  const ip = proxied
    ? headers.get("x-client-ip") || "unknown"
    : headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  return { country, city, ip, proxied };
}
export function clean(value, length = 100) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f]/g, "").slice(0, length)
    : "";
}
