import type { ReactElement } from "react";

type HUDCornerPosition = "tl" | "tr" | "bl" | "br";
type HUDCornerTone = "cyan" | "amber" | "red" | "green" | "violet";

type HUDCornerProps = {
  position: HUDCornerPosition;
  tone?: HUDCornerTone;
};

export function HUDCorner({ position, tone = "cyan" }: HUDCornerProps): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className={`hud-corner hud-corner--${position} hud-tone--${tone}`}
      focusable="false"
      viewBox="0 0 14 14"
    >
      <path d={cornerPath[position]} />
    </svg>
  );
}

const cornerPath: Record<HUDCornerPosition, string> = {
  tl: "M 0 14 L 0 0 L 14 0",
  tr: "M 0 0 L 14 0 L 14 14",
  bl: "M 0 0 L 0 14 L 14 14",
  br: "M 14 0 L 14 14 L 0 14"
};
