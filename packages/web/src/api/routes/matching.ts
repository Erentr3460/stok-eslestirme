import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { type CatalogProduct, type ErpRow, runMatch } from "../lib/match";
import { norm, tidy, toInt } from "../lib/normalize";
import type { Mapping } from "./uploads";

async function loadContext(batchId: number) {
  const [b] = await db.select().from(schema.batches).where(eq(schema.batches.id, batchId));
  if (!b) throw new Error("Yükleme bulunamadı");
  const mapping = JSON.parse(b.mapping) as Mapping;
  const raw = JSON.parse(b.rows) as Record<string, string | number | null>[];
  const rows: ErpRow[] = raw.map((r, i) => ({
    i,
    code: mapping.code ? tidy(r[mapping.code]) : "",
    code2: mapping.code2 ? tidy(r[mapping.code2]) : "",
    name: mapping.name ? tidy(r[mapping.name]) : "",
    stock: mapping.stock ? toInt(r[mapping.stock]) : null,
  }));

  const products = (await db.select().from(schema.products)).map<CatalogProduct>((p) => ({
    slug: p.slug,
    url: p.url,
    sku: p.sku,
    skuNorm: p.skuNorm,
    name: p.name,
    nameNorm: p.nameNorm,
    brand: p.brand,
    stock: p.stock,
    dsText: p.dsText,
  }));
  const aliases = await db
    .select({ codeNorm: schema.aliases.codeNorm, slug: schema.aliases.slug })
    .from(schema.aliases);
  const prefixRows = await db.select().from(schema.prefixRules);
  const ignored = await db.select().from(schema.ignoredCodes);

  return {
    batch: b,
    mapping,
    products,
    result: runMatch({
      products,
      rows,
      aliases,
      prefixes: prefixRows.filter((p) => p.enabled).map((p) => p.prefix),
      ignored: ignored.map((i) => i.codeNorm),
    }),
  };
}

const overrideSchema = z.record(
  z.string(),
  z.object({ slug: z.string().nullable(), stock: z.number().nullable(), skip: z.boolean().optional() }),
);

