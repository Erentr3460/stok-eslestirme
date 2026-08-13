import type { CatalogProduct } from "../../../api/lib/match";
import { putMany, STORES, get, put } from "./store";
import { getCatalogKey } from "./auth";

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

/**
 * catalog.enc.json — panel şifresiyle AES-GCM şifrelenmiş katalog anlık görüntüsü.
 * Dosya herkese açık adreste dursa da şifre olmadan okunamaz.
 * GitHub Actions haftalık olarak tazeler.
 */
export function snapshotUrl(bust = false): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}catalog.enc.json${bust ? `?t=${Date.now()}` : ""}`;
}

interface EncryptedFile {
  v: number;
  alg: string;
  iv: string;
  data: string;
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptSnapshot(file: EncryptedFile): Promise<Snapshot> {
  const key = await getCatalogKey();
  if (!key) throw new Error("Katalog kilitli — şifre gerekiyor.");
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(file.iv) as BufferSource },
      key,
      fromBase64(file.data) as BufferSource,
    );
  } catch {
    throw new Error("Katalog çözülemedi — şifre eşleşmiyor.");
  }
  return JSON.parse(new TextDecoder().decode(plain)) as Snapshot;
}

async function seedOnce(snap: Snapshot) {
  // Katalogla gelen alias'lar her yüklemede birleştirilir: yeni ürün eşleşmeleri
  // mevcut tarayıcılara da ulaşsın diye. Anahtar codeNorm olduğu için kendi
  // onayladığın eşleşmeler silinmez, sadece eksik olanlar eklenir.
  await putMany(STORES.aliases, snap.seed.aliases);

  // Ignore listesi ve prefix kuralları yalnızca ilk açılışta kurulur —
  // sonradan yaptığın açma/kapama tercihleri korunsun.
  const done = await get<{ key: string; value: string }>(STORES.meta, "seeded");
  if (done) return;
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
    const snap = await decryptSnapshot((await res.json()) as EncryptedFile);
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
