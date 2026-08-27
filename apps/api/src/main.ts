/**
 * Process entrypoint (E04-S039).
 *
 * Kept separate from `server.ts` so tests can build a real server without
 * binding a port, and so a configuration failure exits the process before
 * anything is listening (AC6).
 */
import { buildServer } from "./server.js";
import { ConfigError, loadConfig } from "./config.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      // Written to stderr and exited BEFORE any listen(): a server that is up
      // and misconfigured is worse than one that never started.
      process.stderr.write(`[@ai-km/api] 設定錯誤,拒絕啟動:${error.message}\n`);
      process.exit(78); // EX_CONFIG
    }
    throw error;
  }

  const app = await buildServer({ config });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  process.stderr.write(`[@ai-km/api] 啟動失敗:${(error as Error).message}\n`);
  process.exit(1);
});
