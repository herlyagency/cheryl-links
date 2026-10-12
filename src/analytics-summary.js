import { platformLabels, resolvePlatform } from "./social-platforms.js";
export function sourceLabel(source) {
  const value = String(source || "").trim();
  if (!value || /^(direct|unknown|direct \/ unknown)$/i.test(value))
    return "Direct / source unavailable";
  const normalized = value.toLowerCase().replace(/^www\./, "");
  const names = {
    instagram: "Instagram",
    "instagram.com": "Instagram",
    "l.instagram.com": "Instagram",
    tiktok: "TikTok",
    "tiktok.com": "TikTok",
    youtube: "YouTube",
    "youtube.com": "YouTube",
    twitter: "X / Twitter",
    "twitter.com": "X / Twitter",
    "t.co": "X / Twitter",
    facebook: "Facebook",
    "facebook.com": "Facebook",
    google: "Google",
    "google.com": "Google",
  };
  return Object.hasOwn(names, normalized) ? names[normalized] : value;
}
export function breakdown(
  events,
  field,
  format = (value) => value || "Unavailable",
) {
  const counts = new Map();
  for (const event of events) {
    const key = format(event[field]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
export function summarize(events, site) {
  const views = events.filter((e) => e.event_type === "page_view");
  const clicks = events.filter((e) => e.event_type === "link_click");
  const viewers = new Set(views.map((e) => e.visitor).filter(Boolean));
  const clickers = new Set(clicks.map((e) => e.visitor).filter(Boolean));
  const engaged = [...viewers].filter((id) => clickers.has(id)).length;
  const destinations = new Map(
    site.links.map((link) => [link.id, { ...link, kind: "Link card" }]),
  );
  for (const social of site.socials)
    destinations.set(social.id, {
      ...social,
      title:
        platformLabels[resolvePlatform(social.icon, social.url)] ||
        "Social icon",
      kind: "Social icon",
    });
  for (const click of clicks)
    if (!destinations.has(click.link_id))
      destinations.set(click.link_id, {
        id: click.link_id,
        title: "Removed link",
        kind: "Historical link",
        icon: "globe",
        url: "",
      });
  const ranked = [...destinations.values()]
    .map((link) => {
      const events = clicks.filter((e) => e.link_id === link.id);
      return {
        ...link,
        events,
        clicks: events.length,
        unique: new Set(events.map((e) => e.visitor).filter(Boolean)).size,
        share: clicks.length ? (events.length / clicks.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || a.title.localeCompare(b.title));
  return {
    views,
    clicks,
    visitors: viewers.size,
    engaged,
    engagement: viewers.size ? (engaged / viewers.size) * 100 : null,
    returning: new Set(
      views
        .filter((e) => e.returning)
        .map((e) => e.visitor)
        .filter(Boolean),
    ).size,
    ranked,
  };
}
export function previousRange(from, to) {
  const end = Date.parse(from),
    duration = Date.parse(to) - end;
  if (!Number.isFinite(duration) || duration <= 0)
    throw Error("Choose a valid date range.");
  return { from: new Date(end - duration).toISOString(), to: from };
}
export function changeLabel(current, previous) {
  if (previous == null) return "Comparison unavailable";
  if (!previous)
    return current ? "No activity in the earlier period" : "No change";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}% vs earlier period`;
}
