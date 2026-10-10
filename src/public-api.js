import { sample } from "./model";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const endpoint = configured ? `${url}/functions/v1/collect` : "";
export async function publicSite() {
  if (!configured) {
    try {
      return (
        JSON.parse(localStorage.getItem("cheryl-published")) ||
        structuredClone(sample)
      );
    } catch {
      return structuredClone(sample);
    }
  }
  const response = await fetch(`${url}/rest/v1/rpc/get_public_site`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("Public page unavailable");
  const data = await response.json();
  if (!data) throw Error("The owner has not published this page yet.");
  return data;
}

export async function followerTotal() {
  if (!configured) return null;
  const response = await fetch(`${url}/rest/v1/rpc/get_follower_total`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  return response.json();
}
