export const WIDTH = 1200,
  HEIGHT = 630;
const rgb = (value, fallback) =>
  /^#[0-9a-f]{6}$/i.test(value || "")
    ? [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
    : fallback;
export async function renderPreview(Image, site, avatar) {
  const theme = site.theme || {};
  const start = rgb(theme.background, [250, 247, 242]);
  const end = theme.gradient ? rgb(theme.backgroundEnd, start) : start;
  const image = new Image(WIDTH, HEIGHT);
  image.fill((x, y) => {
    const t = ((x - 1) / (WIDTH - 1) + (y - 1) / (HEIGHT - 1)) / 2;
    const channels = start.map((c, i) => Math.round(c + (end[i] - c) * t));
    return Image.rgbaToColor(...channels, 255);
  });
  const ring = new Image(432, 432).fill(0xffffffff).roundCorners(216);
  image.composite(ring, 384, 99);
  avatar.cover(408, 408).roundCorners(204);
  image.composite(avatar, 396, 111);
  return image.encode(3);
}
export function avatarDestination(value, supabaseUrl) {
  const url = new URL(value || "/avatar.svg", "https://cherylxxw.com");
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw Error("Invalid avatar destination");
  // Uploaded profile photos and the site's own assets are trusted image sources.
  if (
    url.origin !== new URL(supabaseUrl).origin &&
    !["cherylxxw.com", "www.cherylxxw.com", "herlyagency.github.io"].includes(
      url.hostname,
    )
  )
    throw Error("Use an uploaded profile photo for the sharing preview");
  if (
    url.origin === new URL(supabaseUrl).origin &&
    !url.pathname.startsWith("/storage/v1/object/public/images/")
  )
    throw Error("Invalid image path");
  return url;
}
