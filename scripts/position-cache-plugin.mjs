import { resolve } from "node:path";
import { PositionDatabase, cacheMiddleware } from "./position-cache.mjs";

export default function positionCachePlugin() {
  const attach = (server) => {
    let db;
    server.middlewares.use(
      cacheMiddleware(
        () =>
          (db ??= new PositionDatabase(
            resolve(
              server.config.root,
              server.config.mode === "cache-test"
                ? "data/positions-test.sqlite"
                : "data/positions.sqlite",
            ),
          )),
      ),
    );
    server.httpServer?.once("close", () => {
      db?.close();
      db = undefined;
    });
  };
  return {
    name: "local-position-cache",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
