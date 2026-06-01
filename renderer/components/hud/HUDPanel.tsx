import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";
import { HUDCorner } from "./HUDCorner";

type HUDPanelTone = "cyan" | "amber" | "red" | "green" | "violet";

type HUDPanelProps = ComponentPropsWithoutRef<"section"> & {
  children: ReactNode;
  tone?: HUDPanelTone;
  active?: boolean;
  label?: string;
};

export function HUDPanel({
  children,
  tone = "cyan",
  active = false,
  label,
  className,
  ...sectionProps
}: HUDPanelProps): ReactElement {
  const classes = ["hud-panel", `hud-panel--${tone}`, active ? "hud-panel--active" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} aria-label={label} {...sectionProps}>
      <HUDCorner position="tl" tone={tone} />
      <HUDCorner position="br" tone={tone} />
      {children}
    </section>
  );
}
