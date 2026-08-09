import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useUploads() {
  return useQuery(orpc.uploads.list.queryOptions());
}

export function useUpload(id: number | null) {
  return useQuery(
    orpc.uploads.get.queryOptions({ input: { id: id ?? 0 }, enabled: id !== null }),
  );
}

export function useCreateUpload() {
  const qc = useQueryClient();
  return useMutation(
    orpc.uploads.create.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.uploads.key() }),
    }),
  );
}

export function useSetMapping() {
  const qc = useQueryClient();
  return useMutation(
    orpc.uploads.setMapping.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orpc.uploads.key() });
        qc.invalidateQueries({ queryKey: orpc.matching.key() });
      },
    }),
  );
}

export function useRemoveUpload() {
  const qc = useQueryClient();
  return useMutation(
    orpc.uploads.remove.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.uploads.key() }),
    }),
  );
}
