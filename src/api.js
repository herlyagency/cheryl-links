import { createClient } from "@supabase/supabase-js";
import { sample, validateSite } from "./model";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const db = configured ? createClient(url, key) : null;
const copy = (v) => structuredClone(v);
export function demoDraft() {
  try {
    return JSON.parse(localStorage.getItem("cheryl-draft")) || copy(sample);
  } catch {
    return copy(sample);
  }
}
export async function owner() {
  const { data, error } = await db.rpc("is_owner");
  if (error) throw error;
  return data === true;
}
export async function loadDraft() {
  if (!db) return demoDraft();
  const { data, error } = await db
    .from("site_drafts")
    .select("config")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data.config;
}
export async function saveDraft(site) {
  validateSite(site);
  if (!db) {
    localStorage.setItem("cheryl-draft", JSON.stringify(site));
    return;
  }
  const { error } = await db
    .from("site_drafts")
    .update({ config: site, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("id")
    .single();
  if (error) throw error;
}
export async function publish(site) {
  await saveDraft(site);
  if (!db) {
    localStorage.setItem("cheryl-published", JSON.stringify(site));
    return;
  }
  const { error } = await db.rpc("publish_site");
  if (error) throw error;
}
export async function upload(file) {
  if (!db)
    throw Error(
      "Connect Supabase to upload images. You can use a hosted image URL in the demo.",
    );
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 3 * 1024 * 1024
  )
    throw Error("Use a PNG, JPEG or WebP under 3 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width > 4096 || bitmap.height > 4096) {
    bitmap.close();
    throw Error("Maximum image size is 4096 × 4096.");
  }
  bitmap.close();
  const path =
    crypto.randomUUID() +
    "." +
    { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[
      file.type
    ];
  const { error } = await db.storage
    .from("images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return db.storage.from("images").getPublicUrl(path).data.publicUrl;
}
export async function stats(from, to) {
  if (!db) return { events: [], limited: false };
  const { data, error } = await db.rpc("analytics_report", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data;
}
