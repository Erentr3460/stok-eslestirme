import * as XLSX from "xlsx";
import type { CatalogProduct, ErpRow, MatchResult } from "../../../api/lib/match";
import { matchOffThread } from "./match-client";
import { detectMapping, type Mapping } from "../../../api/lib/mapping";
import { norm, tidy, toInt } from "../../../api/lib/normalize";
import { loadSnapshot, type SnapshotProduct } from "./catalog-data";
import { all, del, get, put, STORES } from "./store";

export interface SyncJob {
  id: number;
  status: "running" | "done" | "error";
  fetched: number;
  total: number;
  productCount: number;
  dsTotal: number | null;
  dsDone: number | null;
  message: string | null;
}

interface BatchRecord {
  id?: number;
  filename: string;
  sheetName: string;
  columns: string[];
  mapping: Mapping;
  rows: Record<string, string | number | null>[];
  rowCount: number;
  createdAt: string;
}

interface AliasRecord {
  codeNorm: string;
  codeRaw: string;
  slug: string;
}

interface IgnoredRecord {
  codeNorm: string;
  codeRaw: string;
}

interface PrefixRecord {
  id: number;
  prefix: string;
  enabled: boolean;
}

async function requireBatch(id: number): Promise<BatchRecord & { id: number }> {
  const b = await get<BatchRecord & { id: number }>(STORES.batches, id);
  if (!b) throw new Error("Yükleme bulunamadı");
  return b;
}

/** Kısa ömürlü sonuç önbelleği: aynı girdide (ör. eşleştir → dışa aktar) yeniden taramayı önler. */
let lastRun: { key: string; result: MatchResult } | null = null;

function cheapHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

async function loadContext(batchId: number) {
  const batch = await requireBatch(batchId);
  const snap = await loadSnapshot();
  const rows: ErpRow[] = batch.rows.map((r, i) => ({
    i,
    code: batch.mapping.code ? tidy(r[batch.mapping.code]) : "",
    code2: batch.mapping.code2 ? tidy(r[batch.mapping.code2]) : "",
    name: batch.mapping.name ? tidy(r[batch.mapping.name]) : "",
    stock: batch.mapping.stock ? toInt(r[batch.mapping.stock]) : null,
  }));
  const products: CatalogProduct[] = snap.products;
  const aliases = await all<AliasRecord>(STORES.aliases);
  const ignored = await all<IgnoredRecord>(STORES.ignored);
  const prefixes = await all<PrefixRecord>(STORES.prefixes);

  const input = {
    products,
    rows,
    aliases: aliases.map((a) => ({ codeNorm: a.codeNorm, slug: a.slug })),
    prefixes: prefixes.filter((p) => p.enabled).map((p) => p.prefix),
    ignored: ignored.map((i) => i.codeNorm),
  };

  const key = [
    batchId,
    rows.length,
    snap.syncedAt,
    products.length,
    cheapHash(input.aliases.map((a) => `${a.codeNorm}>${a.slug}`).join("|")),
    cheapHash(input.ignored.join("|")),
    input.prefixes.join(","),
    cheapHash(JSON.stringify(batch.mapping)),
  ].join("~");

  if (lastRun && lastRun.key === key) return { batch, products, result: lastRun.result };

  const result = await matchOffThread(input);
  lastRun = { key, result };
  return { batch, products, result };
}

