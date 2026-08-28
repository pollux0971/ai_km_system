export type FeatureFlagName = "sso" | "voice_input" | "mock_triggers";

interface FeatureFlagConfig {
  defaultEnabled: boolean;
}

/**
 * E01-S015: minimal feature-flag visibility guard. No backend flag
 * service exists yet (no Team B epic owns one) — flags are local static
 * config, override-able per flag via a NEXT_PUBLIC_FEATURE_<NAME> env
 * var for deployment-time control without a code change. Flag names are
 * a TypeScript union (FeatureFlagName), so there's no "unknown flag at
 * runtime" case to guard against — the compiler rejects it.
 *
 * Registering "sso" here does NOT change its current default (still
 * visible) — E01-S002 already established the login page's SSO button
 * must stay present even though real SSO (E02) doesn't exist yet
 * ("MVP 可以簡化視覺或演算法，但此能力本身不可缺席"). This makes that
 * visibility configurable (e.g. an on-prem deployment with no SSO
 * provider at all could turn it off entirely) rather than hardcoded.
 */
const FLAGS: Record<FeatureFlagName, FeatureFlagConfig> = {
  sso: { defaultEnabled: true },
  // E03-S041: push-to-talk voice input in the message composer.
  // Defaults ON per spec's 技術決策; NEXT_PUBLIC_FEATURE_VOICE_INPUT=false
  // turns it off for a deployment without a working ASR sidecar.
  voice_input: { defaultEnabled: true },
  // E03-S045: gates every "[模擬:X]" demo/test hook (answer-state.ts,
  // streaming.ts, file-processing.ts, knowledge-documents.ts — see
  // docs/runbooks/mock-triggers.md for the full list). Defaults OFF,
  // unlike sso/voice_input above — those two are real product features
  // being toggled; this one is exclusively a demo/test hook that lets
  // any production user fake a PERMISSION_DENIED/SOURCE_UNAVAILABLE/etc.
  // answer just by typing a bracketed string, which is a real trust
  // problem (see this story's Security Acceptance). E2E turns it back on
  // via NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS=true (tests/e2e/playwright.config.ts),
  // same as the unit-test environment (apps/web/vitest.setup.ts) — the
  // triggers themselves are unchanged, only reachability is gated.
  mock_triggers: { defaultEnabled: false },
};

/**
 * E03-S045 fix: Next.js only inlines `NEXT_PUBLIC_*` vars into the client
 * bundle for STATIC `process.env.NEXT_PUBLIC_X` member expressions —
 * `process.env[someComputedKey]` can't be statically analyzed by
 * webpack's DefinePlugin, so it silently evaluates to `undefined` in the
 * browser regardless of what's actually set when the server was started.
 * This function used to build the key dynamically
 * (`` `NEXT_PUBLIC_FEATURE_${flag.toUpperCase()}` ``), which worked in
 * vitest (a real Node.js process.env, no bundling involved) but silently
 * never worked in an actual browser — every env override for every flag
 * was always ignored client-side, always falling back to FLAGS[flag]'s
 * default. Went undiscovered until now because both pre-existing flags
 * (sso, voice_input) default to enabled and no E2E spec exercised
 * disabling them via env in a real browser; mock_triggers defaults to
 * disabled and this story's own E2E specs need the override to actually
 * reach the browser, which is what surfaced this.
 */
function readEnvOverride(flag: FeatureFlagName): string | undefined {
  switch (flag) {
    case "sso":
      return process.env.NEXT_PUBLIC_FEATURE_SSO;
    case "voice_input":
      return process.env.NEXT_PUBLIC_FEATURE_VOICE_INPUT;
    case "mock_triggers":
      return process.env.NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS;
  }
}

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  const envValue = readEnvOverride(flag);
  if (envValue === "true") return true;
  if (envValue === "false") return false;
  return FLAGS[flag].defaultEnabled;
}
