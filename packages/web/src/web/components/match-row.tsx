import { useState } from "react";
import { Check, ChevronDown, ChevronRight, EyeOff, Pencil, RotateCcw, X } from "lucide-react";
import { Btn, StockDiff, Tag } from "./ui/bits";
import type { Override } from "../hooks/use-overrides";

export interface RowCandidate {
  slug: string;
  sku: string | null;
  name: string | null;
  brand: string | null;
  stock: number | null;
  score: number;
  reason: string;
  via: string;
}

export interface Row {
  i: number;
  code: string;
  code2: string;
  name: string;
  stock: number | null;
  status: "matched" | "review" | "missing" | "ignored";
  reason: string;
  score: number;
  slug: string | null;
  candidates: RowCandidate[];
  groupRows?: number[];
  groupSum?: number | null;
}

const REASON_TR: Record<string, string> = {
  alias: "kayıtlı eşleşme",
  exact: "birebir SKU",
  prefix: "önek soyuldu",
  datasheet: "datasheet PDF",
  name: "ürün adı",
  contains: "kısmi kod",
  fuzzy: "benzer kod",
  conflict: "birden fazla aday",
  duplicate: "aynı ürüne çok satır",
  none: "eşleşme yok",
};

const TONE: Record<string, "ok" | "review" | "miss" | "idle"> = {
  matched: "ok",
  review: "review",
  missing: "miss",
  ignored: "idle",
};

