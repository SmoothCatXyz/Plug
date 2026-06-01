import type { ReactElement } from "react";

export type StatusDotStatus = "running" | "complete" | "pending" | "waiting" | "error";

type StatusDotProps = {
  status: StatusDotStatus;
  label: string;
};

export function StatusDot({ status, label }: StatusDotProps): ReactElement {
  return (
    <span className={`status-dot status-dot--${status}`} title={label}>
      <span className="status-dot__symbol" aria-hidden="true">
        {statusSymbol[status]}
      </span>
      <span>{label}</span>
    </span>
  );
}

const statusSymbol: Record<StatusDotStatus, string> = {
  running: "▶",
  complete: "✓",
  pending: "○",
  waiting: "⚠",
  error: "✗"
};
