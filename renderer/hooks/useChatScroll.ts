import { useCallback, useLayoutEffect, useRef, useState } from "react";

const INITIAL_WINDOW = 30;
const PAGE_SIZE = 30;
const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 160;

export type ChatScroll = {
  /** Attach to the scrollable message container. */
  containerRef: React.MutableRefObject<HTMLOListElement | null>;
  /** First message index to render — older ones stay paged out until scrolled to. */
  startIndex: number;
  /** Whether the viewport is currently pinned near the bottom. */
  atBottom: boolean;
  /** True when newer messages exist below the current scroll position. */
  hasMoreBelow: boolean;
  /** Jump to the newest message. */
  scrollToBottom: (smooth?: boolean) => void;
  /** Wire to the container's onScroll. */
  handleScroll: () => void;
};

/**
 * Production-grade chat scrolling for a bottom-anchored message list:
 * - sticks to the bottom while you're at the bottom (during streaming and on
 *   new messages), but never yanks you down while you're reading history;
 * - pages older messages in as you scroll up, preserving your scroll position;
 * - jumps to the newest message when the session changes or on first open.
 */
export function useChatScroll(opts: {
  /** Total number of messages in the active session. */
  total: number;
  /** A value that changes as the streaming message grows (e.g. its text length). */
  streamTick: number;
  /** Identity of the active session — switching it re-anchors to the bottom. */
  sessionKey: string | null;
}): ChatScroll {
  const { total, streamTick, sessionKey } = opts;

  const containerRef = useRef<HTMLOListElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(() => Math.min(INITIAL_WINDOW, total));
  const [atBottom, setAtBottom] = useState(true);

  const stickToBottom = useRef(true);
  const prevTotal = useRef(total);
  // Records geometry before older messages are prepended, so we can restore the
  // exact reading position once they render (otherwise the view jumps).
  const pendingAnchor = useRef<{ prevHeight: number; prevTop: number } | null>(null);

  const startIndex = Math.max(0, total - visibleCount);
  const hasMoreBelow = !atBottom;

  const scrollToBottom = useCallback((smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    stickToBottom.current = true;
    setAtBottom(true);
  }, []);

  // Session switch / first open: reset the window and snap to the newest message.
  useLayoutEffect(() => {
    setVisibleCount(Math.min(INITIAL_WINDOW, Math.max(total, 1)));
    stickToBottom.current = true;
    prevTotal.current = total;
    pendingAnchor.current = null;
    const raf = requestAnimationFrame(() => scrollToBottom(false));
    return () => cancelAnimationFrame(raf);
    // Only re-anchor when the session identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // After paging older messages in, restore the prior reading position.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !pendingAnchor.current) return;
    const { prevHeight, prevTop } = pendingAnchor.current;
    el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
    pendingAnchor.current = null;
  }, [visibleCount]);

  // New message or streaming growth: follow the bottom only if pinned there.
  useLayoutEffect(() => {
    const grew = total > prevTotal.current;
    prevTotal.current = total;
    if (stickToBottom.current) {
      // Smooth for a freshly added message, instant for streaming deltas.
      scrollToBottom(grew);
    }
  }, [total, streamTick, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = distanceFromBottom <= NEAR_BOTTOM_PX;
    stickToBottom.current = bottom;
    setAtBottom((prev) => (prev === bottom ? prev : bottom));

    // Near the top with older history still paged out -> load the previous page,
    // anchoring so the current messages don't visibly move. The pendingAnchor
    // guard prevents a burst of scroll events from paging multiple times before
    // the next render lands.
    if (el.scrollTop <= NEAR_TOP_PX && startIndex > 0 && !pendingAnchor.current) {
      pendingAnchor.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop };
      setVisibleCount((c) => Math.min(total, c + PAGE_SIZE));
    }
  }, [total, startIndex]);

  return { containerRef, startIndex, atBottom, hasMoreBelow, scrollToBottom, handleScroll };
}
