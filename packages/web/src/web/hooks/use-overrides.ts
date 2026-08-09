import { useCallback, useEffect, useState } from "react";

export interface Override {
  slug: string | null;
  stock: number | null;
  skip?: boolean;
}

export type Overrides = Record<string, Override>;

const EVT = "slipring.overridechange";
const key = (batchId: number) => `slipring.overrides.${batchId}`;

function read(batchId: number | null): Overrides {
  if (batchId === null) return {};
  try {
    return JSON.parse(localStorage.getItem(key(batchId)) ?? "{}") as Overrides;
  } catch {
    return {};
  }
}

/**
 * Satır bazlı manuel kararlar (ürün seçimi, elle stok, satırı atla).
 * Kalıcı eşleştirmeler DB'deki alias'lara yazılır; buradaki kayıtlar sadece bu dosyaya özeldir.
 */
export function useOverrides(batchId: number | null) {
  const [overrides, setOverrides] = useState<Overrides>(() => read(batchId));

  useEffect(() => {
    setOverrides(read(batchId));
    const sync = () => setOverrides(read(batchId));
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, [batchId]);

  const write = useCallback(
    (next: Overrides) => {
      if (batchId === null) return;
      localStorage.setItem(key(batchId), JSON.stringify(next));
      setOverrides(next);
      window.dispatchEvent(new Event(EVT));
    },
    [batchId],
  );

  const setRow = useCallback(
    (rowIndex: number, value: Override | null) => {
      const next = { ...read(batchId) };
      if (value === null) delete next[String(rowIndex)];
      else next[String(rowIndex)] = value;
      write(next);
    },
    [batchId, write],
  );

  const clear = useCallback(() => write({}), [write]);

  return { overrides, setRow, clear, count: Object.keys(overrides).length };
}
