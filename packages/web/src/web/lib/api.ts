import {
  queryOptions as buildQueryOptions,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { localRouter } from "./local/router";

/**
 * Uygulama statik olarak yayınlanıyor (GitHub Pages): sunucu yok.
 * Bu dosya, eski oRPC istemcisiyle aynı yüzeyi (client + orpc) sunar ama
 * çağrıları tarayıcı içindeki yerel router'a yönlendirir.
 */

type Handler = (input: never) => Promise<unknown>;

type InputOf<F> = F extends (input: infer I) => Promise<unknown> ? I : never;
type OutputOf<F> = F extends (...args: never[]) => Promise<infer O> ? O : never;

interface Procedure<F extends Handler> {
  key: () => readonly unknown[];
  queryOptions: (
    opts?: Omit<
      UseQueryOptions<OutputOf<F>, Error, OutputOf<F>, readonly unknown[]>,
      "queryKey" | "queryFn"
    > & { input?: InputOf<F> },
  ) => UseQueryOptions<OutputOf<F>, Error, OutputOf<F>, readonly unknown[]>;
  mutationOptions: (
    opts?: Omit<UseMutationOptions<OutputOf<F>, Error, InputOf<F>>, "mutationFn">,
  ) => UseMutationOptions<OutputOf<F>, Error, InputOf<F>>;
}

function procedure<F extends Handler>(path: readonly string[], fn: F): Procedure<F> {
  return {
    key: () => path,
    queryOptions: (opts = {}) => {
      const { input, ...rest } = opts;
      return buildQueryOptions({
        queryKey: [...path, input ?? null] as readonly unknown[],
        queryFn: () => fn(input as never) as Promise<OutputOf<F>>,
        ...rest,
      });
    },
    mutationOptions: (opts = {}) => ({
      mutationFn: (input: InputOf<F>) => fn(input as never) as Promise<OutputOf<F>>,
      ...opts,
    }),
  };
}

type Utils<T> = T extends Handler
  ? Procedure<T>
  : { key: () => readonly unknown[] } & { [K in keyof T]: Utils<T[K]> };

function buildUtils<T extends object>(node: T, path: readonly string[]): Utils<T> {
  const out: Record<string, unknown> = { key: () => path };
  for (const [name, value] of Object.entries(node)) {
    out[name] =
      typeof value === "function"
        ? procedure([...path, name], value as Handler)
        : buildUtils(value as object, [...path, name]);
  }
  return out as Utils<T>;
}

/** Doğrudan çağrı: await client.matching.exportFile({...}) */
export const client = localRouter;

/** TanStack Query yardımcıları: useQuery(orpc.ping.queryOptions()) */
export const orpc = buildUtils(localRouter, []);
