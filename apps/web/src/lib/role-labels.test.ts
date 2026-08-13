import { describe, expect, it } from "vitest";
import { roleLabel } from "./role-labels";

describe("roleLabel", () => {
  it("labels every known Role from packages/permissions", () => {
    expect(roleLabel("general_user")).toBe("一般使用者");
    expect(roleLabel("department_manager")).toBe("部門主管");
    expect(roleLabel("knowledge_manager")).toBe("知識管理者");
    expect(roleLabel("maintenance_engineer")).toBe("維修工程師");
    expect(roleLabel("sales_purchasing")).toBe("業務/採購");
    expect(roleLabel("it_administrator")).toBe("IT 管理員");
    expect(roleLabel("ai_administrator")).toBe("AI 管理員");
    expect(roleLabel("auditor")).toBe("稽核人員");
    expect(roleLabel("super_administrator")).toBe("系統管理員");
  });

  it("falls back to the raw string for an unrecognized role (fail-safe, not silent)", () => {
    expect(roleLabel("some-future-role")).toBe("some-future-role");
  });
});
