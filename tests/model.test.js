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

test("moods clear overriding link styles and preserve content and thumbnails", async () => {
  const { applyMood, presets } = await import("../src/model.js");
  const original = structuredClone(sample);
  original.links[0].thumbnail = "https://example.com/photo.jpg";
  const dark = applyMood(original, presets["Minimal Dark"]);
  assert.equal(dark.theme.background, "#171a19");
  assert.equal(dark.links[0].background, "");
  assert.equal(dark.links[0].text, "");
  assert.equal(dark.links[0].thumbnail, original.links[0].thumbnail);
  assert.equal(dark.links[0].url, original.links[0].url);
  assert.equal(original.links[0].background, "#e3ebde");
  assert.equal(
    applyMood(original, presets["Minimal Dark"], true).links[0].background,
    "#e3ebde",
  );
  validateSite(dark);
});

test("automatic thumbnails parse video formats, reject impostor hosts and honor overrides", async () => {
  const { automaticThumbnail, linkThumbnail } = await import("../src/model.js");
  const id = "xqpZBSFcitQ",
    expected = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  for (const url of [
    `https://www.youtube.com/watch?v=${id}&t=5`,
    `https://youtu.be/${id}?si=x`,
    `https://youtube.com/shorts/${id}`,
    `https://youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ])
    assert.equal(automaticThumbnail(url), expected);
  for (const url of [
    "https://youtube.com/@cherylxxw",
    "https://instagram.com/cherylxxw",
    `https://youtube.com.evil.com/watch?v=${id}`,
    "https://youtube.com/watch?v=bad",
    "javascript:alert(1)",
  ])
    assert.equal(automaticThumbnail(url), "");
  assert.equal(
    linkThumbnail({
      url: `https://youtu.be/${id}`,
      thumbnail: "https://example.com/custom.jpg",
    }),
    "https://example.com/custom.jpg",
  );
  assert.equal(
    linkThumbnail({
      url: `https://youtu.be/${id}`,
      thumbnail: "javascript:alert(1)",
    }),
    expected,
  );
});

test("a YouTube URL pasted into the thumbnail field becomes an image", async () => {
  const { linkThumbnail } = await import("../src/model.js");
  assert.equal(
    linkThumbnail({
      url: "https://example.com/",
      thumbnail: "https://www.youtube.com/watch?v=xqpZBSFcitQ&t=5919s",
    }),
    "https://i.ytimg.com/vi/xqpZBSFcitQ/hqdefault.jpg",
  );
});

test("celebrations validate supported effects and finite durations while retaining older drafts", () => {
  assert.doesNotThrow(() => validateSite(structuredClone(sample)));
  for (const celebration of [
    "none",
    "confetti",
    "birthday",
    "snow",
    "hearts",
    "halloween",
    "sparkles",
  ]) {
    const site = structuredClone(sample);
    site.theme.celebration = celebration;
    site.theme.celebrationDuration = 20;
    assert.doesNotThrow(() => validateSite(site));
  }
  for (const settings of [
    { celebration: "unknown" },
    { celebrationDuration: 100 },
    { celebrationDuration: "10" },
  ]) {
    const site = structuredClone(sample);
    Object.assign(site.theme, settings);
    assert.throws(() => validateSite(site), /celebration/);
  }
});
