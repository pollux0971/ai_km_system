import type { Role } from "@ai-km/permissions";

/**
 * Display labels for the Profile view (E01-S010). Translates
 * packages/permissions' Role identifiers to the role names
 * SOURCE_BASELINE.md §7 already defines (General User, Department
 * Manager, Knowledge Manager, Maintenance Engineer, Sales/Purchasing,
 * IT Administrator, AI Administrator, Auditor, Super Administrator) —
 * not inventing new role concepts, just labeling the existing ones.
 */
const ROLE_LABELS: Record<Role, string> = {
  general_user: "一般使用者",
  department_manager: "部門主管",
  knowledge_manager: "知識管理者",
  maintenance_engineer: "維修工程師",
  sales_purchasing: "業務/採購",
  it_administrator: "IT 管理員",
  ai_administrator: "AI 管理員",
  auditor: "稽核人員",
  super_administrator: "系統管理員",
};

/** Falls back to the raw string for a role this map doesn't recognize (fail-safe, not fail-silent). */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}
