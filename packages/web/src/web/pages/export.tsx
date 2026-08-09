import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { useLocation } from "wouter";
import { PageHead } from "../components/layout";
import { Btn, Empty, Stat } from "../components/ui/bits";
import { useBatch } from "../hooks/use-batch";
import { useOverrides } from "../hooks/use-overrides";
import { useExport, useMatchRun } from "../queries/matching";

function download(name: string, mime: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default function ExportPage() {
  const [, navigate] = useLocation();
  const { batchId } = useBatch();
  const run = useMatchRun(batchId);
  const { overrides } = useOverrides(batchId);
  const exp = useExport();
  const [zeroIdle, setZeroIdle] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [result, setResult] = useState<{ rowCount: number; filename: string } | null>(null);

  if (batchId === null) {
    return (
      <>
        <PageHead title="Dışa Aktar" />
        <Empty title="Aktif dosya yok" hint="Önce Excel yükleyip eşleştirmeyi çalıştır." />
        <div className="mt-3">
          <Btn variant="brand" onClick={() => navigate("/yukle")}>
            Excel Yükle →
          </Btn>
        </div>
      </>
    );
  }

  const s = run.data?.summary;
  const manualCount = Object.keys(overrides).length;

  async function generate(kind: "xlsx" | "csv") {
    const res = await exp.mutateAsync({ batchId: batchId!, overrides, zeroIdle, onlyChanged });
    setResult({ rowCount: res.rowCount, filename: res.filename });
    if (kind === "xlsx") {
      download(
        `${res.filename}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        b64ToBlob(
          res.xlsxBase64,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      );
    } else {
      download(
        `${res.filename}.csv`,
        "text/csv",
        new Blob(["﻿" + res.csv], { type: "text/csv;charset=utf-8" }),
      );
    }
  }

  return (
    <>
      <PageHead
        title="Import Dosyası Oluştur"
        desc="Onaylanmış eşleşmelerden admin paneline yükleyeceğin dosya üretilir. Kolonlar: SKU · Ürün Adı · Slug · Eski Stok · Yeni Stok · Değişim · ERP Kodu · Eşleşme · Skor."
      />

      {s && (
        <div className="mb-4 flex gap-3">
          <Stat label="Aktarılacak Eşleşme" value={s.matched} tone="ok" />
          <Stat label="Stok Değişimi" value={s.changed} tone="brand" sub="gerçekten farklı olanlar" />
          <Stat label="Manuel Karar" value={manualCount} tone="idle" />
          <Stat
            label="Onay Bekleyen"
            value={s.review}
            tone="review"
            sub={s.review > 0 ? "bunlar dosyaya girmez" : "hepsi çözüldü"}
          />
        </div>
      )}

      {s && s.review > 0 && (
        <div className="card mb-4 border-review/40 bg-review-soft px-4 py-3 text-[12.5px] text-review">
          <b>{s.review}</b> satır hâlâ onay bekliyor ve dosyaya <b>dahil edilmeyecek</b>. Önce{" "}
          <button
            type="button"
            onClick={() => navigate("/eslestir")}
            className="font-semibold underline"
          >
            eşleştirme ekranında
          </button>{" "}
          bunları çözmek istersen şimdi yapabilirsin.
        </div>
      )}

      <div className="card mb-4 divide-y divide-line">
        <label htmlFor="opt-only-changed" className="flex cursor-pointer items-start gap-3 px-4 py-3">
          <input
            id="opt-only-changed"
            aria-label="Sadece stoğu değişenleri aktar"
            type="checkbox"
            checked={onlyChanged}
            onChange={(e) => setOnlyChanged(e.target.checked)}
            className="mt-0.5 size-4 accent-brand"
          />
          <span>
            <span className="block text-[13px] font-semibold">Sadece stoğu değişenleri aktar</span>
            <span className="block text-[12px] leading-relaxed text-idle">
              Sitedeki değerle ERP değeri aynıysa satır dosyaya girmez. Admin panelinde gereksiz
              güncelleme yapmamak için önerilir.
            </span>
          </span>
        </label>
        <label htmlFor="opt-zero-idle" className="flex cursor-pointer items-start gap-3 px-4 py-3">
          <input
            id="opt-zero-idle"
            aria-label="ERP listesinde olmayan ürünleri sıfıra çek"
            type="checkbox"
            checked={zeroIdle}
            onChange={(e) => setZeroIdle(e.target.checked)}
            className="mt-0.5 size-4 accent-brand"
          />
          <span>
            <span className="block text-[13px] font-semibold">
              ERP listesinde olmayan ürünleri 0'a çek
              {s && s.idle > 0 && (
                <span className="ml-1.5 font-normal text-idle">({s.idle} ürün)</span>
              )}
            </span>
            <span className="block text-[12px] leading-relaxed text-idle">
              Dikkat: Excel'in tüm ürünleri kapsamıyorsa bu, satıştaki ürünleri stoksuz gösterir.
              Sadece listen komple ise işaretle.
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Btn variant="brand" loading={exp.isPending} onClick={() => void generate("xlsx")}>
          <FileSpreadsheet size={14} />
          Excel (.xlsx) İndir
        </Btn>
        <Btn loading={exp.isPending} onClick={() => void generate("csv")}>
          <Download size={14} />
          CSV İndir
        </Btn>
      </div>

      {exp.error && (
        <div className="mt-3 rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12.5px] text-miss">
          {exp.error.message}
        </div>
      )}

      {result && (
        <div className="card rise mt-4 border-ok/40 bg-ok-soft px-4 py-3">
          <p className="text-[13px] font-semibold text-ok">
            Dosya hazır — {result.rowCount} satır
          </p>
          <p className="mono mt-0.5 text-[11.5px] text-idle">{result.filename}</p>
          {result.rowCount === 0 && (
            <p className="mt-1.5 text-[12px] text-review">
              Hiç satır yok. "Sadece stoğu değişenleri aktar" işaretliyken ERP ile site stokları
              birebir aynı olabilir — kaldırıp tekrar dene.
            </p>
          )}
        </div>
      )}
    </>
  );
}
