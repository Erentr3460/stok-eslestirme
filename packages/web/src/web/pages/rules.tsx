import { useState } from "react";
import { EyeOff, Link2Off, Plus, Trash2 } from "lucide-react";
import { PageHead } from "../components/layout";
import { Btn, Tag } from "../components/ui/bits";
import {
  useAddPrefix,
  useAliases,
  useIgnoredCodes,
  usePrefixes,
  useRemovePrefix,
  useTogglePrefix,
  useUnconfirmMatch,
  useUnignoreCode,
} from "../queries/matching";

function Panel({
  title,
  desc,
  count,
  children,
}: {
  title: string;
  desc: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-bold tracking-tight">{title}</h2>
          {count !== undefined && (
            <span className="mono text-[11px] text-idle">{count}</span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-idle">{desc}</p>
      </header>
      {children}
    </section>
  );
}

function PrefixPanel() {
  const prefixes = usePrefixes();
  const add = useAddPrefix();
  const toggle = useTogglePrefix();
  const remove = useRemovePrefix();
  const [draft, setDraft] = useState("");

  const rows = prefixes.data ?? [];

  function submit() {
    const value = draft.trim().toUpperCase();
    if (!value) return;
    add.mutate({ prefix: value }, { onSuccess: () => setDraft("") });
  }

  return (
    <Panel
      title="Önek kuralları"
      desc="Sitedeki SKU'lar önekli (AT-REC-A1M), ERP'de sade (A1M). Bu önekler eşleştirme sırasında kırpılır."
      count={rows.length}
    >
      <div className="flex gap-2 border-b border-line bg-surface px-4 py-3">
        <input
          aria-label="Yeni önek"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Örn. AT-REC-"
          className="mono w-56 rounded-md border border-line bg-white px-2.5 py-1.5 text-[12.5px] uppercase outline-none focus:border-brand"
        />
        <Btn variant="brand" onClick={submit} loading={add.isPending} disabled={!draft.trim()}>
          <Plus size={13} /> Ekle
        </Btn>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-idle">Kural yok.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                <input
                  aria-label={`${p.prefix} kuralı aktif`}
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => toggle.mutate({ id: p.id, enabled: e.target.checked })}
                  className="size-3.5 accent-[var(--color-brand-dark)]"
                />
                <span
                  className={`mono text-[13px] font-semibold ${p.enabled ? "" : "text-idle line-through"}`}
                >
                  {p.prefix}
                </span>
                {!p.enabled && <Tag tone="idle">kapalı</Tag>}
              </label>
              <button
                type="button"
                onClick={() => remove.mutate({ id: p.id })}
                title="Kuralı sil"
                className="rounded p-1 text-idle transition hover:bg-miss-soft hover:text-miss"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AliasPanel() {
  const aliases = useAliases();
  const unconfirm = useUnconfirmMatch();
  const [q, setQ] = useState("");

  const all = aliases.data ?? [];
  const term = q.trim().toLowerCase();
  const rows = term
    ? all.filter(
        (a) => a.codeRaw.toLowerCase().includes(term) || a.slug.toLowerCase().includes(term),
      )
    : all;

  return (
    <Panel
      title="Kayıtlı eşleşmeler"
      desc="Onayladığın ERP kodu → ürün bağlantıları. Sonraki yüklemelerde otomatik uygulanır."
      count={all.length}
    >
      <div className="border-b border-line bg-surface px-4 py-3">
        <input
          aria-label="Kayıtlı eşleşmelerde ara"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Kod veya ürün ara…"
          className="w-full rounded-md border border-line bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand"
        />
      </div>

      {all.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-idle">
          Henüz onaylanmış eşleşme yok. Eşleştir adımında onayladıkların burada birikir.
        </p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-line overflow-auto">
          {rows.map((a) => (
            <li key={a.codeNorm} className="flex items-center gap-3 px-4 py-2.5">
              <span className="mono w-44 shrink-0 truncate text-[12.5px] font-semibold">
                {a.codeRaw}
              </span>
              <span className="text-idle">→</span>
              <a
                href={`https://slip-ring.com/${a.slug}`}
                target="_blank"
                rel="noreferrer"
                className="mono flex-1 truncate text-[12px] text-brand-dark hover:underline"
              >
                {a.slug}
              </a>
              <button
                type="button"
                onClick={() => unconfirm.mutate({ code: a.codeRaw })}
                title="Bağlantıyı kaldır"
                className="rounded p-1 text-idle transition hover:bg-miss-soft hover:text-miss"
              >
                <Link2Off size={14} />
              </button>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-8 text-center text-[12.5px] text-idle">Sonuç yok.</li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function IgnoredPanel() {
  const ignored = useIgnoredCodes();
  const unignore = useUnignoreCode();
  const rows = ignored.data ?? [];

  return (
    <Panel
      title="Yoksayılan kodlar"
      desc="Sitede satılmayan ERP kalemleri. Eşleştirme listesinde görünmez, aktarıma girmez."
      count={rows.length}
    >
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-idle">Yoksayılan kod yok.</p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-line overflow-auto">
          {rows.map((c) => (
            <li key={c.codeNorm} className="flex items-center gap-3 px-4 py-2.5">
              <EyeOff size={13} className="shrink-0 text-idle" />
              <span className="mono flex-1 truncate text-[12.5px]">{c.codeRaw}</span>
              <Btn onClick={() => unignore.mutate({ code: c.codeRaw })}>Geri al</Btn>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Rules() {
  return (
    <>
      <PageHead
        title="Kurallar"
        desc="Eşleştirmenin hafızası. Buradaki kurallar her yüklemede otomatik uygulanır — aynı kodu bir daha onaylamak zorunda kalmazsın."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <PrefixPanel />
          <IgnoredPanel />
        </div>
        <AliasPanel />
      </div>
    </>
  );
}
