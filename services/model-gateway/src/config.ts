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
 */

export type NodeEnv = "development" | "test" | "production";
export type AsrProvider = "whisper-server" | "fake";

export interface ModelGatewayOptions {
  readonly nodeEnv: NodeEnv;
  readonly asrProvider: AsrProvider;
  readonly asrServerUrl: string;
}

export interface ModelGatewayConfig {
  readonly nodeEnv: NodeEnv;
  readonly asrProvider: AsrProvider;
  readonly asrServerUrl: string;
  readonly fakeText: string;
}

export class ModelGatewayConfigError extends Error {
  override readonly name = "ModelGatewayConfigError";
}

const DEFAULT_FAKE_TEXT = "（測試）這是語音辨識的假結果 fake result";

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

  let hostname: string;
  try {
    hostname = new URL(options.asrServerUrl).hostname;
  } catch {
    throw new ModelGatewayConfigError(
      `AI_KM_ASR_SERVER_URL 不是合法的 URL:"${options.asrServerUrl}"。`,
    );
  }
  if (!isLoopbackOrPrivateHost(hostname)) {
    throw new ModelGatewayConfigError(
      `AI_KM_ASR_SERVER_URL 主機 "${hostname}" 不是 loopback 或私網位址,已拒絕啟動以避免 SSRF 風險。`,
    );
  }

  const rawFakeText = env.AI_KM_ASR_FAKE_TEXT;
  const fakeText = rawFakeText && rawFakeText.trim() !== "" ? rawFakeText : DEFAULT_FAKE_TEXT;

  return Object.freeze({
    nodeEnv: options.nodeEnv,
    asrProvider: options.asrProvider,
    asrServerUrl: options.asrServerUrl,
    fakeText,
  });
}
