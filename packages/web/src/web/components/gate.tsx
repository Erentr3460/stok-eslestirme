import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { deriveCatalogKey, isUnlocked, passwordEnabled, unlock, verify } from "../lib/local/auth";

interface GateProps {
  children: React.ReactNode;
}

/** Panelin önündeki şifre ekranı. Doğru şifre girilene kadar içerik yüklenmez. */
export function Gate({ children }: GateProps) {
  const [open, setOpen] = useState(() => !passwordEnabled || isUnlocked());
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (open) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(false);
    const ok = await verify(value);
    if (ok) {
      await deriveCatalogKey(value);
      unlock();
      setOpen(true);
    } else {
      setBusy(false);
      setErr(true);
      setValue("");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <form
        onSubmit={(e) => void submit(e)}
        className="card w-full max-w-[340px] px-6 py-7 text-center"
      >
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft">
          <KeyRound size={18} className="text-brand-dark" />
        </div>
        <h1 className="text-[15px] font-semibold">Stok Eşleştirme Aracı</h1>
        <p className="mt-1 text-[12.5px] text-idle">Devam etmek için şifreni gir.</p>

        <input
          ref={inputRef}
          type="password"
          aria-label="Şifre"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setErr(false);
          }}
          placeholder="••••••••"
          className={`mono mt-4 w-full rounded-md border px-3 py-2 text-center text-[13px] outline-none focus:border-brand ${
            err ? "border-miss bg-miss-soft" : "border-line bg-white"
          }`}
        />
        {err && <p className="mt-2 text-[12px] font-medium text-miss">Şifre yanlış.</p>}

        <button
          type="submit"
          disabled={busy || value.length === 0}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-[13px] font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Giriş Yap
        </button>
      </form>
    </div>
  );
}
