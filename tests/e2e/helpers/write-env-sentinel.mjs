#!/usr/bin/env node
// Companion to helpers/env-sentinel.ts's `sentinelPath` (E04-S056 AC5.1).
// Runs as a plain `node` shell step immediately before a webServer's real
// dev command (see playwright.config.ts's `wrapCommandWithSentinel`), so it
// can't `import` that TS module directly — the path formula below must stay
// identical to `sentinelPath`'s.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , portArg, ...varNames] = process.argv;
const port = Number(portArg);
const values = Object.fromEntries(varNames.map((name) => [name, process.env[name] ?? null]));
writeFileSync(path.join(tmpdir(), `ai-km-e2e-webserver-env-${port}.json`), JSON.stringify(values));
