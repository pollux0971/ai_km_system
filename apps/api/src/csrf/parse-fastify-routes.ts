/**
 * Parses Fastify's `app.printRoutes({ commonPrefix: false })` tree output
 * into a flat `{ method, path }[]` — the real, structural route table, not
 * a hand-maintained list. This is what makes
 * `csrf-route-scan.test.ts` (E04-S048 AC5) a genuine safety net: a future
 * route nobody remembered to add to a checklist still shows up here,
 * because it comes from Fastify's own router, not from this file's memory.
 *
 * Format (from `find-my-way`'s pretty-printer):
 *   ├── /v1/conversations (GET, HEAD, POST)
 *   │   └── /:conversationId (GET, HEAD, PATCH, DELETE)
 *   │       └── /messages (GET, HEAD, POST)
 *
 * Each ancestor level occupies exactly 4 characters ("│   " or "    ")
 * before the current line's own "├── "/"└── " connector, so the connector's
 * character offset divided by 4 is that line's depth — no need to interpret
 * the box-drawing characters themselves beyond finding where they end.
 */

export interface RouteEntry {
  readonly method: string;
  readonly path: string;
}

const CONNECTOR_RE = /[├└]── (.*)$/;
const METHODS_RE = /^(.*?)\s*\(([^)]+)\)\s*$/;

export function parseFastifyRoutes(printRoutesOutput: string): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const pathStack: string[] = [];

  for (const rawLine of printRoutesOutput.split("\n")) {
    if (rawLine.trim() === "") continue;
    const connectorIndex = rawLine.search(/[├└]/);
    if (connectorIndex === -1) continue; // a line with no branch (shouldn't happen, but skip defensively)
    const depth = connectorIndex / 4;

    const match = CONNECTOR_RE.exec(rawLine);
    if (!match?.[1]) continue;
    const rest = match[1];

    const methodsMatch = METHODS_RE.exec(rest);
    const segment = (methodsMatch?.[1] ?? rest).trim();
    const methods = methodsMatch?.[2] ? methodsMatch[2].split(",").map((m) => m.trim()) : [];

    const parentPath = depth > 0 ? (pathStack[depth - 1] ?? "") : "";
    const fullPath = parentPath + segment;
    pathStack[depth] = fullPath;
    pathStack.length = depth + 1; // drop any stale deeper entries from a sibling branch

    for (const method of methods) {
      routes.push({ method, path: fullPath });
    }
  }

  return routes;
}

/** GET/HEAD/OPTIONS never change state — CSRF (E04-S048) never applies to them (the red line). */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function stateChangingRoutesOf(routes: readonly RouteEntry[]): RouteEntry[] {
  return routes.filter((r) => !SAFE_METHODS.has(r.method));
}
