export const LIVE_LINK_ID = "cc11aa22-bb33-4dd4-8ee5-ff6677889900";
export const CHANNEL_ID = "UCyw6EaI4Z6ey_OrFrVtpczA";
export const CHANNEL_URL = "https://www.youtube.com/@Cherylxxw";
export function liveUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return "";
    if (["youtube.com", "www.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/@Cherylxxw/live") return `${CHANNEL_URL}/live`;
      if (
        url.pathname === "/watch" &&
        /^[\w-]{11}$/.test(url.searchParams.get("v") || "")
      )
        return `https://www.youtube.com/watch?v=${url.searchParams.get("v")}`;
    }
    if (url.hostname === "youtu.be" && /^\/[\w-]{11}$/.test(url.pathname))
      return `https://www.youtube.com/watch?v=${url.pathname.slice(1)}`;
  } catch {}
  return "";
}
export function activeBroadcast(data) {
  if (!Array.isArray(data?.items)) throw Error("Invalid YouTube response");
  const item = data.items.find(
    (item) =>
      item.snippet?.channelId === CHANNEL_ID &&
      item.status?.lifeCycleStatus === "live" &&
      item.status?.privacyStatus === "public" &&
      /^[\w-]{11}$/.test(item.id),
  );
  return item
    ? {
        status: "live",
        url: `https://www.youtube.com/watch?v=${item.id}`,
        title: String(item.snippet.title || "Watch Cheryl live").slice(0, 120),
        thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
      }
    : { status: "offline" };
}
export function visibleLive(profile, result, now = Date.now()) {
  if (profile.liveMode === "off") return null;
  if (profile.liveMode === "manual") {
    const url = liveUrl(profile.liveUrl);
    return url
      ? { status: "live", url, title: "Watch Cheryl live", manual: true }
      : null;
  }
  const age = now - Date.parse(result?.checkedAt);
  return result?.status === "live" &&
    age >= -60000 &&
    age < 360000 &&
    liveUrl(result.url)
    ? { ...result, url: liveUrl(result.url) }
    : null;
}
