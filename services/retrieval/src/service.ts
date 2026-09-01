/**
 * `RetrievalService` — the in-process seam `services/generation` and the BFF
 * will call. **Scaffold only: the behaviour is not implemented yet.**
 *
 * The interface exists ahead of the implementation on purpose. It is what
 * E04-S060 (authorization scope) and E04-S061 (vector store) get moved
 * underneath, and declaring it now means those two stories are relocations
 * into a named place rather than relocations plus a design decision.
 *
 * WHAT IS ALREADY DECIDED HERE, AND WHY
 *
 * `retrieve()` takes a `RetrievalScope` as an INPUT. It does not take a user
 * id, a session, or a principal, and it does not derive a scope internally —
 * user decision, 2026-09-02, recorded on E04-S062.
 *
 * That is not a style preference. Deriving the scope here would make this
 * service an authorization boundary, and then "which departments may this
 * person read" would have two answers: this one and E02's. `E04-S009` is the
 * story that owns the single answer, and it is `blocked-team-b` precisely
 * because E02 RBAC does not exist yet. A convenience mapping table here would
 * become the de-facto answer before the real one is written.
 *
 * The scope type itself is branded: only `toRetrievalScope()` can produce one,
 * so "I forgot to thread authorization through" is a compile error rather than
 * a runtime surprise. E04-S060 moves that constructor into this package.
 */

/**
 * Placeholder for the branded `RetrievalScope` that E04-S060 relocates from
 * `services/rag-skeleton/src/authorization/scope.ts`.
 *
 * Deliberately NOT re-declared with a structural shape here: a second
 * definition of the scope type is a second authorization model, and the two
 * would drift. Until E04-S060 lands, this alias makes the dependency visible
 * and unusable rather than convenient.
 */
export type RetrievalScopePlaceholder = never;

export class RetrievalNotImplementedError extends Error {
  override readonly name = "RetrievalNotImplementedError";
}

export interface RetrievalService {
  /** Stable identifier, matching the convention in evidence/telemetry output. */
  readonly componentId: string;
  /**
   * Authorised retrieval. Throws until E04-S060/S061/S062 land.
   *
   * Throwing — rather than returning `[]` — is the whole point of the
   * scaffold. An empty result is indistinguishable from "this user may read
   * nothing" and from "nothing matched", so a scaffold that returned one would
   * let a caller be written against a service that does not exist, and the
   * failure would surface as "no matching documents" in the product.
   */
  retrieve(): Promise<never>;
}

export function createRetrievalScaffold(): RetrievalService {
  return {
    componentId: "retrieval:scaffold",
    async retrieve(): Promise<never> {
      throw new RetrievalNotImplementedError(
        "services/retrieval 尚未實作。這是 E04-S058 建立的空殼," +
          "實作分別由 E04-S060(authorization scope)、E04-S061(vector store)、" +
          "E04-S062(retrieve API)補上。此處刻意拋錯而非回傳空陣列——" +
          "空陣列與「此使用者無任何權限」及「沒有相符文件」無法區分," +
          "會讓呼叫端對著一個不存在的服務寫程式,而故障會以「查無資料」的形式出現在產品裡。",
      );
    },
  };
}
