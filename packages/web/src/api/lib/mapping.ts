/** Excel kolon adlarından ERP alanlarını tahmin eden saf yardımcılar. */

export interface Mapping {
  code: string | null;
  code2: string | null;
  name: string | null;
  stock: string | null;
}

function guess(headers: string[], patterns: RegExp[], exclude: string[] = []): string | null {
  for (const re of patterns) {
    const hit = headers.find((h) => re.test(h) && !exclude.includes(h));
    if (hit) return hit;
  }
  return null;
}

export function detectMapping(headers: string[]): Mapping {
  // Sitedeki SKU'lar ERP'de "Açıklaması" kolonunda (ZEN-/ZER- kodları).
  // "Üretici Kodu" üreticinin datasheet kodu -> yedek kod olarak kullanılır.
  const code = guess(headers, [
    /^açıklama(s[ıi])?$/i,
    /üretici\s*kod/i,
    /stok\s*kod/i,
    /\bsku\b/i,
    /\bkod/i,
    /code/i,
  ]);
  const stock = guess(headers, [/fiili\s*stok/i, /stok/i, /miktar/i, /adet|qty|quantity/i], [code ?? ""]);
  const name = guess(headers, [/açıklama\S*\s*2/i, /ürün\s*ad/i, /\bad[ıi]?\b/i, /name|descr/i], [
    code ?? "",
    stock ?? "",
  ]);
  const code2 = guess(headers, [/üretici\s*kod/i, /stok\s*kod/i, /model/i, /tip/i], [
    code ?? "",
    stock ?? "",
    name ?? "",
  ]);
  return { code, code2, name, stock };
}
