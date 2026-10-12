import { service } from "../_shared/owner.ts";
import { activeBroadcast } from "../_shared/youtube-live.js";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=30",
  "X-Content-Type-Options": "nosniff",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (!["GET", "HEAD"].includes(req.method))
    return Response.json({}, { status: 405, headers });
  const db = service();
  try {
    const { data: row, error } = await db
      .from("youtube_live_cache")
      .select("result,checked_at")
      .eq("id", 1)
      .single();
    if (error) throw error;
    if (row.checked_at && Date.now() - Date.parse(row.checked_at) < 180000)
      return Response.json(
        { ...row.result, checkedAt: row.checked_at },
        { headers },
      );
    const { data: claimed, error: claimError } = await db.rpc(
      "claim_youtube_live_check",
    );
    if (claimError) throw claimError;
    if (!claimed)
      return Response.json(
        row.checked_at && Date.now() - Date.parse(row.checked_at) < 360000
          ? { ...row.result, checkedAt: row.checked_at }
          : { status: "unknown" },
        { headers },
      );
    let result = { status: "unknown" };
    try {
      const clientId = Deno.env.get("YOUTUBE_CLIENT_ID"),
        clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");
      const { data: connection, error: connectionError } = await db
        .from("youtube_connection")
        .select("refresh_token")
        .eq("id", 1)
        .maybeSingle();
      if (connectionError) throw connectionError;
      if (!clientId || !clientSecret || !connection)
        result = { status: "setup_required" };
      else {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: connection.refresh_token,
            grant_type: "refresh_token",
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw Error("YouTube reconnect required");
        const token = await response.json();
        const broadcasts = await fetch(
          "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status&broadcastStatus=active&broadcastType=all&maxResults=50",
          {
            headers: { Authorization: `Bearer ${token.access_token}` },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!broadcasts.ok) throw Error("YouTube check unavailable");
        result = activeBroadcast(await broadcasts.json());
      }
    } catch {
      result = { status: "unknown" };
    }
    const checkedAt = new Date().toISOString();
    const { error: writeError } = await db
      .from("youtube_live_cache")
      .update({ result, checked_at: checkedAt, lease_until: null })
      .eq("id", 1);
    if (writeError) throw writeError;
    return Response.json({ ...result, checkedAt }, { headers });
  } catch {
    return Response.json({ status: "unknown" }, { status: 503, headers });
  }
});
