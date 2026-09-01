/**
 * A real (not mocked-fetch) HTTP fake of the generation contract.
 * NOT integration evidence for a real model — see `contracts/generation.yaml`.
 *
 * Same shape as `fake-embedding-server.ts` and, upstream of both,
 * `tools/asr-readiness/src/testing/fake-sidecar.ts`: real `node:http`,
 * ephemeral port, honest about its ceiling.
 *
 * `forceFabricatedCitation` exists so the client's grounding check can be
 * tested against a provider that actually misbehaves. A guard that has never
 * been shown to fire is not a guard.
 */

import { createServer, type Server } from "node:http";
import type { components } from "../../../contracts/openapi/__checks__/generated/generation.js";

/**
 * CONTRACT BINDING — see the identical note in `fake-embedding-server.ts`.
 * Type-only import of the SAME generated types that
 * `contracts/openapi/__checks__/generation-compat.ts` checks the real provider
 * against, so the fake cannot drift away from
 * `contracts/openapi/generation.yaml` on its own.
 */
type ContractRequest = components["schemas"]["GenerationRequest"];
type ContractResponse = components["schemas"]["GenerationResponse"];

/** See the identical note in `fake-embedding-server.ts`. */
type ValidationErrorBody = components["schemas"]["ValidationErrorBody"];
type NoContextBody = components["schemas"]["GenerationNoContextBody"];
type UnavailableBody = components["schemas"]["GenerationUnavailableBody"];
type ContractError = ValidationErrorBody | NoContextBody | UnavailableBody;

/** Fails closed: a status the contract does not define cannot be forced. */
function errorBodyFor(status: number): ContractError {
  switch (status) {
    case 400:
      return { code: "VALIDATION_ERROR", message: "forced by test" };
    case 422:
      return { code: "GENERATION_NO_CONTEXT", message: "forced by test" };
    case 503:
      return { code: "GENERATION_UNAVAILABLE", message: "forced by test" };
    default:
      throw new Error(
        `contracts/openapi/generation.yaml 沒有定義 ${status} 回應,假 server 不得憑空產生一個。`,
      );
  }
}

export interface FakeGenerationServer {
  readonly url: string;
  readonly requestCount: () => number;
  close(): Promise<void>;
}

export interface FakeGenerationServerOptions {
  readonly forceStatus?: number;
  readonly delayMs?: number;
  /** Emit a citation that was never supplied, to exercise the grounding check. */
  readonly forceFabricatedCitation?: boolean;
}

/**
 * Was a hand-copied mirror of the contract's ContextChunk. A hand-copied
 * mirror is precisely how a fake and its contract drift apart, so it now comes
 * from the generated types. Note what the contract does NOT have: `scopeKey`.
 * Scope is spent before context is assembled (鐵律 #2), and
 * `generation-compat.ts` pins that on the contract side.
 */
type ContextChunk = components["schemas"]["ContextChunk"];

export async function startFakeGenerationServer(
  options: FakeGenerationServerOptions = {},
): Promise<FakeGenerationServer> {
  let requests = 0;

  const server: Server = createServer((req, res) => {
    if (req.url !== "/v1/generate" || req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }
    requests += 1;

    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const respond = (): void => {
        if (options.forceStatus && options.forceStatus >= 400) {
          const forced: ContractError = errorBodyFor(options.forceStatus);
          res.writeHead(options.forceStatus, { "content-type": "application/json" });
          res.end(JSON.stringify(forced));
          return;
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Partial<
            Record<keyof ContractRequest, unknown>
          > & { question?: string; context?: ContextChunk[] };
          const context = Array.isArray(body.context) ? body.context : [];

          if (context.length === 0) {
            // Contract: never answer from parametric knowledge.
            const empty: NoContextBody = {
              code: "GENERATION_NO_CONTEXT",
              message: "no context supplied",
            };
            res.writeHead(422, { "content-type": "application/json" });
            res.end(JSON.stringify(empty));
            return;
          }

          const citations: ContractResponse["citations"] = context.map((c) => ({
            chunkId: c.chunkId,
            documentId: c.documentId,
            startOffset: c.startOffset,
            endOffset: c.endOffset,
          }));

          if (options.forceFabricatedCitation) {
            citations.push({
              chunkId: "fabricated#0",
              documentId: "fabricated",
              startOffset: 0,
              endOffset: 1,
            });
          }

          const payload: ContractResponse = {
            model: "fake-canned",
            answer: `[canned] 依據 ${context.length} 段來源回答:${body.question ?? ""}`,
            citations,
          };
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(payload));
        } catch {
          const bad: ValidationErrorBody = {
            code: "VALIDATION_ERROR",
            message: "invalid body",
          };
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify(bad));
        }
      };

      if (options.delayMs) setTimeout(respond, options.delayMs);
      else respond();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("no server address");

  return {
    url: `http://127.0.0.1:${address.port}`,
    requestCount: () => requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
