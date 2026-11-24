import { LIVE_LINK_ID } from "../supabase/functions/_shared/youtube-live.js";
import {
  platformLabels,
  resolvePlatform,
  isPaymentPlatform,
} from "./social-platforms.js";

const SOURCE_NAMES = {
  instagram: "Instagram",
  "instagram.com": "Instagram",
  "l.instagram.com": "Instagram",
  "lm.instagram.com": "Instagram",
  tiktok: "TikTok",
  "tiktok.com": "TikTok",
  youtube: "YouTube",
  "youtube.com": "YouTube",
  "m.youtube.com": "YouTube",
  twitter: "X",
  x: "X",
  "x.com": "X",
  "twitter.com": "X",
  "t.co": "X",
  "com.twitter.android": "X",
  facebook: "Facebook",
  "facebook.com": "Facebook",
  "m.facebook.com": "Facebook",
  "l.facebook.com": "Facebook",
  "lm.facebook.com": "Facebook",
  snapchat: "Snapchat",
  "snapchat.com": "Snapchat",
  google: "Google",
  "google.com": "Google",
  "com.google.android.gm": "Gmail",
  "com.google.android.googlequicksearchbox": "Google",
  googlequicksearchbox: "Google",
  "com.google.android.apps.searchlite": "Google",
  "com.instagram.android": "Instagram",
  "com.facebook.katana": "Facebook",
  "com.zhiliaoapp.musically": "TikTok",
  "com.snapchat.android": "Snapchat",
  "com.reddit.frontpage": "Reddit",
  linkedin: "LinkedIn",
  "linkedin.com": "LinkedIn",
  reddit: "Reddit",
  "reddit.com": "Reddit",
  "link.me": "Linkme",
  qr: "QR code",
};
export const DIRECT = "Direct / unknown";
const OWN_HOSTS = new Set(["cherylxxw.com"]);
export function sourceLabel(source) {
  const value = String(source || "").trim();
  if (!value || /^(direct|unknown|direct \/ unknown)$/i.test(value))
    return DIRECT;
  const normalized = value.toLowerCase().replace(/^www\./, "");
  // Arriving from Cheryl's own site (reloads, internal links) is not a traffic source.
  if (OWN_HOSTS.has(normalized)) return DIRECT;
  return Object.hasOwn(SOURCE_NAMES, normalized)
    ? SOURCE_NAMES[normalized]
    : value;
}

// Colour follows the source, never its rank. Three validated hues for the most common
// bio-link sources; everything else shares a neutral grey and is told apart by its label.
const SOURCE_COLORS = { Instagram: "#eb6834", TikTok: "#1baf7a", X: "#2a78d6" };
export const OTHER_COLOR = "#a8a59d";
export const DIRECT_COLOR = "#d6d3cb";
export function sourceColor(label) {
  if (label === DIRECT) return DIRECT_COLOR;
  return Object.hasOwn(SOURCE_COLORS, label)
    ? SOURCE_COLORS[label]
    : OTHER_COLOR;
}

/** Merge rows whose raw source maps to the same label (e.g. "t.co" and "twitter"). */
export function sourceRows(rows = []) {
  const merged = new Map();
  for (const row of rows) {
    const label = sourceLabel(row.source);
    const current = merged.get(label) || { label, count: 0, hosts: new Map() };
    current.count += row.count;
    if (row.host)
      current.hosts.set(
        row.host,
        (current.hosts.get(row.host) || 0) + row.count,
      );
    merged.set(label, current);
  }
  return [...merged.values()]
    .map(({ hosts, ...row }) => ({
      ...row,
      host:
        row.label === DIRECT
          ? ""
          : [...hosts].sort((a, b) => b[1] - a[1])[0]?.[0] || "",
      color: sourceColor(row.label),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Join per-destination aggregates with the site's links and socials.
 * group: "social" | "payment" | "live" | "link" | "removed".
 */
export function destinations(rows = [], site, totalClicks = 0) {
  const stats = new Map(rows.map((row) => [row.id, row]));
  const list = [];
  for (const link of site.links)
    if (link.id !== LIVE_LINK_ID)
      list.push({ ...link, kind: "Link card", group: "link" });
  for (const social of site.socials) {
    const platform = resolvePlatform(social.icon, social.url);
    list.push({
      ...social,
      title: platformLabels[platform] || "Social icon",
      kind: "Social icon",
      group: isPaymentPlatform(social.icon, social.url) ? "payment" : "social",
    });
  }
  if (stats.has(LIVE_LINK_ID))
    list.push({
      id: LIVE_LINK_ID,
      title: "Watch Cheryl live",
      kind: "Live stream",
      group: "live",
      icon: "youtube",
      url: "https://www.youtube.com/@Cherylxxw/live",
    });
  const known = new Set(list.map((d) => d.id));
  for (const row of rows)
    if (!known.has(row.id))
      list.push({
        id: row.id,
        title: "Removed link",
        kind: "Removed link",
        group: "removed",
        icon: "globe",
        url: "",
      });
  return list
    .map((d) => {
      const s = stats.get(d.id);
      const clicks = s?.clicks || 0;
      return {
        ...d,
        clicks,
        unique: s?.unique || 0,
        share: totalClicks ? (clicks / totalClicks) * 100 : 0,
        series: s?.series || [],
        sources: s?.sources || [],
        devices: s?.devices || [],
      };
    })
    .sort((a, b) => b.clicks - a.clicks || a.title.localeCompare(b.title));
}

export function previousRange(from, to) {
  const end = Date.parse(from),
    duration = Date.parse(to) - end;
  if (!Number.isFinite(duration) || duration <= 0)
    throw Error("Choose a valid date range.");
  return { from: new Date(end - duration).toISOString(), to: from };
}
/** Percent change, or null when there is nothing to compare against. */
export function change(current, previous) {
  if (previous == null || current == null) return null;
  if (!previous) return current ? Infinity : 0;
  return ((current - previous) / previous) * 100;
}
