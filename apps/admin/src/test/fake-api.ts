import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

/**
 * In-memory, contract-validated fake of `analytics.yaml`'s 5 admin-facing
 * GET routes (E13-S021) — the only ones `apps/admin` calls; `POST /usage-
 * events` is apps/web's own concern (E13-S020) and has no caller here.
 * Same pattern as `apps/web/src/test/fake-api.ts` (E03-S036), deliberately
 * NOT extracted to `packages/testing` or reused from `apps/web` — neither
 * is in this story's allowed-modify list, and this fake is a fifth the
 * size (5 read-only routes, no mutation/ownership model to port).
 *
 * NOT integration evidence for a real server (Testing Boundary /
 * Anti-hallucination Guard) — see docs/stories/E13-S021.md for the
 * separate real-backend E2E (`admin-analytics-real.spec.ts`).
 */

const CONTRACTS_DIR = path.resolve(import.meta.dirname, "../../../../contracts/openapi");

function loadYaml(name: string): Record<string, unknown> {
  return yaml.load(readFileSync(path.join(CONTRACTS_DIR, `${name}.yaml`), "utf8")) as Record<string, unknown>;
}

const specDocs: Record<string, unknown> = {
  "analytics.yaml": loadYaml("analytics"),
  "core.yaml": loadYaml("core"),
};

function resolvePointer(doc: unknown, pointer: string): unknown {
  return pointer
    .split("/")
    .filter(Boolean)
    .reduce<unknown>((acc, key) => {
      const decoded = decodeURIComponent(key).replace(/~1/g, "/").replace(/~0/g, "~");
      return (acc as Record<string, unknown> | undefined)?.[decoded];
    }, doc);
}

