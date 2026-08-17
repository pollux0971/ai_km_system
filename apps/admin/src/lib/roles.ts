import type { ApiError, Result } from "@ai-km/types";
import type { Role } from "@ai-km/permissions";
import { ALL_ROLES } from "./users";

/**
 * E11-S006 "Role list". `role` (not `id`) is deliberately the field
 * name — the identifier IS the meaningful `Role` enum value itself
 * (also reused directly as `AdminUser.roles[number]`), not an opaque
 * generated id a display name happens to be attached to.
 *
 * `description` is NOT invented — it's `AI_KM_BMAD_High_Granularity/
 * SOURCE_BASELINE.md` §7's own per-role "manages/uses/views X"
 * responsibility text, reformatted from a bullet list into one
 * sentence per role, same content and scope, not new claims about what
 * a role can do. Deliberately does NOT include a resource:action
 * permission grid — `E11-S008` "Permission matrix" is its own later,
 * explicitly separate story that owns that; `contracts/permissions/
 * README.md` itself confirms no such matrix exists yet anywhere in
 * this codebase for this story to pull from.
 */
export interface RoleSummary {
  role: Role;
  description: string;
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  general_user: "一般企業員工。",
  department_manager: "管理部門 KB、部門使用者、部門 Knowledge。",
  knowledge_manager: "管理 Knowledge、Document、FAQ、Feedback、Knowledge Quality。",
  maintenance_engineer: "使用 Maintenance Assistant、SOP、Error Code、Troubleshooting。",
  sales_purchasing: "使用 ERP Assistant、Data Query、Excel。",
  it_administrator: "管理 Account、SSO、Connector、System。",
  ai_administrator: "管理 Model、Prompt、Evaluation、RAG。",
  auditor: "查看 Audit、Security Event。",
  super_administrator: "最高系統權限。",
};

/**
 * Same `Promise<Result<T[], ApiError>>` shape listUsers/listErpQueries/
 * listMaintenanceCases already establish for "the thing a whole list
 * page's own loading/error/empty/loaded state machine is built
 * around" — even though this particular mock can't actually fail,
 * matching the established shape (rather than a bare synchronous
 * array, the shape ALL_ROLES/ERP_SCENARIO_OPTIONS use for static
 * dropdown OPTIONS, not a page's own primary fetched data) keeps this
 * story's own list page consistent with every sibling list page.
 */
export async function listRoles(): Promise<Result<RoleSummary[], ApiError>> {
  return { ok: true, value: ALL_ROLES.map((role) => ({ role, description: ROLE_DESCRIPTIONS[role] })) };
}
