import { norm } from "./normalize";

export const SITE = "https://slip-ring.com";

export interface ScrapedProduct {
  slug: string;
  url: string;
  sku: string | null;
  skuNorm: string | null;
  name: string | null;
  nameNorm: string | null;
  brand: string | null;
  price: string | null;
  discountedPrice: string | null;
  stock: number | null;
  quoteOnly: boolean;
  image: string | null;
  /** Ürün sayfasındaki "Technical Datasheets" PDF linklerinin Google Drive id'leri. */
  dsIds: string[];
}

const SKIP = /\/(pages|blog|search|cart|account)(\/|$)|\/(eu|uk)$/;

export async function fetchSitemapUrls(): Promise<string[]> {
  const res = await fetch(`${SITE}/sitemap.xml`, { headers: { "user-agent": "slipring-stock-tool" } });
  if (!res.ok) throw new Error(`sitemap alınamadı (HTTP ${res.status})`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.trim());
  return [...new Set(urls)].filter((u) => u !== `${SITE}/` && !SKIP.test(u));
}

function unescapeJs(s: string): string {
  return s
    .replace(/\\x3C/gi, "<")
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\\//g, "/");
}

const DRIVE_RE = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^"'\\]*?id=)([A-Za-z0-9_-]{20,})/g;

/** Sayfadaki Google Drive datasheet linklerinin id'lerini toplar. */
export function parseDatasheetIds(html: string): string[] {
  return [...new Set([...html.matchAll(DRIVE_RE)].map((m) => m[1]!))];
}

/** Ürün sayfasının içine gömülü TanStack Router state'inden ürün alanlarını çıkarır. */
export function parseProduct(html: string, url: string): ScrapedProduct | null {
  if (!html.includes('kind:"product"')) return null;
  const block = html.slice(html.indexOf('kind:"product"'));
  const pick = (re: RegExp): string | null => {
    const m = block.match(re);
    return m?.[1] !== undefined ? unescapeJs(m[1]) : null;
  };
  const slug = pick(/slug:"([^"]*)"/) ?? url.replace(`${SITE}/`, "");
  const name = pick(/name:"((?:[^"\\]|\\.)*)"/);
  const sku = pick(/sku:"((?:[^"\\]|\\.)*)"/);
  const stockRaw = block.match(/stock:(-?\d+)/)?.[1];
  return {
    slug,
    url,
    sku: sku && sku.trim() ? sku.trim() : null,
    skuNorm: sku ? norm(sku) : null,
    name: name?.trim() ?? null,
    nameNorm: name ? norm(name) : null,
    brand: pick(/brand:"((?:[^"\\]|\\.)*)"/),
    price: pick(/[,{]price:([\d.]+)/),
    discountedPrice: pick(/discounted_price:([\d.]+|null)/),
    stock: stockRaw ? Number.parseInt(stockRaw, 10) : null,
    quoteOnly: /quoteOnly:!0/.test(block),
    image: pick(/image:"((?:[^"\\]|\\.)*)"/),
    dsIds: parseDatasheetIds(html),
  };
}

/**
 * Google Drive'daki datasheet PDF'ini indirir, metnini çıkarır ve normalize eder.
 * ERP kodları (ör. "ZEN-X4EP H273V-Q1/2-4E-520-J001") site SKU'sunda değil,
 * yalnızca bu PDF'lerin içinde geçiyor.
 */
export async function fetchDatasheetText(ids: string[]): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const run = promisify(execFile);

  let all = "";
  for (const id of ids) {
    const pdf = path.join(os.tmpdir(), `ds-${id}.pdf`);
    const txt = `${pdf}.txt`;
    try {
      const res = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, {
        headers: { "user-agent": "slipring-stock-tool" },
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5000 || buf.subarray(0, 4).toString() !== "%PDF") continue;
      await fs.writeFile(pdf, buf);
      await run("pdftotext", ["-q", pdf, txt], { timeout: 60_000 });
      all += `\n${await fs.readFile(txt, "utf8")}`;
    } catch {
      /* tek datasheet hatası taramayı durdurmaz */
    } finally {
      await fs.rm(pdf, { force: true });
      await fs.rm(txt, { force: true });
    }
  }
  return norm(all);
}

export async function fetchProduct(url: string): Promise<ScrapedProduct | null> {
  const res = await fetch(url, { headers: { "user-agent": "slipring-stock-tool" } });
  if (!res.ok) return null;
  return parseProduct(await res.text(), url);
}

/** Verilen URL'leri sınırlı eşzamanlılıkla gezer, her sayfa sonrası onProgress çağırır. */
export async function crawl(
  urls: string[],
  concurrency: number,
  onProgress: (fetched: number, products: ScrapedProduct[]) => void | Promise<void>,
): Promise<ScrapedProduct[]> {
  const found: ScrapedProduct[] = [];
  let cursor = 0;
  let done = 0;
  let batch: ScrapedProduct[] = [];

  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++]!;
      try {
        const p = await fetchProduct(url);
        if (p) {
          found.push(p);
          batch.push(p);
        }
      } catch {
        /* tek sayfa hatası taramayı durdurmaz */
      }
      done++;
      if (done % 20 === 0 || done === urls.length) {
        const flush = batch;
        batch = [];
        await onProgress(done, flush);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  if (batch.length) await onProgress(done, batch);
  return found;
}
