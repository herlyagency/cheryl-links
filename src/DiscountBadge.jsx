export const discountFonts = {
  bold: "Bold",
  rounded: "Rounded",
  serif: "Editorial",
  mono: "Monospace",
};
export const discountColors = {
  coral: ["#ffe4de", "#942b1d"],
  lime: ["#d9f99d", "#29450b"],
  gold: ["#fef3c7", "#78350f"],
  pink: ["#fce7f3", "#9d174d"],
  dark: ["#222222", "#ffffff"],
};
export default function DiscountBadge({ link }) {
  const text =
    typeof link.discountText === "string"
      ? link.discountText.trim().slice(0, 30)
      : "";
  if (!link.discountEnabled || !text) return null;
  const colors = discountColors[link.discountColor] || discountColors.coral;
  const font = Object.hasOwn(discountFonts, link.discountFont)
    ? link.discountFont
    : "bold";
  return (
    <span
      className={`discount-badge discount-font-${font}`}
      style={{ backgroundColor: colors[0], color: colors[1] }}
    >
      {text}
    </span>
  );
}
