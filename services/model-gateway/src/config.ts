/**
 * Package-local config resolution (E12-S031).
 *
 * `apps/api/src/config.ts` already reads/validates `AI_KM_ASR_PROVIDER` and
 * `AI_KM_ASR_SERVER_URL` (scaffolded ahead of time by E04-S039) — this
 * story's allowed-modify list does NOT include `apps/api/src/config.ts`
 * (only `services/model-gateway/**`, `apps/api/src/server.ts`'s one
 * registration line, and `.env.example`), so those two values are passed
 * into `modelGatewayPlugin` as options from that one new registration line
 * rather than read here a second time. `AI_KM_ASR_FAKE_TEXT` is new to this
 * story and has no home in the frozen `ApiConfig` shape, so it is read
 * directly here instead.
 *
 * `AI_KM_EMBEDDING_PROVIDER` / `AI_KM_EMBEDDING_SERVER_URL` (E04-S088) follow
 * the SAME pattern as `AI_KM_ASR_FAKE_TEXT` above, for the SAME reason:
 * `apps/api/src/server.ts`'s `modelGatewayPlugin` registration call is
 * outside this story's allowed-modify list, so there is no existing call
 * site to thread an `apps/api`-read value through. Both are read directly
 * from `env` here, with `options.embeddingProvider` / `options.
 * embeddingServerUrl` (if a caller — e.g. a future story that DOES touch
 * `apps/api/src/server.ts` — supplies them explicitly) taking precedence.
 * Wiring `plugin.ts` to actually construct `HttpEmbeddingProvider` from this
 * resolved config is intentionally NOT part of this story (`plugin.ts` is
 * outside its allowed-modify list too) — see `docs/stories/PROGRESS.md`'s
 * E04-S088 row for that scope note.
 */

export type NodeEnv = "development" | "test" | "production";
export type AsrProvider = "whisper-server" | "fake";
/**
 * `"llama-server"` (E04-S088, ADR 0009 D2) added alongside the placeholder
 * `"fake"` — a real bge-m3 adapter talking to `llama-server`'s measured
 * `/v1/embeddings` endpoint (`models/embedding/README.md`'s "E04-S087"
 * section). See `embedding/http.provider.ts`.
 */
export type EmbeddingProviderChoice = "fake" | "llama-server";
export type GenerationProviderChoice = "fake";

export interface ModelGatewayOptions {
  readonly nodeEnv: NodeEnv;
  readonly asrProvider: AsrProvider;
  readonly asrServerUrl: string;
  /** Defaults to `fake`; refused in production by `assertProviderUsable`. */
  readonly embeddingProvider?: EmbeddingProviderChoice;
  readonly generationProvider?: GenerationProviderChoice;
  /**
   * Only meaningful when `embeddingProvider` resolves to `"fake"` — sizes
   * `DeterministicEmbeddingProvider`'s output. Deliberately UNRELATED to
   * `HttpEmbeddingProvider`'s dimensions: that provider's 1024 comes from
   * the real bge-m3 model (`BGE_M3_DIMENSIONS`) and is not configurable
   * here, so changing this default must never change what the real
   * provider reports.
   */
  readonly embeddingDimensions?: number;
  /** Required when `embeddingProvider` resolves to `"llama-server"`. Subject to the same loopback/private-host SSRF guard as `asrServerUrl`. */
  readonly embeddingServerUrl?: string;
}

export interface ModelGatewayConfig {
  readonly nodeEnv: NodeEnv;
  readonly asrProvider: AsrProvider;
  readonly asrServerUrl: string;
  readonly fakeText: string;
  readonly embeddingProvider: EmbeddingProviderChoice;
  readonly generationProvider: GenerationProviderChoice;
  readonly embeddingDimensions: number;
  /** `undefined` when `embeddingProvider` is `"fake"` (not needed); always a validated loopback/private URL when `embeddingProvider` is `"llama-server"`. */
  readonly embeddingServerUrl: string | undefined;
}

export class ModelGatewayConfigError extends Error {
  override readonly name = "ModelGatewayConfigError";
}

