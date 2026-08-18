"use client";

import { createContext, useContext } from "react";
import type { AuthSession } from "@ai-km/auth-client";

/**
 * E01-S004: exposes the current authenticated user to everything under
 * the (app) shell. Default is `null` — that's only ever observed if a
 * descendant calls useCurrentUser() outside SessionGate's provider (a
 * programmer error), because SessionGate never renders its children
 * until a real session exists (see (app)/session-gate.tsx).
 */
const CurrentUserContext = createContext<AuthSession | null>(null);

export const CurrentUserProvider = CurrentUserContext.Provider;

export function useCurrentUser(): AuthSession {
  const session = useContext(CurrentUserContext);
  if (!session) {
    throw new Error("useCurrentUser() must be called within the authenticated (app) shell");
  }
  return session;
}

/**
 * E13-S009: non-throwing variant for call sites (e.g. message-thread.tsx)
 * that treat the current user as an optional enhancement — usage-event
 * instrumentation should degrade to "don't record" rather than crash the
 * whole component when no provider is present, unlike useCurrentUser()'s
 * every other caller, which genuinely cannot function without a session.
 */
export function useOptionalCurrentUser(): AuthSession | null {
  return useContext(CurrentUserContext);
}
