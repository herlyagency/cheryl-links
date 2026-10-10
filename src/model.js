export const presets = {
  "Minimal Light": {
    background: "#faf7f2",
    backgroundEnd: "#faf7f2",
    gradient: false,
    text: "#302e2a",
    card: "#ffffff",
    accent: "#c74f36",
    radius: 18,
    gap: 12,
    width: 480,
    shadow: 1,
    font: "serif",
    align: "center",
    avatarSize: 96,
    mode: "light",
    backgroundImage: "",
  },
  "Minimal Dark": {
    background: "#171a19",
    backgroundEnd: "#171a19",
    gradient: false,
    text: "#f5f1e8",
    card: "#272c29",
    accent: "#e99f7e",
    radius: 18,
    gap: 12,
    width: 480,
    shadow: 0,
    font: "sans",
    align: "center",
    avatarSize: 96,
    mode: "dark",
    backgroundImage: "",
  },
  "Soft Pastel": {
    background: "#f6edf0",
    backgroundEnd: "#e5eddf",
    gradient: true,
    text: "#453440",
    card: "#fffafc",
    accent: "#985479",
    radius: 24,
    gap: 14,
    width: 480,
    shadow: 1,
    font: "serif",
    align: "center",
    avatarSize: 96,
    mode: "light",
    backgroundImage: "",
  },
  "Modern Gradient": {
    background: "#e4ecf5",
    backgroundEnd: "#f1e6dd",
    gradient: true,
    text: "#253447",
    card: "#ffffff",
    accent: "#345d94",
    radius: 14,
    gap: 12,
    width: 480,
    shadow: 2,
    font: "sans",
    align: "center",
    avatarSize: 96,
    mode: "light",
    backgroundImage: "",
  },
};
export const sample = {
  profile: {
    display_name: "Cheryl",
    username: "cherylxxw",
    bio: "A little bit of everything.\nCreating, exploring & sharing the everyday.",
    avatar_url: "/avatar.svg",
    badge: true,
    footer: "Made with a little love.",
    share: true,
  },
  theme: { ...presets["Minimal Light"] },
  socials: [
    {
      id: "16666666-6666-4666-8666-666666666666",
      icon: "instagram",
      url: "https://instagram.com/",
      active: true,
    },
    {
      id: "26666666-6666-4666-8666-666666666666",
      icon: "tiktok",
      url: "https://tiktok.com/",
      active: true,
    },
    {
      id: "36666666-6666-4666-8666-666666666666",
      icon: "youtube",
      url: "https://youtube.com/",
      active: true,
    },
    {
      id: "46666666-6666-4666-8666-666666666666",
      icon: "mail",
      url: "mailto:hello@example.com",
      active: true,
    },
  ],
  links: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "The latest on YouTube",
      description: "New videos, fresh perspectives.",
      url: "https://youtube.com/",
      icon: "youtube",
      active: true,
      featured: true,
      background: "#e3ebde",
      text: "#29382c",
      start: "",
      end: "",
      thumbnail: "",
      backgroundImage: "",
      border: "",
      radius: null,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Life lately",
      description: "The moments between the moments.",
      url: "https://instagram.com/",
      icon: "instagram",
      active: true,
      featured: false,
      background: "",
      text: "",
      start: "",
      end: "",
      thumbnail: "",
      backgroundImage: "",
      border: "",
      radius: null,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      title: "Come hang out on TikTok",
      description: "A little less curated. A lot more me.",
      url: "https://tiktok.com/",
      icon: "tiktok",
      active: true,
      featured: false,
      background: "",
      text: "",
      start: "",
      end: "",
      thumbnail: "",
      backgroundImage: "",
      border: "",
      radius: null,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      title: "My favorite things",
      description: "Things I use, love, and keep coming back to.",
      url: "https://example.com/",
      icon: "heart",
      active: true,
      featured: false,
      background: "",
      text: "",
      start: "",
      end: "",
      thumbnail: "",
      backgroundImage: "",
      border: "",
      radius: null,
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      title: "Let’s make something together",
      description: "Collaborations & business inquiries.",
      url: "mailto:hello@example.com",
      icon: "mail",
      active: true,
      featured: false,
      background: "",
      text: "",
      start: "",
      end: "",
      thumbnail: "",
      backgroundImage: "",
      border: "",
      radius: null,
    },
  ],
};
export function safeUrl(value, image = false) {
  if (/[\s"'<>\\]/.test(value || "")) return "";
  if (image && /^\/(?!\/)[a-zA-Z0-9/_.-]+$/.test(value || "")) return value;
  try {
    const u = new URL(value);
    return (image
      ? ["https:"]
      : ["https:", "http:", "mailto:", "tel:"]
    ).includes(u.protocol)
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function visible(link, now = Date.now()) {
  return (
    link.active &&
    (!link.start || Date.parse(link.start) <= now) &&
    (!link.end || Date.parse(link.end) > now)
  );
}
export function validateSite(site) {
  if (
    !site ||
    !site.profile ||
    !site.theme ||
    !Array.isArray(site.links) ||
    !Array.isArray(site.socials)
  )
    throw Error("Invalid site configuration.");
  if (!site.profile.display_name.trim()) throw Error("Add a display name.");
  if (site.links.length > 50 || site.socials.length > 12)
    throw Error("Use at most 50 links and 12 social icons.");
  for (const [key, min, max] of [
    ["radius", 0, 40],
    ["gap", 8, 28],
    ["width", 320, 620],
    ["shadow", 0, 2],
    ["avatarSize", 64, 160],
  ]) {
    if (
      !Number.isFinite(site.theme[key]) ||
      site.theme[key] < min ||
      site.theme[key] > max
    )
      throw Error("Theme dimensions are outside the supported range.");
  }
  for (const key of ["background", "backgroundEnd", "text", "card", "accent"])
    if (!/^#[0-9a-fA-F]{6}$/.test(site.theme[key]))
      throw Error("Use six-digit hex theme colors.");
  for (const image of [
    site.profile.avatar_url,
    site.theme.backgroundImage,
    ...site.links.flatMap((l) => [l.thumbnail, l.backgroundImage]),
  ])
    if (image && !safeUrl(image, true))
      throw Error("Images need a secure https URL or a bundled image path.");
  for (const l of site.links)
    for (const key of ["background", "text", "border"])
      if (l[key] && !/^#[0-9a-fA-F]{6}$/.test(l[key]))
        throw Error(
          "Link colors need six-digit hex codes, or leave them blank.",
        );
  for (const l of [...site.links, ...site.socials]) {
    if (!safeUrl(l.url))
      throw Error(
        "Every destination needs a valid https, http, mailto, or tel URL.",
      );
  }
  for (const l of site.links) {
    if (!l.title.trim()) throw Error("Every link needs a title.");
    if (
      (l.start && !Number.isFinite(Date.parse(l.start))) ||
      (l.end && !Number.isFinite(Date.parse(l.end)))
    )
      throw Error("Invalid schedule date.");
    if (l.start && l.end && Date.parse(l.end) <= Date.parse(l.start))
      throw Error("Expiration must be after the start date.");
  }
  return site;
}
export function attribution(referrer, search) {
  const p = new URLSearchParams(search);
  let host = "";
  try {
    host = new URL(referrer).hostname;
  } catch {}
  return {
    source: (p.get("utm_source") || host || "Direct / unknown").slice(0, 100),
    medium: (p.get("utm_medium") || "").slice(0, 100),
    campaign: (p.get("utm_campaign") || "").slice(0, 100),
    referrer: host,
  };
}
export function deviceType(ua) {
  return /iPad|Tablet|Android(?!.*Mobile)/i.test(ua)
    ? "tablet"
    : /Mobile|iPhone/i.test(ua)
      ? "mobile"
      : "desktop";
}
export function rangeDates(filter, start, end, now = new Date()) {
  const to = new Date(now);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (filter === "Yesterday") {
    from.setDate(from.getDate() - 1);
    to.setTime(from.getTime());
    to.setDate(to.getDate() + 1);
  } else if (filter === "Custom") {
    return {
      from: new Date(start + "T00:00:00").toISOString(),
      to: new Date(
        new Date(end + "T00:00:00").setDate(
          new Date(end + "T00:00:00").getDate() + 1,
        ),
      ).toISOString(),
    };
  } else if (filter !== "Today") {
    from.setDate(from.getDate() - (Number(filter.split(" ")[1]) - 1));
  }
  return { from: from.toISOString(), to: to.toISOString() };
}
export function csv(rows) {
  return rows
    .map((row) =>
      row
        .map((v) => {
          let s = String(v ?? "");
          if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
