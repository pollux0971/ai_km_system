/**
 * `GenerationService` — context builder + generation orchestration, sitting in
 * front of the Model Gateway. **Scaffold only: the behaviour is not
 * implemented yet.** E04-S063 fills it in.
 *
 * The layering is the one `services/generation/README.md` already stated
 * before any of this existed:
 *
 *   services/retrieval → services/generation → model-gateway → provider
 *
 * This service does NOT call a model directly. Baseline §5 rule 28 requires
 * model calls to go through the Model Gateway, and ADR 0007 fixes the shape:
 * `app.modelGateway.generate()` in-process, not `POST /v1/generate` over a
 * loopback socket.
 *
 * It also does not re-filter by scope. Authorization is spent by the time
 * context reaches here (鐵律 #2); the gateway's contract has no `scopeKey` on
 * `ContextChunk` for exactly that reason, and re-filtering here would create a
 * second place where visibility is decided.
 */

export class GenerationNotImplementedError extends Error {
  override readonly name = "GenerationNotImplementedError";
}

export interface GenerationService {
  readonly componentId: string;
  /**
   * Throws until E04-S063 lands.
   *
   * Throwing rather than returning an empty answer: an uncited answer in a
   * knowledge-management product is indistinguishable from a hallucination to
   * the person reading it, so a scaffold must never produce one.
   */
  answer(): Promise<never>;
}

export function createGenerationScaffold(): GenerationService {
  return {
    componentId: "generation:scaffold",
    async answer(): Promise<never> {
      throw new GenerationNotImplementedError(
        "services/generation 尚未實作。這是 E04-S059 建立的空殼,實作由 E04-S063 補上" +
          "(組 context → 呼叫 app.modelGateway.generate() → 驗證引用)。" +
          "此處刻意拋錯而非回傳空答案——沒有引用的答案在知識管理產品裡," +
          "對閱讀的人來說與幻覺無法區分。",
      );
    },
  };
}
