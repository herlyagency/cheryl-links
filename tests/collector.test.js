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