export const matching = {
  /** Yüklemeyi mevcut katalog + alias + kurallarla eşleştirir. */
  run: base.input(z.object({ batchId: z.number() })).handler(async ({ input }) => {
    const { batch, mapping, result } = await loadContext(input.batchId);
    return {
      batchId: batch.id,
      filename: batch.filename,
      mapping,
      columns: JSON.parse(batch.columns) as string[],
      ...result,
    };
  }),

  /** Kullanıcı onayı: ERP kodunu bir ürüne kalıcı olarak bağlar. */
  confirm: base
    .input(z.object({ code: z.string(), slug: z.string() }))
    .handler(async ({ input }) => {
      const codeNorm = norm(input.code);
      if (!codeNorm) throw new Error("Kod boş");
      await db
        .insert(schema.aliases)
        .values({ codeNorm, codeRaw: input.code, slug: input.slug })
        .onConflictDoUpdate({
          target: schema.aliases.codeNorm,
          set: { slug: input.slug, codeRaw: input.code },
        });
      return { ok: true };
    }),

  unconfirm: base.input(z.object({ code: z.string() })).handler(async ({ input }) => {
    await db.delete(schema.aliases).where(eq(schema.aliases.codeNorm, norm(input.code)));
    return { ok: true };
  }),

  ignore: base.input(z.object({ code: z.string() })).handler(async ({ input }) => {
    const codeNorm = norm(input.code);
    if (!codeNorm) throw new Error("Kod boş");
    await db
      .insert(schema.ignoredCodes)
      .values({ codeNorm, codeRaw: input.code })
      .onConflictDoNothing();
    return { ok: true };
  }),

  unignore: base.input(z.object({ code: z.string() })).handler(async ({ input }) => {
    await db.delete(schema.ignoredCodes).where(eq(schema.ignoredCodes.codeNorm, norm(input.code)));
    return { ok: true };
  }),

  aliases: base.handler(() => db.select().from(schema.aliases).orderBy(schema.aliases.codeRaw)),
  ignored: base.handler(() => db.select().from(schema.ignoredCodes).orderBy(schema.ignoredCodes.codeRaw)),
  prefixes: base.handler(() => db.select().from(schema.prefixRules).orderBy(schema.prefixRules.prefix)),

  addPrefix: base.input(z.object({ prefix: z.string().min(1) })).handler(async ({ input }) => {
    await db
      .insert(schema.prefixRules)
      .values({ prefix: input.prefix.toUpperCase() })
      .onConflictDoNothing();
    return { ok: true };
  }),

  togglePrefix: base
    .input(z.object({ id: z.number(), enabled: z.boolean() }))
    .handler(async ({ input }) => {
      await db
        .update(schema.prefixRules)
        .set({ enabled: input.enabled })
        .where(eq(schema.prefixRules.id, input.id));
      return { ok: true };
    }),

  removePrefix: base.input(z.object({ id: z.number() })).handler(async ({ input }) => {
    await db.delete(schema.prefixRules).where(eq(schema.prefixRules.id, input.id));
    return { ok: true };
  }),

  /** Onaylanan satırlardan import dosyası üretir (xlsx + csv, base64). */
  exportFile: base
    .input(
      z.object({
        batchId: z.number(),
        overrides: overrideSchema.default({}),
        zeroIdle: z.boolean().default(false),
        onlyChanged: z.boolean().default(false),
      }),
    )
    .handler(async ({ input }) => {
      const { result, products, batch } = await loadContext(input.batchId);
      const bySlug = new Map(products.map((p) => [p.slug, p]));

      interface OutRow {
        SKU: string;
        "Ürün Adı": string;
        Slug: string;
        "Eski Stok": number | string;
        "Yeni Stok": number;
        Değişim: number | string;
        "ERP Kodu": string;
        "Eşleşme": string;
        Skor: number | string;
      }
      const out: OutRow[] = [];
      const usedSlugs = new Set<string>();

      for (const r of result.rows) {
        const ov = input.overrides[String(r.i)];
        if (ov?.skip) continue;
        const slug = ov?.slug ?? (r.status === "matched" ? r.slug : null);
        if (!slug) continue;
        const p = bySlug.get(slug);
        if (!p) continue;
        const newStock = ov?.stock ?? r.stock ?? 0;
        const old = p.stock ?? 0;
        if (input.onlyChanged && old === newStock) continue;
        usedSlugs.add(slug);
        out.push({
          SKU: p.sku ?? "",
          "Ürün Adı": p.name ?? "",
          Slug: p.slug,
          "Eski Stok": old,
          "Yeni Stok": newStock,
          Değişim: newStock - old,
          "ERP Kodu": r.code || r.code2 || r.name,
          "Eşleşme": ov ? "manuel" : r.reason,
          Skor: r.score,
        });
      }

      if (input.zeroIdle) {
        for (const p of result.idle) {
          if (usedSlugs.has(p.slug)) continue;
          const old = p.stock ?? 0;
          if (input.onlyChanged && old === 0) continue;
          out.push({
            SKU: p.sku ?? "",
            "Ürün Adı": p.name ?? "",
            Slug: p.slug,
            "Eski Stok": old,
            "Yeni Stok": 0,
            Değişim: -old,
            "ERP Kodu": "",
            "Eşleşme": "listede yok → 0",
            Skor: "",
          });
        }
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(out);
      ws["!cols"] = [
        { wch: 26 },
        { wch: 48 },
        { wch: 40 },
        { wch: 10 },
        { wch: 10 },
        { wch: 9 },
        { wch: 26 },
        { wch: 14 },
        { wch: 7 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Stok Import");
      const xlsxB64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const safe = batch.filename.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");
      return {
        rowCount: out.length,
        xlsxBase64: xlsxB64,
        csv,
        filename: `stok-import_${safe}_${stamp}`,
      };
    }),
};
