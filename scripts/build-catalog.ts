/**
 * slip-ring.com kataloğunu tarar ve packages/web/public/catalog.json dosyasını üretir.
 * Sunucusuz (statik) sürümde eşleştirme bu dosyaya dayanır.
 * Çalıştırma: bun scripts/build-catalog.ts
 * Gereksinim: pdftotext (poppler-utils)
 */
import { crawl, fetchDatasheetText, fetchSitemapUrls } from "../packages/web/src/api/lib/scrape";
import { norm } from "../packages/web/src/api/lib/normalize";

const OUT = new URL("../packages/web/public/catalog.json", import.meta.url).pathname;

interface Existing {
  products?: { slug: string; dsText?: string | null }[];
  seed?: unknown;
}

const previous: Existing = await Bun.file(OUT)
  .json()
  .catch(() => ({}) as Existing);
const oldDs = new Map((previous.products ?? []).map((p) => [p.slug, p.dsText ?? null]));

const urls = await fetchSitemapUrls();
console.log(`sitemap: ${urls.length} url`);

const products = await crawl(urls, 12, (fetched) => {
  if (fetched % 100 === 0) console.log(`  ${fetched}/${urls.length}`);
});
console.log(`ürün: ${products.length}`);

// Datasheet metinleri: daha önce indirilmişse tekrar indirme.
let done = 0;
const withDs = products.filter((p) => p.dsIds.length > 0);
const dsText = new Map<string, string | null>();
let cursor = 0;
const worker = async () => {
  while (cursor < withDs.length) {
    const p = withDs[cursor++]!;
    const cached = oldDs.get(p.slug);
    if (cached) {
      dsText.set(p.slug, cached);
    } else {
      dsText.set(p.slug, await fetchDatasheetText(p.dsIds));
    }
    done++;
    if (done % 10 === 0) console.log(`  datasheet ${done}/${withDs.length}`);
  }
};
await Promise.all(Array.from({ length: Math.min(5, withDs.length) }, worker));

const seed = (previous.seed as Record<string, unknown> | undefined) ?? {
  aliases: [],
  ignored: [],
  prefixes: [
    { prefix: "AT-REC-", enabled: true },
    { prefix: "AT-", enabled: true },
    { prefix: "ROD-", enabled: true },
    { prefix: "RODA-", enabled: true },
  ],
};

const snapshot = {
  syncedAt: new Date().toISOString(),
  products: products
    .map((p) => ({
      slug: p.slug,
      url: p.url,
      sku: p.sku,
      skuNorm: p.skuNorm ?? (p.sku ? norm(p.sku) : null),
      name: p.name,
      nameNorm: p.nameNorm,
      brand: p.brand,
      price: p.price,
      stock: p.stock,
      dsText: dsText.get(p.slug) ?? null,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug)),
  seed,
};

await Bun.write(OUT, JSON.stringify(snapshot));
console.log(`yazıldı: ${OUT} (${snapshot.products.length} ürün, ${withDs.length} datasheet)`);
