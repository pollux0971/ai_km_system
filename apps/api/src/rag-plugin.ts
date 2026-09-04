/**
 * The combined RAG seam (07-generation/phase-2, I2, ADR 0014).
 *
 * `06-retrieval/phase-2` put `app.retrieval` on the real server; `services/
 * generation`'s own plugin puts `app.generation` there too — but until now
 * nothing in `apps/api`'s composition root actually chained the two: a
 * signed-in person had no production call site that ran `retrieve()` and
 * handed its hits to `answer()`. This file is that call site.
 *
 * `app.rag.ask(question)` — the name and shape are `features/07-generation/
 * phase-2.feature`'s "design judgement A": a composed, in-process seam that
 * itself bakes in ADR 0014's fixed `dept:eng` scope, rather than accepting a
 * `scope` parameter from a caller that (today) does not exist —
 * `03-conversation/phase-2`, the one HTTP call site that could supply a real
 * signed-in person's scope, is still `todo` and gated on a contract decision
 * with no timeline. See that file's header for the full reasoning; this
 * plugin only implements the read-法-1 shape it settled on.
 *
 * ADR 0014, "這份 ADR 的一個空保證": the fixed `dept:eng` scope used to live
 * ONLY in `features/steps/retrieval.steps.ts`'s test code, bypassing every
 * production path — `retrieve()` is deterministic, so a scenario comparing
 * two people's outcomes could never go red no matter what production code
 * did. `answer()` — reached through THIS seam — is the first real
 * `retrieve()` call site, so this is where that fixed value has to actually
 * live for the ADR's "this scenario is the fixed value's removal condition"
 * claim to mean anything. The fixed value stays HERE, in `apps/api`'s
 * composition root — never inside `services/retrieval` or `services/
 * generation` (ADR 0014's Consequences table: "這份 ADR 不授權…把固定值寫進
 * `services/*`"), and `RetrievalService.retrieve()`'s signature is untouched;
 * this plugin merely supplies the `scope` argument every caller of that
 * signature already has to provide.
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

/** The in-process seam decorated onto the parent Fastify instance as `app.rag`. */
export interface RagSeam {
  /**
   * Runs the whole I2 RAG round-trip for one question: `app.retrieval
   * .retrieve()` under ADR 0014's fixed scope, then `app.generation
   * .answer()` over whatever hits come back. Does not accept a `scope`
   * argument — see this file's header, "design judgement A": there is no
   * production caller today that has a real per-person scope to supply, and
   * ADR 0014 hands every signed-in person the identical fixed scope anyway.
   */
  ask(question: string): Promise<GenerationAnswer>;
}

/**
 * ADR 0014's fixed scope, built ONCE at module load (it never varies — that
 * is the entire point of "fixed"). `principalId` is a constant label for
 * "whoever I2's composition root is answering for today", not a real
 * person's id: `ask(question)` takes no caller identity as input (design
 * judgement A again — nothing upstream has one to give it yet), so there is
 * deliberately nothing per-person to thread into it.
 */
const I2_FIXED_PRINCIPAL_ID = "i2-fixed-demo-scope";

function buildI2FixedScope(): RetrievalScope {
  return toRetrievalScope({
    principalId: I2_FIXED_PRINCIPAL_ID,
    allowedScopeKeys: ["dept:eng"],
    deniedScopeKeys: [],
  });
}

const ragPluginImpl: FastifyPluginAsync = async (app: FastifyInstance) => {
  const scope = buildI2FixedScope();

  const seam: RagSeam = {
    async ask(question) {
      // Authorization 先於 retrieval (鐵律 #2): retrieve() runs first, under
      // the fixed scope above, and its (already scope-filtered and
      // leak-asserted — see services/retrieval/src/authorization/scope.ts)
      // hits are the ONLY context answer() ever sees. Nothing here re-derives
      // or widens scope, and nothing here talks to the vector store directly.
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
