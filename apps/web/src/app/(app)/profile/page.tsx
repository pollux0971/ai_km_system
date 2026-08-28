"use client";

import { useCurrentUser } from "@/lib/session-context";
import { roleLabel } from "@/lib/role-labels";

/**
 * E01-S010: User Profile view — Name/Email/Department/Group/Role, per
 * SOURCE_BASELINE.md's older E01-S06 baseline. AuthSession's profile
 * fields are optional (E02 may not always populate them), so each falls
 * back to an explicit "未提供" rather than rendering blank/undefined.
 */
export default function ProfilePage() {
  const user = useCurrentUser();

  return (
    <main style={{ padding: 32 }}>
      <h1>個人資料</h1>
      <dl className="m3-kv-list">
        <dt>姓名</dt>
        <dd>{user.name ?? "未提供"}</dd>

        <dt>Email</dt>
        <dd>{user.email ?? "未提供"}</dd>

        <dt>部門</dt>
        <dd>{user.department ?? "未提供"}</dd>

        <dt>群組</dt>
        <dd>{user.group ?? "未提供"}</dd>

        <dt>角色</dt>
        <dd>{user.roles.length > 0 ? user.roles.map(roleLabel).join("、") : "未提供"}</dd>
      </dl>
    </main>
  );
}
