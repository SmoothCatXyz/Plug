import { CrepeBuilder } from "@milkdown/crepe/builder";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import "./markdown.css";

type MarkdownEditorProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function MarkdownEditor({ value, disabled = false, onChange }: MarkdownEditorProps): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const initialValueRef = useRef(value);
  const latestOnChangeRef = useRef(onChange);
  const [rawMode, setRawMode] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (rawMode || !rootRef.current) {
      return;
    }

    const root = rootRef.current;
    let disposed = false;
    root.replaceChildren();

    const crepe = new CrepeBuilder({
      root,
      defaultValue: initialValueRef.current
    });

    crepe.setReadonly(disabled);
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        latestOnChangeRef.current(markdown);
      });
    });

    void crepe.create().catch((error) => {
      if (disposed) {
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown Milkdown initialization error";
      setLoadError(message);
      setRawMode(true);
    });

    return () => {
      disposed = true;
      void crepe.destroy().catch(() => undefined);
    };
  }, [disabled, rawMode]);

  if (rawMode) {
    return (
      <div className="markdown-editor markdown-editor--raw">
        <div className="markdown-editor__fallback-bar">
          <span>Raw Markdown</span>
          {loadError ? <em>{loadError}</em> : null}
        </div>
        <textarea
          className="markdown-editor__raw-input"
          value={value}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="markdown-editor">
      <div className="markdown-editor__fallback-bar">
        <span>Milkdown</span>
        <button className="markdown-editor__raw-toggle" type="button" onClick={() => setRawMode(true)}>
          Raw
        </button>
      </div>
      <div ref={rootRef} className="markdown-editor__host" />
    </div>
  );
}
