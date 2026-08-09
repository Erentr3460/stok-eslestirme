import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { crawl, fetchDatasheetText, fetchSitemapUrls, type ScrapedProduct } from "../lib/scrape";

const DEFAULT_PREFIXES = ["AT-REC-", "AT-", "ROD-", "RODA-"];

async function ensureDefaults() {
  const existing = await db.select().from(schema.prefixRules);
  if (existing.length === 0) {
    await db.insert(schema.prefixRules).values(DEFAULT_PREFIXES.map((prefix) => ({ prefix })));
  }
}

async function upsertProducts(items: ScrapedProduct[]) {
  if (items.length === 0) return;
  for (const p of items) {
    await db
      .insert(schema.products)
      .values({ ...p, dsIds: JSON.stringify(p.dsIds), syncedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.products.slug,
        set: {
          url: p.url,
          sku: p.sku,
          skuNorm: p.skuNorm,
          name: p.name,
          nameNorm: p.nameNorm,
          brand: p.brand,
          price: p.price,
          discountedPrice: p.discountedPrice,
          stock: p.stock,
          quoteOnly: p.quoteOnly,
          image: p.image,
          dsIds: JSON.stringify(p.dsIds),
          syncedAt: new Date(),
        },
      });
  }
}

/**
 * Datasheet PDF'lerini indirip metnini ürüne yazar.
 * Sadece linki değişmiş veya hiç indirilmemiş ürünler işlenir.
 */
async function indexDatasheets(jobId: number) {
  const rows = await db.select().from(schema.products);
  const todo = rows.filter((r) => {
    const ids = JSON.parse(r.dsIds ?? "[]") as string[];
    return ids.length > 0 && (r.dsText === null || r.dsText === "");
  });
  await db.update(schema.syncJobs).set({ dsTotal: todo.length, dsDone: 0 }).where(eq(schema.syncJobs.id, jobId));

  let done = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < todo.length) {
      const p = todo[cursor++]!;
      const ids = JSON.parse(p.dsIds ?? "[]") as string[];
      const text = await fetchDatasheetText(ids);
      await db
        .update(schema.products)
        .set({ dsText: text, dsAt: new Date() })
        .where(eq(schema.products.id, p.id));
      done++;
      if (done % 5 === 0 || done === todo.length) {
        await db.update(schema.syncJobs).set({ dsDone: done }).where(eq(schema.syncJobs.id, jobId));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, todo.length) }, worker));
}

async function runSync(jobId: number) {
  try {
    const urls = await fetchSitemapUrls();
    await db.update(schema.syncJobs).set({ total: urls.length }).where(eq(schema.syncJobs.id, jobId));
    await crawl(urls, 14, async (fetched, batch) => {
      await upsertProducts(batch);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.products);
      await db
        .update(schema.syncJobs)
        .set({ fetched, productCount: Number(count) })
        .where(eq(schema.syncJobs.id, jobId));
    });
    await indexDatasheets(jobId);
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.products);
    await db
      .update(schema.syncJobs)
      .set({ status: "done", finishedAt: new Date(), productCount: Number(count) })
      .where(eq(schema.syncJobs.id, jobId));
  } catch (err) {
    await db
      .update(schema.syncJobs)
      .set({
        status: "error",
        message: err instanceof Error ? err.message : "bilinmeyen hata",
        finishedAt: new Date(),
      })
      .where(eq(schema.syncJobs.id, jobId));
  }
}

export const catalog = {
  /** Katalog özeti + son tarama durumu. */
  status: base.handler(async () => {
    await ensureDefaults();
    const [agg] = await db
      .select({
        total: sql<number>`count(*)`,
        withSku: sql<number>`sum(case when ${schema.products.sku} is not null and ${schema.products.sku} <> '' then 1 else 0 end)`,
        inStock: sql<number>`sum(case when coalesce(${schema.products.stock},0) > 0 then 1 else 0 end)`,
        lastSync: sql<number | null>`max(${schema.products.syncedAt})`,
      })
      .from(schema.products);
    const [job] = await db
      .select()
      .from(schema.syncJobs)
      .orderBy(desc(schema.syncJobs.id))
      .limit(1);
    const [aliasAgg] = await db.select({ n: sql<number>`count(*)` }).from(schema.aliases);
    return {
      total: Number(agg?.total ?? 0),
      withSku: Number(agg?.withSku ?? 0),
      inStock: Number(agg?.inStock ?? 0),
      lastSync: agg?.lastSync ? new Date(Number(agg.lastSync) * 1000) : null,
      aliasCount: Number(aliasAgg?.n ?? 0),
      job: job ?? null,
    };
  }),

  /** Taramayı arka planda başlatır; arayüz status ile ilerlemeyi izler. */
  sync: base.handler(async () => {
    const [running] = await db
      .select()
      .from(schema.syncJobs)
      .where(eq(schema.syncJobs.status, "running"))
      .limit(1);
    if (running) return { jobId: running.id, alreadyRunning: true };
    const [job] = await db.insert(schema.syncJobs).values({ status: "running" }).returning();
    void runSync(job!.id);
    return { jobId: job!.id, alreadyRunning: false };
  }),

  list: base
    .input(
      z.object({
        q: z.string().optional(),
        limit: z.number().min(1).max(1000).default(100),
      }),
    )
    .handler(async ({ input }) => {
      const rows = await db.select().from(schema.products).orderBy(schema.products.name);
      const q = input.q?.trim().toLowerCase();
      const filtered = q
        ? rows.filter(
            (r) =>
              r.sku?.toLowerCase().includes(q) ||
              r.name?.toLowerCase().includes(q) ||
              r.slug.toLowerCase().includes(q),
          )
        : rows;
      return { total: filtered.length, items: filtered.slice(0, input.limit) };
    }),
};
