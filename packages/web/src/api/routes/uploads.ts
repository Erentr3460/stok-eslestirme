import { desc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { detectMapping, type Mapping } from "../lib/mapping";
import { tidy } from "../lib/normalize";

const mappingSchema = z.object({
  code: z.string().nullable(),
  code2: z.string().nullable(),
  name: z.string().nullable(),
  stock: z.string().nullable(),
});

export type { Mapping };

export const uploads = {
  /** Excel'i yükler, başlıkları okur, kolonları tahmin eder ve satırları saklar. */
  create: base
    .input(z.object({ filename: z.string(), dataBase64: z.string() }))
    .handler(async ({ input }) => {
      const buf = Buffer.from(input.dataBase64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
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
      const [batch] = await db
        .insert(schema.batches)
        .values({
          filename: input.filename,
          sheetName,
          columns: JSON.stringify(headers),
          mapping: JSON.stringify(mapping),
          rows: JSON.stringify(rows),
          rowCount: rows.length,
        })
        .returning();
      return {
        id: batch!.id,
        filename: batch!.filename,
        sheetName,
        columns: headers,
        mapping,
        rowCount: rows.length,
        preview: rows.slice(0, 8),
      };
    }),

  list: base.handler(async () => {
    const rows = await db
      .select({
        id: schema.batches.id,
        filename: schema.batches.filename,
        rowCount: schema.batches.rowCount,
        createdAt: schema.batches.createdAt,
      })
      .from(schema.batches)
      .orderBy(desc(schema.batches.id))
      .limit(30);
    return rows;
  }),

  get: base.input(z.object({ id: z.number() })).handler(async ({ input }) => {
    const [b] = await db.select().from(schema.batches).where(eq(schema.batches.id, input.id));
    if (!b) return null;
    const rows = JSON.parse(b.rows) as Record<string, string | number | null>[];
    return {
      id: b.id,
      filename: b.filename,
      sheetName: b.sheetName,
      columns: JSON.parse(b.columns) as string[],
      mapping: JSON.parse(b.mapping) as Mapping,
      rowCount: b.rowCount,
      createdAt: b.createdAt,
      preview: rows.slice(0, 8),
    };
  }),

  setMapping: base
    .input(z.object({ id: z.number(), mapping: mappingSchema }))
    .handler(async ({ input }) => {
      await db
        .update(schema.batches)
        .set({ mapping: JSON.stringify(input.mapping) })
        .where(eq(schema.batches.id, input.id));
      return { ok: true };
    }),

  remove: base.input(z.object({ id: z.number() })).handler(async ({ input }) => {
    await db.delete(schema.batches).where(eq(schema.batches.id, input.id));
    return { ok: true };
  }),
};
