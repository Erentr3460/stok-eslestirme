import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { PageHead } from "../components/layout";
import { MatchRow, type Row } from "../components/match-row";
import { Btn, Empty, Stat } from "../components/ui/bits";
import { useBatch } from "../hooks/use-batch";
import { useMatchProgress } from "../hooks/use-match-progress";
import { useOverrides } from "../hooks/use-overrides";
import {
  useConfirmMatch,
  useIgnoreCode,
  useMatchRun,
  useUnconfirmMatch,
  useUnignoreCode,
} from "../queries/matching";

type Filter = "matched" | "review" | "missing" | "ignored" | "idle";

/** Tek seferde basılan satır sayısı — 1000+ satırı DOM'a birden yazmak tarayıcıyı kilitliyor. */
const PAGE = 50;

export default function MatchPage() {
  const [, navigate] = useLocation();
  const { batchId } = useBatch();
  const run = useMatchRun(batchId);
  const { overrides, setRow, setMany, clear, count } = useOverrides(batchId);
  const confirm = useConfirmMatch();
  const unconfirm = useUnconfirmMatch();
  const ignore = useIgnoreCode();
  const unignore = useUnignoreCode();
  const [filter, setFilter] = useState<Filter>("review");
  const [qInput, setQInput] = useState("");
  const q = useDeferredValue(qInput);
  const [limit, setLimit] = useState(PAGE);
  const progress = useMatchProgress();

  // Filtre ya da arama değişince listeyi baştan göster.
  useEffect(() => {
    setLimit(PAGE);
  }, [filter, q]);

  const busy = confirm.isPending || unconfirm.isPending || ignore.isPending || unignore.isPending;
  const s = run.data?.summary;

  const rows = useMemo(() => {
    if (!run.data || filter === "idle") return [];
    const needle = q.trim().toLowerCase();
    return (run.data.rows as Row[])
      .filter((r) => {
        const ov = overrides[String(r.i)];
        const status = ov?.skip ? "ignored" : ov?.slug ? "matched" : r.status;
        return status === filter;
      })
      .filter((r) =>
        needle
          ? [r.code, r.code2, r.name, r.candidates[0]?.sku, r.candidates[0]?.name]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(needle))
          : true,
      );
  }, [run.data, filter, q, overrides]);

  /** Onaya düşmüş ama en az bir aday öneri taşıyan satırlar — toplu kabul için. */
  const suggestable = useMemo(
    () => rows.filter((r) => !overrides[String(r.i)] && r.candidates.length > 0),
    [rows, overrides],
  );

  const acceptAllSuggestions = useCallback(() => {
    setMany(
      suggestable.flatMap((r) => {
        const top = r.candidates[0];
        return top ? [{ rowIndex: r.i, value: { slug: top.slug, stock: null } }] : [];
      }),
    );
  }, [suggestable, setMany]);

  const idleRows = useMemo(() => {
    if (!run.data || filter !== "idle") return [];
    const needle = q.trim().toLowerCase();
    return run.data.idle.filter((p) =>
      needle
        ? [p.sku, p.name, p.slug].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))
        : true,
    );
  }, [run.data, filter, q]);

  if (batchId === null) {
    return (
      <>
        <PageHead title="Eşleştirme" />
        <Empty
          title="Önce bir Excel yükle"
          hint="Eşleştirme için aktif bir ERP stok dosyası gerekiyor."
        />
        <div className="mt-3">
          <Btn variant="brand" onClick={() => navigate("/yukle")}>
            Excel Yükle →
          </Btn>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Eşleştirme"
        desc="Yeşil satırlar otomatik onaylandı. Turuncu olanlar senin kararını bekliyor — 'Eşleştir + hatırla' dediğinde kod kalıcı olarak kaydedilir, bir sonraki dosyada otomatik eşleşir."
        action={
          <div className="flex gap-2">
            {count > 0 && <Btn onClick={clear}>Manuel kararları sıfırla ({count})</Btn>}
            <Btn variant="brand" onClick={() => navigate("/aktar")}>
              Dışa Aktar →
            </Btn>
          </div>
        }
      />

      {(run.isFetching || progress.running) && (
        <div className="card mb-4 px-4 py-3">
          <div className="flex items-center gap-2 text-[13px]">
            <Loader2 size={15} className="animate-spin text-brand-dark" />
            <span className="font-semibold">Eşleştiriliyor</span>
            <span className="mono ml-auto text-[12px] text-idle">
              {progress.total > 0 ? `${progress.done}/${progress.total} satır · %${progress.pct}` : "hazırlanıyor…"}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${Math.max(4, progress.pct)}%` }}
            />
          </div>
          <p className="mt-2 text-[11.5px] text-idle">
            Hesaplama arka planda çalışıyor — bu sırada ekranı kullanmaya devam edebilirsin.
          </p>
        </div>
      )}

      {run.error && (
        <div className="card border-miss/40 bg-miss-soft px-4 py-3 text-[12.5px] text-miss">
          Eşleştirme başarısız: {run.error.message}
        </div>
      )}

      {s && (
        <>
          <div className="mb-4 flex gap-3">
            <Stat
              label="Eşleşti"
              value={s.matched}
              tone="ok"
              sub={`${s.changed} satırda stok değişiyor`}
              active={filter === "matched"}
              onClick={() => setFilter("matched")}
            />
            <Stat
              label="Onay Bekliyor"
              value={s.review}
              tone="review"
              sub="benzer bulundu, seçim gerek"
              active={filter === "review"}
              onClick={() => setFilter("review")}
            />
            <Stat
              label="Bulunamadı"
              value={s.missing}
              tone="miss"
              sub="Excel'de var, sitede yok"
              active={filter === "missing"}
              onClick={() => setFilter("missing")}
            />
            <Stat
              label="Listede Yok"
              value={s.idle}
              tone="idle"
              sub="sitede var, Excel'de yok"
              active={filter === "idle"}
              onClick={() => setFilter("idle")}
            />
            <Stat
              label="Yoksayıldı"
              value={s.ignored}
              tone="idle"
              active={filter === "ignored"}
              onClick={() => setFilter("ignored")}
            />
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search size={14} className="text-idle" />
              <input
                aria-label="Satırlarda ara"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Kod veya ürün adı ara…"
                className="mono flex-1 bg-transparent py-1 text-[12.5px] outline-none placeholder:font-sans placeholder:text-idle"
              />
              <span className="mono text-[11px] text-idle">
                {filter === "idle" ? idleRows.length : rows.length} satır
              </span>
              {filter === "review" && suggestable.length > 0 && (
                <Btn onClick={acceptAllSuggestions}>
                  Önerileri kabul et ({suggestable.length})
                </Btn>
              )}
            </div>

            {filter === "idle" ? (
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead className="sticky top-0 bg-surface text-left text-[11px] uppercase tracking-wide text-idle">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Site SKU</th>
                      <th className="px-3 py-2 font-semibold">Ürün</th>
                      <th className="px-3 py-2 font-semibold">Marka</th>
                      <th className="px-3 py-2 text-right font-semibold">Sitedeki Stok</th>
                      <th className="w-8" aria-label="bağlantı" />
                    </tr>
                  </thead>
                  <tbody>
                    {idleRows.slice(0, limit).map((p) => (
                      <tr key={p.slug} className="border-t border-line hover:bg-brand-soft/50">
                        <td className="mono whitespace-nowrap px-3 py-2 font-semibold">
                          {p.sku ?? "—"}
                        </td>
                        <td className="max-w-[460px] truncate px-3 py-2">{p.name}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-idle">{p.brand ?? "—"}</td>
                        <td
                          className={`mono px-3 py-2 text-right font-semibold ${
                            (p.stock ?? 0) > 0 ? "text-ok" : "text-idle"
                          }`}
                        >
                          {p.stock ?? 0}
                        </td>
                        <td className="px-2">
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-idle hover:text-brand-dark"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {idleRows.length > limit && (
                  <div className="border-t border-line px-3 py-3 text-center">
                    <Btn onClick={() => setLimit((n) => n + 250)}>
                      Daha fazla göster · {limit} / {idleRows.length}
                    </Btn>
                  </div>
                )}
                {idleRows.length === 0 && (
                  <p className="py-10 text-center text-[12.5px] text-idle">
                    Sitedeki her ürünün ERP listesinde karşılığı var.
                  </p>
                )}
              </div>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead className="sticky top-0 z-10 bg-surface text-left text-[11px] uppercase tracking-wide text-idle">
                    <tr>
                      <th className="w-7" aria-label="durum" />
                      <th className="px-2 py-2 font-semibold whitespace-nowrap">ERP Kodu / Üretici Kodu</th>
                      <th className="px-2 py-2 font-semibold">Site Ürünü</th>
                      <th className="px-2 py-2 font-semibold">Eşleşme</th>
                      <th className="px-2 py-2 text-right font-semibold">Stok</th>
                      <th className="px-2 py-2 text-right font-semibold">Aksiyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, limit).map((r) => (
                      <MatchRow
                        key={r.i}
                        row={r}
                        override={overrides[String(r.i)]}
                        busy={busy}
                        onPick={(slug) =>
                          confirm.mutate({ code: r.code || r.code2 || r.name, slug })
                        }
                        onOverride={(v) => setRow(r.i, v)}
                        onIgnore={() => ignore.mutate({ code: r.code || r.code2 || r.name })}
                        onUnignore={() => unignore.mutate({ code: r.code || r.code2 || r.name })}
                        onUnlink={() => unconfirm.mutate({ code: r.code || r.code2 || r.name })}
                      />
                    ))}
                  </tbody>
                </table>
                {rows.length > limit && (
                  <div className="border-t border-line px-3 py-3 text-center">
                    <Btn onClick={() => setLimit((n) => n + 250)}>
                      Daha fazla göster · {limit} / {rows.length}
                    </Btn>
                  </div>
                )}
                {rows.length === 0 && (
                  <p className="py-10 text-center text-[12.5px] text-idle">
                    {filter === "review"
                      ? "Onay bekleyen satır kalmadı — dışa aktarmaya geçebilirsin."
                      : "Bu filtrede satır yok."}
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="mt-4 text-[12.5px] text-idle">
            Eşleşme oranı düşükse{" "}
            <Link to="/kurallar" className="font-semibold text-brand-dark hover:underline">
              önek kurallarına
            </Link>{" "}
            bak — sitedeki SKU'larda ERP'de olmayan bir önek olabilir.
          </p>
        </>
      )}
    </>
  );
}
