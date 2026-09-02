/**
 * A real (not mocked-fetch) HTTP fake of the embedding contract, for
 * exercising the client's actual POST + fetch machinery end to end.
 * NOT integration evidence for a real embedding model — see
 * `contracts/openapi/embedding.yaml` and
 * `services/retrieval/src/evidence-tier.ts`.
 *
 * Deliberately copied in shape from
 * `tools/asr-readiness/src/testing/fake-sidecar.ts`, which already got this
 * right: a real `node:http` server on an ephemeral port. Ephemeral matters —
 * this repo has documented port collisions on 3000/3001/4000 and a fake that
 * grabbed a fixed port would add a fourth.
 *
 * The vectors it returns come from the SAME deterministic provider used
 * in-process at PF1, so an PF2 test and an PF1 test of the same behaviour agree.
 * If they disagreed, one of them would be wrong and nobody would know which.
 */

import { createServer, type Server } from "node:http";
import { createDeterministicEmbeddingProvider } from "../src/embedding/model-gateway-deterministic.provider.js";
import type { components } from "../../../contracts/openapi/__checks__/generated/embedding.js";

/**
 * CONTRACT BINDING — the fake and the real provider answer to the same source.
 *
 * Every payload this server writes is typed against the SAME generated types
 * that `contracts/openapi/__checks__/embedding-compat.ts` checks the real
 * provider against. It is a type-only import, so nothing is emitted and
 * nothing is executed; what it buys is that the fake cannot drift away from
 * `contracts/openapi/embedding.yaml` silently. Without it, the fake and the
 * real implementation each stay internally consistent while diverging from one
 * another — "各自驗證正確、接縫沒被驗證", which is the failure mode this whole
 * exercise exists to close.
 */
type ContractRequest = components["schemas"]["EmbeddingRequest"];
type ContractResponse = components["schemas"]["EmbeddingResponse"];

/**
 * One body type per status, each with its own `code` enum — the contract no
 * longer has a single catch-all `Error`. That is the point: a caller branches
 * on `code`, so a fake that could emit any code for any status would let a
 * consumer be written against a code the real gateway never returns.
 */
type ValidationErrorBody = components["schemas"]["ValidationErrorBody"];
type PayloadTooLargeBody = components["schemas"]["PayloadTooLargeBody"];
type UnavailableBody = components["schemas"]["EmbeddingUnavailableBody"];
type ContractError = ValidationErrorBody | PayloadTooLargeBody | UnavailableBody;

/** Fails closed: a status the contract does not define cannot be forced. */
function errorBodyFor(status: number): ContractError {
  switch (status) {
    case 400:
      return { code: "VALIDATION_ERROR", message: "forced by test" };
    case 413:
      return { code: "PAYLOAD_TOO_LARGE", message: "forced by test" };
    case 503:
      return { code: "EMBEDDING_UNAVAILABLE", message: "forced by test" };
    default:
      throw new Error(
        `contracts/openapi/embedding.yaml 沒有定義 ${status} 回應,假 server 不得憑空產生一個。`,
      );
  }
}

export interface FakeEmbeddingServer {
  readonly url: string;
  readonly requestCount: () => number;
  close(): Promise<void>;
}

export interface FakeEmbeddingServerOptions {
  readonly dimensions?: number;
  /** Force a status code, to exercise the client's error mapping. */
  readonly forceStatus?: number;
  /** Delay each response, to exercise timeout handling. */
  readonly delayMs?: number;
}

export async function startFakeEmbeddingServer(
  options: FakeEmbeddingServerOptions = {},
): Promise<FakeEmbeddingServer> {
  const dimensions = options.dimensions ?? 256;
  const provider = createDeterministicEmbeddingProvider({ dimensions });
  let requests = 0;

  const server: Server = createServer((req, res) => {
    if (req.url !== "/v1/embeddings" || req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }
    requests += 1;

    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const respond = async (): Promise<void> => {
        if (options.forceStatus && options.forceStatus >= 400) {
          const forced: ContractError = errorBodyFor(options.forceStatus);
          res.writeHead(options.forceStatus, { "content-type": "application/json" });
          res.end(JSON.stringify(forced));
          return;
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Partial<
            Record<keyof ContractRequest, unknown>
          >;
          const input: ContractRequest["input"] = Array.isArray(body.input)
            ? (body.input as string[])
            : [];
          const vectors = await provider.embed(input);
          // `Array.from` is contractual, not cosmetic: `JSON.stringify` of a
          // Float32Array yields `{"0":…}`, an object, which deserialises to a
          // zero-length vector that scores 0 against everything and reads as
          // "no matching documents". `embedding-compat.ts` pins the same rule
          // on the contract side.
          const payload: ContractResponse = {
            model: "fake-deterministic",
            dimensions,
            data: vectors.map((v, index) => ({ index, embedding: Array.from(v) })),
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

      if (options.delayMs) setTimeout(() => void respond(), options.delayMs);
      else void respond();
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
