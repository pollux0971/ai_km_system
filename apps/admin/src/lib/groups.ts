import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S010 "Group management" — same treatment `departments.ts`'s own
 * E11-S009 doc comment already establishes for a sibling concept:
 * `Group` is this file's own local entity, not blocked on Team B
 * (`AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md`'s own "E02-S04
 * Group Entity" names this as Team B's schema to define; `contracts/`
 * has no group schema at all, same "not yet populated" situation as
 * the sibling Role/Permission/Department concepts already document).
 * This mock exists purely inside apps/admin's own boundary and makes
 * no claim of real backend integration.
 *
 * Seed names are NOT invented — they're the exact 3 group strings
 * `@ai-km/auth-client`'s own mock `ACCOUNTS` already uses for its
 * optional `AuthSession.group` profile-display field (E01-S010), just
 * given a proper entity id here for the first time so they can be
 * listed/created as first-class records instead of only existing as
 * another entity's free-text field. Unlike `department` (which
 * apps/admin's own `AdminUser` already tracks per-user), `group` isn't
 * tracked on `AdminUser` at all — this story only owns the group
 * records themselves, not per-user membership, same "don't invent a
 * capability past what this story's own name covers" discipline
 * `departments.ts`'s own scope (list+create, no rename/delete) already
 * establishes.
 */
export interface Group {
  groupId: string;
  name: string;
}

const SEED_GROUPS: Group[] = [
  { groupId: "mock-group-general", name: "一般使用者群組" },
  { groupId: "mock-group-maintenance", name: "維修工程師群組" },
  { groupId: "mock-group-sales", name: "業務群組" },
];

const STORAGE_KEY = "ai-km:mock-admin-groups";

/** Same sessionStorage-backed reasoning as departments.ts's own readStore(). */
function readStore(): Group[] {
  if (typeof window === "undefined") return SEED_GROUPS;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SEED_GROUPS;
  try {
    return JSON.parse(raw) as Group[];
  } catch {
    return SEED_GROUPS;
  }
}

function writeStore(groups: Group[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export async function listGroups(): Promise<Result<Group[], ApiError>> {
  return { ok: true, value: readStore() };
}

/** Only `name` is required — same minimal shape createDepartment already establishes for this sibling entity. */
export async function createGroup(input: { name: string }): Promise<Result<Group, ApiError>> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入群組名稱。" } };
  }

  const group: Group = { groupId: crypto.randomUUID(), name };
  writeStore([...readStore(), group]);
  return { ok: true, value: group };
}
