import { Loader2 } from "lucide-react";

export function Btn({
  children,
  variant = "ghost",
  loading,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "brand" | "ghost" | "dark" | "danger";
  loading?: boolean;
}) {
  const styles: Record<string, string> = {
    brand: "bg-brand text-navy hover:bg-brand-dark border-transparent font-semibold",
    dark: "bg-navy text-white hover:bg-navy-soft border-transparent font-semibold",
    ghost: "bg-white text-ink hover:bg-surface border-line",
    danger: "bg-white text-miss hover:bg-miss-soft border-line",
  };
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] leading-5 transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  tone = "idle",
  active,
  onClick,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "review" | "miss" | "idle" | "brand";
  active?: boolean;
  onClick?: () => void;
  sub?: string;
}) {
  const tones: Record<string, string> = {
    ok: "text-ok",
    review: "text-review",
    miss: "text-miss",
    idle: "text-idle",
    brand: "text-brand-dark",
  };
  const ring: Record<string, string> = {
    ok: "border-ok",
    review: "border-review",
    miss: "border-miss",
    idle: "border-idle",
    brand: "border-brand",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`card flex flex-1 flex-col items-start px-4 py-3 text-left transition ${
        onClick ? "cursor-pointer hover:border-ink/25" : ""
      } ${active ? `${ring[tone]} border-2` : ""}`}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-idle">{label}</span>
      <span className={`mono mt-1 text-[21px] font-bold leading-none ${tones[tone]}`}>{value}</span>
      {sub && <span className="mt-1 text-[11px] text-idle">{sub}</span>}
    </Tag>
  );
}

export function Tag({
  children,
  tone = "idle",
}: {
  children: React.ReactNode;
  tone?: "ok" | "review" | "miss" | "idle" | "brand";
}) {
  const tones: Record<string, string> = {
    ok: "bg-ok-soft text-ok",
    review: "bg-review-soft text-review",
    miss: "bg-miss-soft text-miss",
    idle: "bg-idle-soft text-idle",
    brand: "bg-brand-soft text-brand-dark",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <p className="text-[14px] font-semibold">{title}</p>
      {hint && <p className="max-w-md text-[12.5px] leading-relaxed text-idle">{hint}</p>}
    </div>
  );
}

export function StockDiff({ from, to }: { from: number; to: number }) {
  const up = to > from;
  const same = to === from;
  return (
    <span className="mono inline-flex items-center gap-1 text-[12px] whitespace-nowrap">
      <span className={same ? "text-idle" : "text-idle line-through"}>{from}</span>
      <span className="text-idle">→</span>
      <span className={`font-bold ${same ? "text-idle" : up ? "text-ok" : "text-miss"}`}>{to}</span>
    </span>
  );
}
