import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "../lib/api";

export function useMatchRun(batchId: number | null) {
  return useQuery(
    orpc.matching.run.queryOptions({
      input: { batchId: batchId ?? 0 },
      enabled: batchId !== null,
      staleTime: 0,
    }),
  );
}

function invalidateMatch(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: orpc.matching.key() });
}

export function useConfirmMatch() {
  const qc = useQueryClient();
  return useMutation(orpc.matching.confirm.mutationOptions({ onSuccess: () => invalidateMatch(qc) }));
}

export function useUnconfirmMatch() {
  const qc = useQueryClient();
  return useMutation(
    orpc.matching.unconfirm.mutationOptions({ onSuccess: () => invalidateMatch(qc) }),
  );
}

export function useIgnoreCode() {
  const qc = useQueryClient();
  return useMutation(orpc.matching.ignore.mutationOptions({ onSuccess: () => invalidateMatch(qc) }));
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
