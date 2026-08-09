import { norm, similarity } from "./normalize";

export interface CatalogProduct {
  slug: string;
  url: string;
  sku: string | null;
  skuNorm: string | null;
  name: string | null;
  nameNorm: string | null;
  brand: string | null;
  stock: number | null;
  /** Datasheet PDF metninin normalize hali (ERP kodları burada geçer). */
  dsText?: string | null;
}

export interface ErpRow {
  i: number;
  code: string;
  code2: string;
  name: string;
  stock: number | null;
}

export type MatchReason =
  | "alias"
  | "exact"
  | "prefix"
  | "datasheet"
  | "name"
  | "contains"
  | "fuzzy"
  | "conflict"
  | "duplicate"
  | "none";

export interface Candidate {
  slug: string;
  sku: string | null;
  name: string | null;
  brand: string | null;
  stock: number | null;
  score: number;
  reason: MatchReason;
  via: string;
}

export interface MatchRow extends ErpRow {
  status: "matched" | "review" | "missing" | "ignored";
  reason: MatchReason;
  score: number;
  slug: string | null;
  candidates: Candidate[];
  /** Aynı ürüne düşen diğer ERP satır indeksleri. */
  groupRows?: number[];
  groupSum?: number | null;
}

export interface MatchInput {
  products: CatalogProduct[];
  rows: ErpRow[];
  aliases: { codeNorm: string; slug: string }[];
  prefixes: string[];
  ignored: string[];
}

export interface MatchSummary {
  matched: number;
  review: number;
  missing: number;
  ignored: number;
  idle: number;
  changed: number;
}

export interface MatchResult {
  rows: MatchRow[];
  /** Sitede olup Excel'de karşılığı bulunmayan ürünler. */
  idle: CatalogProduct[];
  summary: MatchSummary;
}

const AUTO_THRESHOLD = 85;

function push(map: Map<string, CatalogProduct[]>, key: string, p: CatalogProduct) {
  if (!key || key.length < 2) return;
  const arr = map.get(key);
  if (arr) {
    if (!arr.some((x) => x.slug === p.slug)) arr.push(p);
  } else map.set(key, [p]);
}

