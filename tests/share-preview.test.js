import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Image } from "imagescript";
import decodeWebp, { init } from "@jsquash/webp/decode.js";
import {
  renderPreview,
  avatarDestination,
} from "../supabase/functions/share-preview/render.js";
import { decodeAvatar } from "../supabase/functions/share-preview/decode.js";
test("sharing image uses published background, gradient and centered circular avatar", async () => {
  const avatar = new Image(600, 300).fill(0xff0000ff);
  const png = await renderPreview(
    Image,
    {
      theme: {
        background: "#123456",
        backgroundEnd: "#ffffff",
        gradient: false,
      },
    },
    avatar,
  );
  const image = await Image.decode(png);
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
  assert.equal(image.getPixelAt(1, 1), 0x123456ff);
  assert.equal(image.getPixelAt(1200, 630), 0x123456ff);
  assert.equal(image.getPixelAt(600, 315), 0xff0000ff);
  assert.equal(image.getPixelAt(600, 104), 0xffffffff);
  const gradient = await Image.decode(
    await renderPreview(
      Image,
      {
        theme: {
          background: "#000000",
          backgroundEnd: "#ffffff",
          gradient: true,
        },
      },
      avatar,
    ),
  );
  assert.equal(gradient.getPixelAt(1, 1), 0x000000ff);
  assert.equal(gradient.getPixelAt(1200, 630), 0xffffffff);
});
test("avatar source blocks private and unrelated URLs and accepts uploaded photos", () => {
  const base = "https://xsvtainakcubyoqlrmcy.supabase.co";
  assert.equal(
    avatarDestination(`${base}/storage/v1/object/public/images/photo.jpg`, base)
      .hostname,
    new URL(base).hostname,
  );
  assert.equal(
    avatarDestination("/avatar.svg", base).hostname,
    "cherylxxw.com",
  );
  for (const url of [
    "http://127.0.0.1/photo",
    "https://evil.com/photo",
    `${base}/rest/v1/site_drafts`,
    "https://cherylxxw.com@evil.com/photo",
  ])
    assert.throws(() => avatarDestination(url, base));
});
test("sharing avatar decoder supports uploaded JPEG, PNG and WebP", async () => {
  const source = new Image(20, 20).fill(0x123456ff);
  const wasm = await readFile(
    new URL(
      "../node_modules/@jsquash/webp/codec/dec/webp_dec.wasm",
      import.meta.url,
    ),
  );
  await init(await WebAssembly.compile(wasm));
  for (const [type, data] of [
    ["image/png", await source.encode()],
    ["image/jpeg", await source.encodeJPEG()],
    ["image/webp", await source.encodeWEBP()],
  ]) {
    const image = await decodeAvatar(Image, data, type, decodeWebp);
    assert.equal(image.width, 20);
    assert.equal(image.height, 20);
  }
});
