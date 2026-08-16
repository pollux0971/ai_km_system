import type { ApiError, Result } from "@ai-km/types";
import type { Role } from "@ai-km/permissions";

/**
 * E11-S002 "User list". Field names deliberately reuse
 * `@ai-km/auth-client`'s own `AuthSession`/`MockAccount` vocabulary
 * (`userId`/`roles`/`name`/`email`/`department`) rather than inventing
 * a parallel set of names for the same concepts — that shape is already
 * the established "this is what a user looks like" contract both
 * apps/web (via login) and apps/admin (here) agree on, even though this
 * file's own seed data is independent from auth-client's private
 * ACCOUNTS map (that map isn't exported, and only has 3 non-admin
 * accounts — too thin to demonstrate a real admin user list, which
 * needs to show admin-role accounts too).
 *
 * `status` ("active"/"disabled") is new here — auth-client's own
 * `ACCOUNT_DISABLED` login error code already establishes "disabled" as
 * a real, existing account state in this system's vocabulary; this
 * just surfaces it as a field the list can display, not a new concept.
 * Toggling it is E11-S005's own job — this story only shows it.
 */
export interface AdminUser {
  userId: string;
  name: string;
  email: string;
  department: string;
  roles: Role[];
  status: "active" | "disabled";
  /** E11-S003 "User detail" — account creation time, UTC storage per this codebase's own established convention. */
  createdAt: string;
}

/**
 * Seed data: reuses the same 3 real identities already established in
 * `@ai-km/auth-client`'s mock ACCOUNTS (same name/email/department —
 * this is the same person, not a coincidentally-similar fictional one),
 * plus one representative account per admin-only role
 * (it_administrator/ai_administrator/auditor/super_administrator —
 * SOURCE_BASELINE's own role list, none of which auth-client's own mock
 * currently seeds) and one disabled account, so both the role-diversity
 * and status-diversity a real list needs to demonstrate are genuinely
 * present rather than assumed.
 */
const SAMPLE_USERS: AdminUser[] = [
  {
    userId: "mock-user-1",
    name: "示範使用者",
    email: "demo-user@example.com",
    department: "資訊部",
    roles: ["general_user"],
    status: "active",
    createdAt: "2026-01-15T02:00:00.000Z",
  },
  {
    userId: "mock-user-maintenance",
    name: "示範維修工程師",
    email: "demo-maintenance@example.com",
    department: "維修部",
    roles: ["maintenance_engineer"],
    status: "active",
    createdAt: "2026-02-03T03:30:00.000Z",
  },
  {
    userId: "mock-user-sales",
    name: "示範業務",
    email: "demo-sales@example.com",
    department: "業務部",
    roles: ["sales_purchasing"],
    status: "active",
    createdAt: "2026-02-20T06:15:00.000Z",
  },
  {
    userId: "mock-user-it-admin",
    name: "示範 IT 管理員",
    email: "demo-it-admin@example.com",
    department: "資訊部",
    roles: ["it_administrator"],
    status: "active",
    createdAt: "2025-11-01T01:00:00.000Z",
  },
  {
    userId: "mock-user-ai-admin",
    name: "示範 AI 管理員",
    email: "demo-ai-admin@example.com",
    department: "資訊部",
    roles: ["ai_administrator"],
    status: "active",
    createdAt: "2025-11-01T01:05:00.000Z",
  },
  {
    userId: "mock-user-auditor",
    name: "示範稽核員",
    email: "demo-auditor@example.com",
    department: "稽核部",
    roles: ["auditor"],
    status: "active",
    createdAt: "2025-11-05T04:20:00.000Z",
  },
  {
    userId: "mock-user-super-admin",
    name: "示範最高管理員",
    email: "demo-super-admin@example.com",
    department: "資訊部",
    roles: ["super_administrator"],
    status: "active",
    createdAt: "2025-10-01T00:00:00.000Z",
  },
  {
    userId: "mock-user-disabled",
    name: "示範已停用帳號",
    email: "demo-disabled@example.com",
    department: "業務部",
    roles: ["sales_purchasing"],
    status: "disabled",
    createdAt: "2026-03-10T08:45:00.000Z",
  },
];

export async function listUsers(): Promise<Result<AdminUser[], ApiError>> {
  return { ok: true, value: SAMPLE_USERS };
}

/**
 * E11-S003 "User detail". Same `value: T | null` (not a rejected Promise
 * or a NOT_FOUND error) shape getErpQuery/getMaintenanceCase already
 * establish for "the fetch itself succeeded; the id just doesn't
 * resolve to anything", leaving the NOT_FOUND-vs-error distinction to
 * the caller.
 */
export async function getUser(userId: string): Promise<Result<AdminUser | null, ApiError>> {
  return { ok: true, value: SAMPLE_USERS.find((user) => user.userId === userId) ?? null };
}
