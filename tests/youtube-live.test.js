import test from "node:test";
import assert from "node:assert/strict";
import {
  activeBroadcast,
  CHANNEL_ID,
  liveUrl,
  visibleLive,
  LIVE_LINK_ID,
} from "../supabase/functions/_shared/youtube-live.js";
import { sample, validateSite } from "../src/model.js";
import { summarize } from "../src/analytics-summary.js";
const broadcast = {
  id: "abcdefghijk",
  snippet: { channelId: CHANNEL_ID, title: "Streaming now" },
  status: { lifeCycleStatus: "live", privacyStatus: "public" },
};
test("live detection only exposes public active broadcasts belonging to Cheryl", () => {
  assert.equal(activeBroadcast({ items: [broadcast] }).status, "live");
  for (const item of [
    { ...broadcast, snippet: { channelId: "other" } },
    {
      ...broadcast,
      status: { lifeCycleStatus: "testing", privacyStatus: "public" },
    },
    {
      ...broadcast,
      status: { lifeCycleStatus: "live", privacyStatus: "unlisted" },
    },
    {
      ...broadcast,
      status: { lifeCycleStatus: "complete", privacyStatus: "public" },
    },
  ])
    assert.equal(activeBroadcast({ items: [item] }).status, "offline");
  assert.throws(() => activeBroadcast({}));
});
test("Live now overrides and stale/error states never invent an automatic live badge", () => {
  const now = Date.now(),
    result = {
      ...activeBroadcast({ items: [broadcast] }),
      checkedAt: new Date(now).toISOString(),
    };
  assert.ok(visibleLive({}, result, now));
  assert.equal(visibleLive({ liveMode: "off" }, result, now), null);
  assert.equal(visibleLive({}, result, now + 360001), null);
  assert.equal(visibleLive({}, { status: "unknown" }, now), null);
  assert.ok(
    visibleLive(
      { liveMode: "manual", liveUrl: "https://youtu.be/abcdefghijk" },
      null,
      now,
    ),
  );
  for (const url of [
    "javascript:alert(1)",
    "https://youtube.com.evil.com/watch?v=abcdefghijk",
    "https://evil.com/live",
    "https://youtube.com/@Other/live",
  ])
    assert.equal(liveUrl(url), "");
  assert.equal(
    liveUrl("https://www.youtube.com/watch?v=abcdefghijk&feature=share"),
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
});
test("manual settings validate and live clicks have a readable analytics destination", () => {
  const site = structuredClone(sample);
  site.profile.liveMode = "manual";
  site.profile.liveUrl = "https://www.youtube.com/@Cherylxxw/live";
  assert.doesNotThrow(() => validateSite(site));
  site.profile.liveUrl = "https://evil.com";
  assert.throws(() => validateSite(site), /YouTube/);
  const summary = summarize(
    [{ event_type: "link_click", link_id: LIVE_LINK_ID, visitor: "a" }],
    sample,
  );
  assert.equal(summary.ranked[0].kind, "Live stream");
  assert.equal(summary.ranked[0].title, "Watch Cheryl live");
});
