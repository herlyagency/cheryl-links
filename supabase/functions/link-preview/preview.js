// Only fetch these trusted public publishers. No arbitrary URL proxy or redirects to private hosts.
const publishers = new Set([
  "withrose.com",
  "www.withrose.com",
  "vimeo.com",
  "www.vimeo.com",
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
]);
export function allowedPreviewUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.port &&
      !u.username &&
      !u.password &&
      publishers.has(u.hostname)
      ? u
      : null;
  } catch {
    return null;
  }
}
function decode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => {
      const code =
        n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}
export function previewImage(html, base) {
  const found = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const match of tag.matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    ))
      attrs[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
    const property = (attrs.property || attrs.name || "").toLowerCase();
    if (
      ["og:image", "og:image:secure_url", "twitter:image"].includes(property) &&
      !found[property]
    )
      found[property] = attrs.content;
  }
  for (const key of ["og:image:secure_url", "og:image", "twitter:image"]) {
    try {
      const u = new URL(found[key], base);
      if (
        found[key] &&
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        u.href.length <= 2000 &&
        !/["'<>\\\s]/.test(u.href)
      )
        return u.href;
    } catch {}
  }
  return null;
}
export async function fetchPreview(value, fetcher = fetch) {
  let url = allowedPreviewUrl(value);
  if (!url) throw Error("Unsupported preview publisher");
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetcher(url.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "text/html" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      const next = location && allowedPreviewUrl(new URL(location, url).href);
      if (!next) throw Error("Unsafe preview redirect");
      url = next;
      continue;
    }
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html")
    ) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = "",
      bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 262144) break;
        html += decoder.decode(part.value, { stream: true });
        if (/<\/head\s*>/i.test(html)) break;
      }
    } finally {
      await reader.cancel();
    }
    return previewImage(html, url.href);
  }
  throw Error("Too many redirects");
}

// Arbitrary destinations are resolved by a metadata service, never fetched by our server.
export function publicPreviewUrl(value) {
  try {
    const u = new URL(value);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port ||
      !u.hostname.includes(".") ||
      u.hostname.endsWith(".local") ||
      u.hostname.endsWith(".internal") ||
      /^[\d.]+$/.test(u.hostname) ||
      u.hostname.includes(":")
    )
      return null;
    return u;
  } catch {
    return null;
  }
}
export async function fetchRichPreview(value, fetcher = fetch) {
  const url = publicPreviewUrl(value);
  if (!url) throw Error("Unsupported preview URL");
  if (allowedPreviewUrl(value)) {
    try {
      const image = await fetchPreview(value, fetcher);
      if (image) return { image };
    } catch {
      /* Try the metadata provider when a publisher blocks direct fetching. */
    }
  }
  const endpoint = new URL("https://api.microlink.io/");
  endpoint.searchParams.set("url", url.href);
  const response = await fetcher(endpoint.href, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error("Preview service unavailable or daily limit reached");
  const result = await response.json();
  if (result.status !== "success") throw Error("Preview unavailable");
  const data = result.data || {};
  const imageUrl = publicPreviewUrl(data.image?.url || data.logo?.url);
  return {
    image: imageUrl?.protocol === "https:" ? imageUrl.href : null,
    title: typeof data.title === "string" ? data.title.slice(0, 100) : "",
    description:
      typeof data.description === "string"
        ? data.description.slice(0, 180)
        : "",
  };
}
