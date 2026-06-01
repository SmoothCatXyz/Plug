// Lightweight per-turn timing logger for the chat pipeline. Every line is
// prefixed with the turn id and the elapsed time since the turn started, so a
// full request reads as one ordered timeline in the dev console:
//
//   [turn a1b2c3] +    0ms ▶ "打开知乎" (mode=auto)
//   [turn a1b2c3] +  412ms classify (412ms) -> work
//   [turn a1b2c3] +  450ms route=work -> orchestrator
//   [turn a1b2c3]          step 1 model 2840ms → browser_relay_navigate
//   [turn a1b2c3]          step 2 model 1900ms → final answer
//   [turn a1b2c3] +14200ms orchestrator (13750ms) model≈4740ms tools≈3399ms steps=2
//   [turn a1b2c3] +16000ms ✓ DONE (16000ms)

export interface TurnLog {
  readonly t0: number;
  /** Log a line stamped with elapsed-since-turn-start. */
  log(message: string): void;
  /** Log a line WITHOUT the elapsed stamp (for nested sub-steps). */
  sub(message: string): void;
  /** Begin a named phase; the returned fn logs its duration when called. */
  phase(name: string): (detail?: string) => void;
}

export function createTurnLog(streamId: string, opener: string): TurnLog {
  const t0 = Date.now();
  const tag = `[turn ${streamId.slice(0, 6)}]`;
  const stamp = (): string => `+${String(Date.now() - t0).padStart(6)}ms`;
  const log = (message: string): void => console.log(`${tag} ${stamp()} ${message}`);

  log(opener);

  return {
    t0,
    log,
    sub: (message: string) => console.log(`${tag}          ${message}`),
    phase(name: string) {
      const start = Date.now();
      return (detail = "") => log(`${name} (${Date.now() - start}ms)${detail ? ` ${detail}` : ""}`);
    }
  };
}
