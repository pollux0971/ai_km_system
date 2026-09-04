import type { ApiError, Result } from "@ai-km/types";
import type { Role } from "@ai-km/permissions";
import { ALL_ROLES } from "./users";

/**
 * E11-S008 "Permission matrix" — the resource:action grid `roles.ts`'s
 * own E11-S006 doc comment deliberately deferred to this later story
 * (and `contracts/permissions/README.md` confirms Team B hasn't
 * populated a real permission-model contract yet). Rather than
 * inventing new resource:action pairs nowhere in this codebase, this
 * reuses the exact same source `roles.ts`'s own `ROLE_DESCRIPTIONS`
 * already draws from — `archive/AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md`
 * §7's per-role "manages/uses/views X" bullet lists — just kept as an
 * array of individual capability labels per role instead of one prose
 * sentence, so a grid can be built from it.
 */
export interface PermissionMatrixRow {
  role: Role;
  capabilities: string[];
}

const NON_ADMIN_CAPABILITIES: Record<Exclude<Role, "super_administrator">, string[]> = {
  general_user: [],
  department_manager: ["部門 KB", "部門使用者", "部門 Knowledge"],
  knowledge_manager: ["Knowledge", "Document", "FAQ", "Feedback", "Knowledge Quality"],
  maintenance_engineer: ["Maintenance Assistant", "SOP", "Error Code", "Troubleshooting"],
  sales_purchasing: ["ERP Assistant", "Data Query", "Excel"],
  it_administrator: ["Account", "SSO", "Connector", "System"],
  ai_administrator: ["Model", "Prompt", "Evaluation", "RAG"],
  auditor: ["Audit", "Security Event"],
};

/**
 * Every distinct capability label across the 8 non-admin roles, in a
 * stable column order (each role's own bullets stay grouped together).
 * Also doubles as `super_administrator`'s own capability list below —
 * SOURCE_BASELINE §7 describes that role as having "最高系統權限"
 * (the highest system permission) rather than enumerating individual
 * items the way it does for every other role; translating "highest" as
 * "has every capability every other role has" is the literal, minimal
 * reading of that one sentence, not a new claim about capabilities
 * SOURCE_BASELINE itself never mentions.
 */
export const ALL_CAPABILITIES: string[] = Object.values(NON_ADMIN_CAPABILITIES).flat();

const ROLE_CAPABILITIES: Record<Role, string[]> = {
  ...NON_ADMIN_CAPABILITIES,
  super_administrator: ALL_CAPABILITIES,
};

/**
 * Same `Promise<Result<T[], ApiError>>` shape `listRoles`/`listUsers`
 * already establish for a list page's own primary fetched data.
 */
export async function listPermissionMatrix(): Promise<Result<PermissionMatrixRow[], ApiError>> {
  return { ok: true, value: ALL_ROLES.map((role) => ({ role, capabilities: ROLE_CAPABILITIES[role] })) };
}
