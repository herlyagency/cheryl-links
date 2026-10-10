import { isOwner, cors, service } from "../_shared/owner.ts";
import { providerCount, combinedTotal } from "./providers.js";
Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST")
    return new Response("{}", { status: 405, headers });
  const cronSecret = Deno.env.get("FOLLOWER_SYNC_SECRET");
  const scheduled =
    !!cronSecret &&
    cronSecret.length >= 32 &&
    req.headers.get("x-sync-secret") === cronSecret;
  if (!scheduled && !(await isOwner(req)))
    return new Response("{}", { status: 403, headers });
  try {
    const db = service();
    const { data: previous, error: readError } = await db
      .from("site_followers")
      .select("accounts,synced_at")
      .eq("id", 1)
      .maybeSingle();
    if (readError) throw Error("Migration required");
    if (
      previous?.synced_at &&
      Date.now() - Date.parse(previous.synced_at) < 300000
    )
      return Response.json(
        { ...previous, total: combinedTotal(previous.accounts) },
        { headers },
      );
    const configs = JSON.parse(Deno.env.get("FOLLOWER_ACCOUNTS_JSON") || "[]");
    if (!Array.isArray(configs) || configs.length > 10)
      throw Error("Invalid account configuration");
    const ids = new Set();
    const accounts = [];
    for (const config of configs) {
      if (
        !["instagram", "youtube", "tiktok"].includes(config.platform) ||
        typeof config.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(config.id) ||
        typeof config.token !== "string" ||
        !config.token
      )
        throw Error("Invalid account configuration");
      const account = `${config.platform}:${config.id}`;
      if (ids.has(account)) continue;
      ids.add(account);
      const old = previous?.accounts?.find(
        (a: { account: string }) => a.account === account,
      );
      const row = {
        account,
        platform: config.platform,
        label:
          typeof config.label === "string"
            ? config.label.slice(0, 80)
            : config.platform,
        count: old?.count ?? null,
        updated_at: old?.updated_at ?? null,
        status: "Connected",
      };
      try {
        row.count = await providerCount(config.platform, config);
        row.updated_at = new Date().toISOString();
      } catch {
        row.status =
          old?.count != null
            ? "Last known count · reconnect account"
            : "Needs account connection";
      }
      accounts.push(row);
    }
    const report = { id: 1, accounts, synced_at: new Date().toISOString() };
    const { error } = await db.from("site_followers").upsert(report);
    if (error) throw error;
    return Response.json(
      { ...report, total: combinedTotal(accounts) },
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          "Follower sync needs configuration. Check migration and account secrets.",
      },
      { status: 503, headers },
    );
  }
});
