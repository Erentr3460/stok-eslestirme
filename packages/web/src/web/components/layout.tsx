import {
  Database,
  Download,
  FileSpreadsheet,
  GitCompareArrows,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useCatalogStatus } from "../queries/catalog";
import { useBatch } from "../hooks/use-batch";

const NAV = [
  { to: "/", label: "Hızlı Güncelleme", icon: Zap, group: "main" },
  { to: "/yukle", label: "Excel Yükle", icon: FileSpreadsheet, group: "adv" },
  { to: "/eslestir", label: "Eşleştirmeyi Gözden Geçir", icon: GitCompareArrows, group: "adv" },
  { to: "/aktar", label: "Dosya Oluştur", icon: Download, group: "adv" },
  { to: "/katalog", label: "Site Katalogu", icon: Database, group: "adv" },
  { to: "/kurallar", label: "Kurallar", icon: SlidersHorizontal, group: "adv" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [path] = useLocation();
  const status = useCatalogStatus();
  const { batchId } = useBatch();
  const running = status.data?.job?.status === "running";

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 flex w-[230px] flex-col bg-navy text-white">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="text-[15px] font-bold tracking-tight">
            SLIP<span className="text-brand">RING</span>
          </div>
          <div className="mt-0.5 text-[11px] text-white/50">Stok Eşleştirme Aracı</div>
        </div>

        <nav className="flex-1 px-2 py-3">
          {NAV.map((n) => {
            const first = n.group === "adv" && NAV.findIndex((x) => x.group === "adv") === NAV.indexOf(n);
            const active = path === n.to;
            const Icon = n.icon;
            return (
              <div key={n.to}>
                {first && (
                  <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                    Gelişmiş
                  </p>
                )}
              <Link
                to={n.to}
                className={`mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition ${
                  active ? "bg-brand text-navy" : "text-white/70 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon size={15} strokeWidth={2.2} />
                <span className="flex-1 leading-tight">{n.label}</span>
              </Link>
              </div>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-white/10 px-5 py-4 text-[11px] text-white/60">
          <div className="flex items-center justify-between">
            <span>Katalog</span>
            <span className="mono text-white/90">{status.data?.total ?? "—"} ürün</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Kayıtlı eşleşme</span>
            <span className="mono text-white/90">{status.data?.aliasCount ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Aktif dosya</span>
            <span className="mono text-white/90">{batchId ? `#${batchId}` : "yok"}</span>
          </div>
          {running && (
            <div className="flex items-center gap-1.5 pt-1 text-brand">
              <span className="size-1.5 animate-pulse rounded-full bg-brand" />
              tarama sürüyor…
            </div>
          )}
        </div>
      </aside>

      <main className="ml-[230px] flex-1 px-7 py-7">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}

export function PageHead({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-6">
      <div>
        <h1 className="text-[23px] font-bold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-idle">{desc}</p>}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  );
}
