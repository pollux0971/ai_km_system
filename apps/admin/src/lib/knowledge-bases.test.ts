import { describe, expect, it } from "vitest";
import { listKnowledgeBases } from "./knowledge-bases";

describe("listKnowledgeBases (E11-S011)", () => {
  it("returns every seeded knowledge base with its own name, description, and updatedAt", async () => {
    const result = await listKnowledgeBases();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      {
        id: "kb-sample-1",
        name: "產品保固政策",
        description: "保固期限、涵蓋範圍與理賠流程等相關文件。",
        updatedAt: "2026-08-13T01:00:00.000Z",
      },
      {
        id: "kb-sample-2",
        name: "設備維修標準作業程序",
        description: "常見設備故障排除步驟與維修 SOP 文件集。",
        updatedAt: "2026-08-11T06:30:00.000Z",
      },
      {
        id: "kb-sample-3",
        name: "人力資源與請假規範",
        description: "請假、加班、差旅申請等人資相關政策文件。",
        updatedAt: "2026-08-09T02:15:00.000Z",
      },
    ]);
  });

  it("every knowledge base has its own distinct id", async () => {
    const result = await listKnowledgeBases();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.value.map((kb) => kb.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
