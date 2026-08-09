import type { CatalogProduct } from "../../../api/lib/match";
import { putMany, STORES, get, put } from "./store";

export interface SnapshotProduct extends CatalogProduct {
  price: string | null;
}

export interface Snapshot {
  syncedAt: string;
  products: SnapshotProduct[];
  seed: {
    aliases: { codeNorm: string; codeRaw: string; slug: string }[];
    ignored: { codeNorm: string; codeRaw: string }[];
    prefixes: { prefix: string; enabled: boolean }[];
  };
}

let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

/** catalog.json statik dosyası — GitHub Actions haftalık olarak tazeler. */
export function snapshotUrl(bust = false): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}catalog.json${bust ? `?t=${Date.now()}` : ""}`;
}

async function seedOnce(snap: Snapshot) {
  const done = await get<{ key: string; value: string }>(STORES.meta, "seeded");
  if (done) return;
  await putMany(STORES.aliases, snap.seed.aliases);
  await putMany(STORES.ignored, snap.seed.ignored);
  await putMany(
    STORES.prefixes,
    snap.seed.prefixes.map((p, i) => ({ id: i + 1, prefix: p.prefix, enabled: p.enabled })),
  );
  await put(STORES.meta, { key: "seeded", value: new Date().toISOString() });
}

export async function loadSnapshot(force = false): Promise<Snapshot> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const res = await fetch(snapshotUrl(force), { cache: force ? "reload" : "default" });
    if (!res.ok) throw new Error(`Katalog dosyası okunamadı (HTTP ${res.status})`);
    const snap = (await res.json()) as Snapshot;
    cache = snap;
    await seedOnce(snap);
    return snap;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
