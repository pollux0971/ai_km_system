import createFetchClient from "openapi-fetch";
import type { Client } from "openapi-fetch";
import type { paths as CorePaths } from "./generated/core";
import type { paths as AuthPaths } from "./generated/auth";
import type { paths as ConversationsPaths } from "./generated/conversations";
import type { paths as TranscriptionsPaths } from "./generated/transcriptions";

const CLIENT_ID_STORAGE_KEY = "ai-km:client-id";
const CORRELATION_ID_HEADER = "x-correlation-id";
const CLIENT_ID_HEADER = "x-client-id";

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
      return request;
    },
  });
}

/**
 * Builds the typed API client for every spec under contracts/openapi, grouped by spec
 * name. Every request gets `credentials: "include"`, an auto-generated (overridable)
 * `x-correlation-id`, and a per-tab `x-client-id`.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, fetch, clientId } = options;
  const resolvedClientId = clientId ?? getOrCreateSessionClientId();

  const shared = { baseUrl, fetch, credentials: "include" as const };
  const core = createFetchClient<CorePaths>(shared);
  const auth = createFetchClient<AuthPaths>(shared);
  const conversations = createFetchClient<ConversationsPaths>(shared);
  const transcriptions = createFetchClient<TranscriptionsPaths>(shared);

  for (const client of [core, auth, conversations, transcriptions]) {
    attachHeaderMiddleware(client as unknown as Client<Record<string, never>>, resolvedClientId);
  }

  return { core, auth, conversations, transcriptions };
}