export function runMatch(input: MatchInput): MatchResult {
  const { products, rows } = input;
  const aliasMap = new Map(input.aliases.map((a) => [a.codeNorm, a.slug]));
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const ignoredSet = new Set(input.ignored);
  const prefixes = input.prefixes.map((p) => norm(p)).filter((p) => p.length >= 2);

  const exactIdx = new Map<string, CatalogProduct[]>();
  const prefixIdx = new Map<string, CatalogProduct[]>();
  const nameIdx = new Map<string, CatalogProduct[]>();

  for (const p of products) {
    if (p.skuNorm) {
      push(exactIdx, p.skuNorm, p);
      for (const pre of prefixes) {
        if (p.skuNorm.startsWith(pre) && p.skuNorm.length - pre.length >= 3) {
          push(prefixIdx, p.skuNorm.slice(pre.length), p);
        }
      }
    }
    if (p.nameNorm) push(nameIdx, p.nameNorm, p);
  }

  const withDs = products.filter((p) => p.dsText && p.dsText.length > 20);

  const out: MatchRow[] = [];

  for (const row of rows) {
    const cands: { code: string; raw: string }[] = [];
    const seen = new Set<string>();
    for (const raw of [row.code, row.code2, row.name]) {
      const n = norm(raw);
      if (n && !seen.has(n)) {
        seen.add(n);
        cands.push({ code: n, raw });
      }
    }

    if (cands.length === 0) {
      out.push({ ...row, status: "missing", reason: "none", score: 0, slug: null, candidates: [] });
      continue;
    }
    if (cands.some((c) => ignoredSet.has(c.code))) {
      out.push({ ...row, status: "ignored", reason: "none", score: 0, slug: null, candidates: [] });
      continue;
    }

    const found = new Map<string, Candidate>();
    const add = (p: CatalogProduct, score: number, reason: MatchReason, via: string) => {
      const prev = found.get(p.slug);
      if (prev && prev.score >= score) return;
      found.set(p.slug, {
        slug: p.slug,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        stock: p.stock,
        score,
        reason,
        via,
      });
    };

    // 1) Kalıcı alias (kullanıcı bir kere onaylamış)
    for (const c of cands) {
      const slug = aliasMap.get(c.code);
      const p = slug ? bySlug.get(slug) : undefined;
      if (p) add(p, 100, "alias", c.raw);
    }
    // 2) Birebir SKU
    for (const c of cands) for (const p of exactIdx.get(c.code) ?? []) add(p, 100, "exact", c.raw);
    // 3) Önek soyulmuş SKU (AT-REC-A1M -> A1M)
    for (const c of cands) for (const p of prefixIdx.get(c.code) ?? []) add(p, 92, "prefix", c.raw);
    // 4) Datasheet PDF'i — ERP kodu ürünün teknik dokümanının içinde geçiyor mu
    if (Math.max(0, ...[...found.values()].map((c) => c.score)) < 100) {
      for (const c of cands) {
        if (c.code.length < 8) continue;
        for (const p of withDs) {
          if ((p.dsText ?? "").includes(c.code)) add(p, 96, "datasheet", c.raw);
        }
      }
    }
    // 5) Birebir ürün adı
    for (const c of cands) for (const p of nameIdx.get(c.code) ?? []) add(p, 88, "name", c.raw);

    // 6-7-8) Zayıf sinyaller: yalnızca kesin eşleşme yoksa taranır
    const best = Math.max(0, ...[...found.values()].map((c) => c.score));
    if (best < AUTO_THRESHOLD) {
      for (const c of cands) {
        if (c.code.length < 5) continue;
        for (const p of products) {
          const sku = p.skuNorm ?? "";
          const nm = p.nameNorm ?? "";
          if (sku.length >= 5 && (sku.includes(c.code) || c.code.includes(sku))) {
            const ratio = Math.min(sku.length, c.code.length) / Math.max(sku.length, c.code.length);
            add(p, Math.round(55 + ratio * 25), "contains", c.raw);
          } else if (c.code.length >= 6 && nm.length >= 6 && nm.includes(c.code)) {
            add(p, 70, "contains", c.raw);
          } else if (sku.length >= 5) {
            const sim = Math.max(similarity(sku, c.code), similarity(nm, c.code));
            if (sim >= 0.5) add(p, Math.round(sim * 78), "fuzzy", c.raw);
          }
          // Datasheet metninde kısmi geçiş — kesin eşleşme yokken öneri olarak sunulur
          if (c.code.length >= 6 && (p.dsText ?? "").includes(c.code)) {
            add(p, 84, "datasheet", c.raw);
          }
        }
      }
    }

    const list = [...found.values()].sort((a, b) => b.score - a.score).slice(0, 6);
    if (list.length === 0) {
      out.push({ ...row, status: "missing", reason: "none", score: 0, slug: null, candidates: [] });
      continue;
    }
    const top = list[0]!;
    const tie = list.filter((c) => c.score === top.score).length > 1;
    const auto = top.score >= AUTO_THRESHOLD && !tie;
    out.push({
      ...row,
      status: auto ? "matched" : "review",
      reason: tie ? "conflict" : top.reason,
      score: top.score,
      slug: auto ? top.slug : null,
      candidates: list,
    });
  }

  // Aynı ürüne düşen birden fazla otomatik satır → onaya düşer (yanlışlıkla stok ezilmesin)
  const groups = new Map<string, MatchRow[]>();
  for (const r of out) if (r.status === "matched" && r.slug) {
    const g = groups.get(r.slug);
    if (g) g.push(r);
    else groups.set(r.slug, [r]);
  }
  for (const [, g] of groups) {
    if (g.length < 2) continue;
    const sum = g.reduce((acc, r) => acc + (r.stock ?? 0), 0);
    for (const r of g) {
      r.status = "review";
      r.reason = "duplicate";
      r.groupRows = g.map((x) => x.i);
      r.groupSum = sum;
    }
  }

  const usedSlugs = new Set(out.filter((r) => r.slug).map((r) => r.slug as string));
  const idle = products.filter((p) => !usedSlugs.has(p.slug));

  const summary: MatchSummary = {
    matched: out.filter((r) => r.status === "matched").length,
    review: out.filter((r) => r.status === "review").length,
    missing: out.filter((r) => r.status === "missing").length,
    ignored: out.filter((r) => r.status === "ignored").length,
    idle: idle.length,
    changed: out.filter(
      (r) => r.status === "matched" && (bySlug.get(r.slug!)?.stock ?? null) !== (r.stock ?? 0),
    ).length,
  };

  return { rows: out, idle, summary };
}
