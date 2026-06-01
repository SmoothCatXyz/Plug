import type { ReactElement, ReactNode } from "react";

type NumericTextProps = {
  children: ReactNode;
  muted?: boolean;
};

export function NumericText({ children, muted = false }: NumericTextProps): ReactElement {
  return <span className={`numeric-text${muted ? " numeric-text--muted" : ""}`}>{children}</span>;
}
