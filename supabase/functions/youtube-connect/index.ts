import { isOwner, cors, service } from "../_shared/owner.ts";
import { CHANNEL_ID } from "../_shared/youtube-live.js";
const redirect = (status: string) =>
  Response.redirect(`https://cherylxxw.com/admin/?youtube=${status}`, 302);
Deno.serve(async (req) => {
  const headers = cors(req),
    db = service();
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID"),
    clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");
  const callback = `${Deno.env.get("SUPABASE_URL")}/functions/v1/youtube-connect`;
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method === "GET") {
    const url = new URL(req.url),
      state = url.searchParams.get("state"),
      code = url.searchParams.get("code");
    if (!state || !/^[\w-]{72}$/.test(state)) return redirect("failed");
    const { data, error } = await db
      .from("youtube_oauth_states")
      .delete()
      .eq("state", state)
      .gt("expires_at", new Date().toISOString())
      .select("state")
      .maybeSingle();
    if (error || !data || !code || !clientId || !clientSecret)
      return redirect("failed");
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: callback,
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error("Authorization failed");
      const token = await response.json();
      const channel = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
        {
          headers: { Authorization: `Bearer ${token.access_token}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!channel.ok) throw Error("Channel unavailable");
      const channels = await channel.json();
      if (
        !channels.items?.some((item: { id: string }) => item.id === CHANNEL_ID)
      )
        return redirect("wrong-channel");
      if (!token.refresh_token) throw Error("Reconnect required");
      const { error: saveError } = await db
        .from("youtube_connection")
        .upsert({
          id: 1,
          refresh_token: token.refresh_token,
          connected_at: new Date().toISOString(),
        });
      if (saveError) throw saveError;
      await db
        .from("youtube_live_cache")
        .update({ result: null, checked_at: null, lease_until: null })
        .eq("id", 1);
      return redirect("connected");
    } catch {
      return redirect("failed");
    }
  }
  if (req.method !== "POST") return Response.json({}, { status: 405, headers });
  if (!(await isOwner(req))) return Response.json({}, { status: 403, headers });
  try {
    const { action } = await req.json();
    if (action === "status") {
      const { data, error } = await db
        .from("youtube_connection")
        .select("connected_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return Response.json(
        {
          configured: !!clientId && !!clientSecret,
          connected: !!data,
          callback,
        },
        { headers },
      );
    }
    if (action === "connect") {
      if (!clientId || !clientSecret)
        return Response.json(
          {
            error:
              "Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in Supabase first.",
          },
          { status: 409, headers },
        );
      const state = crypto.randomUUID() + crypto.randomUUID();
      await db
        .from("youtube_oauth_states")
        .delete()
        .lt("expires_at", new Date().toISOString());
      const { error } = await db
        .from("youtube_oauth_states")
        .insert({
          state,
          expires_at: new Date(Date.now() + 600000).toISOString(),
        });
      if (error) throw error;
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callback,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        access_type: "offline",
        prompt: "consent",
        state,
      }).toString();
      return Response.json({ url: url.toString() }, { headers });
    }
    if (action === "disconnect") {
      const { data } = await db
        .from("youtube_connection")
        .select("refresh_token")
        .eq("id", 1)
        .maybeSingle();
      const { error } = await db
        .from("youtube_connection")
        .delete()
        .eq("id", 1);
      if (error) throw error;
      await db
        .from("youtube_live_cache")
        .update({ result: null, checked_at: null, lease_until: null })
        .eq("id", 1);
      if (data)
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: data.refresh_token }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      return Response.json({ connected: false }, { headers });
    }
    return Response.json({}, { status: 400, headers });
  } catch {
    return Response.json(
      {
        error:
          "YouTube connection unavailable. Check migration 013 and function setup.",
      },
      { status: 500, headers },
    );
  }
});
