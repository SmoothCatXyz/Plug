import type { ReactElement } from "react";

type HUDIconProps = {
  svg: string;
  label?: string;
  size?: "sm" | "md" | "lg";
};

export function HUDIcon({ svg, label, size = "md" }: HUDIconProps): ReactElement {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={`hud-icon hud-icon--${size}`}
      dangerouslySetInnerHTML={{ __html: svg }}
      role={label ? "img" : undefined}
    />
  );
}
