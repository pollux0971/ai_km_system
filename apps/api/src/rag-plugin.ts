/**
 * The combined RAG seam (07-generation/phase-2, I2, ADR 0014).
 *
 * `06-retrieval/phase-2` put `app.retrieval` on the real server; `services/
 * generation`'s own plugin puts `app.generation` there too — but until now
 * nothing in `apps/api`'s composition root actually chained the two: a
 * signed-in person had no production call site that ran `retrieve()` and
 * handed its hits to `answer()`. This file is that call site.
 *
 * `app.rag.ask(question, caller?)` — the name and shape are `features/07-
 * generation/phase-2.feature`'s "design judgement A": a composed, in-process
 * seam that itself bakes in ADR 0014's fixed `dept:eng` scope, rather than
 * accepting a `scope` parameter directly.
 *
 * ADR 0014, "這份 ADR 的一個空保證" (2026-09-05 更新): `ask()` used to take no
 * caller identity at all, so even after this seam became a real production
 * call site, no caller had "who is asking" to hand it — `03-conversation/
 * phase-2` is the first HTTP call site that actually has a signed-in person,
 * so THIS is where `caller` gets threaded through. `caller` is OPTIONAL and
 * defaults to the same fixed placeholder principal every caller got before
 * this change (`I2_FIXED_PRINCIPAL_ID`) — `07-generation/phase-2`'s own
 * `askThroughCombinedSeam()` step helper still calls `ask(question)` with
 * one argument (features/steps/generation.steps.ts, not this phase's to
 * modify), and its scenarios assert two different people get the EXACT SAME
 * outcome through that one-argument call. Making `caller` required, or
 * changing what a missing `caller` defaults to, would silently change that
 * seam's already-green behaviour — see NEXT.md's "完成的定義" item 3 (07/06's
 * 12 phase-2 scenarios must not regress).
 *
 * What DOES change: the fixed value itself. ADR 0014 still says allowed/
 * denied scope keys stay `["dept:eng"]`/`[]` for everyone in I2 — that has
 * NOT changed. What changes is `principalId`: when a caller supplies its own
 * identity, THAT identity — not the constant placeholder — is what reaches
 * `RetrievalScope.principalId`. This is the "移除條件" ADR 0014 asks for:
 * `03-conversation/phase-2.feature`'s scenario 4 records two different
 * askers' scopes and asserts their `principalId`s differ while
 * `allowedScopeKeys`/`deniedScopeKeys` stay identical — a signature that
 * ignored `caller` (or a mutation that hardcodes the fixed principal
 * regardless of `caller`) makes that scenario go red. See this phase's own
 * reverse-verification for the actual experiment.
 *
 * Wrapped in `fp()` — ADR 0007 §4/§5 — so `app.rag` is visible to SIBLING
 * plugins and routes, not just to children registered inside this plugin's
 * own scope. Registered in `server.ts` after both `retrievalPlugin` and
 * `generationPlugin` so `app.retrieval` / `app.generation` are already
 * decorated by the time this plugin's own body runs (E04-S049's ordering
 * rule) — though `ask()` itself only reads them lazily, at CALL time, not at
 * registration time, so the ordering is belt-and-braces here rather than
 * load-bearing.
 */
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { toRetrievalScope, type RetrievalScope } from "@ai-km/service-retrieval";
import type { GenerationAnswer } from "@ai-km/service-generation";

/**
 * Who is asking. `principalId` is the only field ADR 0014's fixed scope
 * cares about today — `allowedScopeKeys`/`deniedScopeKeys` stay the fixed
 * `["dept:eng"]`/`[]` for every caller regardless of identity, by design
 * (ADR 0014 has not been superseded; only the removal-condition machinery
 * around `principalId` has).
 */
export interface RagCaller {
  readonly principalId: string;
}

/** The in-process seam decorated onto the parent Fastify instance as `app.rag`. */
export interface RagSeam {
  /**
   * Runs the whole I2 RAG round-trip for one question: `app.retrieval
   * .retrieve()` under ADR 0014's fixed scope, then `app.generation
   * .answer()` over whatever hits come back.
   *
   * `caller` is OPTIONAL — see this file's header. Omitting it reproduces
   * today's pre-existing behaviour byte for byte (the fixed placeholder
   * principal, same as before this parameter existed); supplying it makes
   * `RetrievalScope.principalId` carry THAT caller's own identity instead.
   */
  ask(question: string, caller?: RagCaller): Promise<GenerationAnswer>;
}

/**
 * ADR 0014's fixed scope's fallback principal — used only when a caller
 * does not supply its own identity (today: `07-generation/phase-2`'s
 * `askThroughCombinedSeam()` step helper, which calls `ask(question)` with
 * one argument and asserts every signed-in person gets the identical
 * outcome through it). Not a real person's id.
 */
const I2_FIXED_PRINCIPAL_ID = "i2-fixed-demo-scope";

function buildI2FixedScope(caller?: RagCaller): RetrievalScope {
  return toRetrievalScope({
    principalId: caller?.principalId ?? I2_FIXED_PRINCIPAL_ID,
    allowedScopeKeys: ["dept:eng"],
    deniedScopeKeys: [],
  });
}

const ragPluginImpl: FastifyPluginAsync = async (app: FastifyInstance) => {
  const seam: RagSeam = {
    async ask(question, caller) {
      // Authorization 先於 retrieval (鐵律 #2): retrieve() runs first, under
      // the scope built above (fixed allowed/denied keys, per-caller
      // principalId when supplied), and its (already scope-filtered and
      // leak-asserted — see services/retrieval/src/authorization/scope.ts)
      // hits are the ONLY context answer() ever sees. Nothing here re-derives
      // or widens scope, and nothing here talks to the vector store directly.
      const scope = buildI2FixedScope(caller);
      const hits = await app.retrieval.retrieve(question, scope);
      return app.generation.answer(question, hits);
    },
  };

  app.decorate("rag", seam);
};

/** See ADR 0007 §4/§5 — without `fp()` the decoration is invisible to siblings. */
export const ragPlugin = fp(ragPluginImpl, { name: "ai-km-rag-seam" });

declare module "fastify" {
  interface FastifyInstance {
    /** The combined RAG seam — see this file's header. */
    rag: RagSeam;
  }
}
