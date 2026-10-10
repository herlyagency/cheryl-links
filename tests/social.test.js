import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedPreviewUrl,
  previewImage,
  fetchPreview,
  fetchRichPreview,
  publicPreviewUrl,
} from "../supabase/functions/link-preview/preview.js";
import {
  countValue,
  providerCount,
  combinedTotal,
} from "../supabase/functions/sync-followers/providers.js";
import {
  presets,
  validateSite,
  sample,
  formatFollowers,
  previewSupported,
  socialFollowerTotal,
} from "../src/model.js";
test("Open Graph images handle attribute order, entities, relative paths and unsafe URLs", () => {
  assert.equal(
    previewImage(
      `<meta content="/cherylxxw/opengraph-image?a=1&amp;b=2" property="og:image">`,
      "https://withrose.com/cherylxxw",
    ),
    "https://withrose.com/cherylxxw/opengraph-image?a=1&b=2",
  );
  assert.equal(
    previewImage(
      `<meta property='og:image' content='javascript:alert(1)'><meta name='twitter:image' content='https://example.com/fallback.png'>`,
      "https://withrose.com/",
    ),
    "https://example.com/fallback.png",
  );
  assert.equal(
    previewImage(
      `<meta property='og:image' content='http://example.com/photo.jpg'>`,
      "https://withrose.com/",
    ),
    null,
  );
});
test("preview fetch rejects untrusted hosts and validates every redirect", async () => {
  for (const url of [
    "http://withrose.com/",
    "https://withrose.com.evil.com/",
    "https://127.0.0.1/",
    "https://user:pass@withrose.com/",
    "https://withrose.com:8443/",
  ])
    assert.equal(allowedPreviewUrl(url), null);
  await assert.rejects(
    fetchPreview(
      "https://withrose.com/cherylxxw",
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/private" },
        }),
    ),
    /Unsafe/,
  );
  assert.equal(
    await fetchPreview(
      "https://www.withrose.com/cherylxxw",
      async () =>
        new Response(
          '<meta property="og:image" content="https://withrose.com/photo.png">',
          { headers: { "content-type": "text/html" } },
        ),
    ),
    "https://withrose.com/photo.png",
  );
  assert.equal(
    await fetchPreview(
      "https://withrose.com/cherylxxw",
      async () =>
        new Response("x", { headers: { "content-type": "application/json" } }),
    ),
    null,
  );
});
test("follower APIs validate counts and never substitute zero for hidden or failed counts", async () => {
  for (const value of [null, undefined, -1, "", 1.5, "NaN", true])
    assert.throws(() => countValue(value));
  assert.equal(countValue("1234"), 1234);
  assert.equal(
    combinedTotal([{ count: 100 }, { count: null }, { count: 200 }]),
    300,
  );
  assert.equal(combinedTotal([{ count: null }]), null);
  const yt = async () =>
    Response.json({
      items: [
        {
          id: "channel",
          statistics: {
            subscriberCount: "12300",
            hiddenSubscriberCount: false,
          },
        },
      ],
    });
  assert.equal(
    await providerCount("youtube", { id: "channel", token: "test" }, yt),
    12300,
  );
  await assert.rejects(
    providerCount("youtube", { id: "channel", token: "test" }, async () =>
      Response.json({
        items: [{ id: "channel", statistics: { hiddenSubscriberCount: true } }],
      }),
    ),
    /hidden/,
  );
  assert.equal(
    await providerCount("instagram", { id: "123", token: "test" }, async () =>
      Response.json({ followers_count: 321 }),
    ),
    321,
  );
  assert.equal(
    await providerCount("tiktok", { id: "user", token: "test" }, async () =>
      Response.json({
        data: { user: { open_id: "user", follower_count: 456 } },
        error: { code: "ok" },
      }),
    ),
    456,
  );
  await assert.rejects(
    providerCount("tiktok", { id: "user", token: "test" }, async () =>
      Response.json({
        data: { user: { open_id: "wrong", follower_count: 456 } },
        error: { code: "ok" },
      }),
    ),
    /connection/,
  );
});
test("new moods remain valid with backward-compatible look and motion defaults", () => {
  for (const preset of Object.values(presets))
    validateSite({ ...structuredClone(sample), theme: preset });
  assert.equal(formatFollowers(1200), "1.2K");
  assert.throws(() =>
    validateSite({
      ...structuredClone(sample),
      theme: { ...sample.theme, animation: "unsafe" },
    }),
  );
});

test("rich previews default to public web links through the metadata service", async () => {
  assert.equal(previewSupported("https://example.org/article"), true);
  assert.equal(previewSupported("http://example.org/article"), true);
  for (const url of [
    "mailto:hello@example.com",
    "https://127.0.0.1/",
    "https://localhost/",
    "https://example.local/",
    "https://user:pass@example.org/",
  ]) {
    assert.equal(previewSupported(url), false);
    assert.equal(publicPreviewUrl(url), null);
  }
  let requested;
  const preview = await fetchRichPreview(
    "https://example.org/article",
    async (url) => {
      requested = new URL(url);
      return Response.json({
        status: "success",
        data: {
          title: "Article",
          description: "Details",
          image: { url: "https://cdn.example.org/cover.jpg" },
        },
      });
    },
  );
  assert.equal(requested.hostname, "api.microlink.io");
  assert.equal(
    requested.searchParams.get("url"),
    "https://example.org/article",
  );
  assert.deepEqual(preview, {
    image: "https://cdn.example.org/cover.jpg",
    title: "Article",
    description: "Details",
  });
  await assert.rejects(
    fetchRichPreview(
      "https://example.org",
      async () => new Response(null, { status: 429 }),
    ),
    /limit/,
  );
  assert.equal(
    (
      await fetchRichPreview("https://example.org", async () =>
        Response.json({
          status: "success",
          data: { image: { url: "javascript:bad" } },
        }),
      )
    ).image,
    null,
  );
});

test("manual follower totals follow visible accounts and validate saved counts", () => {
  assert.equal(
    socialFollowerTotal([
      { active: true, followers: 1200 },
      { active: true, followers: 3400 },
      { active: false, followers: 900 },
      { active: true },
    ]),
    4600,
  );
  assert.equal(socialFollowerTotal([{ active: true, followers: 0 }]), 0);
  assert.equal(socialFollowerTotal([{ active: true }]), null);
  const site = structuredClone(sample);
  site.socials[0].followers = 1200;
  validateSite(site);
  for (const count of [-1, 1.5, "123", 1000000000001]) {
    site.socials[0].followers = count;
    assert.throws(() => validateSite(site), /Follower/);
  }
  site.socials[0].followers = null;
  validateSite(site);
});
