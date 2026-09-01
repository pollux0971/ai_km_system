/**
 * DeterministicEmbeddingProvider — ceiling PF1.
 *
 * Relocated here from `services/rag-skeleton/src/embedding/deterministic.
 * provider.ts` (E12-S032 — the move `./provider.ts`'s old `FakeEmbeddingProvider`
 * docstring said belonged to "a story of its own"). The hashing/normalisation
 * arithmetic below is UNCHANGED; only the outer shape changed, to return this
 * package's `EmbedResult` (`vectors: number[][]`) from `embed(input:
 * EmbedInput)` instead of the skeleton's `embed(texts): Promise<Float32Array[]>`.
 * `services/rag-skeleton` now imports the provider from here instead.
 *
 * WHAT IT IS: feature hashing (the "hashing trick"). Text is tokenised, each
 * token is hashed into a bucket, buckets are counted, the vector is
 * L2-normalised. This is a real, standard vectorisation technique — not a
 * random number generator wearing a costume — which is why retrieval ordering
 * built on it is meaningful enough to test against.
 *
 * WHAT IT PROVES: that the pipeline is wired correctly. Chunks reach the
 * store, the store ranks by similarity, the scope filter runs before results
 * are returned, citations carry the right offsets, the generation stage gets
 * the context it was given. All of that is plumbing, and plumbing is exactly
 * what broke in E04-S049…S053.
 *
 * WHAT IT DOES NOT PROVE, EVER: semantic recall. It captures LEXICAL overlap
 * only. "馬達過熱" and "motor overheating" share no tokens and will not
 * retrieve each other. Any AC about semantic search, synonym handling,
 * cross-lingual retrieval, answer quality or hallucination rate is PF3 and this
 * provider must not be used to claim it — `requireProviderFidelity` will stop you.
 *
 * TOKENISATION: whitespace-and-punctuation split for Latin script, character
 * bigrams for CJK. Bigrams are used because Chinese has no word delimiter and
 * a per-character index retrieves almost everything; bigrams are the standard
 * cheap approximation and are enough for the ordering assertions in the
 * skeleton test.
 */

import type { EmbedInput, EmbedResult, EmbeddingProvider } from "./provider.js";

const DEFAULT_DIMENSIONS = 256;

/** Matches a run of CJK ideographs, kana, or Hangul. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

const LATIN_TOKEN = /[a-z0-9]+/gi;

export function tokenise(text: string): readonly string[] {
  const tokens: string[] = [];

  for (const m of text.matchAll(LATIN_TOKEN)) {
    tokens.push(m[0].toLowerCase());
  }

  // CJK: collect maximal runs, then emit character bigrams (plus unigrams for
  // single-character runs so a lone 「泵」 is still indexable).
  let run = "";
  const flush = (): void => {
    if (run.length === 0) return;
    if (run.length === 1) {
      tokens.push(run);
    } else {
      for (let i = 0; i < run.length - 1; i += 1) tokens.push(run.slice(i, i + 2));
    }
    run = "";
  };
  for (const ch of text) {
    if (CJK.test(ch)) run += ch;
    else flush();
  }
  flush();

  return tokens;
}

/**
 * FNV-1a, 32-bit. Chosen for being short, dependency-free and stable across
 * Node versions — the vectors must be reproducible or stored embeddings and
 * freshly computed queries would silently disagree.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * L2-normalise. Copied unchanged from the skeleton's `embedding/provider.ts`
 * (this package does not depend on that one — see `../fidelity.ts`'s header
 * for why the dependency would point the wrong way — so the four lines of
 * arithmetic move with the provider that is the only thing that used them).
 */
function normalise(vector: Float32Array): Float32Array {
  let magnitude = 0;
  for (let i = 0; i < vector.length; i += 1) magnitude += vector[i]! * vector[i]!;
  magnitude = Math.sqrt(magnitude);
  if (magnitude === 0) return vector;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) out[i] = vector[i]! / magnitude;
  return out;
}

export interface DeterministicProviderOptions {
  readonly dimensions?: number;
}

export function createDeterministicEmbeddingProvider(
  options: DeterministicProviderOptions = {},
): EmbeddingProvider {
  const dimensions = options.dimensions ?? DEFAULT_DIMENSIONS;
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("dimensions 必須是正整數。");
  }

  const model = "embedding:deterministic";

  const provider: EmbeddingProvider = {
    name: "fake",
    model,
    fidelityCeiling: "PF1",
    dimensions,

    async embed(input: EmbedInput): Promise<EmbedResult> {
      const vectors = input.texts.map((text) => {
        const buckets = new Float32Array(dimensions);
        for (const token of tokenise(text ?? "")) {
          const h = fnv1a(token);
          const index = h % dimensions;
          // Signed hashing: a second bit decides the sign, which keeps
          // unrelated collisions from always reinforcing each other.
          const sign = (h >>> 31) & 1 ? -1 : 1;
          // `index` is `h % dimensions` with `h` a uint32 and `dimensions` a
          // positive integer, so it is always in `[0, buckets.length)`. The
          // `?? 0` satisfies `noUncheckedIndexedAccess` without changing
          // behaviour — it is unreachable at runtime.
          buckets[index] = (buckets[index] ?? 0) + sign;
        }
        return normalise(buckets);
      });
      // `Array.from` at this boundary is contractual, not cosmetic:
      // `JSON.stringify(new Float32Array(...))` serialises to `{"0":…}`, an
      // object, not an array, which deserialises to a zero-length vector that
      // scores 0 against everything and reads as "no matching documents" —
      // see `contracts/openapi/__checks__/embedding-compat.ts`.
      return { vectors: vectors.map((v) => Array.from(v)), model, dimensions };
    },
  };

  return provider;
}
