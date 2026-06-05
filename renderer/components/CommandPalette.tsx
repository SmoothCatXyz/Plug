import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { Keycap, StatusDot } from "./hud";
import { isImeComposing } from "../lib/keyboard-guards";
import "./command-palette.css";

export type CommandPaletteAction = {
  id: string;
  label: string;
  detail: string;
  group: string;
  shortcut?: string[];
  disabled?: boolean;
  run: () => Promise<void> | void;
};

type CommandPaletteProps = {
  open: boolean;
  actions: CommandPaletteAction[];
  onClose: () => void;
};

export function CommandPalette({ open, actions, onClose }: CommandPaletteProps): ReactElement | null {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return actions.filter((action) => {
      if (!normalizedQuery) {
        return true;
      }

      return [action.label, action.detail, action.group, action.shortcut?.join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [actions, query]);
  const activeAction = filteredActions[activeIndex] ?? filteredActions[0] ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery("");
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) {
    return null;
  }

  async function executeAction(action: CommandPaletteAction): Promise<void> {
    if (action.disabled) {
      return;
    }

    await action.run();
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (isImeComposing(event)) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(filteredActions.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && activeAction) {
      event.preventDefault();
      void executeAction(activeAction);
    }
  }

  return (
    <div className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
      <div className="command-palette__panel">
        <header className="command-palette__header">
          <div>
            <span className="hud-label">Command Bus</span>
            <h2 id="command-palette-title">Pilot Command Palette</h2>
          </div>
          <div className="command-palette__close">
            <Keycap>Esc</Keycap>
          </div>
        </header>

        <div className="command-palette__input-row">
          <span aria-hidden="true">⌁</span>
          <input
            autoFocus
            value={query}
            placeholder="Search commands, sessions, tools"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="command-palette__list" role="listbox" aria-label="Commands">
          {filteredActions.length ? (
            filteredActions.map((action, index) => (
              <button
                className={[
                  "command-palette__item",
                  index === activeIndex ? "command-palette__item--active" : "",
                  action.disabled ? "command-palette__item--disabled" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={action.id}
                type="button"
                disabled={action.disabled}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void executeAction(action)}
              >
                <span className="command-palette__item-marker" aria-hidden="true">
                  ◆
                </span>
                <span className="command-palette__item-main">
                  <strong>{action.label}</strong>
                  <em>{action.detail}</em>
                </span>
                <span className="command-palette__item-side">
                  <StatusDot status={action.disabled ? "waiting" : "complete"} label={action.group} />
                  {action.shortcut?.length ? (
                    <span className="command-palette__keys">
                      {action.shortcut.map((key) => (
                        <Keycap key={key}>{key}</Keycap>
                      ))}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          ) : (
            <div className="command-palette__empty">
              <strong>No command signal</strong>
              <p>Adjust the query or switch context.</p>
            </div>
          )}
        </div>

        <footer className="command-palette__footer">
          <span>↑ ↓ Navigate</span>
          <span>Enter Execute</span>
        </footer>
      </div>
    </div>
  );
}