function dereference(node: unknown, currentDoc: string): unknown {
  if (Array.isArray(node)) return node.map((item) => dereference(item, currentDoc));
  if (node && typeof node === "object") {
    const ref = (node as Record<string, unknown>).$ref;
    if (typeof ref === "string") {
      const hashIndex = ref.indexOf("#");
      const rawFilePart = hashIndex > 0 ? ref.slice(0, hashIndex) : "";
      const filePart = rawFilePart.replace(/^\.\//, "");
      const pointer = hashIndex >= 0 ? ref.slice(hashIndex + 1) : "";
      const targetDoc = filePart || currentDoc;
      const resolved = resolvePointer(specDocs[targetDoc], pointer);
      if (resolved === undefined) {
        throw new Error(`[admin fake-api] could not resolve $ref "${ref}" from ${currentDoc}`);
      }
      return dereference(resolved, targetDoc);
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref") continue;
      out[key] = dereference(value, currentDoc);
    }
    return out;
  }
  return node;
}

function schemaFor(name: string): object {
  const schemas = (specDocs["analytics.yaml"] as { components: { schemas: Record<string, unknown> } }).components
    .schemas;
  return dereference(schemas[name], "analytics.yaml") as object;
}

// "uuid" is deliberately NOT registered — same reasoning apps/web's own
// fake-api.ts already establishes: test fixtures use short, readable ids
// ("f1", "conv-1") rather than real UUIDs, and strict format:uuid
// validation on response bodies would flag those as invalid for no
// benefit this fake actually needs (it never parses/reuses the id as a
// UUID, only compares it for equality).
const ajv = new Ajv({ strict: false });
addFormats(ajv, { formats: ["date", "date-time"] });

function compile(name: string): ValidateFunction {
  return ajv.compile(schemaFor(name));
}

const validators = {
  UsageMetrics: compile("UsageMetrics"),
  LatencyMetrics: compile("LatencyMetrics"),
  FeedbackQueuePage: compile("FeedbackQueuePage"),
  FeedbackItem: compile("FeedbackItem"),
  SystemHealth: compile("SystemHealth"),
};

function validated<T>(validator: ValidateFunction, body: T): T {
  if (!validator(body)) {
    throw new Error(`[admin fake-api] response does not match contract: ${ajv.errorsText(validator.errors)}`);
  }
  return body;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function errorBody(code: string, message: string): { code: string; message: string } {
  return { code, message };
}

// ---- Fixture data ----------------------------------------------------------------

export interface FakeFeedbackItem {
  id: string;
  verdict: "ok" | "ng";
  reason?: string;
  comment?: string;
  citationFeedback?: { citationId: string; verdict: "ok" | "ng" }[];
  submittedAt: string;
  messageId: string;
  conversationId: string;
  answerExcerpt: string;
}

type FakeApiRoute = "usage" | "latency" | "feedback-list" | "feedback-item" | "health";

interface FakeApiState {
  usageMetricsByDate: Map<string, { dailyActiveUsers: number; questionsAsked: number }>;
  latencyMetrics: { averageLatencyMs: number | null; sampleCount: number };
  feedbackItems: FakeFeedbackItem[];
  health: { checkedAt: string; subsystems: { name: string; status: string; detail?: string }[] };
  forcedFailure?: { route: FakeApiRoute; status: number; code: string };
}

let state: FakeApiState;

/** Every test starts from the same known state — no usage days recorded, no latency samples, no feedback, health all `ok`. Matches the honest "sandbox account with no history" starting point, not a plausible-looking fabricated non-zero default. */
export function resetFakeApi(): void {
  state = {
    usageMetricsByDate: new Map(),
    latencyMetrics: { averageLatencyMs: null, sampleCount: 0 },
    feedbackItems: [],
    health: {
      checkedAt: "2026-08-29T00:00:00.000Z",
      subsystems: [
        { name: "api", status: "ok" },
        { name: "database", status: "ok" },
        { name: "migrations", status: "ok" },
        { name: "asr", status: "ok" },
      ],
    },
  };
}
resetFakeApi();

export function setUsageMetrics(date: string, metrics: { dailyActiveUsers: number; questionsAsked: number }): void {
  state.usageMetricsByDate.set(date, metrics);
}

export function setLatencyMetrics(metrics: { averageLatencyMs: number | null; sampleCount: number }): void {
  state.latencyMetrics = metrics;
}

export function setFeedbackItems(items: FakeFeedbackItem[]): void {
  state.feedbackItems = items;
}

export function setHealth(subsystems: { name: string; status: string; detail?: string }[]): void {
  state.health = { checkedAt: state.health.checkedAt, subsystems };
}

/** Forces the NEXT request to the given route to fail with `status`/`code`, then reverts. */
export function failNextRequest(route: FakeApiRoute, status: number, code: string): void {
  state.forcedFailure = { route, status, code };
}

function takeForcedFailure(route: FakeApiRoute): { status: number; code: string } | undefined {
  if (state.forcedFailure?.route !== route) return undefined;
  const failure = state.forcedFailure;
  state.forcedFailure = undefined;
  return failure;
}

// ---- Router -----------------------------------------------------------------------

export async function fakeFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  if (pathname === "/api/v1/admin/metrics/usage" && request.method === "GET") {
    const forced = takeForcedFailure("usage");
    if (forced) return jsonResponse(forced.status, errorBody(forced.code, "forced failure"));

    const date = searchParams.get("date");
    if (!date) return jsonResponse(400, errorBody("VALIDATION_ERROR", "date is required"));
    const metrics = state.usageMetricsByDate.get(date) ?? { dailyActiveUsers: 0, questionsAsked: 0 };
    return jsonResponse(200, validated(validators.UsageMetrics, { date, ...metrics }));
  }

  if (pathname === "/api/v1/admin/metrics/latency" && request.method === "GET") {
    const forced = takeForcedFailure("latency");
    if (forced) return jsonResponse(forced.status, errorBody(forced.code, "forced failure"));

    return jsonResponse(200, validated(validators.LatencyMetrics, state.latencyMetrics));
  }

  if (pathname === "/api/v1/admin/feedback" && request.method === "GET") {
    const forced = takeForcedFailure("feedback-list");
    if (forced) return jsonResponse(forced.status, errorBody(forced.code, "forced failure"));

    const verdict = searchParams.get("verdict") as "ok" | "ng" | null;
    const hasReasonParam = searchParams.get("hasReason");
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "20");

    let items = state.feedbackItems;
    if (verdict) items = items.filter((item) => item.verdict === verdict);
    if (hasReasonParam !== null) {
      const wantsReason = hasReasonParam === "true";
      items = items.filter((item) => (item.reason != null && item.reason !== "") === wantsReason);
    }

    const totalCount = items.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const paged = items.slice((page - 1) * pageSize, page * pageSize);

    return jsonResponse(
      200,
      validated(validators.FeedbackQueuePage, { items: paged, page, pageSize, totalCount, totalPages }),
    );
  }

  const feedbackItemMatch = /^\/api\/v1\/admin\/feedback\/([^/]+)$/.exec(pathname);
  if (feedbackItemMatch && request.method === "GET") {
    const forced = takeForcedFailure("feedback-item");
    if (forced) return jsonResponse(forced.status, errorBody(forced.code, "forced failure"));

    const messageId = decodeURIComponent(feedbackItemMatch[1]!);
    const item = state.feedbackItems.find((candidate) => candidate.messageId === messageId);
    if (!item) return jsonResponse(404, errorBody("NOT_FOUND", "找不到指定的回饋紀錄。"));
    return jsonResponse(200, validated(validators.FeedbackItem, item));
  }

  if (pathname === "/api/v1/admin/health" && request.method === "GET") {
    const forced = takeForcedFailure("health");
    if (forced) return jsonResponse(forced.status, errorBody(forced.code, "forced failure"));

    return jsonResponse(200, validated(validators.SystemHealth, state.health));
  }

  throw new Error(`[admin fake-api] unhandled request: ${request.method} ${pathname}`);
}
