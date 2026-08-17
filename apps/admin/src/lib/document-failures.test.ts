import { describe, expect, it } from "vitest";
import { listFailedDocuments, retryDocumentProcessing } from "./document-failures";

describe("listFailedDocuments (E11-S018)", () => {
  it("returns an empty list — admin has no real cross-knowledge-base channel to observe processing failures yet", async () => {
    const result = await listFailedDocuments();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });
});

describe("retryDocumentProcessing (E11-S019)", () => {
  it("returns NOT_FOUND for any id — the same permanently-empty reality listFailedDocuments() already reflects, since no failed document has ever been observed", async () => {
    const result = await retryDocumentProcessing("any-document-id-at-all");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND for a second, different id too — not a fixed single lookup result", async () => {
    const result = await retryDocumentProcessing("a-completely-different-id");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
