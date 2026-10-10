import React from "react";
export const celebrations = {
  none: "None",
  confetti: "Confetti",
  birthday: "Birthday balloons",
  snow: "Winter snow",
  hearts: "Valentine hearts",
  halloween: "Halloween pumpkins",
  sparkles: "New Year sparkles",
};
export default function Celebration({ theme }) {
  const effect = theme.celebration || "none";
  if (effect === "none" || !Object.hasOwn(celebrations, effect)) return null;
  const duration = Math.min(
    20,
    Math.max(5, Number(theme.celebrationDuration) || 10),
  );
  const symbols = {
    birthday: "🎈",
    snow: "❄",
    hearts: "♥",
    halloween: "🎃",
    sparkles: "✦",
  };
  return (
    <div
      className={`celebration celebration-${effect}`}
      aria-hidden="true"
      key={`${effect}-${duration}`}
    >
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 43 + 7) % 100}%`,
            "--delay": `${(i % 8) * 0.16}s`,
            "--duration": `${duration - 1.2}s`,
            "--drift": `${((i % 5) - 2) * 32}px`,
            "--spin": `${(i % 2 ? -1 : 1) * 540}deg`,
            color: ["#ff709b", "#ffc857", "#7bdff2", "#b2f7b0", "#c9a7ff"][
              i % 5
            ],
            backgroundColor:
              effect === "confetti"
                ? ["#ff709b", "#ffc857", "#7bdff2", "#b2f7b0", "#c9a7ff"][i % 5]
                : undefined,
          }}
        >
          {symbols[effect]}
        </span>
      ))}
    </div>
  );
}
