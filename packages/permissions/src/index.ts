/**
 * Shared role/permission TYPES only. The authorization policy engine and the
 * authoritative Deny-Wins decision logic are owned by Team B (E02). Team A
 * consumes these shapes to render UI state (e.g. hide/disable actions) but
 * must never treat a client-side check as the real authorization boundary.
 */

export type Role =
  | "general_user"
  | "department_manager"
  | "knowledge_manager"
  | "maintenance_engineer"
  | "sales_purchasing"
  | "it_administrator"
  | "ai_administrator"
  | "auditor"
  | "super_administrator";

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
}
