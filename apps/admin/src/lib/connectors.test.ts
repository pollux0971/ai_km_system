import { beforeEach, describe, expect, it } from "vitest";
import { disableConnector, enableConnector, listConnectors } from "./connectors";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("listConnectors (E11-S014)", () => {
  it("returns all 9 seeded connector types, grounded in SOURCE_BASELINE's own E10 story list, each starting disabled", async () => {
    const result = await listConnectors();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { id: "erp", name: "ERP 連接器", status: "disabled" },
      { id: "mes", name: "MES 連接器", status: "disabled" },
      { id: "crm", name: "CRM 連接器", status: "disabled" },
      { id: "hr", name: "HR 連接器", status: "disabled" },
      { id: "scm", name: "SCM 連接器", status: "disabled" },
      { id: "plm", name: "PLM 連接器", status: "disabled" },
      { id: "iot", name: "IoT 連接器", status: "disabled" },
      { id: "generic-rest", name: "通用 REST 連接器", status: "disabled" },
      { id: "database-view", name: "資料庫檢視連接器", status: "disabled" },
    ]);
  });
});

describe("enableConnector (E11-S014)", () => {
  it("enables a disabled connector and persists it, visible via a subsequent listConnectors() call", async () => {
    const result = await enableConnector("erp");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("enabled");

    const list = await listConnectors();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value.find((connector) => connector.id === "erp")?.status).toBe("enabled");
  });

  it("only changes the targeted connector's status, leaving every other connector untouched", async () => {
    const before = await listConnectors();
    if (!before.ok) throw new Error("expected ok");
    const othersBefore = before.value.filter((connector) => connector.id !== "erp");

    await enableConnector("erp");

    const after = await listConnectors();
    if (!after.ok) throw new Error("expected ok");
    const othersAfter = after.value.filter((connector) => connector.id !== "erp");
    expect(othersAfter).toEqual(othersBefore);
  });

  it("returns NOT_FOUND for an unknown connector id", async () => {
    const result = await enableConnector("not-a-real-connector");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("disableConnector (E11-S014)", () => {
  it("disables a previously-enabled connector and persists it, visible via a subsequent listConnectors() call", async () => {
    await enableConnector("erp");
    const result = await disableConnector("erp");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("disabled");

    const list = await listConnectors();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value.find((connector) => connector.id === "erp")?.status).toBe("disabled");
  });

  it("returns NOT_FOUND for an unknown connector id", async () => {
    const result = await disableConnector("not-a-real-connector");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
