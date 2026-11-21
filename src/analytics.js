import { endpoint } from "./public-api";
import { attribution, deviceType } from "./model";

// Cookieless by default: nothing is stored in the browser, and the server derives an
// ID that only lasts one day. "Remember this device" (opt-in) adds a stored random ID
// so returning visitors can be recognised across days.
const REMEMBER_KEY = "cheryl-analytics-consent";
const VISITOR_KEY = "cheryl-visitor";
let session = "",
  pending = [],
  starting = false,
  renew = null,
  renewed = false;

export const enabled = Boolean(
  endpoint &&
  import.meta.env.VITE_ANALYTICS_ENABLED === "true" &&
  import.meta.env.VITE_TURNSTILE_SITE_KEY,
);
export const blocked = () =>
  typeof navigator !== "undefined" &&
  (Boolean(navigator.globalPrivacyControl) || navigator.doNotTrack === "1");

export function remembered() {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "yes";
  } catch {
    return false;
  }
}
export function remember(value) {
  try {
    localStorage.setItem(REMEMBER_KEY, value ? "yes" : "no");
    if (!value) localStorage.removeItem(VISITOR_KEY);
  } catch {}
}
/** The Turnstile widget registers how to get a fresh token when a session expires. */
export function onRenew(fn) {
  renew = fn;
}

function storedVisitor() {
  if (!remembered()) return undefined;
  try {
    const visitor = localStorage.getItem(VISITOR_KEY) || crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, visitor);
    return visitor;
  } catch {
    return undefined;
  }
}

function post(body) {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

export async function startTracking(turnstileToken) {
  // Turnstile re-fires its callback when it refreshes a token; one session per page is enough.
  if (!enabled || blocked() || starting || session) return;
  const first = !session && !renewed;
  starting = true;
  try {
    const r = await post({
      action: "session",
      token: turnstileToken,
      visitor: storedVisitor(),
      device: deviceType(navigator.userAgent, navigator.maxTouchPoints || 0),
      lang: (navigator.language || "").split("-")[0].toLowerCase(),
      ...attribution(document.referrer, location.search, navigator.userAgent),
    });
    if (!r.ok) throw Error();
    session = (await r.json()).session;
    if (first) track("page_view");
    pending.splice(0).forEach((args) => track(...args));
  } catch {
    pending = [];
  } finally {
    starting = false;
  }
}

export function track(type, linkId = null, extra = {}) {
  if (!enabled || blocked()) return;
  if (!session) {
    if (pending.length < 20 && type !== "page_view")
      pending.push([type, linkId, extra]);
    return;
  }
  const event = [type, linkId, extra];
  post({
    action: "event",
    session,
    event_id: crypto.randomUUID(),
    event_type: type,
    link_id: linkId,
    ...extra,
  })
    .then((r) => {
      // Signed sessions last 30 minutes. Renew once with a fresh Turnstile token.
      if (r.status === 403 && renew && !renewed) {
        renewed = true;
        session = "";
        pending.push(event);
        renew();
      }
    })
    .catch(() => {});
}

/** Engaged time (only while the page is visible) and deepest scroll, sent in increments. */
export function trackEngagement() {
  if (!enabled || blocked()) return () => {};
  let visibleSince = document.hidden ? 0 : Date.now();
  let carried = 0,
    total = 0,
    deepest = 0;
  const measure = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.round((window.scrollY / max) * 100) : 100;
    deepest = Math.max(deepest, Math.min(100, Math.max(0, pct)));
  };
  const flush = () => {
    if (visibleSince) carried += (Date.now() - visibleSince) / 1000;
    visibleSince = 0;
    const seconds = Math.min(Math.round(carried), 1800 - total);
    if (seconds >= 1) {
      total += seconds;
      carried = 0;
      track("engagement", null, { duration: seconds, scroll: deepest });
    }
  };
  const visibility = () => {
    if (document.hidden) flush();
    else visibleSince = Date.now();
  };
  measure();
  window.addEventListener("scroll", measure, { passive: true });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", flush);
  return () => {
    window.removeEventListener("scroll", measure);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", flush);
  };
}
