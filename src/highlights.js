export const highlightOptions = {
  none: "None",
  float: "Gentle movement",
  bounce: "Bounce",
  wiggle: "Side-to-side wiggle",
  pulse: "Size pulse",
  tilt: "Playful tilt",
  shine: "Shine sweep",
  glow: "Pulsing glow",
};
export function highlightStyle(link) {
  const level = Number.isInteger(link.highlightIntensity)
    ? Math.max(1, Math.min(5, link.highlightIntensity))
    : 2;
  return {
    "--highlight-distance": `${level * 2}px`,
    "--highlight-angle": `${level * 0.65}deg`,
    "--highlight-scale": 1 + level * 0.008,
    "--highlight-period": `${(4.2 - level * 0.3).toFixed(1)}s`,
    "--highlight-brightness": 0.18 + level * 0.1,
    "--highlight-blur": `${3 + level * 4}px`,
  };
}
