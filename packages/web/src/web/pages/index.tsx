import { useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { Link } from "wouter";
import { PageHead } from "../components/layout";
import { Btn, Empty, Stat, Tag } from "../components/ui/bits";
import { useCatalogList, useCatalogStatus, useSyncCatalog } from "../queries/catalog";

export default function CatalogPage() {
  const status = useCatalogStatus();
  const sync = useSyncCatalog();
  const [q, setQ] = useState("");
  const list = useCatalogList(q);

  const job = status.data?.job ?? null;
  const running = job?.status === "running";
  const pct = job && job.total > 0 ? Math.round((job.fetched / job.total) * 100) : 0;

  return (
    <>
      <PageHead
        title="Site Katalogu"
        desc="slip-ring.com kataloğunun son anlık görüntüsü. Her ürünün SKU, ad, marka, stok bilgisi ve teknik datasheet metni burada tutulur; eşleştirme bu veriye göre yapılır."
        action={
          <Btn variant="brand" loading={running || sync.isPending} onClick={() => sync.mutate(undefined)}>
            <RefreshCw size={13} />
            {running ? "Yenileniyor…" : "Katalogu Yenile"}
          </Btn>
        }
      />

      <div className="mb-4 flex gap-3">
        <Stat label="Toplam Ürün" value={status.data?.total ?? "—"} tone="brand" />
        <Stat
          label="SKU'su Olan"
          value={status.data?.withSku ?? "—"}
          tone="ok"
          sub={
            status.data && status.data.total > 0
              ? `${status.data.total - status.data.withSku} ürünün SKU'su boş`
              : undefined
          }
        />
        <Stat label="Stokta" value={status.data?.inStock ?? "—"} tone="idle" />
        <Stat
          label="Katalog Tarihi"
          value={
            status.data?.lastSync
              ? new Date(status.data.lastSync).toLocaleDateString("tr-TR", {
                  day: "2-digit",
                  month: "short",
                })
              : "—"
          }
          tone="idle"
          sub={
            status.data?.lastSync
              ? new Date(status.data.lastSync).toLocaleTimeString("tr-TR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "hiç taranmadı"
          }
        />
      </div>

      {job && (
        <div className="card mb-4 px-4 py-3">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="font-semibold">
              {running
                ? "Tarama sürüyor"
                : job.status === "done"
                  ? "Tarama tamamlandı"
                  : "Tarama hata verdi"}
            </span>
            <span className="mono text-idle">
              {job.fetched} / {job.total || "?"} sayfa · {job.productCount} ürün
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-surface">
            <div
              className={`h-full rounded transition-all duration-500 ${
                job.status === "error" ? "bg-miss" : running ? "bg-brand" : "bg-ok"
              }`}
              style={{ width: `${running ? pct : 100}%` }}
            />
          </div>
          {job.message && <p className="mt-2 text-[12px] text-miss">{job.message}</p>}
        </div>
      )}

      {status.data && status.data.total === 0 && !running ? (
        <Empty
          title="Katalog henüz boş"
          hint="Katalog dosyası yüklenemedi. Sayfayı yenile veya 'Katalogu Yenile' butonuna bas."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={14} className="text-idle" />
            <input
              aria-label="Katalogda ara"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="SKU, ürün adı veya slug ara…"
              className="mono flex-1 bg-transparent py-1 text-[12.5px] outline-none placeholder:font-sans placeholder:text-idle"
            />
            <span className="mono text-[11px] text-idle">
              {list.data ? `${list.data.items.length} / ${list.data.total}` : "…"}
            </span>
          </div>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-surface text-left text-[11px] uppercase tracking-wide text-idle">
                <tr>
                  <th className="px-3 py-2 font-semibold">SKU</th>
                  <th className="px-3 py-2 font-semibold">Ürün</th>
                  <th className="px-3 py-2 font-semibold">Marka</th>
                  <th className="px-3 py-2 text-right font-semibold">Stok</th>
                  <th className="px-3 py-2 text-right font-semibold">Fiyat</th>
                  <th className="w-8" aria-label="bağlantı" />
                </tr>
              </thead>
              <tbody>
                {list.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-idle">
                      Yükleniyor…
                    </td>
                  </tr>
                )}
                {list.data?.items.map((p) => (
                  <tr key={p.slug} className="border-t border-line hover:bg-brand-soft/60">
                    <td className="mono whitespace-nowrap px-3 py-2 font-semibold">
                      {p.sku ?? <Tag tone="miss">SKU YOK</Tag>}
                    </td>
                    <td className="max-w-[520px] truncate px-3 py-2">{p.name}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-idle">{p.brand ?? "—"}</td>
                    <td
                      className={`mono px-3 py-2 text-right font-semibold ${
                        (p.stock ?? 0) > 0 ? "text-ok" : "text-idle"
                      }`}
                    >
                      {p.stock ?? 0}
                    </td>
                    <td className="mono px-3 py-2 text-right text-idle">{p.price ?? "—"}</td>
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
          </div>
        </div>
      )}

      {status.data && status.data.total > 0 && (
        <p className="mt-4 text-[12.5px] text-idle">
          Katalog hazır →{" "}
          <Link to="/yukle" className="font-semibold text-brand-dark hover:underline">
            ERP stok Excel'ini yükle
          </Link>
        </p>
      )}
    </>
  );
}
