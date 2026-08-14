import { type MatchInput, type MatchResult, runMatch } from "../../../api/lib/match";

/** İlerleme bildirimi — arayüz `slipring.matchprogress` olayını dinler. */
export const PROGRESS_EVENT = "slipring.matchprogress";

export interface MatchProgressDetail {
  done: number;
  total: number;
  running: boolean;
}

function emit(detail: MatchProgressDetail) {
  window.dispatchEvent(new CustomEvent<MatchProgressDetail>(PROGRESS_EVENT, { detail }));
}

type WorkerReply =
  | { id: number; type: "progress"; done: number; total: number }
  | { id: number; type: "done"; result: MatchResult }
  | { id: number; type: "error"; message: string };

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./match-worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Eşleştirmeyi worker'da çalıştırır; worker kurulamazsa ana thread'e düşer.
 * Aynı anda tek iş yeter — yeni istek geldiğinde eskisi terk edilir.
 */
export function matchOffThread(input: MatchInput): Promise<MatchResult> {
  const w = getWorker();
  if (!w) {
    emit({ done: 0, total: input.rows.length, running: true });
    const result = runMatch(input);
    emit({ done: input.rows.length, total: input.rows.length, running: false });
    return Promise.resolve(result);
  }

  const id = ++seq;
  emit({ done: 0, total: input.rows.length, running: true });

  return new Promise<MatchResult>((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerReply>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") {
        emit({ done: msg.done, total: msg.total, running: true });
        return;
      }
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      emit({ done: input.rows.length, total: input.rows.length, running: false });
      if (msg.type === "done") resolve(msg.result);
      else reject(new Error(msg.message));
    };
    const onError = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      emit({ done: 0, total: 0, running: false });
      reject(new Error("Eşleştirme worker'ı çalıştırılamadı"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, input });
  });
}
