import { describe, expect, it } from "vitest";
import { parseFastifyRoutes, stateChangingRoutesOf } from "./parse-fastify-routes.js";

// Captured verbatim from a real `app.printRoutes({ commonPrefix: false })`
// call against the real assembled server (see this story's EVIDENCE for the
// exact command), so this test proves the parser against real tool output,
// not an invented fixture.
const SAMPLE_OUTPUT = `├── /v1/conversations (GET, HEAD, POST)
│   └── /:conversationId (GET, HEAD, PATCH, DELETE)
│       └── /messages (GET, HEAD, POST)
│           └── /:messageId/revisions (POST)
├── /v1/auth/login (POST)
├── /v1/auth/logout (POST)
├── /v1/auth/session (GET, HEAD)
├── /v1/transcriptions (POST)
└── /v1/health (GET, HEAD)
`;

describe("parseFastifyRoutes", () => {
  it("reconstructs full paths from a nested tree, not just leaf segments", () => {
    const routes = parseFastifyRoutes(SAMPLE_OUTPUT);
    const paths = new Set(routes.map((r) => r.path));
    expect(paths).toContain("/v1/conversations");
    expect(paths).toContain("/v1/conversations/:conversationId");
    expect(paths).toContain("/v1/conversations/:conversationId/messages");
    expect(paths).toContain("/v1/conversations/:conversationId/messages/:messageId/revisions");
  });

  it("emits one entry per method, not one per line", () => {
    const routes = parseFastifyRoutes(SAMPLE_OUTPUT);
    const conversationsRoot = routes.filter((r) => r.path === "/v1/conversations");
    expect(conversationsRoot.map((r) => r.method).sort()).toEqual(["GET", "HEAD", "POST"]);
  });

  it("handles a leaf with only one method (no trailing siblings)", () => {
    const routes = parseFastifyRoutes(SAMPLE_OUTPUT);
    expect(routes).toContainEqual({ method: "POST", path: "/v1/auth/login" });
    expect(routes).toContainEqual({ method: "POST", path: "/v1/transcriptions" });
  });

  it("does not confuse a shallower sibling with a stale deeper path (stack truncation)", () => {
    const routes = parseFastifyRoutes(SAMPLE_OUTPUT);
    // /v1/auth/login sits at depth 0, right after a depth-3 leaf
    // (/:messageId/revisions) — if the parser failed to truncate the path
    // stack, it would wrongly prefix login's path with the conversations
    // branch's accumulated segments.
    expect(routes.some((r) => r.path.includes("conversations") && r.path.includes("login"))).toBe(false);
  });

  it("returns the exact total route×method count for this fixture (3+4+3+1+1+1+2+1+2 = 18 method entries)", () => {
    expect(parseFastifyRoutes(SAMPLE_OUTPUT)).toHaveLength(18);
  });
});

describe("stateChangingRoutesOf", () => {
  it("excludes GET/HEAD/OPTIONS", () => {
    const routes = parseFastifyRoutes(SAMPLE_OUTPUT);
    const stateChanging = stateChangingRoutesOf(routes);
    expect(stateChanging.every((r) => !["GET", "HEAD", "OPTIONS"].includes(r.method))).toBe(true);
  });

  it("keeps every POST/PATCH/PUT/DELETE route", () => {
    const routes = parseFastifyRoutes(SAMPLE_OUTPUT);
    const stateChanging = stateChangingRoutesOf(routes);
    expect(stateChanging).toEqual(
      expect.arrayContaining([
        { method: "POST", path: "/v1/conversations" },
        { method: "PATCH", path: "/v1/conversations/:conversationId" },
        { method: "DELETE", path: "/v1/conversations/:conversationId" },
        { method: "POST", path: "/v1/conversations/:conversationId/messages" },
        { method: "POST", path: "/v1/conversations/:conversationId/messages/:messageId/revisions" },
        { method: "POST", path: "/v1/auth/login" },
        { method: "POST", path: "/v1/auth/logout" },
        { method: "POST", path: "/v1/transcriptions" },
      ]),
    );
    expect(stateChanging).toHaveLength(8);
  });
});
