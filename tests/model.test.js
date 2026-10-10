import test from "node:test";
import assert from "node:assert/strict";
import {
  safeUrl,
  visible,
  attribution,
  csv,
  validateSite,
  sample,
  rangeDates,
} from "../src/model.js";
import {
  signSession,
  verifySession,
  validEvent,
} from "../supabase/functions/collect/security.js";
test("URLs reject executable schemes, protocol-relative URLs and malformed images", () => {
  for (const u of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//evil.com",
    'https://example.com/"x',
    "file:///tmp/foo",
  ])
    assert.equal(safeUrl(u), "");
  assert.ok(safeUrl("https://example.com/path?q=one"));
  assert.ok(safeUrl("mailto:hello@example.com"));
  assert.equal(safeUrl("http://example.com/x.jpg", true), "");
  assert.equal(safeUrl("/avatar.svg", true), "/avatar.svg");
});
test("schedules have inclusive start and exclusive expiry", () => {
  const l = {
    active: true,
    start: "2026-10-10T12:00:00Z",
    end: "2026-10-10T13:00:00Z",
  };
  assert.equal(visible(l, Date.parse(l.start) - 1), false);
  assert.equal(visible(l, Date.parse(l.start)), true);
  assert.equal(visible(l, Date.parse(l.end)), false);
  assert.equal(visible({ ...l, active: false }, Date.parse(l.start)), false);
});
test("attribution prioritizes explicit UTM and never invents a source", () => {
  assert.equal(attribution("", "").source, "Direct / unknown");
  assert.equal(
    attribution("https://instagram.com/private?secret=x", "").referrer,
    "instagram.com",
  );
  assert.equal(
    attribution("https://google.com/", "?utm_source=tiktok&utm_medium=bio")
      .source,
    "tiktok",
  );
});
test("CSV escapes quotes, delimiters, and spreadsheet formulas", () => {
  assert.equal(
    csv([["=1+1", "a,b", 'say "hi"']]),
    '"\'=1+1","a,b","say ""hi"""',
  );
});
test("validation rejects unsafe links and reversed schedules", () => {
  assert.equal(
    validateSite(structuredClone(sample)).profile.display_name,
    "Cheryl",
  );
  const bad = structuredClone(sample);
  bad.links[0].url = "javascript:alert(1)";
  assert.throws(() => validateSite(bad));
  bad.links[0].url = "https://example.com";
  bad.links[0].start = "2030-01-02";
  bad.links[0].end = "2030-01-01";
  assert.throws(() => validateSite(bad));
});
test("signed sessions cannot be forged or used after expiry", async () => {
  const secret = "a".repeat(64),
    now = Date.now();
  const token = await signSession(
    { visitor: "test", expires: now + 60000 },
    secret,
  );
  assert.equal((await verifySession(token, secret, now)).visitor, "test");
  assert.equal(await verifySession(token + "x", secret, now), null);
  assert.equal(await verifySession(token, "b".repeat(64), now), null);
  assert.equal(await verifySession(token, secret, now + 61000), null);
});
test("events require valid IDs and valid type/link pairings", () => {
  const id = sample.links[0].id;
  assert.equal(
    validEvent({ event_id: id, event_type: "page_view", link_id: null }),
    true,
  );
  assert.equal(
    validEvent({ event_id: id, event_type: "link_click", link_id: id }),
    true,
  );
  assert.equal(
    validEvent({ event_id: id, event_type: "page_view", link_id: id }),
    false,
  );
  assert.equal(
    validEvent({ event_id: "bad", event_type: "link_click", link_id: id }),
    false,
  );
});
test("date ranges respect local midnight and yesterday excludes today", () => {
  const now = new Date(2026, 9, 10, 12);
  const r = rangeDates("Yesterday", "", "", now);
  assert.equal(new Date(r.from).getDate(), 9);
  assert.equal(new Date(r.to).getDate(), 10);
});
