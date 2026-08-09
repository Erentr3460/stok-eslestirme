import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Site katalogu — slip-ring.com sitemap taramasından gelen ürünler. */
export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    url: text("url").notNull(),
    sku: text("sku"),
    skuNorm: text("sku_norm"),
    name: text("name"),
    nameNorm: text("name_norm"),
    brand: text("brand"),
    price: text("price"),
    discountedPrice: text("discounted_price"),
    stock: integer("stock"),
    quoteOnly: integer("quote_only", { mode: "boolean" }).default(false),
    image: text("image"),
    /** Ürün sayfasındaki teknik datasheet PDF'lerinin Google Drive id'leri (JSON: string[]). */
    dsIds: text("ds_ids"),
    /** Datasheet PDF metinlerinin normalize edilmiş hali — ERP kodu burada aranır. */
    dsText: text("ds_text"),
    dsAt: integer("ds_at", { mode: "timestamp" }),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("products_slug_uq").on(t.slug)],
);

/** Katalog tarama işi — arka planda çalışır, arayüz durumu buradan okur. */
export const syncJobs = sqliteTable("sync_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull().default("running"), // running | done | error
  total: integer("total").notNull().default(0),
  fetched: integer("fetched").notNull().default(0),
  productCount: integer("product_count").notNull().default(0),
  /** Datasheet indeksleme ilerlemesi. */
  dsTotal: integer("ds_total").notNull().default(0),
  dsDone: integer("ds_done").notNull().default(0),
  message: text("message"),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
});

/** Kullanıcının onayladığı kalıcı eşleştirmeler: ERP kodu -> site slug. */
export const aliases = sqliteTable(
  "aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    codeNorm: text("code_norm").notNull(),
    codeRaw: text("code_raw").notNull(),
    slug: text("slug").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("aliases_code_uq").on(t.codeNorm)],
);

/** Yoksayılan ERP kodları — bir daha "bulunamadı" listesinde rahatsız etmesin. */
export const ignoredCodes = sqliteTable(
  "ignored_codes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    codeNorm: text("code_norm").notNull(),
    codeRaw: text("code_raw").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("ignored_code_uq").on(t.codeNorm)],
);

/** SKU önek kuralları — site SKU'sundaki önek ERP kodunda yoksa soyulur (AT-REC-A1M -> A1M). */
export const prefixRules = sqliteTable(
  "prefix_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    prefix: text("prefix").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("prefix_uq").on(t.prefix)],
);

/** Yüklenen Excel + eşleştirme sonucu (satırlar JSON olarak saklanır). */
export const batches = sqliteTable("batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  sheetName: text("sheet_name"),
  columns: text("columns").notNull(), // JSON: string[]
  mapping: text("mapping").notNull(), // JSON: { code, code2, name, stock }
  rows: text("rows").notNull(), // JSON: ErpRow[]
  rowCount: integer("row_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
