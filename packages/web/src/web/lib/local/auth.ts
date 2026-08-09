import config from "./auth-config.json";

/**
 * Panel giriş şifresi.
 * Şifrenin kendisi hiçbir yerde saklanmaz — sadece PBKDF2-SHA256 özeti (hash)
 * kod içinde durur. Girilen şifre aynı tuz ve tur sayısıyla özetlenip
 * karşılaştırılır, doğruysa oturum sekme kapanana kadar açık kalır.
 */

const SESSION_KEY = "slipring.unlocked";
const KEY_STORE = "slipring.ck";

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, saltHex: string, iterations: number) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((h) => Number.parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

export async function verify(password: string): Promise<boolean> {
  const got = await hashPassword(password, config.salt, config.iterations);
  return got === config.hash;
}

export function isUnlocked(): boolean {
  if (!config.hash) return true;
  // Katalog anahtarı da gerekli — biri olmadan panel açılırsa katalog çözülemez.
  return (
    sessionStorage.getItem(SESSION_KEY) === config.hash && sessionStorage.getItem(KEY_STORE) !== null
  );
}

export function unlock(): void {
  sessionStorage.setItem(SESSION_KEY, config.hash);
}

export function lock(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(KEY_STORE);
  cachedKey = null;
}

/**
 * Katalog şifre çözme anahtarı.
 * Giriş doğrulama hash'inden ayrı bir tuzla türetilir, böylece koddaki hash'i
 * gören biri katalogu çözemez. Türetilmiş anahtar sekme oturumunda tutulur ki
 * her sayfa yenilemesinde 310000 turluk hesap tekrarlanmasın.
 */
let cachedKey: CryptoKey | null = null;

async function importAesKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/.{2}/g)!.map((h) => Number.parseInt(h, 16)));
}

/** Şifreden AES anahtarını türetir ve oturuma yazar. */
export async function deriveCatalogKey(password: string): Promise<void> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: fromHex(config.encSalt) as BufferSource,
      iterations: config.iterations,
      hash: "SHA-256",
    },
    base,
    256,
  );
  sessionStorage.setItem(KEY_STORE, toHex(bits));
  cachedKey = await importAesKey(bits);
}

/** Oturumdaki anahtarı verir; yoksa null. */
export async function getCatalogKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  const hex = sessionStorage.getItem(KEY_STORE);
  if (!hex) return null;
  cachedKey = await importAesKey(fromHex(hex).buffer as ArrayBuffer);
  return cachedKey;
}

/** Şifre tanımlı değilse giriş ekranı hiç gösterilmez. */
export const passwordEnabled = Boolean(config.hash);
