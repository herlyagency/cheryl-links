import { endpoint } from "./public-api";
import { attribution, deviceType } from "./model";
let session = "",
  pending = [],
  started = false;
export const enabled = Boolean(
  endpoint &&
  import.meta.env.VITE_ANALYTICS_ENABLED === "true" &&
  import.meta.env.VITE_TURNSTILE_SITE_KEY,
);
export function optedIn() {
  try {
    return localStorage.getItem("cheryl-analytics-consent") === "yes";
  } catch {
    return false;
  }
}
export function consent(value) {
  try {
    localStorage.setItem("cheryl-analytics-consent", value ? "yes" : "no");
  } catch {}
  if (!value) {
    session = "";
    pending = [];
    started = false;
    try {
      localStorage.removeItem("cheryl-visitor");
    } catch {}
  }
}
export async function startTracking(turnstileToken) {
  if (
    !enabled ||
    !optedIn() ||
    started ||
    navigator.globalPrivacyControl ||
    navigator.doNotTrack === "1"
  )
    return;
  started = true;
  let visitor;
  try {
    visitor = localStorage.getItem("cheryl-visitor") || crypto.randomUUID();
    localStorage.setItem("cheryl-visitor", visitor);
  } catch {
    visitor = crypto.randomUUID();
  }
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "session",
        token: turnstileToken,
        visitor,
        device: deviceType(navigator.userAgent),
        ...attribution(document.referrer, location.search),
      }),
      keepalive: true,
    });
    if (!r.ok) throw Error();
    session = (await r.json()).session;
    track("page_view");
    pending.splice(0).forEach((args) => track(...args));
  } catch {
    pending = [];
  }
}
export function track(type, linkId = null) {
  if (!enabled || !optedIn()) return;
  if (!session) {
    if (pending.length < 10 && type === "link_click")
      pending.push([type, linkId]);
    return;
  }
  const body = JSON.stringify({
    action: "event",
    session,
    event_id: crypto.randomUUID(),
    event_type: type,
    link_id: linkId,
  });
  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