export function MatchRow({
  row,
  override,
  onPick,
  onOverride,
  onIgnore,
  onUnignore,
  onUnlink,
  busy,
}: {
  row: Row;
  override: Override | undefined;
  onPick: (slug: string) => void;
  onOverride: (value: Override | null) => void;
  onIgnore: () => void;
  onUnignore: () => void;
  onUnlink: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.stock ?? 0));

  const effSlug = override?.slug ?? row.slug;
  const chosen = row.candidates.find((c) => c.slug === effSlug);
  const target = chosen ?? row.candidates[0] ?? null;
  const oldStock = chosen?.stock ?? 0;
  const newStock = override?.stock ?? row.stock ?? 0;
  const code = row.code || row.code2 || row.name;
  const skipped = override?.skip === true;
  const manual =
    Boolean(override?.slug) || (override?.stock !== undefined && override?.stock !== null);

  const tone = skipped ? "idle" : override?.slug ? "ok" : TONE[row.status]!;

  return (
    <>
      <tr
        className={`border-t border-line align-middle transition hover:bg-brand-soft/50 ${
          skipped ? "opacity-45" : ""
        }`}
      >
        <td className="w-7 pl-3" aria-label="durum">
          <span
            className={`block size-2 rounded-full ${
              tone === "ok"
                ? "bg-ok"
                : tone === "review"
                  ? "bg-review"
                  : tone === "miss"
                    ? "bg-miss"
                    : "bg-idle"
            }`}
          />
        </td>

        <td className="px-2 py-1.5">
          <div
            className="mono flex items-baseline gap-1.5 text-[12px] font-semibold"
            title={[row.code, row.code2].filter(Boolean).join("   |   ")}
          >
            <span className="whitespace-nowrap">{code || "—"}</span>
            {row.code && row.code2 && row.code2 !== row.code && (
              <span className="whitespace-nowrap rounded bg-brand-soft px-1 py-px text-[10.5px] font-medium text-idle">
                {row.code2}
              </span>
            )}
          </div>
          {row.name && row.name !== code && (
            <div className="max-w-[420px] truncate text-[11px] text-idle">{row.name}</div>
          )}
        </td>

        <td className="px-2 py-1.5">
          {effSlug && target ? (
            <>
              <div className="mono max-w-[230px] truncate text-[12px] font-semibold text-navy">
                {target.sku ?? target.slug}
              </div>
              <div className="max-w-[230px] truncate text-[11px] text-idle">{target.name}</div>
            </>
          ) : (
            <span className="text-[11.5px] text-idle">
              {row.status === "ignored" ? "yoksayıldı" : "site karşılığı bulunamadı"}
            </span>
          )}
        </td>

        <td className="px-2 py-1.5 whitespace-nowrap">
          <Tag tone={tone}>
            {override?.slug ? "manuel" : (REASON_TR[row.reason] ?? row.reason)}
          </Tag>
          {row.score > 0 && !override?.slug && (
            <span className="mono ml-1.5 text-[10.5px] text-idle">%{row.score}</span>
          )}
        </td>

        <td className="px-2 py-1.5 text-right">
          {editing ? (
            <span className="inline-flex items-center gap-1">
              <input
                aria-label="Yeni stok adedi"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="mono w-16 rounded border border-brand px-1.5 py-0.5 text-right text-[12px] outline-none"
              />
              <button
                type="button"
                className="text-ok"
                onClick={() => {
                  const n = Number.parseInt(draft, 10);
                  onOverride({
                    slug: override?.slug ?? null,
                    stock: Number.isFinite(n) ? n : null,
                    skip: override?.skip,
                  });
                  setEditing(false);
                }}
              >
                <Check size={13} />
              </button>
              <button type="button" className="text-idle" onClick={() => setEditing(false)}>
                <X size={13} />
              </button>
            </span>
          ) : effSlug ? (
            <StockDiff from={oldStock} to={newStock} />
          ) : (
            <span className="mono text-[12px] text-idle">{row.stock ?? "—"}</span>
          )}
        </td>

        <td className="w-[210px] px-2 py-1.5">
          <div className="flex items-center justify-end gap-1">
            {row.candidates.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-0.5 rounded px-1.5 py-1 text-[11.5px] text-idle transition hover:bg-white hover:text-ink"
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {row.candidates.length} aday
              </button>
            )}
            {effSlug && (
              <button
                type="button"
                title="Stoğu elle değiştir"
                onClick={() => {
                  setDraft(String(newStock));
                  setEditing(true);
                }}
                className="rounded p-1 text-idle transition hover:bg-white hover:text-ink"
              >
                <Pencil size={13} />
              </button>
            )}
            {row.status === "matched" && row.reason === "alias" && (
              <button
                type="button"
                title="Kayıtlı eşleşmeyi kaldır"
                onClick={onUnlink}
                disabled={busy}
                className="rounded p-1 text-idle transition hover:bg-white hover:text-miss"
              >
                <RotateCcw size={13} />
              </button>
            )}
            {row.status === "ignored" ? (
              <Btn onClick={onUnignore} loading={busy}>
                Geri al
              </Btn>
            ) : (
              <button
                type="button"
                title="Bu kodu bir daha sorma"
                onClick={onIgnore}
                disabled={busy}
                className="rounded p-1 text-idle transition hover:bg-white hover:text-miss"
              >
                <EyeOff size={13} />
              </button>
            )}
            {manual && (
              <button
                type="button"
                title="Manuel kararı sıfırla"
                onClick={() => onOverride(null)}
                className="rounded p-1 text-idle transition hover:bg-white hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {row.groupRows && row.groupRows.length > 1 && (
        <tr className="border-t border-review/20 bg-review-soft/50">
          <td aria-hidden="true" className="w-7" />
          <td colSpan={5} className="px-2 py-1.5 text-[11.5px] text-review">
            Bu ürüne <b>{row.groupRows.length}</b> ERP satırı düşüyor (toplam stok{" "}
            <b className="mono">{row.groupSum}</b>). Hangisinin geçerli olduğunu seç, gerisini atla —
            ya da bir satıra toplamı elle yaz.
            <button
              type="button"
              onClick={() =>
                onOverride({ slug: effSlug, stock: row.groupSum ?? null, skip: false })
              }
              className="ml-2 font-semibold underline"
            >
              toplamı bu satıra yaz
            </button>
            <button
              type="button"
              onClick={() => onOverride({ slug: effSlug, stock: null, skip: true })}
              className="ml-2 font-semibold underline"
            >
              bu satırı atla
            </button>
          </td>
        </tr>
      )}

      {open && (
        <tr className="border-t border-line bg-surface">
          <td className="w-7" aria-label="adaylar" />
          <td colSpan={5} className="px-2 py-2">
            <div className="space-y-1">
              {row.candidates.map((c) => (
                <div
                  key={c.slug}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px] ${
                    c.slug === effSlug ? "border-ok bg-ok-soft" : "border-line bg-white"
                  }`}
                >
                  <span className="mono w-[190px] shrink-0 truncate font-semibold">
                    {c.sku ?? c.slug}
                  </span>
                  <span className="flex-1 truncate text-idle">{c.name}</span>
                  <span className="w-20 shrink-0 truncate text-idle">{c.brand ?? "—"}</span>
                  <span className="mono w-12 shrink-0 text-right text-idle">stok {c.stock ?? 0}</span>
                  <Tag tone={c.score >= 85 ? "ok" : c.score >= 70 ? "review" : "idle"}>
                    %{c.score} · {REASON_TR[c.reason] ?? c.reason}
                  </Tag>
                  {c.slug === effSlug ? (
                    <span className="w-[150px] text-right text-[11px] font-semibold text-ok">
                      seçili
                    </span>
                  ) : (
                    <span className="flex w-[150px] justify-end gap-1">
                      <Btn onClick={() => onOverride({ slug: c.slug, stock: override?.stock ?? null })}>
                        Sadece bu dosya
                      </Btn>
                      <Btn variant="dark" loading={busy} onClick={() => onPick(c.slug)}>
                        Eşleştir + hatırla
                      </Btn>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
