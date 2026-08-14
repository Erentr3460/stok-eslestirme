import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MatchRow, MatchSummary } from "../../api/lib/match";
import { client, orpc } from "../lib/api";

type RunData = Awaited<ReturnType<typeof client.matching.run>>;
type QC = ReturnType<typeof useQueryClient>;

export function useMatchRun(batchId: number | null) {
  return useQuery(
    orpc.matching.run.queryOptions({
      input: { batchId: batchId ?? 0 },
      enabled: batchId !== null,
      staleTime: 5 * 60 * 1000,
      // Yeniden hesaplanırken tablo boşalmasın.
      placeholderData: (prev) => prev,
    }),
  );
}

function invalidateMatch(qc: QC) {
  qc.invalidateQueries({ queryKey: orpc.matching.key() });
}

const rowCode = (r: MatchRow) => r.code || r.code2 || r.name;

function summarize(rows: MatchRow[], prev: MatchSummary): MatchSummary {
  return {
    matched: rows.filter((r) => r.status === "matched").length,
    review: rows.filter((r) => r.status === "review").length,
    missing: rows.filter((r) => r.status === "missing").length,
    ignored: rows.filter((r) => r.status === "ignored").length,
    idle: prev.idle,
    changed: rows.filter((r) => {
      if (r.status !== "matched") return false;
      const c = r.candidates.find((x) => x.slug === r.slug);
      return (c?.stock ?? null) !== (r.stock ?? 0);
    }).length,
  };
}

/**
 * Onay/yoksay tıklamaları tüm eşleştirmeyi baştan çalıştırmak yerine
 * ekrandaki sonucu yerinde günceller — tıklama anında, donma olmadan.
 * Kalıcı kayıt (alias) yine IndexedDB'ye yazılır.
 */
function patchRows(qc: QC, code: string, patch: (r: MatchRow) => MatchRow) {
  qc.setQueriesData<RunData>({ queryKey: orpc.matching.run.key() }, (old) => {
    if (!old) return old;
    let touched = false;
    const rows = old.rows.map((r) => {
      if (rowCode(r) !== code) return r;
      touched = true;
      return patch(r);
    });
    if (!touched) return old;
    return { ...old, rows, summary: summarize(rows, old.summary) };
  });
}

export function useConfirmMatch() {
  const qc = useQueryClient();
  return useMutation(
    orpc.matching.confirm.mutationOptions({
      onSuccess: (_res, input) => {
        patchRows(qc, input.code, (r) => ({
          ...r,
          status: "matched",
          reason: "alias",
          score: 100,
          slug: input.slug,
        }));
      },
    }),
  );
}

export function useUnconfirmMatch() {
  const qc = useQueryClient();
  return useMutation(
    orpc.matching.unconfirm.mutationOptions({ onSuccess: () => invalidateMatch(qc) }),
  );
}

export function useIgnoreCode() {
  const qc = useQueryClient();
  return useMutation(
    orpc.matching.ignore.mutationOptions({
      onSuccess: (_res, input) => {
        patchRows(qc, input.code, (r) => ({
          ...r,
          status: "ignored",
          reason: "none",
          score: 0,
          slug: null,
          candidates: [],
        }));
      },
    }),
  );
}

export function useUnignoreCode() {
  const qc = useQueryClient();
  return useMutation(
    orpc.matching.unignore.mutationOptions({ onSuccess: () => invalidateMatch(qc) }),
  );
}

export function useAliases() {
  return useQuery(orpc.matching.aliases.queryOptions());
}

export function useIgnoredCodes() {
  return useQuery(orpc.matching.ignored.queryOptions());
}

export function usePrefixes() {
  return useQuery(orpc.matching.prefixes.queryOptions());
}

export function useAddPrefix() {
  const qc = useQueryClient();
  return useMutation(
    orpc.matching.addPrefix.mutationOptions({ onSuccess: () => invalidateMatch(qc) }),
  );
}

export function useTogglePrefix() {
  const qc = useQueryClient();
  return useMutation(
    orpc.matching.togglePrefix.mutationOptions({ onSuccess: () => invalidateMatch(qc) }),
  );
}

export function useRemovePrefix() {
  const qc = useQueryClient();
  return useMutation(
    orpc.matching.removePrefix.mutationOptions({ onSuccess: () => invalidateMatch(qc) }),
  );
}

export interface ExportOptions {
  batchId: number;
  overrides: Record<string, { slug: string | null; stock: number | null; skip?: boolean }>;
  zeroIdle: boolean;
  onlyChanged: boolean;
}

export function useExport() {
  return useMutation({
    mutationFn: (opts: ExportOptions) => client.matching.exportFile(opts),
  });
}
