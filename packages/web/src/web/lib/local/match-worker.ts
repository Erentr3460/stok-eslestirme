/// <reference lib="webworker" />
import { type MatchInput, runMatch } from "../../../api/lib/match";

/**
 * Eşleştirme ayrı bir thread'de çalışır: 1500+ satır × 600 ürün taraması
 * ana thread'i kilitlemesin, arayüz donmasın diye.
 */
self.onmessage = (e: MessageEvent<{ id: number; input: MatchInput }>) => {
  const { id, input } = e.data;
  try {
    const result = runMatch(input, (done, total) => {
      self.postMessage({ id, type: "progress", done, total });
    });
    self.postMessage({ id, type: "done", result });
  } catch (err) {
    self.postMessage({
      id,
      type: "error",
      message: err instanceof Error ? err.message : "Eşleştirme hatası",
    });
  }
};
