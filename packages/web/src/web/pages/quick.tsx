import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { useLocation } from "wouter";
import { PageHead } from "../components/layout";
import { Btn } from "../components/ui/bits";
import { useBatch } from "../hooks/use-batch";
import { useMatchProgress } from "../hooks/use-match-progress";
import { useOverrides } from "../hooks/use-overrides";
import { useCatalogStatus, useSyncCatalog } from "../queries/catalog";
import { useExport, useExportMissing, useMatchRun } from "../queries/matching";
import { useCreateUpload, useUpload } from "../queries/uploads";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Dosya okunamadı"));
    r.readAsDataURL(file);
  });
}

function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function b64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function StepCard({
  n,
  title,
  desc,
  state,
  children,
}: {
  n: number;
  title: string;
  desc?: string;
  state: "todo" | "active" | "done";
  children?: React.ReactNode;
}) {
  const badge =
    state === "done"
      ? "bg-ok text-white"
      : state === "active"
        ? "bg-brand text-navy"
        : "bg-idle-soft text-idle";
  return (
    <section className={`card px-5 py-4 ${state === "todo" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`mono mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${badge}`}
        >
          {state === "done" ? "✓" : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
          {desc && <p className="mt-0.5 text-[12.5px] leading-relaxed text-idle">{desc}</p>}
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </section>
  );
}

export default function QuickPage() {
  const [, navigate] = useLocation();
  const { batchId, select } = useBatch();
  const active = useUpload(batchId);
  const create = useCreateUpload();
  const run = useMatchRun(batchId);
  const { overrides } = useOverrides(batchId);
  const exp = useExport();
  const expMissing = useExportMissing();
  const status = useCatalogStatus();
  const syncCatalog = useSyncCatalog();
  const progress = useMatchProgress();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ rowCount: number; filename: string } | null>(null);
  const [missing, setMissing] = useState<{
    missingCount: number;
    reviewCount: number;
    zeroCount: number;
  } | null>(null);

  const mapping = active.data?.mapping;
  const columnsOk = Boolean(mapping?.code && mapping?.stock);
  const s = run.data?.summary;
  const working = run.isFetching || progress.running;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setErr(null);
    setDone(null);
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
      setErr("Sadece .xlsx, .xls veya .csv dosyası yükleyebilirsin.");
      return;
    }
    try {
      const res = await create.mutateAsync({
        filename: file.name,
        dataBase64: await toBase64(file),
      });
      select(res.id);
      syncCatalog.mutate(undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Dosya işlenemedi");
    }
  }

  async function generateMissing() {
    if (batchId === null) return;
    const res = await expMissing.mutateAsync({ batchId });
    setMissing({
      missingCount: res.missingCount,
      reviewCount: res.reviewCount,
      zeroCount: res.zeroCount,
    });
    download(`${res.filename}.xlsx`, b64ToBlob(res.xlsxBase64));
  }

  async function generate() {
    if (batchId === null) return;
    const res = await exp.mutateAsync({
      batchId,
      overrides,
      zeroIdle: false,
      onlyChanged: true,
    });
    setDone({ rowCount: res.rowCount, filename: res.filename });
    download(`${res.filename}.xlsx`, b64ToBlob(res.xlsxBase64));
  }

  const step1: "todo" | "active" | "done" = active.data ? "done" : "active";
  const step2: "todo" | "active" | "done" = !active.data ? "todo" : s ? "done" : "active";
  const step3: "todo" | "active" | "done" = !s ? "todo" : done ? "done" : "active";

  return (
    <>
      <PageHead
        title="Hızlı Stok Güncelleme"
        desc="Üç adım: Excel'i bırak · sonucu gör · dosyayı indir. Detaylı ayarlar soldaki menüde duruyor, buradan hiçbirine dokunmadan işini bitirebilirsin."
        action={
          <Btn onClick={() => navigate("/eslestir")}>Detaylı ekran →</Btn>
        }
      />

      <div className="space-y-3">
        <StepCard
          n={1}
          title="ERP Excel'ini bırak"
          desc="Logo'dan aldığın stok listesi. Kolonlar otomatik tanınır."
          state={step1}
        >
          <button
            type="button"
            aria-label="Excel dosyası seç"
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-8 transition ${
              drag ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-brand/60"
            }`}
          >
            {create.isPending ? (
              <Loader2 size={24} className="animate-spin text-brand-dark" />
            ) : (
              <UploadCloud size={24} className={drag ? "text-brand-dark" : "text-idle"} />
            )}
            <span className="text-[13.5px] font-semibold">
              {create.isPending ? "Dosya okunuyor…" : "Excel dosyasını buraya bırak"}
            </span>
            <span className="text-[12px] text-idle">veya tıklayıp seç · .xlsx, .xls, .csv</span>
            <input
              ref={inputRef}
              aria-label="Excel dosyası"
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </button>

          {err && (
            <div className="mt-3 rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12.5px] text-miss">
              {err}
            </div>
          )}

          {active.data && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
              <FileSpreadsheet size={14} className="text-brand-dark" />
              <span className="font-semibold">{active.data.filename}</span>
              <span className="mono text-[11.5px] text-idle">
                {active.data.rowCount} satır · {active.data.columns.length} kolon
              </span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="ml-1 text-[11.5px] font-semibold text-brand-dark underline"
              >
                başka dosya seç
              </button>
            </div>
          )}

          {active.data && !columnsOk && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-review/40 bg-review-soft px-3 py-2 text-[12.5px] text-review">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Kod veya stok kolonu tanınamadı.{" "}
                <button
                  type="button"
                  onClick={() => navigate("/yukle")}
                  className="font-semibold underline"
                >
                  Kolonları elle seç
                </button>
                .
              </span>
            </div>
          )}
        </StepCard>

        <StepCard
          n={2}
          title="Eşleştirme sonucu"
          desc="ERP kodları sitedeki ürünlerle karşılaştırılır. Bu hesap arka planda çalışır, ekran donmaz."
          state={step2}
        >
          {!active.data ? (
            <p className="text-[12.5px] text-idle">Önce yukarıdan dosya bırak.</p>
          ) : working ? (
            <>
              <div className="flex items-center gap-2 text-[13px]">
                <Loader2 size={15} className="animate-spin text-brand-dark" />
                <span className="font-semibold">Karşılaştırılıyor…</span>
                <span className="mono ml-auto text-[12px] text-idle">
                  {progress.total > 0
                    ? `${progress.done}/${progress.total} satır · %${progress.pct}`
                    : "hazırlanıyor"}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${Math.max(4, progress.pct)}%` }}
                />
              </div>
            </>
          ) : run.error ? (
            <p className="text-[12.5px] text-miss">Eşleştirme başarısız: {run.error.message}</p>
          ) : s ? (
            <div className="space-y-2">
              <p className="text-[14px] leading-relaxed">
                <span className="mono text-[19px] font-bold text-ok">{s.changed}</span>{" "}
                <span className="font-semibold">ürünün stoğu değişiyor.</span>
              </p>
              <p className="text-[12.5px] leading-relaxed text-idle">
                {s.matched} satır kesin eşleşti · {s.missing} satırın sitede karşılığı yok (dosyaya
                girmez).
              </p>
              {s.review > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-review/40 bg-review-soft px-3 py-2 text-[12.5px] text-review">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    <b>{s.review}</b> satırda emin olamadım, bunlar dosyaya girmeyecek. İstersen{" "}
                    <button
                      type="button"
                      onClick={() => navigate("/eslestir")}
                      className="font-semibold underline"
                    >
                      tek tek bakıp onayla
                    </button>{" "}
                    — bir kez onayladığın kod bir daha sormaz.
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </StepCard>

        <StepCard
          n={3}
          title="Excel'i indir ve panele yükle"
          desc="Sadece stoğu gerçekten değişen satırlar dosyaya girer."
          state={step3}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              variant="brand"
              disabled={!s}
              loading={exp.isPending}
              onClick={() => void generate()}
              className="px-4 py-2 text-[13.5px]"
            >
              <Download size={15} />
              Excel'i İndir
            </Btn>
            <Btn onClick={() => navigate("/aktar")}>Aktarma seçenekleri</Btn>
          </div>

          {exp.error && (
            <div className="mt-3 rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12.5px] text-miss">
              {exp.error.message}
            </div>
          )}

          {done && (
            <div className="rise mt-3 rounded-md border border-ok/40 bg-ok-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ok">
                <CheckCircle2 size={14} /> İndirildi — {done.rowCount} satır
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-idle">
                Şimdi slip-ring.com yönetim panelini aç ve bu dosyayı ürün/stok içe aktarma
                ekranına yükle.
              </p>
              {done.rowCount === 0 && (
                <p className="mt-1 text-[12px] text-review">
                  Hiç satır çıkmadı — ERP stokları sitedekiyle birebir aynı görünüyor.
                </p>
              )}
            </div>
          )}
        </StepCard>
        <StepCard
          n={4}
          title="Sitede olmayan ürünleri indir"
          desc="ERP listende olup slip-ring.com'da bulunmayan ürünler. Bu dosyayı açıp siteye yeni ürün olarak ekleyebilirsin."
          state={s ? "active" : "todo"}
        >
          {s ? (
            <>
              <p className="mb-3 text-[12.5px] leading-relaxed text-idle">
                <span className="mono font-bold text-ink">{s.missing}</span> ürünün sitede hiç
                karşılığı yok
                {s.review > 0 && (
                  <>
                    {" · "}
                    <span className="mono font-bold text-ink">{s.review}</span> tanesinde de emin
                    olamadım (dosyada ayrı sayfada, sitedeki en benzer ürünle birlikte)
                  </>
                )}
                .
              </p>
              <Btn
                loading={expMissing.isPending}
                onClick={() => void generateMissing()}
                className="px-4 py-2 text-[13.5px]"
              >
                <Download size={15} />
                Eksik Ürün Listesini İndir
              </Btn>
            </>
          ) : (
            <p className="text-[12.5px] text-idle">Önce dosyayı yükle.</p>
          )}

          {expMissing.error && (
            <div className="mt-3 rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12.5px] text-miss">
              {expMissing.error.message}
            </div>
          )}

          {missing && (
            <div className="rise mt-3 rounded-md border border-ok/40 bg-ok-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ok">
                <CheckCircle2 size={14} /> İndirildi
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-idle">
                <b>Eklenecek (Stoklu)</b>: {missing.missingCount} ürün — stoğu olan ve sitede hiç
                bulunmayanlar, doğrudan eklenecek liste. <b>Emin Olunamayan</b>:{" "}
                {missing.reviewCount} ürün — eklemeden önce "Sitedeki Benzer Ürün" kolonuna bak.{" "}
                <b>Stoksuz (Atlanacak)</b>: {missing.zeroCount} ürün — stoğu 0, eklemene gerek yok.
                Her satırdaki "Kontrol et" linkine tıklayarak sitede aratabilirsin.
              </p>
            </div>
          )}
        </StepCard>
      </div>

      <p className="mt-4 text-[12px] text-idle">
        Site katalogu her gün otomatik tazelenir
        {status.data?.lastSync
          ? ` — son güncelleme ${new Date(status.data.lastSync).toLocaleString("tr-TR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : ""}
        {status.data?.total ? ` · ${status.data.total} ürün` : ""}.
      </p>
    </>
  );
}
