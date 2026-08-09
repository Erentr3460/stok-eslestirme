/**
 * catalog.json dosyasını panel şifresiyle şifreler ve catalog.enc.json üretir.
 *
 * Şifreleme: AES-256-GCM. Anahtar, panel şifresinden PBKDF2-SHA256 (310000 tur)
 * ile türetilir; giriş ekranındaki doğrulama hash'inden AYRI bir tuz kullanılır,
 * böylece hash'i gören biri anahtarı türetemez.
 *
 * Düz şifre hiçbir çıktıya yazılmaz. Şifre PANEL_PASSWORD ortam değişkeninden
 * (yerelde .env, GitHub Actions'ta secret) okunur.
 *
 * Kullanım: PANEL_PASSWORD=... bun scripts/encrypt-catalog.ts
 */
import { webcrypto as crypto } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const PLAIN = `${ROOT}packages/web/public/catalog.json`;
const ENC = `${ROOT}packages/web/public/catalog.enc.json`;
const CONFIG = `${ROOT}packages/web/src/web/lib/local/auth-config.json`;

const password = process.env.PANEL_PASSWORD;
if (!password) {
  console.error("PANEL_PASSWORD tanımlı değil.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(CONFIG, "utf8")) as {
  salt: string;
  iterations: number;
  hash: string;
  encSalt?: string;
};

if (!config.encSalt) {
  console.error("auth-config.json içinde encSalt yok.");
  process.exit(1);
}

function fromHex(hex: string) {
  return Uint8Array.from(hex.match(/.{2}/g)!.map((h) => Number.parseInt(h, 16)));
}

const baseKey = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
  "PBKDF2",
  false,
  ["deriveKey"],
);
const key = await crypto.subtle.deriveKey(
  {
    name: "PBKDF2",
    salt: fromHex(config.encSalt),
    iterations: config.iterations,
    hash: "SHA-256",
  },
  baseKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
);

const plaintext = readFileSync(PLAIN);
const iv = crypto.getRandomValues(new Uint8Array(12));
const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

writeFileSync(
  ENC,
  JSON.stringify({
    v: 1,
    alg: "AES-GCM",
    iv: Buffer.from(iv).toString("base64"),
    data: Buffer.from(cipher).toString("base64"),
  }),
);

console.log(
  `şifrelendi: ${plaintext.byteLength} bayt → ${ENC.split("/").pop()} (${cipher.byteLength} bayt)`,
);
