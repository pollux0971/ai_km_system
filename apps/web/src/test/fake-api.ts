import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

/**
 * In-memory, contract-validated fake of the `conversations.yaml` REST surface (E03-S036).
 * Injected as `fetch` into the singleton `apiClient` (see `setApiFetchForTests` in
 * `apps/web/src/lib/api.ts`) so `apps/web/src/lib/conversations.ts` and its tests never
 * need a real backend or `sessionStorage`. Every response (and every mutating request
 * body) is validated with Ajv against the actual spec, so if this fake drifts from the
 * real contract, the drift itself fails a test — never silently rendered "close enough".
 *
 * NOT integration evidence for a real server (Testing Boundary / Anti-hallucination
 * Guard) — see docs/stories/E03-S036.md for the separate L3 smoke against the real API.
 */

// ---- Load + dereference the schemas this fake actually needs -------------------------

const CONTRACTS_DIR = path.resolve(import.meta.dirname, "../../../../contracts/openapi");

function loadYaml(name: string): Record<string, unknown> {
  return yaml.load(readFileSync(path.join(CONTRACTS_DIR, `${name}.yaml`), "utf8")) as Record<string, unknown>;
}

const specDocs: Record<string, unknown> = {
  "conversations.yaml": loadYaml("conversations"),
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

/** Resolves every `$ref` (same-doc `#/...` and cross-file `./core.yaml#/...`) into a plain, ref-free schema. */
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
        throw new Error(`[fake-api] could not resolve $ref "${ref}" from ${currentDoc}`);
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
  const schemas = (specDocs["conversations.yaml"] as { components: { schemas: Record<string, unknown> } }).components
    .schemas;
  return dereference(schemas[name], "conversations.yaml") as object;
}

// Only "date-time" is registered — NOT "uuid". This fake's seeded conversations
// (below) intentionally keep the pre-existing "sample-1"/"sample-2"/"sample-3" ids so
// `sidebar.test.tsx`'s existing href assertions don't have to change; strict
// format:uuid validation on response bodies would otherwise flag those as invalid. The
// *request path parameter* `conversationId` is still validated as a UUID separately,
// by hand, in the router below — that's what actually exercises real client behavior.
const ajv = new Ajv({ strict: false });
addFormats(ajv, { formats: ["date-time"] });

function compile(name: string): ValidateFunction {
  return ajv.compile(schemaFor(name));
}

const validators = {
  Conversation: compile("Conversation"),
  ConversationListPage: compile("ConversationListPage"),
  CreateConversationRequest: compile("CreateConversationRequest"),
  UpdateConversationRequest: compile("UpdateConversationRequest"),
  ValidationErrorBody: compile("ValidationErrorBody"),
  UnauthenticatedErrorBody: compile("UnauthenticatedErrorBody"),
  PermissionDeniedErrorBody: compile("PermissionDeniedErrorBody"),
  NotFoundErrorBody: compile("NotFoundErrorBody"),
  InternalErrorBody: compile("InternalErrorBody"),
} as const;

function assertValid(name: keyof typeof validators, data: unknown): void {
  const validate = validators[name];
  if (!validate(data)) {
    throw new Error(
      `[fake-api] ${name} failed contract validation (contracts/openapi/conversations.yaml):\n` +
        `${JSON.stringify(validate.errors, null, 2)}\nOffending value:\n${JSON.stringify(data, null, 2)}`,
    );
  }
}

// ---- In-memory store -------------------------------------------------------------------

interface FakeConversation {
  id: string;
  title: string;
  mode: "normal" | "advanced";
  knowledgeScopes: string[];
  model: "standard" | "advanced-local" | "cloud";
  archived: boolean;
  lastMessageAt: string;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
}

let store: FakeConversation[] = [];
let failNext: { code: string; status: number } | null = null;

const STATUS_FOR_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

const ERROR_VALIDATOR_FOR_CODE: Partial<Record<string, keyof typeof validators>> = {
  VALIDATION_ERROR: "ValidationErrorBody",
  UNAUTHENTICATED: "UnauthenticatedErrorBody",
  PERMISSION_DENIED: "PermissionDeniedErrorBody",
  NOT_FOUND: "NotFoundErrorBody",
  INTERNAL_ERROR: "InternalErrorBody",
};

/** Test hook: clears the store and any pending forced failure. Call in `beforeEach`. */
export function resetFakeApi(): void {
  store = [];
  failNext = null;
}

/** Test hook: the same 3 conversations `SAMPLE_CONVERSATIONS` used to seed, now as full `Conversation` records. */
export function seedSampleConversations(): void {
  store = [
    {
      id: "sample-1",
      title: "產品保固政策詢問",
      mode: "normal",
      knowledgeScopes: ["company", "qna"],
      model: "standard",
      archived: false,
      lastMessageAt: "2026-08-12T09:15:00.000Z",
      lastMessagePreview: "保固期從出貨日起算 12 個月，涵蓋原廠零件更換。",
      createdAt: "2026-08-12T09:00:00.000Z",
      updatedAt: "2026-08-12T09:15:00.000Z",
    },
    {
      id: "sample-2",
      title: "設備 E-204 錯誤代碼排查",
      mode: "normal",
      knowledgeScopes: [],
      model: "standard",
      archived: false,
      lastMessageAt: "2026-08-11T14:30:00.000Z",
      lastMessagePreview: "請確認感測器接線是否鬆脫，並重新校正歸零。",
      createdAt: "2026-08-11T14:00:00.000Z",
      updatedAt: "2026-08-11T14:30:00.000Z",
    },
    {
      id: "sample-3",
      title: "Q3 銷售報表彙整",
      mode: "advanced",
      knowledgeScopes: [],
      model: "advanced-local",
      archived: false,
      lastMessageAt: "2026-08-10T02:00:00.000Z",
      lastMessagePreview: "本季華北區成長 12%，主要來自新客戶導入。",
      createdAt: "2026-08-10T01:00:00.000Z",
      updatedAt: "2026-08-10T02:00:00.000Z",
    },
  ];
}

