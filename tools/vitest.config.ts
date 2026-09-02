import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `__fixtures__/**/*.test.ts` stays in `include` so that mutate.mjs's
    // own spawned `vitest run <explicit fixture path>` calls can find those
    // files at all (an explicit path argument is matched against files
    // vitest already discovered via `include` — excluding the fixtures here
    // makes them invisible to that explicit invocation too, not just to a
    // bare `vitest run`; verified empirically while building this package).
    // Some fixtures (`already-red.test.ts`) are DELIBERATELY, PERMANENTLY
    // red — they exist to prove mutate.mjs refuses an invalid baseline —
    // so this package's own `"test"` script (`package.json`) deliberately
    // runs `vitest run mutate.test.ts`, not a bare `vitest run`: the bare
    // form would sweep the fixtures in too and report a real (if
    // intentional) failure on every `pnpm turbo run test`.
    include: ["*.test.ts", "__fixtures__/**/*.test.ts"],
    // mutate.test.ts spawns `node tools/mutate.mjs ...` as a real child
    // process, which in turn spawns `pnpm --filter <pkg> exec vitest run
    // ...` as ITS OWN child process (see mutate.mjs's module docstring) —
    // three levels of process nesting, each with real pnpm/vitest startup
    // cost. The default timeout is too tight for that.
    testTimeout: 60_000,
  },
});
