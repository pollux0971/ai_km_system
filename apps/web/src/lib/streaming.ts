/**
 * E03-S010: SSE/WebSocket streaming renderer. SOURCE_BASELINE.md and
 * the epic file give this story only its title — zero technical
 * content anywhere (no SSE-vs-WebSocket choice, no chunk/frame format,
 * no reconnection semantics — that last one was explicitly flagged
 * back then as a separate, still-unbuilt story, E03-S031 "stream
 * disconnect/reconnect UX"; S031 has since been implemented, see
 * `shouldSimulateStreamDisconnect`/`MOCK_STREAM_DISCONNECT_TRIGGER`
 * and `streamAssistantReply`'s own updated doc comment below).
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
 * E03-S031 "stream disconnect/reconnect UX". No real transport exists
 * to genuinely disconnect (see this file's own top doc comment), so —
 * same as E03-S021's `MOCK_ANSWER_STATE_TRIGGERS` and E03-S029's
 * `MOCK_FILE_PROCESSING_FAILURE_TRIGGER` — a deterministic, honestly-
 * labeled mock trigger is the only way to make the disconnect path
 * genuinely reachable through the UI rather than permanently
 * unreachable dead code. Same "[模擬:X]" bracketed-marker convention as
 * those two.
 */
export const MOCK_STREAM_DISCONNECT_TRIGGER = "[模擬:STREAM_DISCONNECT]";

export function shouldSimulateStreamDisconnect(userQuestion: string): boolean {
  return userQuestion.includes(MOCK_STREAM_DISCONNECT_TRIGGER);
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
 *
 * `simulateDisconnect` (E03-S031, default false — every pre-S031 call
 * site keeps its exact prior behavior unchanged) throws partway
 * through — roughly halfway, so the consumer genuinely has SOME
 * partial content to preserve, matching how a real mid-stream network
 * drop would leave a partial answer sitting in the UI rather than
 * nothing at all. Deliberately a plain `throw`, not a distinguished
 * error type or `AsyncGenerator.return()`/`.throw()` protocol dance —
 * this generator is the ONLY thing that can throw inside the consumer's
 * `for await` loop (message-thread.tsx's runStream), so any caught
 * error there is unambiguously "the stream disconnected," with no
 * other failure mode to disambiguate from.
 */
export async function* streamAssistantReply(delayMs = 20, simulateDisconnect = false): AsyncGenerator<string> {
  const characters = Array.from(MOCK_REPLY);
  const disconnectAtIndex = Math.floor(characters.length / 2);
  let index = 0;
  for (const character of characters) {
    if (simulateDisconnect && index === disconnectAtIndex) {
      throw new Error("模擬串流中斷");
    }
    if (delayMs > 0) await delay(delayMs);
    yield character;
    index++;
  }
}
