export async function decodeAvatar(Image, bytes, type, webp) {
  if (
    type.includes("webp") ||
    (bytes[0] === 82 && bytes[1] === 73 && bytes[8] === 87 && bytes[9] === 69)
  ) {
    const decoded = await webp(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const image = new Image(decoded.width, decoded.height);
    image.bitmap.set(decoded.data);
    return image;
  }
  if (type.includes("svg"))
    return Image.renderSVG(
      new TextDecoder().decode(bytes),
      408,
      Image.SVG_MODE_WIDTH,
    );
  return Image.decode(bytes);
}
