import { describe, expect, it } from "vitest";
import { rolesRequiredFor, visibleEntryCards, visibleNavItems } from "./nav-items";

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

describe("visibleEntryCards", () => {
  it("excludes Home and Conversations even though they're visible nav items", () => {
    const cards = visibleEntryCards(["super_administrator"]);

    expect(cards.map((card) => card.href)).not.toContain("/");
    expect(cards.map((card) => card.href)).not.toContain("/conversations");
  });

  it("shows only the Knowledge card to a general_user", () => {
    const cards = visibleEntryCards(["general_user"]);

    expect(cards.map((card) => card.href)).toEqual(["/knowledge"]);
  });

  it("shows Knowledge + Maintenance to a maintenance_engineer, but not ERP", () => {
    const cards = visibleEntryCards(["maintenance_engineer"]);

    expect(cards.map((card) => card.href)).toEqual(["/knowledge", "/maintenance"]);
  });

  it("shows Knowledge + ERP to a sales_purchasing user, but not Maintenance", () => {
    const cards = visibleEntryCards(["sales_purchasing"]);

    expect(cards.map((card) => card.href)).toEqual(["/knowledge", "/erp"]);
  });

  it("shows all three cards to a super_administrator, each with a description", () => {
    const cards = visibleEntryCards(["super_administrator"]);

    expect(cards.map((card) => card.href)).toEqual(["/knowledge", "/maintenance", "/erp"]);
    for (const card of cards) {
      expect(card.entryCardDescription).toBeTruthy();
    }
  });
});

describe("rolesRequiredFor (E01-S017)", () => {
  it("returns the exact allow-list for a role-restricted route", () => {
    expect(rolesRequiredFor("/maintenance")).toEqual(["maintenance_engineer", "super_administrator"]);
    expect(rolesRequiredFor("/erp")).toEqual(["sales_purchasing", "super_administrator"]);
  });

  it("returns 'all' for a route open to every authenticated role", () => {
    expect(rolesRequiredFor("/")).toBe("all");
    expect(rolesRequiredFor("/knowledge")).toBe("all");
  });

  it("returns undefined for a path not listed in NAV_ITEMS (e.g. /profile) — open by design, not an oversight", () => {
    expect(rolesRequiredFor("/profile")).toBeUndefined();
  });
});
