import { createClient } from "npm:@supabase/supabase-js@2.117.3";
export const service = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
export async function isOwner(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    },
  );
  const { data: user, error } = await client.auth.getUser();
  if (error || !user.user) return false;
  const { data, error: ownerError } = await client.rpc("is_owner");
  return !ownerError && data === true;
}
export function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = (
    Deno.env.get("ALLOWED_ORIGINS") ||
    "https://cherylxxw.com,https://www.cherylxxw.com"
  )
    .split(",")
    .map((s) => s.trim());
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Origin": allowed.includes(origin)
      ? origin
      : "https://cherylxxw.com",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
}
