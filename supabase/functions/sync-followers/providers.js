export function countValue(value) {
  if (
    value == null ||
    value === "" ||
    !["string", "number"].includes(typeof value)
  )
    throw Error("Count unavailable");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw Error("Count unavailable");
  return n;
}
export function combinedTotal(accounts) {
  const counts = accounts.filter(
    (a) => Number.isSafeInteger(a.count) && a.count >= 0,
  );
  return counts.length ? counts.reduce((sum, a) => sum + a.count, 0) : null;
}
export async function providerCount(platform, config, fetcher = fetch) {
  let url,
    headers = {};
  if (platform === "youtube") {
    url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.search = new URLSearchParams({
      part: "statistics",
      id: config.id,
      key: config.token,
    }).toString();
  } else if (platform === "instagram") {
    if (!/^[0-9]+$/.test(config.id))
      throw Error("Invalid Instagram account ID");
    // Instagram professional account ID and Facebook Graph API access token.
    url = new URL(`https://graph.facebook.com/v24.0/${config.id}`);
    url.searchParams.set("fields", "followers_count");
    headers = { Authorization: `Bearer ${config.token}` };
  } else if (platform === "tiktok") {
    url = new URL(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,follower_count",
    );
    headers = { Authorization: `Bearer ${config.token}` };
  } else throw Error("Unknown platform");
  const response = await fetcher(url.href, {
    headers,
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!response.ok) throw Error("Account connection needs attention");
  const data = await response.json();
  if (platform === "youtube") {
    const account = data.items?.find((a) => a.id === config.id);
    if (!account || account.statistics?.hiddenSubscriberCount)
      throw Error("Count hidden or account unavailable");
    return countValue(account.statistics.subscriberCount);
  }
  if (platform === "instagram") {
    if (data.error) throw Error("Account connection needs attention");
    return countValue(data.followers_count);
  }
  if (data.error?.code !== "ok" || data.data?.user?.open_id !== config.id)
    throw Error("Account connection needs attention");
  return countValue(data.data.user.follower_count);
}
