import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyFileProcessing, MOCK_FILE_PROCESSING_FAILURE_TRIGGER, simulateFileProcessing } from "./file-processing";

describe("classifyFileProcessing (E03-S029)", () => {
  it("classifies ordinary filenames as done", () => {
    expect(classifyFileProcessing(["報表.pdf"])).toBe("done");
    expect(classifyFileProcessing(["a.txt", "b.docx"])).toBe("done");
  });

  it("classifies as failed when the mock trigger appears in any filename", () => {
    expect(classifyFileProcessing([`損毀檔案${MOCK_FILE_PROCESSING_FAILURE_TRIGGER}.pdf`])).toBe("failed");
  });

  it("one failing filename among several fails the whole batch", () => {
    expect(classifyFileProcessing(["ok.pdf", `bad${MOCK_FILE_PROCESSING_FAILURE_TRIGGER}.pdf`, "also-ok.txt"])).toBe("failed");
  });

  it("an empty file list classifies as done (nothing to fail)", () => {
    expect(classifyFileProcessing([])).toBe("done");
  });
});

describe("simulateFileProcessing (E03-S029)", () => {
  it("resolves to the same classification classifyFileProcessing would return", async () => {
    await expect(simulateFileProcessing(["報表.pdf"], 0)).resolves.toBe("done");
    await expect(simulateFileProcessing([`bad${MOCK_FILE_PROCESSING_FAILURE_TRIGGER}.pdf`], 0)).resolves.toBe("failed");
  });

  it("defaults to a non-zero delay", async () => {
    const start = Date.now();
    await simulateFileProcessing(["報表.pdf"]);
    expect(Date.now() - start).toBeGreaterThan(0);
  });
});

// E03-S045 (AC1): vitest.setup.ts sets mock_triggers to "true" globally —
// this test locally overrides it to exercise the flag-OFF default.
describe("classifyFileProcessing respects the mock_triggers flag (E03-S045)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores the trigger phrase and classifies as done when mock_triggers is disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS", "false");
    expect(classifyFileProcessing([`損毀檔案${MOCK_FILE_PROCESSING_FAILURE_TRIGGER}.pdf`])).toBe("done");
  });
});
