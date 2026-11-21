# Optional: city-level location proxy

The collector records a visitor's **country** from Cloudflare's `cf-ipcountry` header when one reaches it. To also record **cities** (or if no country appears in the dashboard after a day of traffic), put this small Cloudflare Worker in front of the `collect` Edge Function. It uses the same Cloudflare account as Turnstile and fits the free plan.

1. In Cloudflare → Workers, create a Worker named `cheryl-collect` with the code below.
2. Add two Worker secrets: `COLLECT_URL` (`https://<project>.supabase.co/functions/v1/collect`) and `GEO_PROXY_SECRET` (32+ random characters).
3. Add the same `GEO_PROXY_SECRET` as a Supabase Edge Function secret and redeploy `collect`.
4. Set the repository variable `VITE_ANALYTICS_ENDPOINT` to the Worker URL and redeploy the site.

```js
export default {
  async fetch(request, env) {
    const headers = new Headers(request.headers);
    for (const h of [
      "x-geo-secret",
      "x-geo-country",
      "x-geo-city",
      "x-client-ip",
    ])
      headers.delete(h);
    headers.set("x-geo-secret", env.GEO_PROXY_SECRET);
    headers.set("x-geo-country", request.cf?.country || "");
    headers.set("x-geo-city", encodeURIComponent(request.cf?.city || ""));
    headers.set("x-client-ip", request.headers.get("cf-connecting-ip") || "");
    const response = await fetch(env.COLLECT_URL, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    });
    return new Response(response.body, response);
  },
};
```

The collector only trusts `x-geo-*` and `x-client-ip` when `x-geo-secret` matches, so visitors can't fake a location by sending those headers themselves. The client IP is used only for the daily hash and rate limits, and is never stored.
