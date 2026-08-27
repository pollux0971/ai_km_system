/**
 * Registers the SQLite connection on the Fastify instance (E04-S040).
 *
 * Kept as a plugin so `apps/api/src/server.ts` gains exactly one registration
 * line and every domain plugin sees the same `fastify.db`.
 */
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type { Database } from "better-sqlite3";
import { openDatabase } from "./index.js";
import { resolveMigrationsDir, runMigrations } from "./migrate.js";

export interface DatabasePluginOptions {
  readonly dbPath: string;
  /**
   * Apply pending migrations at startup. True in development/test; production
   * deployments should run `pnpm --filter @ai-km/api migrate` as an explicit
   * deploy step so a schema change is a decision, not a side effect of a
   * restart.
   */
  readonly autoMigrate: boolean;
  /** Overridden by tests. */
  readonly migrationsDir?: string;
}

const plugin: FastifyPluginAsync<DatabasePluginOptions> = async (app, options) => {
  const db: Database = openDatabase(options.dbPath);

  if (options.autoMigrate) {
    // Deliberately NOT wrapped in try/catch: a database whose schema could not
    // be brought up to date must stop startup, not serve requests against a
    // schema nobody verified.
    const applied = runMigrations(db, options.migrationsDir ?? resolveMigrationsDir());
    if (applied.length > 0) app.log.info({ applied }, "applied pending migrations");
  }

  app.decorate("db", db);
  app.addHook("onClose", async () => {
    db.close();
  });
};

export const databasePlugin = fp(plugin, { name: "ai-km-database" });

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}
