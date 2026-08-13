/**
 * E03-S010: SSE/WebSocket streaming renderer. SOURCE_BASELINE.md and
 * the epic file give this story only its title — zero technical
 * content anywhere (no SSE-vs-WebSocket choice, no chunk/frame format,
 * no reconnection semantics; that last one is explicitly a separate,
 * still-unbuilt story, E03-S031 "stream disconnect/reconnect UX").
 * There is no real Model Gateway, no LLM integration, and no SSE/
 * WebSocket endpoint contract anywhere — `contracts/openapi/core.yaml`
 * is an empty scaffold, and its own comment states real endpoints must
 * be negotiated with Team B before being added. E04 (RAG & Conversation
 * Intelligence, which this epic depends on per SOURCE_BASELINE's
 * dependency map) and E12 (Model & Prompt Platform) are both Team B and
 * don't exist yet.
 *
 * So what's buildable and honestly testable right now is the RENDERER:
 * given any async source of incremental text, display it progressively,
 * handle completion and failure. This function is that mock source —
 * deliberately NOT using the real `EventSource`/`WebSocket` browser
 * APIs, since there's nothing real on the other end to connect to.
 * message-thread.tsx (the consumer) only depends on this generator's
 * shape (`AsyncGenerator<string>`), not on how the chunks arrive — so
 * swapping this file for a real SSE/WebSocket client once E04/E12's
 * contracts exist is the only change a real implementation would need.
 *
 * The reply text itself is a fixed, explicitly-labeled placeholder —
 * not a fabricated "helpful AI answer" that could be mistaken for a
 * real generated response. Same honesty bar as E03-S005's "雲端模型
 * （尚未啟用)" labeling: visibly present, clearly marked as not real.
 *
 * The trailing `[1]` is E03-S013's citation marker — see
 * message-content.tsx for why this stays a plain substring rather than
 * structured data. It's appended here (not fabricated inline as if some
 * specific claim were sourced) so the badge is genuinely visible/
 * demonstrable end-to-end without implying any particular sentence
 * above was verified against a real document.
 */
const MOCK_REPLY =
  "（模擬回覆）這是前端展示用的固定文字，尚未串接真正的 AI 生成服務。" +
  "真正的回答生成依賴 Model Gateway 與 RAG 平台（E04、E12，Team B），目前都還不存在。[1]";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Yields MOCK_REPLY one character at a time with a short delay,
 * simulating progressive arrival. Splitting by character rather than
 * by word (`.split(" ")`) is deliberate — Chinese text has no spaces
 * between words, so a word-split would yield the entire reply as one
 * giant chunk, defeating the point of demonstrating progressive
 * rendering. `Array.from` (not a plain index loop) iterates by Unicode
 * code point, so this stays correct if MOCK_REPLY ever contains a
 * character outside the Basic Multilingual Plane.
 *
 * `delayMs` defaults to 20 (real, humanly-perceptible pacing — a
 * "streaming" effect that resolves instantly wouldn't visibly
 * demonstrate anything); unit tests pass 0 so the whole reply resolves
 * in one microtask flush instead of ~1.5s of real wall-clock time per
 * consumption, without reaching for fake-timer plumbing around an
 * async generator.
 */
export async function* streamAssistantReply(delayMs = 20): AsyncGenerator<string> {
  for (const character of Array.from(MOCK_REPLY)) {
    if (delayMs > 0) await delay(delayMs);
    yield character;
  }
}
