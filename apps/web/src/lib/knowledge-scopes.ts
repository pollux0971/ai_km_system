import type { Role } from "@ai-km/permissions";

export type KnowledgeScope = "company" | "department" | "project" | "private" | "qna";

export interface KnowledgeScopeOption {
  id: KnowledgeScope;
  label: string;
  /** "all" = every authenticated role; otherwise the exact allow-list. */
  roles: Role[] | "all";
}

/**
 * E03-S003: the five knowledge scopes named in SOURCE_BASELINE.md's
 * Knowledge feature list ("Company KB / Department KB / Project KB /
 * Private KB / Q&A KB" — "Knowledge Base" itself is that list's section
 * heading, not a 6th scope; the ingestion-method bullets alongside it,
 * File/Folder Upload etc., belong to E05's own stories, not this
 * selector). No source names a role-to-scope restriction, so every
 * scope is currently `roles: "all"` — this isn't an oversight, it's the
 * honest absence of a defined rule; inventing a differentiated matrix
 * ungrounded in spec would violate the "不得自行猜測" boundary.
 *
 * Structured exactly like lib/nav-items.ts's NavItem/visibleNavItems —
 * same UX-only-visibility caveat (Frontend/UX Boundary: "UI permission
 * hiding 只屬 UX,不可作為 security control") — so the moment E05 (real
 * KB entities) and E02 (real RBAC) exist and define actual per-scope
 * restrictions, only this table's `roles` values need to change; the
 * filtering mechanism itself is already here and already tested.
 */
export const KNOWLEDGE_SCOPES: KnowledgeScopeOption[] = [
  { id: "company", label: "公司知識庫", roles: "all" },
  { id: "department", label: "部門知識庫", roles: "all" },
  { id: "project", label: "專案知識庫", roles: "all" },
  { id: "private", label: "個人知識庫", roles: "all" },
  { id: "qna", label: "問答庫", roles: "all" },
];

/**
 * `options` defaults to the real KNOWLEDGE_SCOPES table but can be
 * overridden — every real entry today is `roles: "all"`, so nothing in
 * production currently exercises the restrictive-roles branch; the
 * override exists so that branch is still covered by a real test
 * against this exact function (not a reimplementation of its logic)
 * rather than going untested until some future scope actually
 * restricts a role.
 */
export function visibleKnowledgeScopes(
  userRoles: string[],
  options: KnowledgeScopeOption[] = KNOWLEDGE_SCOPES,
): KnowledgeScopeOption[] {
  return options.filter((option) => option.roles === "all" || option.roles.some((role) => userRoles.includes(role)));
}
