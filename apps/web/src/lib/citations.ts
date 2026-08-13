import type { ApiError, Result } from "@ai-km/types";

/**
 * E03-S014: citation preview drawer. SOURCE_BASELINE.md gives this
 * story a title plus a three-item bullet list (line 1168-1174):
 *
 *   E03-S14 Citation Preview
 *   顯示：
 *   - File
 *   - Page
 *   - Snippet
 *
 * — the fields to show, nothing about their data shape, how they're
 * fetched, or what happens on failure. Modeled as a by-id lookup
 * (`Result<CitationSource, ApiError>`) rather than embedding this data
 * inline on Message — a real implementation backed by E04 (RAG &
 * Conversation Intelligence, Team B, doesn't exist yet) would fetch
 * source detail per citation id, not carry it inline in every message.
 *
 * There's no real document store to look up File/Page/Snippet against,
 * so — same anti-invention discipline as message-content.tsx's `[N]`
 * marker parsing and E03-S005 never inventing a real model vendor
 * name — the mock entries below are explicitly labeled as placeholders
 * rather than dressed up as a specific real document, which could be
 * mistaken for genuine extracted content. Two entries ("1", "2") exist
 * so tests can prove distinct citation ids resolve to distinct content
 * (not just always the same static drawer); only "1" is currently
 * reachable through the live app, since lib/streaming.ts's MOCK_REPLY
 * only ever embeds a single `[1]` marker.
 *
 * An unknown id fails closed with `{ ok: false, error: { code:
 * "NOT_FOUND" } }` directly — matching sendMessage/
 * receiveAssistantReply's convention (a lookup this function's only
 * caller, citation-preview-drawer.tsx, needs a definite yes/no answer
 * from) rather than getConversation's `T | null` convention (meant for
 * a *higher-level* caller to translate into either a hard failure or a
 * legitimate empty state). There's no such higher-level caller here, so
 * returning the final outcome directly avoids an unused intermediate
 * distinction.
 *
 * E03-S016 ("Citation permission-error UX") adds `FORBIDDEN_CITATION_IDS`
 * — a citation id this mock treats as permission-denied. There is no
 * real E02 (Identity, RBAC & Authorization) contract or per-document
 * permission system to call; inventing one would violate this repo's
 * "don't invent contracts" rule. What's genuinely buildable without
 * that is the UX/presentation layer S016's own epic title names: given
 * SOME citation IS forbidden, render that state correctly (deny-wins —
 * no File/Page/Snippet ever leaks) rather than crashing, showing a
 * generic error, or silently rendering nothing. The forbidden check
 * runs BEFORE the found/not-found lookup below — a deliberate mirror
 * of the Security Acceptance's "Authorization 在資料取得...之前完成"
 * even at mock scale: permission is decided first, never as a
 * side-effect of failing to find content.
 *
 * `id: "3"` is reserved for this — like S014's `id: "2"`, it exists so
 * tests can exercise the behavior directly; it is not embedded in
 * lib/streaming.ts's MOCK_REPLY (unlike `"1"`). Adding a second live
 * marker there would make an ordinary demo reply permanently show one
 * citation that always denies access, and — concretely checked — would
 * break citation-badge.spec.ts's existing single-`getByRole("superscript")`
 * locator inside one list item (an unrelated regression risk for no
 * real gain, for a story whose own epic title scopes it to the error
 * PRESENTATION, not to how often a real system would hit it).
 *
 * `CITATION_ERROR_MESSAGES` centralizes the citation-specific override
 * text for NOT_FOUND/FORBIDDEN so citation-preview-drawer.tsx and
 * citation-source-view.tsx render identical wording from one place
 * instead of two copies drifting apart — same "context-specific
 * wording for the same code" pattern ErrorMessage's own doc comment
 * describes, just shared rather than duplicated now that a second
 * code needs it. Any code not in this map (e.g. a genuine future
 * SERVER_ERROR) still falls through to ErrorMessage's own generic
 * mapping — this file only owns wording for codes IT can actually
 * produce.
 *
 * getCitationSource below still writes its own `error.message` as a
 * literal rather than reading back from `CITATION_ERROR_MESSAGES` —
 * this repo's `noUncheckedIndexedAccess` types any access into a
 * `Record<string, string>` (even known-literal `.FORBIDDEN` property
 * access, since Record desugars to an index signature) as possibly
 * `undefined`, and `ApiError.message` requires a definite `string`.
 * The two literals below are intentionally the same text as the map
 * above, not independent copies that happen to match — a change to
 * one should update the other.
 */
export interface CitationSource {
  id: string;
  file: string;
  page: number;
  snippet: string;
}

export const CITATION_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "找不到這個引用來源。",
  FORBIDDEN: "您沒有權限檢視這個引用來源。",
};

const FORBIDDEN_CITATION_IDS = new Set(["3"]);

const MOCK_CITATION_SOURCES: Record<string, CitationSource> = {
  "1": {
    id: "1",
    file: "（模擬來源文件 1，尚未串接真正的知識庫）",
    page: 1,
    snippet: "（模擬片段）真正的原文片段依賴 RAG 平台（E04，Team B），目前都還不存在，這裡僅顯示預覽版面配置用的佔位文字。",
  },
  "2": {
    id: "2",
    file: "（模擬來源文件 2，尚未串接真正的知識庫）",
    page: 5,
    snippet: "（模擬片段）真正的原文片段依賴 RAG 平台（E04，Team B），目前都還不存在，這裡僅顯示預覽版面配置用的佔位文字。",
  },
};

export async function getCitationSource(id: string): Promise<Result<CitationSource, ApiError>> {
  if (FORBIDDEN_CITATION_IDS.has(id)) {
    return { ok: false, error: { code: "FORBIDDEN", message: "您沒有權限檢視這個引用來源。" } };
  }

  const source = MOCK_CITATION_SOURCES[id];
  if (!source) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個引用來源。" } };
  }
  return { ok: true, value: source };
}