const DEFAULT_FAKE_TEXT = "（測試）這是語音辨識的假結果 fake result";
/**
 * `DeterministicEmbeddingProvider`'s own default — see that class's
 * `DEFAULT_DIMENSIONS`. Kept at 256 deliberately: this is the placeholder's
 * dimension count, not the real model's. `HttpEmbeddingProvider` reports
 * `BGE_M3_DIMENSIONS` (1024) on its own and never reads this constant.
 */
const DEFAULT_EMBEDDING_DIMENSIONS = 256;
const EMBEDDING_PROVIDER_CHOICES: readonly EmbeddingProviderChoice[] = ["fake", "llama-server"];

/**
 * `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, and
 * `localhost`/`::1`. Anything else is refused — the sidecar URL is
 * operator-configured, and a public/attacker-influenced host here would
 * turn this endpoint into an SSRF primitive (spec Security Acceptance).
 */
function isLoopbackOrPrivateHost(rawHostname: string): boolean {
  const hostname = rawHostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname === "::1") return true;

  const octets = hostname.split(".");
  if (octets.length !== 4 || !octets.every((part) => /^\d{1,3}$/.test(part))) return false;
  const [a, b] = octets.map(Number) as [number, number, number, number];
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Shared by the ASR guard and the embedding-server guard below (E04-S088) so
 * the SSRF refusal condition and message shape cannot drift between the two
 * sidecar URLs this plugin dials out to.
 */
function assertLoopbackOrPrivateUrl(envVarName: string, rawUrl: string): string {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    throw new ModelGatewayConfigError(`${envVarName} 不是合法的 URL:"${rawUrl}"。`);
  }
  if (!isLoopbackOrPrivateHost(hostname)) {
    throw new ModelGatewayConfigError(
      `${envVarName} 主機 "${hostname}" 不是 loopback 或私網位址,已拒絕啟動以避免 SSRF 風險。`,
    );
  }
  return rawUrl;
}

export function resolveModelGatewayConfig(
  options: ModelGatewayOptions,
  env: NodeJS.ProcessEnv = process.env,
): ModelGatewayConfig {
  // Fail closed (ADR 0004 §2 / STORY_WORKFLOW rule "不造假綠燈"): a fake
  // provider must never be reachable in a real deployment, mirroring
  // apps/api/src/config.ts's testSandbox/devTriggers guards exactly — this
  // is that same guard, just implemented at this plugin's boundary since
  // config.ts itself is outside this story's allowed-modify list.
  if (options.nodeEnv === "production" && options.asrProvider === "fake") {
    throw new ModelGatewayConfigError(
      "AI_KM_ASR_PROVIDER=fake 不得在 NODE_ENV=production 下啟用(fake provider 只能用於 unit/E2E)。已拒絕啟動。",
    );
  }

  assertLoopbackOrPrivateUrl("AI_KM_ASR_SERVER_URL", options.asrServerUrl);

  const rawFakeText = env.AI_KM_ASR_FAKE_TEXT;
  const fakeText = rawFakeText && rawFakeText.trim() !== "" ? rawFakeText : DEFAULT_FAKE_TEXT;

  // See this file's header for why these two are read from `env` directly
  // rather than threaded through `options` the way the ASR fields are.
  const rawEmbeddingProvider = options.embeddingProvider ?? env.AI_KM_EMBEDDING_PROVIDER;
  const embeddingProvider: EmbeddingProviderChoice =
    rawEmbeddingProvider && rawEmbeddingProvider.trim() !== ""
      ? (rawEmbeddingProvider as EmbeddingProviderChoice)
      : "fake";
  if (!EMBEDDING_PROVIDER_CHOICES.includes(embeddingProvider)) {
    throw new ModelGatewayConfigError(
      `AI_KM_EMBEDDING_PROVIDER 的值 "${String(rawEmbeddingProvider)}" 不是已知的 embedding provider` +
        `(必須是 ${EMBEDDING_PROVIDER_CHOICES.map((c) => `"${c}"`).join(" 或 ")})。已拒絕啟動——` +
        `不得靜默當成 "fake" 處理,那會讓打字錯誤悄悄退回 placeholder。`,
    );
  }

  let embeddingServerUrl: string | undefined;
  if (embeddingProvider === "llama-server") {
    const rawEmbeddingServerUrl = options.embeddingServerUrl ?? env.AI_KM_EMBEDDING_SERVER_URL;
    if (!rawEmbeddingServerUrl || rawEmbeddingServerUrl.trim() === "") {
      throw new ModelGatewayConfigError(
        'AI_KM_EMBEDDING_PROVIDER="llama-server" 但缺少 AI_KM_EMBEDDING_SERVER_URL(或 embeddingServerUrl 選項)。已拒絕啟動。',
      );
    }
    embeddingServerUrl = assertLoopbackOrPrivateUrl("AI_KM_EMBEDDING_SERVER_URL", rawEmbeddingServerUrl);
  }

  return Object.freeze({
    nodeEnv: options.nodeEnv,
    asrProvider: options.asrProvider,
    asrServerUrl: options.asrServerUrl,
    fakeText,
    embeddingProvider,
    generationProvider: options.generationProvider ?? "fake",
    embeddingDimensions: options.embeddingDimensions ?? DEFAULT_EMBEDDING_DIMENSIONS,
    embeddingServerUrl,
  });
}

