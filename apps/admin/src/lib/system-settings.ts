import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S020 "System settings". The only real, Team-A-owned, global
 * system-level configuration value that exists anywhere in this
 * codebase today is `apps/web`'s own SSO feature flag
 * (`lib/feature-flags.ts`, E01-S015, approved) — `FLAGS.sso.
 * defaultEnabled: true`. `ssoEnabled` below mirrors that real value's
 * current default (same "mirrors a real already-approved value, not an
 * invented shape" reasoning `FailedDocument`'s own E11-S018 doc comment
 * establishes for a different domain), not an import — apps/admin and
 * apps/web are separate Next.js apps with fully independent runtime
 * state (same boundary `models.ts`'s own E11-S013 doc comment
 * establishes for a different setting).
 *
 * Toggling here is a purely local sessionStorage-backed mock action,
 * same "zero real-world effect" honesty apps/admin's own Model/
 * Connector toggles already established (E11-S013/S014): the real flag
 * apps/web reads is resolved from `process.env` at request time on a
 * separately deployed app, which this toggle can never reach.
 * `contracts/` has zero settings content either way — no real backend
 * settings service exists to defer to instead.
 */
export interface SystemSettings {
  ssoEnabled: boolean;
}

const STORAGE_KEY = "ai-km-admin-system-settings";

function readStore(): SystemSettings {
  if (typeof window === "undefined") return { ssoEnabled: true };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ssoEnabled: true };
    return JSON.parse(raw) as SystemSettings;
  } catch {
    return { ssoEnabled: true };
  }
}

function writeStore(settings: SystemSettings): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function getSystemSettings(): Promise<Result<SystemSettings, ApiError>> {
  return { ok: true, value: readStore() };
}

export async function disableSso(): Promise<Result<SystemSettings, ApiError>> {
  const settings = { ...readStore(), ssoEnabled: false };
  writeStore(settings);
  return { ok: true, value: settings };
}

export async function enableSso(): Promise<Result<SystemSettings, ApiError>> {
  const settings = { ...readStore(), ssoEnabled: true };
  writeStore(settings);
  return { ok: true, value: settings };
}
