import { useCallback, useEffect, useState } from "react";
import { useUploads } from "../queries/uploads";

const KEY = "slipring.activeBatch";
const EVT = "slipring.batchchange";

function read(): number | null {
  const raw = localStorage.getItem(KEY);
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Aktif Excel yüklemesi — sayfalar arası paylaşılır, sekme yenilense de kalır.
 * Tarayıcıda seçim yoksa en son yüklenen dosyaya düşer, böylece başka bir
 * cihazdan/temiz tarayıcıdan girildiğinde ekranlar boş görünmez.
 */
export function useBatch() {
  const [stored, setStored] = useState<number | null>(() => read());
  const uploads = useUploads();

  useEffect(() => {
    const sync = () => setStored(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const select = useCallback((id: number | null) => {
    if (id === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(id));
    window.dispatchEvent(new Event(EVT));
  }, []);

  const list = uploads.data ?? [];
  const exists = stored !== null && list.some((u) => u.id === stored);
  const batchId = exists ? stored : (list[0]?.id ?? null);

  return { batchId, select };
}
