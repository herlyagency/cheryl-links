import test from "node:test";
import assert from "node:assert/strict";
import { transformWithEsbuild } from "vite";
import { readFile } from "node:fs/promises";
import { signSession } from "../supabase/functions/collect/security.js";
import { sample } from "../src/model.js";
const security = new URL(
  "../supabase/functions/collect/security.js",
  import.meta.url,
).href;
const source = (
  await readFile(
    new URL("../supabase/functions/collect/handler.ts", import.meta.url),
    "utf8",
  )
).replace(/(['"])\.\/security\.js\1/, JSON.stringify(security));
const { code } = await transformWithEsbuild(source, "handler.ts", {
  loader: "ts",
  target: "esnext",
});
const { createCollector } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const secret = "s".repeat(64),
  origin = "https://cherylxxw.com";
function fixture() {
  const counts = {},
    inserted = [];
  let allowed = true;
  const db = {
    rpc: async (name, args) => {
      if (name === "get_public_site") return { data: sample, error: null };
      const k = args.p_key + args.p_bucket;
      counts[k] = (counts[k] || 0) + 1;
      return { data: allowed && counts[k] <= args.p_limit, error: null };
    },
    from: () => ({
      insert: async (data) => {
        inserted.push(data);
        return { error: null };
      },
    }),
  };
  const handle = createCollector({
    supabase: db,
    secret,
    turnstileSecret: "test-secret",
    origins: [origin],
  });
  return {
    handle,
    inserted,
    block: () => {
      allowed = false;
    },
  };
}
function req(data, options = {}) {
  return new Request(origin, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...options.headers },
    body: JSON.stringify(data),
  });
}
test("collector rejects wrong origins, oversized bodies, malformed IDs and exhausted budgets", async () => {
  const f = fixture();
  assert.equal(
    (await f.handle(req({}, { headers: { origin: "https://evil.com" } })))
      .status,
    403,
  );
  assert.equal((await f.handle(req({ extra: "x".repeat(5000) }))).status, 413);
  assert.equal(
    (await f.handle(req({ action: "event", event_id: "bad" }))).status,
    400,
  );
  f.block();
  assert.equal((await f.handle(req({ action: "session" }))).status, 429);
  assert.equal(f.inserted.length, 0);
});
test("collector accepts a valid session once per page view, validates destinations, and saves no IP", async () => {
  const f = fixture();
  const session = await signSession(
    {
      visitor: sample.links[0].id,
      expires: Date.now() + 60000,
      nonce: "test",
      source: "instagram",
      medium: "bio",
      campaign: "",
      referrer: "instagram.com",
      device: "mobile",
    },
    secret,
  );
  const page = {
    action: "event",
    session,
    event_type: "page_view",
    event_id: crypto.randomUUID(),
    link_id: null,
  };
  assert.equal((await f.handle(req(page))).status, 204);
  assert.equal(
    (await f.handle(req({ ...page, event_id: crypto.randomUUID() }))).status,
    204,
  );
  assert.equal(f.inserted.length, 1);
  assert.equal(
    (
      await f.handle(
        req({
          action: "event",
          session,
          event_type: "link_click",
          event_id: crypto.randomUUID(),
          link_id: sample.links[0].id,
        }),
      )
    ).status,
    204,
  );
  assert.equal(f.inserted[1].source, "instagram");
  assert.equal(f.inserted[1].country, null);
  assert.equal("ip" in f.inserted[1], false);
  assert.equal(
    (
      await f.handle(
        req({
          action: "event",
          session,
          event_type: "link_click",
          event_id: crypto.randomUUID(),
          link_id: crypto.randomUUID(),
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await f.handle(req({ ...page, session: session + "tampered" }))).status,
    403,
  );
});
test("Turnstile verification checks the hostname before minting a signed session", async (t) => {
  const f = fixture();
  let hostname = "evil.com";
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ success: true, hostname }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const body = {
    action: "session",
    visitor: sample.links[0].id,
    token: "test-token",
    source: "instagram",
    device: "mobile",
    referrer: "instagram.com/private?secret=x",
  };
  assert.equal((await f.handle(req(body))).status, 403);
  hostname = "cherylxxw.com";
  const result = await f.handle(req(body));
  assert.equal(result.status, 200);
  assert.equal(typeof (await result.json()).session, "string");
});
const turnstileOk = (t) =>
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({ success: true, hostname: "cherylxxw.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
async function newSession(f, body = {}, headers = {}) {
  const r = await f.handle(
    req(
      {
        action: "session",
        token: "t",
        source: "instagram",
        device: "mobile",
        ...body,
      },
      { headers },
    ),
  );
  assert.equal(r.status, 200);
  return (await r.json()).session;
}
const payload = (token) =>
  JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.0";
test("cookieless sessions get a daily visitor ID from IP + browser, never storing either", async (t) => {
  turnstileOk(t);
  const f = fixture();
  const ua = { "user-agent": iphone, "x-forwarded-for": "203.0.113.9" };
  const a = payload(await newSession(f, {}, ua));
  const b = payload(await newSession(f, {}, ua));
  const other = payload(
    await newSession(
      f,
      {},
      { ...ua, "user-agent": "Mozilla/5.0 (Windows NT 10.0)" },
    ),
  );
  assert.equal(a.identity, "daily");
  assert.equal(a.visitor, b.visitor);
  assert.notEqual(a.visitor, other.visitor);
  assert.match(
    a.visitor,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.notEqual(a.nonce, b.nonce);
  assert.equal(a.os, "iOS");
  assert.equal(a.app, "Instagram");
  assert.equal(JSON.stringify(a).includes("203.0.113.9"), false);
  const remembered = payload(
    await newSession(f, { visitor: sample.links[0].id }, ua),
  );
  assert.equal(remembered.identity, "persistent");
  assert.equal(remembered.visitor, sample.links[0].id);
});
test("geography is trusted only from Cloudflare's header or the shared-secret proxy", async (t) => {
  turnstileOk(t);
  const f = fixture();
  assert.equal(
    payload(await newSession(f, {}, { "cf-ipcountry": "US" })).country,
    "US",
  );
  assert.equal(
    payload(await newSession(f, {}, { "cf-ipcountry": "XX" })).country,
    null,
  );
  assert.equal(
    payload(await newSession(f, {}, { "cf-ipcountry": "usa" })).country,
    null,
  );
  const proxied = createCollector({
    supabase: { rpc: async () => ({ data: true, error: null }) },
    secret,
    turnstileSecret: "x",
    origins: [origin],
    geoProxySecret: "geo-secret-value",
  });
  const viaProxy = payload(
    await newSession(
      { handle: proxied },
      {},
      {
        "x-geo-secret": "geo-secret-value",
        "x-geo-country": "CA",
        "x-geo-city": "Montr%C3%A9al",
        "x-client-ip": "198.51.100.4",
      },
    ),
  );
  assert.deepEqual([viaProxy.country, viaProxy.city], ["CA", "Montréal"]);
  const spoofed = payload(
    await newSession(
      { handle: proxied },
      {},
      {
        "x-geo-secret": "wrong",
        "x-geo-country": "CA",
        "x-geo-city": "Montreal",
      },
    ),
  );
  assert.deepEqual([spoofed.country, spoofed.city], [null, null]);
});
test("engagement, share and live-stream events are validated and stored with session fields", async (t) => {
  turnstileOk(t);
  const f = fixture();
  const session = await newSession(
    f,
    { lang: "es" },
    { "user-agent": iphone, "cf-ipcountry": "MX" },
  );
  const send = (extra) =>
    f.handle(
      req({
        action: "event",
        session,
        event_id: crypto.randomUUID(),
        link_id: null,
        ...extra,
      }),
    );
  assert.equal(
    (await send({ event_type: "engagement", duration: 12, scroll: 55 })).status,
    204,
  );
  assert.equal(
    (await send({ event_type: "engagement", duration: 9999, scroll: 55 }))
      .status,
    400,
  );
  assert.equal(
    (await send({ event_type: "engagement", duration: 3 })).status,
    400,
  );
  assert.equal((await send({ event_type: "share" })).status, 204);
  assert.equal(
    (await send({ event_type: "share", link_id: sample.links[0].id })).status,
    400,
  );
  assert.equal((await send({ event_type: "unknown" })).status, 400);
  assert.equal(
    (
      await send({
        event_type: "link_click",
        link_id: "cc11aa22-bb33-4dd4-8ee5-ff6677889900",
      })
    ).status,
    204,
  );
  const [engagement, share, live] = f.inserted;
  assert.equal(engagement.duration_s, 12);
  assert.equal(engagement.scroll, 55);
  assert.equal(engagement.identity, "daily");
  assert.equal(engagement.country, "MX");
  assert.equal(engagement.lang, "es");
  assert.equal(engagement.app, "Instagram");
  assert.equal(engagement.session, payload(session).nonce);
  assert.equal(share.duration_s, null);
  assert.equal(live.link_id, "cc11aa22-bb33-4dd4-8ee5-ff6677889900");
});
test("refusals caused by the global daily cap are counted as dropped", async () => {
  const calls = [];
  const handle = createCollector({
    supabase: {
      rpc: async (_name, args) => {
        calls.push(args.p_key);
        return { data: args.p_key === "dropped", error: null };
      },
    },
    secret,
    turnstileSecret: "x",
    origins: [origin],
  });
  assert.equal(
    (await handle(req({ action: "session", token: "t" }))).status,
    429,
  );
  assert.deepEqual(calls, ["global-requests", "dropped"]);
});
