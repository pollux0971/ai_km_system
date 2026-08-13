import { describe, expect, it } from "vitest";
import { visibleNavItems } from "./nav-items";

describe("visibleNavItems", () => {
  it("shows only the all-roles items to a general_user", () => {
    const items = visibleNavItems(["general_user"]);

    expect(items.map((item) => item.href)).toEqual(["/", "/conversations", "/knowledge"]);
  });

  it("additionally shows Maintenance to a maintenance_engineer", () => {
    const items = visibleNavItems(["maintenance_engineer"]);

    expect(items.map((item) => item.href)).toEqual(["/", "/conversations", "/knowledge", "/maintenance"]);
  });

  it("additionally shows ERP to a sales_purchasing user", () => {
    const items = visibleNavItems(["sales_purchasing"]);

    expect(items.map((item) => item.href)).toEqual(["/", "/conversations", "/knowledge", "/erp"]);
  });

  it("shows everything to a super_administrator", () => {
    const items = visibleNavItems(["super_administrator"]);

    expect(items.map((item) => item.href)).toEqual(["/", "/conversations", "/knowledge", "/maintenance", "/erp"]);
  });

  it("does not show Maintenance to a sales_purchasing user, or ERP to a maintenance_engineer", () => {
    expect(visibleNavItems(["sales_purchasing"]).map((item) => item.href)).not.toContain("/maintenance");
    expect(visibleNavItems(["maintenance_engineer"]).map((item) => item.href)).not.toContain("/erp");
  });

  it("fails closed (shows only all-roles items) for an unrecognized role string", () => {
    const items = visibleNavItems(["some-future-role-not-yet-known"]);

    expect(items.map((item) => item.href)).toEqual(["/", "/conversations", "/knowledge"]);
  });

  it("fails closed for an empty roles array", () => {
    const items = visibleNavItems([]);

    expect(items.map((item) => item.href)).toEqual(["/", "/conversations", "/knowledge"]);
  });

  it("unions visibility across multiple roles on one session", () => {
    const items = visibleNavItems(["maintenance_engineer", "sales_purchasing"]);

    expect(items.map((item) => item.href)).toEqual(["/", "/conversations", "/knowledge", "/maintenance", "/erp"]);
  });
});
