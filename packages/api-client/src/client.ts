import createFetchClient from "openapi-fetch";
import type { Client } from "openapi-fetch";
import type { paths as CorePaths } from "./generated/core.js";
import type { paths as AuthPaths } from "./generated/auth.js";
import type { paths as ConversationsPaths } from "./generated/conversations.js";
import type { paths as TranscriptionsPaths } from "./generated/transcriptions.js";
import type { paths as AnalyticsPaths } from "./generated/analytics.js";

const CLIENT_ID_STORAGE_KEY = "ai-km:client-id";
const CORRELATION_ID_HEADER = "x-correlation-id";
const CLIENT_ID_HEADER = "x-client-id";
/**
 * CSRF defence (E04-S048, ADR 0005 addendum). A plain cross-site `<form>`
 * submission cannot set a custom header at all (setting one from `fetch`/XHR
 * triggers a CORS preflight, and CORS stays off by default — ADR 0003 §6),
 * so requiring this on every request is what makes `apps/api`'s
 * `x-requested-with` check work: a real browser session-cookie ride-along
 * from a malicious site can never carry it. The exact value does not matter
 * server-side (`services/identity`'s `checkCsrf` only checks presence); this
 * is the conventional string other frameworks use for the same purpose.
 */
const CSRF_HEADER = "x-requested-with";
const CSRF_HEADER_VALUE = "XMLHttpRequest";

export interface ApiClientOptions {
  /** Root URL every request is resolved against. The caller decides this — this package never reads env. */
  baseUrl: string;
  /** Override fetch, e.g. a fake in tests. Defaults to globalThis.fetch. */
  fetch?: (input: Request) => Promise<Response>;
  /**
   * Fixed client id to send as `x-client-id` instead of the sessionStorage-persisted one.
   * Required in contexts without `sessionStorage` (e.g. a BFF route handler).
   */
  clientId?: string;
}

export interface ApiClient {
  core: Client<CorePaths>;
  auth: Client<AuthPaths>;
  conversations: Client<ConversationsPaths>;
  transcriptions: Client<TranscriptionsPaths>;
  analytics: Client<AnalyticsPaths>;
  /**
   * E03-S039: the same id every request above sends as `x-client-id` (either
   * the resolved sessionStorage-backed tab id, or the caller's explicit
   * `clientId` option). Exposed so a consumer comparing a ChangeEvent's
   * `originClientId` (E04-S038's SSE contract) against "was this my own
   * tab's mutation" doesn't need to re-derive the id via a second,
   * independent sessionStorage read.
   */
  clientId: string;
}

function hasSessionStorage(): boolean {
  try {
    return typeof globalThis.sessionStorage !== "undefined";
  } catch {
    return false;
  }
}

/** One uuid per browser tab, persisted in sessionStorage so it survives re-renders/reloads within the tab. */
function getOrCreateSessionClientId(): string {
  if (!hasSessionStorage()) {
    return crypto.randomUUID();
  }
  const existing = globalThis.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  globalThis.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
  return created;
}

function attachHeaderMiddleware(client: Client<Record<string, never>>, clientId: string): void {
  client.use({
    onRequest({ request }) {
      if (!request.headers.has(CORRELATION_ID_HEADER)) {
        request.headers.set(CORRELATION_ID_HEADER, crypto.randomUUID());
      }
      if (!request.headers.has(CLIENT_ID_HEADER)) {
        request.headers.set(CLIENT_ID_HEADER, clientId);
      }
      if (!request.headers.has(CSRF_HEADER)) {
        request.headers.set(CSRF_HEADER, CSRF_HEADER_VALUE);
      }
      return request;
    },
  });
}

/**
 * Builds the typed API client for every spec under contracts/openapi, grouped by spec
 * name. Every request gets `credentials: "include"`, an auto-generated (overridable)
 * `x-correlation-id`, a per-tab `x-client-id`, and `x-requested-with` (E04-S048's
 * CSRF defence — see the constant above).
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, fetch, clientId } = options;
  const resolvedClientId = clientId ?? getOrCreateSessionClientId();

  const shared = { baseUrl, fetch, credentials: "include" as const };
  const core = createFetchClient<CorePaths>(shared);
  const auth = createFetchClient<AuthPaths>(shared);
  const conversations = createFetchClient<ConversationsPaths>(shared);
  const transcriptions = createFetchClient<TranscriptionsPaths>(shared);
  const analytics = createFetchClient<AnalyticsPaths>(shared);

  for (const client of [core, auth, conversations, transcriptions, analytics]) {
    attachHeaderMiddleware(client as unknown as Client<Record<string, never>>, resolvedClientId);
  }

  return { core, auth, conversations, transcriptions, analytics, clientId: resolvedClientId };
}
