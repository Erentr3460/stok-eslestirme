/** Türkçe karakterleri sadeleştirip alfanümerik olmayan her şeyi atar. */
export function norm(input: unknown): string {
  if (input === null || input === undefined) return "";
  let s = String(input).toUpperCase();
  const map: Record<string, string> = {
    İ: "I",
    I: "I",
    Ş: "S",
    Ğ: "G",
    Ü: "U",
    Ö: "O",
    Ç: "C",
    Â: "A",
    Î: "I",
    Û: "U",
    "×": "X",
    "–": "-",
    "—": "-",
  };
  s = s.replace(/[İIŞĞÜÖÇÂÎÛ×–—]/g, (c) => map[c] ?? c);
  return s.replace(/[^A-Z0-9]/g, "");
}

/** Görsel karşılaştırma için: sadece boşlukları toparlar, kodu bozmaz. */
export function tidy(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/\s+/g, " ").trim();
}

/** Sayıya çevir; boş/geçersizse null döner. Türkçe ondalık virgülünü de anlar. */
export function toInt(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input) : null;
  const cleaned = String(input)
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Bir metnin 2-gram sayaç haritası — benzerlik hesabında yeniden kullanılır. */
export function gramMap(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/**
 * Önceden hazırlanmış gram haritalarıyla Dice benzerliği.
 * `similarity` ile aynı sonucu verir ama haritaları her karşılaştırmada
 * yeniden kurmadığı için binlerce satırda kat kat hızlıdır.
 */
export function diceFromGrams(
  a: Map<string, number>,
  aLen: number,
  b: Map<string, number>,
  bLen: number,
): number {
  if (aLen < 2 || bLen < 2) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let hits = 0;
  for (const [g, c] of small) {
    const d = big.get(g);
    if (d) hits += c < d ? c : d;
  }
  return (2 * hits) / (aLen - 1 + bLen - 1);
}

/** İki normalize kod arasında 0-1 arası benzerlik (Dice, 2-gram). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const c = grams.get(g) ?? 0;
    if (c > 0) {
      hits++;
      grams.set(g, c - 1);
    }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1);
}
