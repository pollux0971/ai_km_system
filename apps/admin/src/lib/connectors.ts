import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S014 "Connector admin". Same treatment `models.ts`'s own E11-S013
 * doc comment already establishes for a sibling Team-B-owned concept:
 * the 9 connector types are grounded in
 * `AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md`'s own "24. E10 —
 * Enterprise Data Integration" story list (E10-S05 ERP Connector
 * through E10-S13 Database View Connector), not invented vendor/system
 * names. The real Connector Framework/Registry/Credential/Health Check
 * (E10-S01–S04, all Team B) don't exist yet, and `contracts/` has no
 * connector content at all.
 *
 * Deliberately does NOT model SOURCE_BASELINE's own 4-value Connector
 * State enum (HEALTHY/DEGRADED/FAILED/DISABLED, E10-S32) — those first
 * three are a computed health-check reading (E10-S04's job, not built),
 * and fabricating one here would be inventing operational data about a
 * connection that has never actually been made. This story only models
 * the one state Team A's admin console can honestly observe/control
 * today — 啟用/停用 (enabled/disabled) — same binary shape `models.ts`
 * already establishes for its own sibling "only model what's real, not
 * the parts that need a real backend" discipline. Every connector
 * starts disabled: none of them has ever actually been configured or
 * connected (unlike `models.ts`'s on-prem tiers, which SOURCE_BASELINE
 * decision #30 already treats as available-by-default — there's no
 * equivalent "already usable" baseline decision for any connector).
 */
export type ConnectorId = "erp" | "mes" | "crm" | "hr" | "scm" | "plm" | "iot" | "generic-rest" | "database-view";

export interface Connector {
  id: ConnectorId;
  name: string;
  status: "enabled" | "disabled";
}

const SEED_CONNECTORS: Connector[] = [
  { id: "erp", name: "ERP 連接器", status: "disabled" },
  { id: "mes", name: "MES 連接器", status: "disabled" },
  { id: "crm", name: "CRM 連接器", status: "disabled" },
  { id: "hr", name: "HR 連接器", status: "disabled" },
  { id: "scm", name: "SCM 連接器", status: "disabled" },
  { id: "plm", name: "PLM 連接器", status: "disabled" },
  { id: "iot", name: "IoT 連接器", status: "disabled" },
  { id: "generic-rest", name: "通用 REST 連接器", status: "disabled" },
  { id: "database-view", name: "資料庫檢視連接器", status: "disabled" },
];

const STORAGE_KEY = "ai-km:mock-admin-connectors";

/** Same sessionStorage-backed reasoning as models.ts's own readStore(). */
function readStore(): Connector[] {
  if (typeof window === "undefined") return SEED_CONNECTORS;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SEED_CONNECTORS;
  try {
    return JSON.parse(raw) as Connector[];
  } catch {
    return SEED_CONNECTORS;
  }
}

function writeStore(connectors: Connector[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(connectors));
}

export async function listConnectors(): Promise<Result<Connector[], ApiError>> {
  return { ok: true, value: readStore() };
}

/** Two separate functions rather than one boolean toggle — same shape disableModel/enableModel already establish. */
export async function enableConnector(id: string): Promise<Result<Connector, ApiError>> {
  const store = readStore();
  const existing = store.find((connector) => connector.id === id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個連接器。" } };
  }

  const updated: Connector = { ...existing, status: "enabled" };
  writeStore(store.map((connector) => (connector.id === id ? updated : connector)));
  return { ok: true, value: updated };
}

export async function disableConnector(id: string): Promise<Result<Connector, ApiError>> {
  const store = readStore();
  const existing = store.find((connector) => connector.id === id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個連接器。" } };
  }

  const updated: Connector = { ...existing, status: "disabled" };
  writeStore(store.map((connector) => (connector.id === id ? updated : connector)));
  return { ok: true, value: updated };
}
