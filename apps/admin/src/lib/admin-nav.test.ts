import { describe, expect, it } from "vitest";
import { ADMIN_NAV_GROUPS } from "./admin-nav";

/**
 * ux/admin-ui-overhaul: ADMIN_NAV_GROUPS is the single source both the
 * sidebar and the home entry cards render from. These tests freeze the
 * exact 16 href/label pairs the home page had already accumulated story
 * by story (E11-S002 … E13-S013) so the grouping refactor can never
 * silently drop or rename an approved entry.
 */

const EXPECTED_ENTRIES: [string, string][] = [
  ["/users", "使用者管理"],
  ["/roles", "角色管理"],
  ["/permissions", "權限矩陣"],
  ["/departments", "部門管理"],
  ["/groups", "群組管理"],
  ["/knowledge", "知識庫管理"],
  ["/prompts", "提示詞管理"],
  ["/models", "模型管理"],
  ["/connectors", "連接器管理"],
  ["/audit", "稽核紀錄"],
  ["/feedback", "回饋佇列"],
  ["/document-failures", "文件失敗佇列"],
  ["/settings", "系統設定"],
  ["/usage", "使用量儀表板"],
  ["/health", "系統健康儀表板"],
  ["/latency", "延遲儀表板"],
];

describe("ADMIN_NAV_GROUPS", () => {
  const flat = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

  it("contains exactly the 16 approved entries, each with its original label", () => {
    expect(flat).toHaveLength(EXPECTED_ENTRIES.length);
    for (const [href, label] of EXPECTED_ENTRIES) {
      const item = flat.find((candidate) => candidate.href === href);
      expect(item, `missing nav entry for ${href}`).toBeDefined();
      expect(item?.label).toBe(label);
    }
  });

  it("never lists the same route in two groups", () => {
    const hrefs = flat.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives every entry a non-empty description for the home entry cards", () => {
    for (const item of flat) {
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it("gives every group a non-empty title and at least one item", () => {
    for (const group of ADMIN_NAV_GROUPS) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
