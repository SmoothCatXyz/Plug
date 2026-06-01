import type { ReactElement, ReactNode } from "react";

type KeycapProps = {
  children: ReactNode;
};

export function Keycap({ children }: KeycapProps): ReactElement {
  return <span className="keycap">{children}</span>;
}