/**
 * Same fail-closed rule as the ASR guard above, but applied WHEN THE FEATURE IS
 * REGISTERED rather than at config resolution.
 *
 * The ASR guard can refuse at boot because ASR is always registered. These two
 * are registered only when their contract is loaded, and refusing to boot the
 * whole API because an unrelated, unloaded feature has no real provider would
 * be a worse failure than the one it prevents. So the check runs at the point
 * of registration: if the embedding routes are being mounted in production and
 * the only available provider is the placeholder fake, startup stops there.
 *
 * ── E04-S088 FOLLOW-UP (coordinator review) ─────────────────────────────
 *
 * This function used to take only `provider: string` — the DECLARED choice
 * read out of config/env. That was a guard pointed at something that cannot
 * disagree with itself: once `EmbeddingProviderChoice` grew a second legal
 * value (`"llama-server"`), it became possible for `plugin.ts` to declare
 * `embeddingProvider: "llama-server"` while its provider-construction code
 * still always built `DeterministicEmbeddingProvider` — a real production
 * bug that existed in this codebase for one review cycle. The guard, only
 * ever looking at the string, said OK. Exactly the failure shape this repo
 * keeps bleeding from: a gate checked against something that cannot refute
 * it.
 *
 * So this now takes the ACTUAL constructed provider instance (or anything
 * with a `.name`) and checks it against the declared string ITSELF, before
 * ever asking whether that name is "fake". A caller that constructs a
 * provider whose `.name` does not match what it declared to this function
 * is refused unconditionally (not just in production) — that mismatch is a
 * wiring defect, not an environment/config choice, and cannot be blamed on
 * "which environment we're in" the way the fake-in-production rule can.
 */
export interface ProviderIdentity {
  readonly name: string;
}

export function assertProviderUsable(
  nodeEnv: NodeEnv,
  feature: "embedding" | "generation",
  declaredProvider: string,
  actualProvider: ProviderIdentity,
): void {
  if (declaredProvider !== actualProvider.name) {
    throw new ModelGatewayConfigError(
      `${feature} provider 宣告為 "${declaredProvider}",但實際建構出來的 provider 回報的 name 是 ` +
        `"${actualProvider.name}"——宣告與實際不符,拒絕啟動。這道守門檢查的是實際建構的 provider ` +
        `實例,不是設定字串;字串相符不代表接線正確,字串不符則一定是接線的 bug,與 NODE_ENV 無關。`,
    );
  }
  if (nodeEnv === "production" && actualProvider.name === "fake") {
    throw new ModelGatewayConfigError(
      `${feature} provider = "fake" 不得在 NODE_ENV=production 下啟用` +
        `(placeholder fake 只能用於 unit/E2E)。已拒絕啟動。` +
        `真實 provider 需要一個已測試、非 placeholder 的實作。`,
    );
  }
}
