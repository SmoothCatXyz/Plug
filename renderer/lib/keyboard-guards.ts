import type { DependencyList, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { HotkeyCallback, Keys, Options } from "react-hotkeys-hook";

type KeyboardEventLike = KeyboardEvent | ReactKeyboardEvent<Element>;

export type PlugHotkeyOptions = Omit<
  Options,
  "enableOnContentEditable" | "enableOnFormTags" | "ignoreEventWhen"
> & {
  ignoreEventWhen?: (event: KeyboardEvent) => boolean;
};

export function usePlugHotkeys(
  keys: Keys,
  callback: HotkeyCallback,
  options: PlugHotkeyOptions = {},
  dependencies: DependencyList = []
): void {
  const { ignoreEventWhen, ...hotkeyOptions } = options;

  useHotkeys(
    keys,
    callback,
    {
      preventDefault: true,
      ...hotkeyOptions,
      enableOnContentEditable: false,
      enableOnFormTags: false,
      ignoreEventWhen: (event) => isImeComposing(event) || Boolean(ignoreEventWhen?.(event))
    },
    dependencies
  );
}

export function commandHotkeys(key: string): string[] {
  return [`meta+${key}`, `ctrl+${key}`];
}

export function isImeComposing(event: KeyboardEventLike): boolean {
  const currentEvent = event as KeyboardEvent & { isComposing?: boolean };
  const nativeEvent = ("nativeEvent" in event ? event.nativeEvent : event) as KeyboardEvent & {
    isComposing?: boolean;
  };

  return Boolean(
    currentEvent.isComposing ||
      nativeEvent.isComposing ||
      currentEvent.key === "Process" ||
      nativeEvent.key === "Process" ||
      currentEvent.keyCode === 229 ||
      nativeEvent.keyCode === 229
  );
}

export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const editableTagNames = new Set(["INPUT", "TEXTAREA", "SELECT"]);
  if (editableTagNames.has(target.tagName)) {
    return true;
  }

  return Boolean(target.closest("[contenteditable='true'], [contenteditable='plaintext-only']"));
}
