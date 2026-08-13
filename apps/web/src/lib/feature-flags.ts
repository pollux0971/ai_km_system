export type FeatureFlagName = "sso";

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
};

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  const envValue = process.env[`NEXT_PUBLIC_FEATURE_${flag.toUpperCase()}`];
  if (envValue === "true") return true;
  if (envValue === "false") return false;
  return FLAGS[flag].defaultEnabled;
}
