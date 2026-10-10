import { PGlite } from "@electric-sql/pglite";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sample } from "../src/model.js";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  outsider = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("Postgres migrations enforce private drafts, atomic publishing, schedules and owner analytics", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
 create table storage.objects(id uuid,bucket_id text); alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 insert into auth.users values('${owner}'),('${outsider}');`);
    for (const file of [
      "001_site.sql",
      "002_analytics.sql",
      "004_seed.sql",
      "005_function_permissions.sql",
      "006_followers.sql",
    ])
      await pg.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    await pg.exec(`insert into public.site_owner(user_id) values('${owner}');`);
    await pg.exec("set role service_role");
    await pg.query(
      "insert into public.site_followers(id,accounts) values(1,$1)",
      [
        JSON.stringify([
          { platform: "youtube", account: "youtube:test", count: 1200 },
          { platform: "instagram", account: "instagram:test", count: 3400 },
          { platform: "tiktok", account: "tiktok:test", count: null },
        ]),
      ],
    );
    await pg.exec("reset role; set role anon");
    assert.equal(
      (await pg.query("select public.get_follower_total() as report")).rows[0]
        .report.total,
      4600,
    );
    await assert.rejects(
      pg.query("select * from public.site_followers"),
      /permission denied/,
    );
    await pg.exec("reset role");
    await pg.exec("set role anon");
    assert.equal(
      (await pg.query("select public.get_public_site() as site")).rows[0].site,
      null,
    );
    await assert.rejects(
      pg.query("select * from public.site_drafts"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select * from public.site_published"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select * from public.analytics_events"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select public.take_budget('fake',now(),100)"),
      /permission denied/,
    );
    await pg.exec(
      `reset role; set request.jwt.claim.sub='${outsider}'; set role authenticated;`,
    );
    assert.equal(
      (await pg.query("select * from public.site_followers")).rows.length,
      0,
    );
    await assert.rejects(
      pg.query("update public.site_followers set accounts='[]'"),
      /permission denied/,
    );
    assert.equal(
      (await pg.query("select * from public.site_drafts")).rows.length,
      0,
    );
    await assert.rejects(
      pg.query("select public.publish_site()"),
      /Owner access required/,
    );
    await assert.rejects(
      pg.query("select public.analytics_report(now()-interval '1 day',now())"),
      /Owner access required/,
    );
    await pg.exec(
      `reset role; set request.jwt.claim.sub='${owner}'; set role authenticated;`,
    );
    assert.equal(
      (await pg.query("select public.is_owner() as yes")).rows[0].yes,
      true,
    );
    await pg.query("select public.publish_site()");
    const config = structuredClone(sample);
    config.links[0].active = false;
    config.links[1].start = "2099-01-01T00:00:00Z";
    config.links[2].end = "2000-01-01T00:00:00Z";
    await pg.query("update public.site_drafts set config=$1 where id=1", [
      JSON.stringify(config),
    ]);
    // Saving does not publish.
    assert.equal(
      (await pg.query("select public.get_public_site() as site")).rows[0].site
        .links.length,
      5,
    );
    await pg.query("select public.publish_site()");
    await pg.exec("reset role; set role anon");
    assert.equal(
      (await pg.query("select public.get_public_site() as site")).rows[0].site
        .links.length,
      2,
    );
    await pg.exec(
      `reset role; set request.jwt.claim.sub='${owner}'; set role authenticated;`,
    );
    config.links[0].url = "javascript:alert(1)";
    await assert.rejects(
      pg.query("update public.site_drafts set config=$1 where id=1", [
        JSON.stringify(config),
      ]),
      /check constraint/,
    );
    config.links[0].url = "https://example.com";
    config.links[0].background = "red; background:url(https://bad.com)";
    await assert.rejects(
      pg.query("update public.site_drafts set config=$1 where id=1", [
        JSON.stringify(config),
      ]),
      /check constraint/,
    );
    await pg.exec("reset role");
    assert.equal(
      (
        await pg.query(
          "select public.take_budget('test',date_trunc('minute',now()),1) as ok",
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await pg.query(
          "select public.take_budget('test',date_trunc('minute',now()),1) as ok",
        )
      ).rows[0].ok,
      false,
    );
  } finally {
    await pg.close();
  }
});
