import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useCatalogStatus() {
  return useQuery(
    orpc.catalog.status.queryOptions({
      refetchInterval: (q) => (q.state.data?.job?.status === "running" ? 1200 : false),
    }),
  );
}

export function useSyncCatalog() {
  const qc = useQueryClient();
  return useMutation(
    orpc.catalog.sync.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.catalog.key() }),
    }),
  );
}

export function useCatalogList(q: string) {
  return useQuery(orpc.catalog.list.queryOptions({ input: { q, limit: 300 }, staleTime: 30_000 }));
}
