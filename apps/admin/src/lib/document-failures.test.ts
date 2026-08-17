import { describe, expect, it } from "vitest";
import { listFailedDocuments } from "./document-failures";

describe("listFailedDocuments (E11-S018)", () => {
  it("returns an empty list — admin has no real cross-knowledge-base channel to observe processing failures yet", async () => {
    const result = await listFailedDocuments();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});
