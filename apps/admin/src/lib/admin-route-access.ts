import type { Role } from "@ai-km/permissions";

/**
 * E11-S023 "admin route authorization". Same "route -> required roles"
 * shape `apps/web`'s own `nav-items.ts` / `rolesRequiredFor` (E01-S006/
 * S017, approved) already establishes, adapted for this app's own
 * routes — same exact-match-OR-nested-under-a-listed-href resolution
 * (`${route.href}/` prefix, not a bare `startsWith`, so `/document-
 * failures` never accidentally matches an unrelated sibling like
 * `/document-failures-report`).
 *
 * The role assignments are NOT invented — every one is read directly
 * off `roles.ts`'s own `ROLE_DESCRIPTIONS` (E11-S006, itself sourced
 * from `SOURCE_BASELINE.md` §7, already approved): `it_administrator`
 * "管理 Account、SSO、Connector、System" → /users, /connectors,
 * /settings, /health; `ai_administrator` "管理 Model、Prompt、
 * Evaluation、RAG" → /models, /prompts; `auditor` "查看 Audit、Security
 * Event" → /audit; `knowledge_manager` "管理 Knowledge、Document、FAQ、
 * Feedback、Knowledge Quality" → /knowledge, /feedback, /document-
 * failures. `super_administrator` ("最高系統權限") is always additionally
 * allowed everywhere, same "super_administrator" super-set apps/web's
 * own NAV_ITEMS already grants for /maintenance and /erp.
 *
 * Routes with no literal textual match in any admin-flavored role's own
 * description (/roles, /permissions, /departments, /groups, /usage,
 * /latency) deliberately default to `super_administrator` ONLY — the
 * Security AC's own "Deny Wins" requirement means an ambiguous mapping
 * must resolve to the MOST restrictive role, not a guessed broader one.
 * Defining the RBAC structure itself (/roles, /permissions) or
 * cross-department oversight (/departments, /groups) being
 * super_administrator-only is the conservative reading, not a claim
 * about eventual real policy. `/latency` (E13-S013) is grouped with
 * `/usage` for the same reason: both are E13 cross-app metrics
 * dashboards with no textual match in any admin role's own
 * `ROLE_DESCRIPTIONS` — added by E11-S026 (this file previously never
 * listed it at all, a pre-existing gap invisible until this story
 * actually wired `AdminRouteGuard` into a real layout; see
 * archive/stories/E11-S026.md).
 *
 * `general_user`/`department_manager`/`maintenance_engineer`/
 * `sales_purchasing` never appear in this table at all — none of their
 * own `ROLE_DESCRIPTIONS` name any admin-console domain, so none of
 * them have any legitimate route here, same deny-by-omission discipline
 * as every other role's inclusion being traceable to specific text.
 *
 * Deliberately does NOT filter which links `page.tsx`'s home page shows
 * per role (that would be `visibleNavItems`'s own job, E01-S006) — this
 * story's own title is "route authorization", not "role-aware
 * navigation"; scoping the two separately is the same discipline
 * apps/web's own E01-S006 vs. E01-S017 split already established.
 */
export interface AdminRouteAccess {
  href: string;
  roles: Role[];
}

const ADMIN_ROLES: Role[] = ["it_administrator", "ai_administrator", "auditor", "super_administrator"];

export const ADMIN_ROUTES: AdminRouteAccess[] = [
  { href: "/", roles: ADMIN_ROLES },
  { href: "/users", roles: ["it_administrator", "super_administrator"] },
  { href: "/roles", roles: ["super_administrator"] },
  { href: "/permissions", roles: ["super_administrator"] },
  { href: "/departments", roles: ["super_administrator"] },
  { href: "/groups", roles: ["super_administrator"] },
  { href: "/knowledge", roles: ["knowledge_manager", "super_administrator"] },
  { href: "/prompts", roles: ["ai_administrator", "super_administrator"] },
  { href: "/models", roles: ["ai_administrator", "super_administrator"] },
  { href: "/connectors", roles: ["it_administrator", "super_administrator"] },
  { href: "/audit", roles: ["auditor", "super_administrator"] },
  { href: "/feedback", roles: ["knowledge_manager", "super_administrator"] },
  { href: "/document-failures", roles: ["knowledge_manager", "super_administrator"] },
  { href: "/settings", roles: ["it_administrator", "super_administrator"] },
  { href: "/usage", roles: ["super_administrator"] },
  { href: "/health", roles: ["it_administrator", "super_administrator"] },
  { href: "/latency", roles: ["super_administrator"] },
];

export function rolesRequiredForAdminRoute(pathname: string): Role[] | undefined {
  return ADMIN_ROUTES.find((route) => route.href === pathname || pathname.startsWith(`${route.href}/`))?.roles;
}
