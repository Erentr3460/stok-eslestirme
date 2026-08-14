import { useEffect, useState } from "react";
import { type MatchProgressDetail, PROGRESS_EVENT } from "../lib/local/match-client";

/** Worker'daki eşleştirmenin canlı ilerlemesi (yüzde). */
export function useMatchProgress() {
  const [state, setState] = useState<MatchProgressDetail>({ done: 0, total: 0, running: false });

  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<MatchProgressDetail>).detail);
    window.addEventListener(PROGRESS_EVENT, on);
    return () => window.removeEventListener(PROGRESS_EVENT, on);
  }, []);

  const pct = state.total > 0 ? Math.min(99, Math.round((state.done / state.total) * 100)) : 0;
  return { ...state, pct };
}
