"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { createDepartment, listDepartments, type Department } from "@/lib/departments";

const logger = createLogger("admin:department-management");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; departments: Department[] };

/**
 * E11-S009 "Department management" — same loading/error/loaded shape
 * RoleList (E11-S006) already establishes, plus an inline create form
 * (same "own list page's own create action" shape RoleEditor's own
 * save form establishes, not a separate route the way `/users/new` is —
 * a department only has one field, so there's no multi-field form
 * complex enough to warrant its own page the way creating a user was).
 * A successful create appends to the already-loaded list in place
 * (visible immediately, no refetch/reload) and clears the input.
 */
export default function DepartmentManagement() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const nameId = useId();

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading department list", { correlationId });

    listDepartments().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load department list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("department list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", departments: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (state.status !== "loaded") return;

    const trimmed = name.trim();
    if (!trimmed || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("creating department", { correlationId, name: trimmed });

    const result = await createDepartment({ name: trimmed });
    setPending(false);

    if (!result.ok) {
      logger.error("failed to create department", { correlationId, code: result.error.code });
      setError(true);
      return;
    }

    logger.info("department created", { correlationId, departmentId: result.value.departmentId });
    setState({ status: "loaded", departments: [...state.departments, result.value] });
    setName("");
  }

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入部門清單。" />;
  }

  return (
    <div>
      {state.departments.length === 0 ? (
        <EmptyState message="尚無部門。" />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {state.departments.map((department) => (
            <li key={department.departmentId} style={{ marginBottom: 8 }}>
              {department.name}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <label htmlFor={nameId}>部門名稱</label>
        <br />
        <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} disabled={pending} />{" "}
        <button type="submit" disabled={pending || name.trim().length === 0}>
          新增部門
        </button>
      </form>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="新增失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