/** Test hook: makes the NEXT request fail with the given machine-readable code, once. */
export function failNextRequest(code: string): void {
  failNext = { code, status: STATUS_FOR_CODE[code] ?? 500 };
}

/**
 * Test hook: makes the NEXT request throw (simulating a real network failure — DNS,
 * connection refused, offline) instead of resolving with an HTTP error response, once.
 */
export function failNextRequestWithNetworkError(): void {
  failNext = { code: "__NETWORK_ERROR__", status: 0 };
}

// ---- HTTP plumbing ----------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function errorResponse(status: number, code: string, message: string): Response {
  const body = { code, message };
  const validatorName = ERROR_VALIDATOR_FOR_CODE[code];
  if (validatorName) assertValid(validatorName, body);
  return jsonResponse(status, body);
}

function conversationResponse(status: number, record: FakeConversation): Response {
  assertValid("Conversation", record);
  return jsonResponse(status, record);
}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return undefined;
  return JSON.parse(text);
}

// ---- Route handlers ----------------------------------------------------------------------

function handleList(url: URL): Response {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  const q = (url.searchParams.get("q") ?? "").trim();
  const archived = url.searchParams.get("archived") === "true";

  const archivedFiltered = store.filter((item) => item.archived === archived);
  const filtered = q
    ? archivedFiltered.filter((item) => item.title.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
    : archivedFiltered;
  const sorted = [...filtered].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = (page - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);

  const body = { items, page, pageSize, totalCount, totalPages };
  assertValid("ConversationListPage", body);
  return jsonResponse(200, body);
}

async function handleCreate(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  if (body !== undefined) assertValid("CreateConversationRequest", body);
  const mode = (body as { mode?: "normal" | "advanced" } | undefined)?.mode ?? "normal";

  const now = new Date().toISOString();
  const record: FakeConversation = {
    id: crypto.randomUUID(),
    title: "新對話",
    mode,
    knowledgeScopes: [],
    model: "standard",
    archived: false,
    lastMessageAt: now,
    lastMessagePreview: "尚無訊息。",
    createdAt: now,
    updatedAt: now,
  };
  store = [record, ...store];
  return conversationResponse(201, record);
}

function findOr404(id: string): FakeConversation | Response {
  const record = store.find((item) => item.id === id);
  return record ?? errorResponse(404, "NOT_FOUND", "找不到這筆對話。");
}

function handleGet(id: string): Response {
  const found = findOr404(id);
  if (found instanceof Response) return found;
  return conversationResponse(200, found);
}

async function handlePatch(id: string, request: Request): Promise<Response> {
  const found = findOr404(id);
  if (found instanceof Response) return found;

  const body = (await readJsonBody(request)) ?? {};
  assertValid("UpdateConversationRequest", body);
  const patch = body as Partial<Omit<FakeConversation, "id" | "createdAt" | "updatedAt">>;

  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (!trimmed) return errorResponse(400, "VALIDATION_ERROR", "對話名稱不得為空。");
    patch.title = trimmed;
  }

  const updated: FakeConversation = { ...found, ...patch, updatedAt: new Date().toISOString() };
  store = store.map((item) => (item.id === id ? updated : item));
  return conversationResponse(200, updated);
}

function handleDelete(id: string): Response {
  const found = findOr404(id);
  if (found instanceof Response) return found;
  store = store.filter((item) => item.id !== id);
  return new Response(null, { status: 204 });
}

export async function fakeFetch(request: Request): Promise<Response> {
  if (failNext) {
    const { code, status } = failNext;
    failNext = null;
    if (code === "__NETWORK_ERROR__") {
      throw new TypeError("[fake-api] simulated network error");
    }
    return errorResponse(status, code, `[fake-api] forced failure: ${code}`);
  }

  const url = new URL(request.url);
  const { pathname, method } = { pathname: url.pathname, method: request.method };

  if (pathname === "/api/v1/conversations") {
    if (method === "GET") return handleList(url);
    if (method === "POST") return handleCreate(request);
  }

  const singleMatch = pathname.match(/^\/api\/v1\/conversations\/([^/]+)$/);
  if (singleMatch) {
    const id = decodeURIComponent(singleMatch[1] ?? "");
    if (!UUID_RE.test(id)) {
      return errorResponse(400, "VALIDATION_ERROR", "conversationId must be a UUID.");
    }
    if (method === "GET") return handleGet(id);
    if (method === "PATCH") return handlePatch(id, request);
    if (method === "DELETE") return handleDelete(id);
  }

  return errorResponse(404, "NOT_FOUND", `[fake-api] no handler for ${method} ${pathname}`);
}
