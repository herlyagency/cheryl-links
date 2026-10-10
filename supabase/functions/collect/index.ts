import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { createCollector } from "./handler.ts";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(
  createCollector({
    supabase,
    secret: Deno.env.get("ANALYTICS_SIGNING_SECRET") || "",
    turnstileSecret: Deno.env.get("TURNSTILE_SECRET_KEY") || "",
    origins: (
      Deno.env.get("ALLOWED_ORIGINS") ||
      "https://cherylxxw.com,https://www.cherylxxw.com"
    )
      .split(",")
      .map((s) => s.trim()),
  }),
);
