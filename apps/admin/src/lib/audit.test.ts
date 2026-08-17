import { describe, expect, it } from "vitest";
import { listAuditEvents } from "./audit";

describe("listAuditEvents (E11-S015)", () => {
  it("returns an empty list — no real audit event pipeline exists yet (E14, Team B, not built)", async () => {
    const result = await listAuditEvents();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});
