"use client";

import { useCallback, useState } from "react";

/**
 * Previous/Next paging over the admin APIs' keyset cursors.
 * Keeps a stack of the cursors used to reach each page, so "Previous" just pops.
 */
export function useCursorPager() {
  const [stack, setStack] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStack((s) => (s.length === 1 && s[0] === null ? s : [null]));
  }, []);

  return {
    /** Cursor to send for the current page (null = first page). */
    cursor: stack[stack.length - 1],
    /** 1-based page number. */
    page: stack.length,
    hasPrev: stack.length > 1,
    hasNext: nextCursor !== null,
    /** Call with the `nextCursor` from each response. */
    setNextCursor,
    next: () => {
      if (nextCursor) setStack((s) => [...s, nextCursor]);
    },
    prev: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    reset,
  };
}
