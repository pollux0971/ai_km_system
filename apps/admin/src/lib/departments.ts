import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S009 "Department management". `Department` is this file's own
 * local entity, the same "self-contained frontend mock, not blocked on
 * Team B" treatment `users.ts`'s own `AdminUser`/`createUser` already
 * establishes for a concept nominally owned by another domain
 * (`archive/AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md`'s own
 * "E02-S03 Department Entity" names this as Team B's schema to define;
 * `contracts/` has no department schema at all, same "not yet
 * populated" situation `contracts/permissions/README.md` already
 * documents for the sibling Role/Permission concept — see
 * `permission-matrix.ts`'s own doc comment). Rather than inventing a
 * cross-team contract or blocking on it, this mock exists purely inside
 * apps/admin's own boundary and makes no claim of real backend
 * integration.
 *
 * Seed names are NOT invented — they're the exact 4 department strings
 * this codebase's own `AdminUser.department` free-text field already
 * uses (`users.ts`'s own `SAMPLE_USERS`, mirrored in
 * `@ai-km/auth-client`'s mock `ACCOUNTS`), just given a proper entity id
 * here for the first time so they can be listed/created as first-class
 * records instead of only existing as another entity's free-text field.
 */
export interface Department {
  departmentId: string;
  name: string;
}

const SEED_DEPARTMENTS: Department[] = [
  { departmentId: "mock-department-it", name: "資訊部" },
  { departmentId: "mock-department-maintenance", name: "維修部" },
  { departmentId: "mock-department-sales", name: "業務部" },
  { departmentId: "mock-department-audit", name: "稽核部" },
];

const STORAGE_KEY = "ai-km:mock-admin-departments";

/** Same sessionStorage-backed reasoning as users.ts's own readStore(). */
function readStore(): Department[] {
  if (typeof window === "undefined") return SEED_DEPARTMENTS;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SEED_DEPARTMENTS;
  try {
    return JSON.parse(raw) as Department[];
  } catch {
    return SEED_DEPARTMENTS;
  }
}

function writeStore(departments: Department[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(departments));
}

export async function listDepartments(): Promise<Result<Department[], ApiError>> {
  return { ok: true, value: readStore() };
}

/**
 * Only `name` is required — unlike `createUser`'s multi-field form, a
 * department's only meaningful attribute in this codebase's own
 * existing vocabulary (`AdminUser.department` is a bare string) is its
 * name.
 */
export async function createDepartment(input: { name: string }): Promise<Result<Department, ApiError>> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入部門名稱。" } };
  }

  const department: Department = { departmentId: crypto.randomUUID(), name };
  writeStore([...readStore(), department]);
  return { ok: true, value: department };
}
