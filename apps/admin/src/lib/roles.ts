import type { ApiError, Result } from "@ai-km/types";
import type { Role } from "@ai-km/permissions";
import { ALL_ROLES } from "./users";

/**
 * E11-S006 "Role list". `role` (not `id`) is deliberately the field
 * name — the identifier IS the meaningful `Role` enum value itself
 * (also reused directly as `AdminUser.roles[number]`), not an opaque
 * generated id a display name happens to be attached to.
 *
 * `description` is NOT invented — it's `archive/AI_KM_BMAD_High_Granularity/
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

const STORAGE_KEY = "ai-km:mock-role-descriptions";

/**
 * E11-S007 "Role editor" — first writeDescriptions() caller (S006,
 * read-only, deliberately left persistence out). Same sessionStorage-
 * backed reasoning as users.ts's own readStore(), except this stores a
 * `Record<Role, string>` (the full, always-9-key description map) not
 * an array — `updateRoleDescription` always reads the full map, updates
 * one key, and writes the full map back, same "write the complete
 * current state, not a diff" shape disableUser's own writeStore call
 * already establishes for its own array.
 */
function readDescriptions(): Record<Role, string> {
  if (typeof window === "undefined") return ROLE_DESCRIPTIONS;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return ROLE_DESCRIPTIONS;
  try {
    return JSON.parse(raw) as Record<Role, string>;
  } catch {
    return ROLE_DESCRIPTIONS;
  }
}

function writeDescriptions(descriptions: Record<Role, string>): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(descriptions));
}

function isRole(value: string): value is Role {
  return (ALL_ROLES as string[]).includes(value);
}

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
  const descriptions = readDescriptions();
  return { ok: true, value: ALL_ROLES.map((role) => ({ role, description: descriptions[role] })) };
}

/**
 * E11-S007 "Role editor". Takes a raw `string` (not `Role`) — the
 * caller is a `/roles/[role]` dynamic route segment, which is always an
 * untyped string from the URL, not guaranteed to be a real role. Same
 * `value: T | null` (not a NOT_FOUND error) shape getUser/getErpQuery
 * already establish for "the lookup itself succeeded; this particular
 * id/role just doesn't resolve to anything."
 */
export async function getRole(role: string): Promise<Result<RoleSummary | null, ApiError>> {
  if (!isRole(role)) {
    return { ok: true, value: null };
  }
  const descriptions = readDescriptions();
  return { ok: true, value: { role, description: descriptions[role] } };
}

/**
 * E11-S007 "Role editor". Also takes a raw `string` for `role` and
 * re-validates it server-side — same "don't trust a bypassed client"
 * discipline selectErpQueryScenario's own scenarioId check already
 * establishes, even though the editor UI only ever reaches this
 * function after `getRole` has already confirmed the role is real.
 * Unlike `disableUser`/`enableUser` (idempotent, no validity check on
 * their own input beyond existence), `description` is required here —
 * a role's description IS this whole feature's actual content, not
 * optional metadata the way KnowledgeBase's own `description` is.
 */
export async function updateRoleDescription(role: string, description: string): Promise<Result<RoleSummary, ApiError>> {
  if (!isRole(role)) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個角色。" } };
  }

  const trimmed = description.trim();
  if (!trimmed) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入角色說明。" } };
  }

  const descriptions = readDescriptions();
  const updated = { ...descriptions, [role]: trimmed };
  writeDescriptions(updated);
  return { ok: true, value: { role, description: trimmed } };
}
