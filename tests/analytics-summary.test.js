import test from "node:test";
import assert from "node:assert/strict";
import {
  summarize,
  breakdown,
  sourceLabel,
  previousRange,
  changeLabel,
} from "../src/analytics-summary.js";
const site = {
  links: [
    { id: "a", title: "Video", icon: "youtube", url: "https://youtube.com" },
  ],
  socials: [{ id: "b", icon: "auto", url: "https://instagram.com/cheryl" }],
};
test("analytics attributes repeat clicks and historical destinations without inflating visitor engagement", () => {
  const events = [
    { event_type: "page_view", visitor: "v1" },
    { event_type: "page_view", visitor: "v1" },
    { event_type: "page_view", visitor: "v2", returning: true },
    ...Array.from({ length: 3 }, () => ({
      event_type: "link_click",
      visitor: "v1",
      link_id: "a",
    })),
    { event_type: "link_click", visitor: "v1", link_id: "b" },
    { event_type: "link_click", visitor: "outside", link_id: "removed" },
  ];
  const data = summarize(events, site);
  assert.equal(data.visitors, 2);
  assert.equal(data.engagement, 50);
  assert.equal(data.returning, 1);
  assert.equal(data.clicks.length, 5);
  assert.equal(data.ranked[0].share, 60);
  assert.equal(data.ranked[0].unique, 1);
  assert.equal(data.ranked.find((link) => link.id === "b").title, "Instagram");
  assert.equal(data.ranked.find((link) => link.id === "removed").clicks, 1);
  assert.equal(
    data.ranked.reduce((sum, link) => sum + link.share, 0),
    100,
  );
});
test("source breakdown combines aliases, preserves unknown sources and handles special names", () => {
  const rows = breakdown(
    [
      { source: "instagram" },
      { source: "l.instagram.com" },
      { source: "Direct / unknown" },
      { source: "__proto__" },
    ],
    "source",
    sourceLabel,
  );
  assert.deepEqual(rows[0], ["Instagram", 2]);
  assert.ok(rows.some(([name]) => name === "Direct / source unavailable"));
  assert.ok(rows.some(([name]) => name === "__proto__"));
});
test("comparisons use equal periods and handle zero baselines and unavailable data", () => {
  const range = previousRange("2026-10-11T00:00:00Z", "2026-10-11T12:00:00Z");
  assert.deepEqual(range, {
    from: "2026-10-10T12:00:00.000Z",
    to: "2026-10-11T00:00:00Z",
  });
  assert.equal(changeLabel(20, 10), "+100.0% vs earlier period");
  assert.equal(changeLabel(0, 10), "-100.0% vs earlier period");
  assert.equal(changeLabel(10, 0), "No activity in the earlier period");
  assert.equal(changeLabel(10, undefined), "Comparison unavailable");
  assert.throws(() => previousRange("bad", "bad"));
  assert.equal(summarize([], site).engagement, null);
});
