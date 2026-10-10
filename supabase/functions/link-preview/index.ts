import { isOwner, cors } from "../_shared/owner.ts";
import { fetchPreview } from "./preview.js";
Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST")
    return new Response("{}", { status: 405, headers });
  if (!(await isOwner(req)))
    return new Response("{}", { status: 403, headers });
  try {
    const text = await req.text();
    if (text.length > 4096) return new Response("{}", { status: 413, headers });
    const { url } = JSON.parse(text);
    return Response.json({ image: await fetchPreview(url) }, { headers });
  } catch {
    return Response.json(
      { error: "Preview unavailable. Use a manual image." },
      { status: 400, headers },
    );
  }
});