export const localRouter = {
  ping: () => Promise.resolve({ ok: true as const }),

  catalog: {
    async status(): Promise<{
      total: number;
      withSku: number;
      inStock: number;
      lastSync: Date | null;
      aliasCount: number;
      job: SyncJob | null;
    }> {
      const snap = await loadSnapshot();
      const aliases = await all<AliasRecord>(STORES.aliases);
      return {
        total: snap.products.length,
        withSku: snap.products.filter((p) => p.sku && p.sku.trim() !== "").length,
        inStock: snap.products.filter((p) => (p.stock ?? 0) > 0).length,
        lastSync: snap.syncedAt ? new Date(snap.syncedAt) : null,
        aliasCount: aliases.length,
        job: null,
      };
    },

    /** Statik sürümde tarama yapılmaz; yayınlanmış katalog dosyası yeniden çekilir. */
    async sync(): Promise<{ jobId: number; alreadyRunning: boolean }> {
      await loadSnapshot(true);
      return { jobId: 0, alreadyRunning: false };
    },

    async list(input: { q?: string; limit?: number }): Promise<{
      total: number;
      items: SnapshotProduct[];
    }> {
      const snap = await loadSnapshot();
      const q = input.q?.trim().toLowerCase();
      const sorted = [...snap.products].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "tr"));
      const filtered = q
        ? sorted.filter(
            (r) =>
              r.sku?.toLowerCase().includes(q) ||
              r.name?.toLowerCase().includes(q) ||
              r.slug.toLowerCase().includes(q),
          )
        : sorted;
      return { total: filtered.length, items: filtered.slice(0, input.limit ?? 100) };
    },
  },

  uploads: {
    async create(input: { filename: string; dataBase64: string }) {
      const wb = XLSX.read(input.dataBase64, { type: "base64" });
      const sheetName = wb.SheetNames[0]!;
      const ws = wb.Sheets[sheetName]!;
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
      const headers = (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0] ?? [])
        .map((h) => tidy(h))
        .filter((h) => h.length > 0);
      const mapping = detectMapping(headers);
      const rows = raw.map((r) => {
        const o: Record<string, string | number | null> = {};
        for (const h of headers) {
          const v = r[h];
          o[h] = v === null || v === undefined ? null : typeof v === "number" ? v : tidy(v);
        }
        return o;
      });
      const record: BatchRecord = {
        filename: input.filename,
        sheetName,
        columns: headers,
        mapping,
        rows,
        rowCount: rows.length,
        createdAt: new Date().toISOString(),
      };
      const id = await put(STORES.batches, record);
      return {
        id,
        filename: record.filename,
        sheetName,
        columns: headers,
        mapping,
        rowCount: rows.length,
        preview: rows.slice(0, 8),
      };
    },

    async list() {
      const rows = await all<BatchRecord & { id: number }>(STORES.batches);
      return rows
        .sort((a, b) => b.id - a.id)
        .slice(0, 30)
        .map((b) => ({
          id: b.id,
          filename: b.filename,
          rowCount: b.rowCount,
          createdAt: b.createdAt,
        }));
    },

    async get(input: { id: number }) {
      const b = await get<BatchRecord & { id: number }>(STORES.batches, input.id);
      if (!b) return null;
      return {
        id: b.id,
        filename: b.filename,
        sheetName: b.sheetName,
        columns: b.columns,
        mapping: b.mapping,
        rowCount: b.rowCount,
        createdAt: b.createdAt,
        preview: b.rows.slice(0, 8),
      };
    },

    async setMapping(input: { id: number; mapping: Mapping }) {
      const b = await requireBatch(input.id);
      await put(STORES.batches, { ...b, mapping: input.mapping });
      return { ok: true as const };
    },

    async remove(input: { id: number }) {
      await del(STORES.batches, input.id);
      return { ok: true as const };
    },
  },

  matching: {
    async run(input: { batchId: number }) {
      const { batch, result } = await loadContext(input.batchId);
      return {
        batchId: batch.id,
        filename: batch.filename,
        mapping: batch.mapping,
        columns: batch.columns,
        ...result,
      };
    },

    async confirm(input: { code: string; slug: string }) {
      const codeNorm = norm(input.code);
      if (!codeNorm) throw new Error("Kod boş");
      await put<AliasRecord>(STORES.aliases, { codeNorm, codeRaw: input.code, slug: input.slug });
      return { ok: true as const };
    },

    async unconfirm(input: { code: string }) {
      await del(STORES.aliases, norm(input.code));
      return { ok: true as const };
    },

    async ignore(input: { code: string }) {
      const codeNorm = norm(input.code);
      if (!codeNorm) throw new Error("Kod boş");
      await put<IgnoredRecord>(STORES.ignored, { codeNorm, codeRaw: input.code });
      return { ok: true as const };
    },

    async unignore(input: { code: string }) {
      await del(STORES.ignored, norm(input.code));
      return { ok: true as const };
    },

    async aliases() {
      const rows = await all<AliasRecord>(STORES.aliases);
      return rows.sort((a, b) => a.codeRaw.localeCompare(b.codeRaw, "tr"));
    },

    async ignored() {
      const rows = await all<IgnoredRecord>(STORES.ignored);
      return rows.sort((a, b) => a.codeRaw.localeCompare(b.codeRaw, "tr"));
    },

    async prefixes() {
      const rows = await all<PrefixRecord>(STORES.prefixes);
      return rows.sort((a, b) => a.prefix.localeCompare(b.prefix, "tr"));
    },

    async addPrefix(input: { prefix: string }) {
      const prefix = input.prefix.toUpperCase();
      const rows = await all<PrefixRecord>(STORES.prefixes);
      if (rows.some((r) => r.prefix === prefix)) return { ok: true as const };
      const id = Math.max(0, ...rows.map((r) => r.id)) + 1;
      await put<PrefixRecord>(STORES.prefixes, { id, prefix, enabled: true });
      return { ok: true as const };
    },

    async togglePrefix(input: { id: number; enabled: boolean }) {
      const row = await get<PrefixRecord>(STORES.prefixes, input.id);
      if (row) await put<PrefixRecord>(STORES.prefixes, { ...row, enabled: input.enabled });
      return { ok: true as const };
    },

    async removePrefix(input: { id: number }) {
      await del(STORES.prefixes, input.id);
      return { ok: true as const };
    },

    async exportFile(input: {
      batchId: number;
      overrides: Record<string, { slug: string | null; stock: number | null; skip?: boolean }>;
      zeroIdle: boolean;
      onlyChanged: boolean;
    }) {
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
        Eşleşme: string;
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
          Eşleşme: ov ? "manuel" : r.reason,
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
            Eşleşme: "listede yok → 0",
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
      const xlsxBase64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const safe = batch.filename.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");
      return {
        rowCount: out.length,
        xlsxBase64,
        csv,
        filename: `stok-import_${safe}_${stamp}`,
      };
    },
  },
};

export type LocalRouter = typeof localRouter;
