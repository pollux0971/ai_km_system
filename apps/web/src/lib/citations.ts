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
 */
export interface CitationSource {
  id: string;
  file: string;
  page: number;
  snippet: string;
}

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
  const source = MOCK_CITATION_SOURCES[id];
  if (!source) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個引用來源。" } };
  }
  return { ok: true, value: source };
}
