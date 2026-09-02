import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `src/check.live.test.ts` builds the REAL `apps/api` server (real
    // contracts, real domain plugins) and is what `tools/mutate.mjs`'s
    // `--expect-fail` points at for this story's reverse verification —
    // see README.md "Why no package.json test script" for why this whole
    // package deliberately has no `"test"` script (so `pnpm turbo run
    // test` never runs it): mutate.mjs invokes `vitest run <file>`
    // directly, bypassing package.json entirely, so the file must still be
    // discoverable by an explicit-path `vitest run` call — which (per
    // tools/vitest.config.ts's own comment, verified empirically there
    // too) requires the file to appear in `include`, not just exist on
    // disk.
    include: ["src/**/*.test.ts"],
    // check.live.test.ts spins up the real Fastify app (SQLite migrations,
    // every domain plugin) — slower than a pure unit test.
    testTimeout: 30_000,
  },
});
