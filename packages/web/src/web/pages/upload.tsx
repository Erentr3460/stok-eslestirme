import { useRef, useState } from "react";
import { Check, FileSpreadsheet, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { useLocation } from "wouter";
import { PageHead } from "../components/layout";
import { Btn, Empty, Tag } from "../components/ui/bits";
import { useBatch } from "../hooks/use-batch";
import { useCatalogStatus, useSyncCatalog } from "../queries/catalog";
import {
  useCreateUpload,
  useRemoveUpload,
  useSetMapping,
  useUpload,
  useUploads,
} from "../queries/uploads";

type Mapping = { code: string | null; code2: string | null; name: string | null; stock: string | null };

const FIELDS: { key: keyof Mapping; label: string; hint: string; required?: boolean }[] = [
  { key: "code", label: "Ürün Kodu", hint: "Ana eşleştirme kolonu", required: true },
  { key: "code2", label: "Yedek Kod", hint: "Ana kod tutmazsa denenir" },
  { key: "name", label: "Ürün Adı", hint: "Son çare eşleştirme + gösterim" },
  { key: "stock", label: "Stok Adedi", hint: "Siteye yazılacak değer", required: true },
];

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Dosya okunamadı"));
    r.readAsDataURL(file);
  });
}

export default function UploadPage() {
  const [, navigate] = useLocation();
  const { batchId, select } = useBatch();
  const uploads = useUploads();
  const active = useUpload(batchId);
  const create = useCreateUpload();
  const setMapping = useSetMapping();
  const remove = useRemoveUpload();
  const catalogStatus = useCatalogStatus();
  const syncCatalog = useSyncCatalog();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Mapping | null>(null);
  const [saved, setSaved] = useState(false);

  const mapping = draft ?? active.data?.mapping ?? null;
  const columns = active.data?.columns ?? [];

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setErr(null);
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
      setErr("Sadece .xlsx, .xls veya .csv yükleyebilirsin.");
      return;
    }
    try {
      const res = await create.mutateAsync({ filename: file.name, dataBase64: await toBase64(file) });
      setDraft(null);
      select(res.id);
      // Yayınlanmış katalog dosyasını tazele (haftalık otomatik güncelleniyor).
      syncCatalog.mutate(undefined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Dosya işlenemedi");
    }
  }

  function set(key: keyof Mapping, value: string) {
    if (!mapping) return;
    setDraft({ ...mapping, [key]: value === "" ? null : value });
    setSaved(false);
  }

  const job = catalogStatus.data?.job ?? null;
  const syncing = job?.status === "running";
  const ready = Boolean(mapping?.code && mapping?.stock) && !syncing;

  return (
    <>
      <PageHead
        title="ERP Stok Listesi Yükle"
        desc="Logo'dan çektiğin Excel'i bırak. Kolonlar otomatik tanınır; yanlış tanıdıysa aşağıdan düzelt. Dosya kaydedilir, sonra tekrar yüklemeden eşleştirebilirsin."
      />

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
        className={`mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-11 transition ${
          drag ? "border-brand bg-brand-soft" : "border-line bg-white hover:border-brand/60"
        }`}
      >
        <UploadCloud size={26} className={drag ? "text-brand-dark" : "text-idle"} />
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
        <div className="mb-4 rounded-md border border-miss/30 bg-miss-soft px-3 py-2 text-[12.5px] text-miss">
          {err}
        </div>
      )}

      {job && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] ${
            syncing
              ? "border-brand/40 bg-brand-soft text-ink"
              : job.status === "error"
                ? "border-miss/30 bg-miss-soft text-miss"
                : "border-ok/30 bg-ok-soft text-ink"
          }`}
        >
          <RefreshCw size={13} className={syncing ? "animate-spin text-brand-dark" : "text-ok"} />
          {syncing ? (
            <span>
              Sitedeki güncel stoklar çekiliyor —{" "}
              <span className="mono font-semibold">
                {job.fetched ?? 0}/{job.total ?? 0} sayfa
              </span>
              {(job.dsTotal ?? 0) > 0 && (
                <>
                  {" · datasheet "}
                  <span className="mono font-semibold">
                    {job.dsDone ?? 0}/{job.dsTotal ?? 0}
                  </span>
                </>
              )}
            </span>
          ) : job.status === "error" ? (
            <span>Site taraması hata verdi: {job.message ?? "bilinmeyen hata"}</span>
          ) : (
            <span>
              Site stokları güncel —{" "}
              <span className="mono font-semibold">{catalogStatus.data?.total ?? 0} ürün</span> tarandı.
            </span>
          )}
          <button
            type="button"
            onClick={() => syncCatalog.mutate(undefined)}
            disabled={syncing}
            className="ml-auto text-[11.5px] font-semibold text-brand-dark underline disabled:opacity-40"
          >
            yeniden çek
          </button>
        </div>
      )}

      {active.data && mapping && (
        <div className="card rise mb-4 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <FileSpreadsheet size={15} className="text-brand-dark" />
            <span className="text-[13px] font-semibold">{active.data.filename}</span>
            <span className="mono text-[11.5px] text-idle">
              {active.data.sheetName} · {active.data.rowCount} satır · {columns.length} kolon
            </span>
            <Tag tone="brand">AKTİF</Tag>
          </div>

          <div className="grid grid-cols-4 gap-3 border-b border-line px-4 py-4">
            {FIELDS.map((f) => {
              const auto = active.data?.mapping[f.key];
              const val = mapping[f.key] ?? "";
              return (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="text-[11.5px] font-semibold">
                    {f.label}
                    {f.required && <span className="text-miss"> *</span>}
                    {auto && auto === val && !draft && (
                      <span className="ml-1.5 font-normal text-[10px] uppercase text-ok">
                        otomatik
                      </span>
                    )}
                  </span>
                  <select
                    value={val}
                    onChange={(e) => set(f.key, e.target.value)}
                    className={`mono rounded-md border px-2 py-1.5 text-[12px] outline-none focus:border-brand ${
                      f.required && !val ? "border-miss bg-miss-soft" : "border-line bg-white"
                    }`}
                  >
                    <option value="">— seçilmedi —</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-idle">{f.hint}</span>
                </label>
              );
            })}
          </div>

          <div className="max-h-[300px] overflow-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead className="sticky top-0 bg-surface text-left text-[10.5px] uppercase tracking-wide text-idle">
                <tr>
                  {columns.map((c) => {
                    const role = FIELDS.find((f) => mapping[f.key] === c);
                    return (
                      <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">
                        {c}
                        {role && <span className="ml-1 text-brand-dark">· {role.label}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {active.data.preview.map((row, i) => (
                  <tr key={i} className="border-t border-line">
                    {columns.map((c) => (
                      <td
                        key={c}
                        className={`max-w-[260px] truncate px-3 py-1.5 ${
                          FIELDS.some((f) => mapping[f.key] === c) ? "mono font-medium" : "text-idle"
                        }`}
                      >
                        {row[c] === null ? "—" : String(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-line bg-surface px-4 py-3">
            <span className="text-[12px] text-idle">
              {syncing
                ? "Site stokları çekiliyor, bitince eşleştirmeye geçebilirsin."
                : ready
                  ? "Kolonlar tamam, eşleştirmeye geçebilirsin."
                  : "Kod ve stok kolonu zorunlu."}
            </span>
            <div className="flex gap-2">
              {draft && (
                <Btn
                  loading={setMapping.isPending}
                  onClick={async () => {
                    await setMapping.mutateAsync({ id: active.data!.id, mapping: draft });
                    setDraft(null);
                    setSaved(true);
                  }}
                >
                  Kolonları Kaydet
                </Btn>
              )}
              {saved && !draft && (
                <span className="flex items-center gap-1 self-center text-[12px] font-semibold text-ok">
                  <Check size={13} /> kaydedildi
                </span>
              )}
              <Btn variant="brand" disabled={!ready || Boolean(draft)} onClick={() => navigate("/eslestir")}>
                Eşleştirmeye Geç →
              </Btn>
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-wide text-idle">
        Önceki Yüklemeler
      </h2>
      {uploads.data && uploads.data.length > 0 ? (
        <div className="card divide-y divide-line overflow-hidden">
          {uploads.data.map((u) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 px-4 py-2.5 text-[12.5px] ${
                u.id === batchId ? "bg-brand-soft" : ""
              }`}
            >
              <FileSpreadsheet size={14} className="shrink-0 text-idle" />
              <span className="flex-1 truncate font-medium">{u.filename}</span>
              <span className="mono text-[11.5px] text-idle">{u.rowCount} satır</span>
              <span className="mono w-[110px] text-right text-[11.5px] text-idle">
                {new Date(u.createdAt).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {u.id === batchId ? (
                <Tag tone="brand">AKTİF</Tag>
              ) : (
                <Btn
                  onClick={() => {
                    setDraft(null);
                    select(u.id);
                  }}
                >
                  Seç
                </Btn>
              )}
              <button
                type="button"
                onClick={async () => {
                  await remove.mutateAsync({ id: u.id });
                  if (u.id === batchId) select(null);
                }}
                className="text-idle transition hover:text-miss"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Henüz dosya yüklenmedi" hint="İlk Excel'ini yukarıdan bırak." />
      )}
    </>
  );
}
