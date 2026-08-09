import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { catalog } from "./routes/catalog";
import { matching } from "./routes/matching";
import { ping } from "./routes/ping";
import { uploads } from "./routes/uploads";

// API features are oRPC procedures, one file per feature in ./routes/,
// composed into this router — typed end-to-end via the clients
// (web: src/web/lib/api.ts, mobile: lib/api.ts).
export const router = {
  ping,
  catalog,
  uploads,
  matching,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);

export default app;
