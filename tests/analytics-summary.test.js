import test from "node:test";
import assert from "node:assert/strict";
import {
  destinations,
  sourceLabel,
  sourceRows,
  sourceColor,
  previousRange,
  change,
  DIRECT,
  OTHER_COLOR,
} from "../src/analytics-summary.js";
const LIVE = "cc11aa22-bb33-4dd4-8ee5-ff6677889900";
const site = {
  links: [
    { id: "a", title: "Video", icon: "youtube", url: "https://youtube.com" },
  ],
  socials: [
    { id: "b", icon: "auto", url: "https://instagram.com/cheryl" },
    { id: "c", icon: "auto", url: "https://venmo.com/u/cheryl" },
  ],
};
test("destinations join aggregates with links, group payments and keep historical clicks", () => {
  const list = destinations(
    [
      { id: "a", clicks: 3, unique: 1, series: [1, 2] },
      { id: "b", clicks: 1, unique: 1 },
      { id: "removed", clicks: 1, unique: 1 },
      { id: LIVE, clicks: 5, unique: 4 },
    ],
    site,
    10,
  );
  assert.deepEqual(
    list.map((d) => [d.id, d.group, d.clicks]),
    [
      [LIVE, "live", 5],
      ["a", "link", 3],
      ["b", "social", 1],
      ["removed", "removed", 1],
      ["c", "payment", 0],
    ],
  );
  assert.equal(list.find((d) => d.id === "b").title, "Instagram");
  assert.equal(list.find((d) => d.id === "a").share, 30);
  assert.deepEqual(list.find((d) => d.id === "c").series, []);
  assert.equal(destinations([], site, 0)[0].share, 0);
});
test("source rows merge aliases, keep the most common host and colour by source", () => {
  const rows = sourceRows([
    { source: "instagram", host: "", count: 2 },
    { source: "l.instagram.com", host: "l.instagram.com", count: 5 },
    { source: "t.co", host: "t.co", count: 3 },
    { source: "com.twitter.android", host: "com.twitter.android", count: 1 },
    { source: "Direct / unknown", host: "", count: 4 },
    { source: "__proto__", host: "", count: 1 },
  ]);
  assert.deepEqual(rows[0], {
    label: "Instagram",
    count: 7,
    host: "l.instagram.com",
    color: "#eb6834",
  });
  assert.deepEqual(
    rows.find((r) => r.label === "X"),
    { label: "X", count: 4, host: "t.co", color: "#2a78d6" },
  );
  assert.equal(rows.find((r) => r.label === DIRECT).count, 4);
  assert.equal(sourceColor("__proto__"), OTHER_COLOR);
  assert.equal(sourceLabel(""), DIRECT);
  assert.equal(sourceLabel("link.me"), "Linkme");
});
test("comparisons use equal periods and handle zero baselines and unavailable data", () => {
  const range = previousRange("2026-10-11T00:00:00Z", "2026-10-11T12:00:00Z");
  assert.deepEqual(range, {
    from: "2026-10-10T12:00:00.000Z",
    to: "2026-10-11T00:00:00Z",
  });
  assert.equal(change(20, 10), 100);
  assert.equal(change(0, 10), -100);
  assert.equal(change(10, 0), Infinity);
  assert.equal(change(0, 0), 0);
  assert.equal(change(10, undefined), null);
  assert.throws(() => previousRange("bad", "bad"));
});
