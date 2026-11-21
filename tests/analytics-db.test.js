import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const outsider = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const linkA = "11111111-1111-4111-8111-111111111111";
const linkB = "22222222-2222-4222-8222-222222222222";
const v = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const s = (n) => `99999999-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function database() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
 create table storage.objects(id uuid,bucket_id text); alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 insert into auth.users values('${owner}'),('${outsider}');`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).sort())
    if (file !== "003_retention.sql")
      await pg.exec(await readFile(new URL(file, dir), "utf8"));
  await pg.exec(`insert into public.site_owner(user_id) values('${owner}')`);
  return pg;
}

async function insert(pg, rows) {
  for (const r of rows)
    await pg.query(
      `insert into public.analytics_events(id,event_type,link_id,timestamp,source,referrer,device,country,city,visitor,session,identity,os,app,lang,duration_s,scroll,medium,campaign)
       values(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        r.type,
        r.link ?? null,
        r.at,
        r.source ?? "instagram",
        r.referrer ?? "",
        r.device ?? "mobile",
        r.country ?? null,
        r.city ?? null,
        r.visitor,
        r.session ?? null,
        r.identity ?? "daily",
        r.os ?? "",
        r.app ?? "",
        r.lang ?? "",
        r.duration ?? null,
        r.scroll ?? null,
        r.medium ?? "",
        r.campaign ?? "",
      ],
    );
}

test("analytics v2 accepts new event types and rejects malformed rows", async () => {
  const pg = await database();
  try {
    const at = "2026-11-20T12:00:00Z";
    await insert(pg, [
      {
        type: "engagement",
        at,
        visitor: v(1),
        session: s(1),
        duration: 42,
        scroll: 80,
      },
      { type: "share", at, visitor: v(1), session: s(1) },
    ]);
    for (const bad of [
      { type: "engagement", at, visitor: v(1) }, // missing duration
      { type: "page_view", at, visitor: v(1), duration: 5 }, // duration on wrong type
      { type: "link_click", at, visitor: v(1) }, // missing link
      { type: "share", at, visitor: v(1), link: linkA }, // link on wrong type
      { type: "engagement", at, visitor: v(1), duration: 99999 },
      { type: "page_view", at, visitor: v(1), lang: "EN-us" },
      { type: "page_view", at, visitor: v(1), identity: "cookie" },
    ])
      await assert.rejects(insert(pg, [bad]), /check constraint/);
  } finally {
    await pg.close();
  }
});

test("analytics_summary aggregates totals, buckets, breakdowns and is owner-only", async () => {
  const pg = await database();
  try {
    // Current period: 2026-11-15 00:00 → 2026-11-22 00:00 UTC. Previous: 11-08 → 11-15.
    await insert(pg, [
      // session 1: instagram visitor clicks A twice, engages 30s
      {
        type: "page_view",
        at: "2026-11-20T10:00:00Z",
        visitor: v(1),
        session: s(1),
        referrer: "l.instagram.com",
        country: "US",
        city: "Miami",
        os: "iOS",
        app: "Instagram",
        lang: "en",
      },
      {
        type: "link_click",
        link: linkA,
        at: "2026-11-20T10:00:20Z",
        visitor: v(1),
        session: s(1),
        country: "US",
        city: "Miami",
      },
      {
        type: "link_click",
        link: linkA,
        at: "2026-11-20T10:01:00Z",
        visitor: v(1),
        session: s(1),
        country: "US",
        city: "Miami",
      },
      {
        type: "engagement",
        at: "2026-11-20T10:02:00Z",
        visitor: v(1),
        session: s(1),
        duration: 20,
        scroll: 60,
      },
      {
        type: "engagement",
        at: "2026-11-20T10:05:00Z",
        visitor: v(1),
        session: s(1),
        duration: 10,
        scroll: 40,
      },
      // session 2: x.com visitor bounces
      {
        type: "page_view",
        at: "2026-11-21T22:30:00Z",
        visitor: v(2),
        session: s(2),
        source: "t.co",
        referrer: "t.co",
        device: "desktop",
        country: "CA",
        os: "macOS",
        app: "Safari",
        lang: "fr",
        campaign: "launch",
        medium: "bio",
      },
      {
        type: "engagement",
        at: "2026-11-21T22:31:00Z",
        visitor: v(2),
        session: s(2),
        duration: 10,
        scroll: 20,
      },
      // session 3: returning persistent visitor clicks B, shares
      {
        type: "page_view",
        at: "2026-11-16T08:00:00Z",
        visitor: v(3),
        session: s(3),
        identity: "persistent",
        country: "US",
      },
      {
        type: "link_click",
        link: linkB,
        at: "2026-11-16T08:00:05Z",
        visitor: v(3),
        session: s(3),
        identity: "persistent",
        country: "US",
      },
      {
        type: "share",
        at: "2026-11-16T08:00:09Z",
        visitor: v(3),
        session: s(3),
        identity: "persistent",
      },
      // previous period
      {
        type: "page_view",
        at: "2026-11-10T08:00:00Z",
        visitor: v(3),
        session: s(4),
        identity: "persistent",
      },
      {
        type: "page_view",
        at: "2026-11-10T09:00:00Z",
        visitor: v(4),
        session: s(5),
      },
      {
        type: "link_click",
        link: linkA,
        at: "2026-11-10T09:00:30Z",
        visitor: v(4),
        session: s(5),
      },
      // outside both periods
      {
        type: "page_view",
        at: "2026-10-01T08:00:00Z",
        visitor: v(9),
        session: s(9),
      },
    ]);
    await pg.exec(
      `insert into public.analytics_limits(key,bucket,count) values('dropped','2026-11-18T00:00:00Z',7),('dropped','2026-10-01T00:00:00Z',99)`,
    );

    const q =
      "select public.analytics_summary('2026-11-15T00:00:00Z','2026-11-22T00:00:00Z','UTC') as r";
    await pg.exec(
      `set request.jwt.claim.sub='${outsider}'; set role authenticated;`,
    );
    await assert.rejects(pg.query(q), /Owner access required/);
    await pg.exec(`reset role; set role anon`);
    await assert.rejects(pg.query(q), /permission denied/);
    await pg.exec(
      `reset role; set request.jwt.claim.sub='${owner}'; set role authenticated;`,
    );
    const r = (await pg.query(q)).rows[0].r;

    assert.equal(r.unit, "day");
    assert.deepEqual(
      {
        views: r.totals.views,
        clicks: r.totals.clicks,
        shares: r.totals.shares,
        visitors: r.totals.visitors,
        clickers: r.totals.clickers,
        days: r.totals.active_days,
      },
      { views: 3, clicks: 3, shares: 1, visitors: 3, clickers: 2, days: 3 },
    );
    assert.equal(r.totals.median_seconds, 20);
    assert.equal(Number(r.totals.avg_scroll), 40);
    assert.deepEqual(
      {
        views: r.previous.views,
        clicks: r.previous.clicks,
        visitors: r.previous.visitors,
      },
      { views: 2, clicks: 1, visitors: 2 },
    );
    assert.equal(r.sessions.count, 3);
    assert.equal(r.sessions.bounced, 1);
    assert.equal(r.sessions.median_time_to_click, 5 + (20 - 5) / 2);
    assert.equal(r.returning, 1);
    assert.equal(r.series.length, 7);
    assert.deepEqual(
      r.series.map((b) => b.views),
      [0, 1, 0, 0, 0, 1, 1],
    );
    assert.deepEqual(
      r.series.map((b) => b.clicks),
      [0, 1, 0, 0, 0, 2, 0],
    );
    assert.equal(r.hours.length, 24);
    assert.equal(r.hours[10].current, 3);
    assert.equal(r.hours[9].previous, 2);
    assert.equal(r.weekdays.find((d) => d.day === 5).count, 3); // Friday Nov 20
    const ig = r.sources.find((x) => x.source === "instagram");
    assert.equal(ig.count, 2);
    assert.equal(ig.host, "l.instagram.com");
    assert.deepEqual(r.devices[0], { key: "mobile", count: 2 });
    assert.deepEqual(r.apps.map((a) => a.key).sort(), ["Instagram", "Safari"]);
    assert.deepEqual(r.languages.map((a) => a.key).sort(), ["en", "fr"]);
    assert.deepEqual(r.campaigns, [
      { campaign: "launch", medium: "bio", source: "t.co", count: 1 },
    ]);
    assert.deepEqual(r.countries[0], { key: "US", count: 5 });
    assert.deepEqual(r.cities[0], { key: "Miami", country: "US", count: 3 });
    const a = r.destinations.find((d) => d.id === linkA);
    assert.equal(a.clicks, 2);
    assert.equal(a.unique, 1);
    assert.deepEqual(a.series, [0, 0, 0, 0, 0, 2, 0]);
    assert.deepEqual(a.devices, [{ key: "mobile", count: 2 }]);
    assert.equal(r.realtime.length, 30);
    assert.equal(r.dropped, 7);

    // Short ranges use hourly buckets in the requested time zone.
    const h = (
      await pg.query(
        "select public.analytics_summary('2026-11-20T05:00:00Z','2026-11-21T05:00:00Z','America/New_York') as r",
      )
    ).rows[0].r;
    assert.equal(h.unit, "hour");
    assert.equal(h.tz, "America/New_York");
    assert.equal(h.series.length, 24);
    assert.equal(h.series.find((b) => b.at === "2026-11-20T05:00:00").views, 1); // 10:00 UTC = 05:00 New York
    // Unknown zones fall back to UTC instead of failing.
    const u = (
      await pg.query(
        "select public.analytics_summary(now()-interval '1 day',now(),'Mars/Base') as r",
      )
    ).rows[0].r;
    assert.equal(u.tz, "UTC");
    await assert.rejects(
      pg.query(
        "select public.analytics_summary(now(),now()-interval '1 day','UTC')",
      ),
      /Invalid date range/,
    );
  } finally {
    await pg.close();
  }
});
