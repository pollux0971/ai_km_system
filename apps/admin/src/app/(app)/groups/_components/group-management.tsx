"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { createGroup, listGroups, type Group } from "@/lib/groups";

const logger = createLogger("admin:group-management");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; groups: Group[] };

/**
 * E11-S010 "Group management" — same list+inline-create shape
 * DepartmentManagement (E11-S009) already establishes for a sibling
 * mock entity: loading/error/loaded three-state, a successful create
 * appends to the already-loaded list in place (no refetch/reload) and
 * clears the input.
 */
export default function GroupManagement() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const nameId = useId();

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading group list", { correlationId });

    listGroups().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load group list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("group list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", groups: result.value });
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
    logger.info("creating group", { correlationId, name: trimmed });

    const result = await createGroup({ name: trimmed });
    setPending(false);

    if (!result.ok) {
      logger.error("failed to create group", { correlationId, code: result.error.code });
      setError(true);
      return;
    }

    logger.info("group created", { correlationId, groupId: result.value.groupId });
    setState({ status: "loaded", groups: [...state.groups, result.value] });
    setName("");
  }

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入群組清單。" />;
  }

  return (
    <div>
      {state.groups.length === 0 ? (
        <EmptyState message="尚無群組。" />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {state.groups.map((group) => (
            <li key={group.groupId} style={{ marginBottom: 8 }}>
              {group.name}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <label htmlFor={nameId}>群組名稱</label>
        <br />
        <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} disabled={pending} />{" "}
        <button type="submit" disabled={pending || name.trim().length === 0}>
          新增群組
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
