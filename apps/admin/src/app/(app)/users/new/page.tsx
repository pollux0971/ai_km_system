"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { ALL_ROLES, createUser, type AdminUser } from "@/lib/users";

const logger = createLogger("admin:create-user");

/**
 * E11-S004 "Create user" — same "individual useState per field, submit
 * disabled until all required input present, generic error banner on
 * failure, values kept on failure, redirect only on success" shape
 * knowledge/new/page.tsx (E05-S003) and maintenance/new/page.tsx (E07-S002)
 * already establish for this codebase's create-forms; no `_components`
 * split, same as those two — a create-form's own state IS the page.
 *
 * Redirects to the new user's own /users/{id} detail page (E11-S003
 * already exists, unlike knowledge/new's redirect-to-list fallback from
 * a time /knowledge/[id] didn't exist yet) — same choice erp/new/page.tsx
 * makes once /erp/[id] already exists.
 *
 * apps/admin has no telemetry lib (`@/lib/telemetry`) the way apps/web
 * does — S001/S002/S003 all satisfy the correlation-id/structured-
 * telemetry AC with `createLogger` alone, no trackEvent calls; this
 * story follows that same already-approved apps/admin precedent rather
 * than introducing a new shared telemetry dependency un-asked-for.
 */
export default function NewUserPage() {
  const router = useRouter();
  const nameId = useId();
  const emailId = useId();
  const departmentId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [roles, setRoles] = useState<AdminUser["roles"]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  function toggleRole(role: AdminUser["roles"][number], checked: boolean) {
    setRoles((current) => (checked ? [...current, role] : current.filter((existing) => existing !== role)));
  }

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedDepartment = department.trim();
  const canSubmit = trimmedName.length > 0 && trimmedEmail.length > 0 && trimmedDepartment.length > 0 && roles.length > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("creating user", { correlationId });

    const result = await createUser({ name: trimmedName, email: trimmedEmail, department: trimmedDepartment, roles });
    setPending(false);

    if (!result.ok) {
      logger.error("failed to create user", { correlationId, code: result.error.code });
      setError(true);
      return;
    }

    logger.info("user created", { correlationId, userId: result.value.userId });
    router.refresh();
    router.replace(`/users/${result.value.userId}`);
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>建立使用者</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={nameId}>姓名</label>
          <br />
          <input id={nameId} type="text" value={name} onChange={(event) => setName(event.target.value)} disabled={pending} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={emailId}>電子郵件</label>
          <br />
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={departmentId}>部門</label>
          <br />
          <input
            id={departmentId}
            type="text"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            disabled={pending}
          />
        </div>
        <fieldset style={{ marginBottom: 16 }} disabled={pending}>
          <legend>角色</legend>
          {ALL_ROLES.map((role) => (
            <div key={role}>
              <label>
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={(event) => toggleRole(role, event.target.checked)}
                />{" "}
                {role}
              </label>
            </div>
          ))}
        </fieldset>
        <button type="submit" disabled={pending || !canSubmit}>
          建立
        </button>{" "}
        <Link href="/users">取消</Link>
      </form>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="無法建立使用者，請稍後再試。" />
        </div>
      )}
    </main>
  );
}
