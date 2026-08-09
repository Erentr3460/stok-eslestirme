import config from "./auth-config.json";

/**
 * Panel giriş şifresi.
 * Şifrenin kendisi hiçbir yerde saklanmaz — sadece PBKDF2-SHA256 özeti (hash)
 * kod içinde durur. Girilen şifre aynı tuz ve tur sayısıyla özetlenip
 * karşılaştırılır, doğruysa oturum sekme kapanana kadar açık kalır.
 */

const SESSION_KEY = "slipring.unlocked";

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
  return sessionStorage.getItem(SESSION_KEY) === config.hash;
}

export function unlock(): void {
  sessionStorage.setItem(SESSION_KEY, config.hash);
}

export function lock(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

/** Şifre tanımlı değilse giriş ekranı hiç gösterilmez. */
export const passwordEnabled = Boolean(config.hash);
