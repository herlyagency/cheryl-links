export const platformLabels = {
  auto: "Automatic (from link)",
  venmo: "Venmo",
  cashapp: "Cash App",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  kick: "Kick",
  threads: "Threads",
  bluesky: "Bluesky",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  discord: "Discord",
  telegram: "Telegram",
  reddit: "Reddit",
  spotify: "Spotify",
  patreon: "Patreon",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  twitch: "Twitch",
  mail: "Email",
  heart: "Support / favorite",
  globe: "Website",
};

const hosts = {
  "cash.app": "cashapp",
  "venmo.com": "venmo",
  "account.venmo.com": "venmo",
  "instagram.com": "instagram",
  "youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
  "tiktok.com": "tiktok",
  "x.com": "twitter",
  "twitter.com": "twitter",
  "kick.com": "kick",
  "threads.net": "threads",
  "threads.com": "threads",
  "bsky.app": "bluesky",
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "linkedin.com": "linkedin",
  "discord.com": "discord",
  "discord.gg": "discord",
  "t.me": "telegram",
  "telegram.me": "telegram",
  "reddit.com": "reddit",
  "redd.it": "reddit",
  "spotify.com": "spotify",
  "open.spotify.com": "spotify",
  "patreon.com": "patreon",
  "pinterest.com": "pinterest",
  "pin.it": "pinterest",
  "snapchat.com": "snapchat",
  "twitch.tv": "twitch",
};
export function normalizeAccountUrl(value) {
  const text = String(value || "").trim();
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]|$)/i.test(text)
    ? `https://${text}`
    : text;
}
export function resolvePlatform(icon, value) {
  if (icon && icon !== "auto" && Object.hasOwn(platformLabels, icon))
    return icon;
  try {
    const u = new URL(normalizeAccountUrl(value));
    if (u.username || u.password) return "globe";
    if (u.protocol === "mailto:") return "mail";
    if (!["https:", "http:"].includes(u.protocol)) return "globe";
    return hosts[u.hostname.toLowerCase().replace(/^www\./, "")] || "globe";
  } catch {
    return "globe";
  }
}
export function isPaymentPlatform(icon, url) {
  return ["cashapp", "venmo"].includes(resolvePlatform(icon, url));
}
