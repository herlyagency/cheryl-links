import {
  hash,
  hashUuid,
  signSession,
  verifySession,
  uuid,
  validEvent,
  clean,
  platform,
  geography,
  LIVE_LINK_ID,
} from "./security.js";

// Daily caps protect the free tier from abuse; they are sized well above real traffic
// (Linkme reported ~900 interactions/day at peak) and every refusal is counted as "dropped".
export const LIMITS = {
  globalRequestsPerDay: 60000,
  globalSessionsPerDay: 20000,
  // Mobile carriers put many people behind one IP (CGNAT), so per-IP limits stay generous.
  ipRequestsPerMinute: 300,
  ipSessionsPerHour: 120,
  visitorEventsPerMinute: 60,
  engagementPerSession: 20,
};

export function createCollector({
  supabase,
  secret,
  turnstileSecret,
  origins,
  geoProxySecret = "",
}: {
  supabase: any;
  secret: string;
  turnstileSecret: string;
  origins: string[];
  geoProxySecret?: string;
}) {
  const minute = () =>
    new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  const hour = () =>
    new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
  const day = () => new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  async function budget(key: string, bucket: string, limit: number) {
    const { data, error } = await supabase.rpc("take_budget", {
      p_key: key,
      p_bucket: bucket,
      p_limit: limit,
    });
    if (error) throw Error("Budget unavailable");
    return data === true;
  }
  // Count refusals that lose real data, so the dashboard can warn about undercounting.
  const dropped = () => budget("dropped", day(), 2147483647).catch(() => {});
  return async (req: Request) => {
    const origin = req.headers.get("origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      Vary: "Origin",
      "Cache-Control": "no-store",
      "Access-Control-Max-Age": "3600",
    };
    const respond = (status: number, data: unknown = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    if (!origins.includes(origin)) return respond(403);
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return respond(405);
    if (secret.length < 32 || !turnstileSecret)
      return respond(503, { error: "Collector is not configured" });
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      return respond(415);
    if (Number(req.headers.get("content-length") || 0) > 4096)
      return respond(413);
    try {
      // Bound the body even if content-length is omitted.
      const reader = req.body?.getReader();
      if (!reader) return respond(400);
      let total = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 4096) {
          await reader.cancel();
          return respond(413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let pos = 0;
      for (const c of chunks) {
        bytes.set(c, pos);
        pos += c.length;
      }
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!data || typeof data !== "object") return respond(400);
      // The IP is never stored. It only feeds keyed hashes that rotate daily.
      const geo = geography(req.headers, geoProxySecret);
      const ipKey = await hash(geo.ip + "|" + day(), secret);
      if (
        !(await budget("global-requests", day(), LIMITS.globalRequestsPerDay))
      ) {
        await dropped();
        return respond(429);
      }
      if (!(await budget("ip:" + ipKey, minute(), LIMITS.ipRequestsPerMinute)))
        return respond(429);
      if (data.action === "session") {
        const remember = data.visitor != null;
        if (
          (remember && !uuid(data.visitor)) ||
          typeof data.token !== "string" ||
          data.token.length > 2048
        )
          return respond(400);
        if (
          !(await budget("sessions:" + ipKey, hour(), LIMITS.ipSessionsPerHour))
        )
          return respond(429);
        if (
          !(await budget("global-sessions", day(), LIMITS.globalSessionsPerDay))
        ) {
          await dropped();
          return respond(429);
        }
        const verification = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            body: new URLSearchParams({
              secret: turnstileSecret,
              response: data.token,
            }),
            signal: AbortSignal.timeout(6000),
          },
        );
        if (!verification.ok) return respond(503);
        const result = await verification.json();
        if (
          !result.success ||
          !origins.some((o) => new URL(o).hostname === result.hostname)
        )
          return respond(403);
        const ua = req.headers.get("user-agent") || "";
        // Cookieless by default: a visitor ID that only lives for one UTC day and
        // cannot be reversed to an IP. A stored browser UUID is used only after opt-in.
        const visitor = remember
          ? data.visitor
          : hashUuid(await hash(`visitor|${day()}|${geo.ip}|${ua}`, secret));
        const source = clean(data.source) || "Direct / unknown",
          device = ["mobile", "tablet", "desktop"].includes(data.device)
            ? data.device
            : "desktop";
        // Referrers are hosts only: never save paths, queries, or fragments.
        const referrer =
          typeof data.referrer === "string" &&
          /^[a-z0-9.-]+$/i.test(data.referrer)
            ? clean(data.referrer, 200)
            : "";
        const plat = platform(ua);
        // iPadOS Safari reports itself as a Mac; the client's touch check marks it as a tablet.
        if (device === "tablet" && plat.os === "macOS") plat.os = "iPadOS";
        const lang =
          typeof data.lang === "string" && /^[a-z]{2,3}$/.test(data.lang)
            ? data.lang
            : "";
        const session = await signSession(
          {
            visitor,
            identity: remember ? "persistent" : "daily",
            source,
            medium: clean(data.medium),
            campaign: clean(data.campaign),
            referrer,
            device,
            lang,
            ...plat,
            country: geo.country,
            city: geo.city,
            expires: Date.now() + 1800000,
            nonce: crypto.randomUUID(),
          },
          secret,
        );
        return respond(200, { session });
      }
      if (data.action !== "event" || !validEvent(data)) return respond(400);
      const session = await verifySession(data.session, secret);
      if (!session) return respond(403);
      if (
        !(await budget(
          "visitor:" + session.visitor,
          minute(),
          LIMITS.visitorEventsPerMinute,
        ))
      )
        return respond(429);
      // One page view per signed session, including refresh duplicate suppression at the request layer.
      if (
        data.event_type === "page_view" &&
        !(await budget("page:" + session.nonce, hour(), 1))
      )
        return new Response(null, { status: 204, headers: cors });
      if (
        data.event_type === "engagement" &&
        !(await budget(
          "engagement:" + session.nonce,
          hour(),
          LIMITS.engagementPerSession,
        ))
      )
        return new Response(null, { status: 204, headers: cors });
      if (data.event_type === "link_click" && data.link_id !== LIVE_LINK_ID) {
        const { data: site, error } = await supabase.rpc("get_public_site");
        if (error) return respond(503);
        if (
          ![...(site?.links || []), ...(site?.socials || [])].some(
            (l) => l.id === data.link_id,
          )
        )
          return respond(400);
      }
      const { error } = await supabase.from("analytics_events").insert({
        id: data.event_id,
        event_type: data.event_type,
        link_id: data.link_id || null,
        visitor: session.visitor,
        session: uuid(session.nonce) ? session.nonce : null,
        identity: session.identity === "daily" ? "daily" : "persistent",
        source: session.source,
        medium: session.medium,
        campaign: session.campaign,
        referrer: session.referrer,
        device: session.device,
        os: session.os || "",
        app: session.app || "",
        lang: session.lang || "",
        country: session.country || null,
        city: session.city || null,
        duration_s: data.event_type === "engagement" ? data.duration : null,
        scroll: data.event_type === "engagement" ? data.scroll : null,
      });
      if (error && error.code !== "23505") return respond(503);
      return new Response(null, { status: 204, headers: cors });
    } catch {
      return respond(503, { error: "Tracking unavailable" });
    }
  };
}
