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
export function validEvent(data) {
  return (
    uuid(data.event_id) &&
    ((data.event_type === "page_view" && data.link_id == null) ||
      (data.event_type === "link_click" && uuid(data.link_id)))
  );
}
export function clean(value, length = 100) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f]/g, "").slice(0, length)
    : "";
}
