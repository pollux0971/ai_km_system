import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MOCK_ANSWER_STATE_TRIGGERS } from "./answer-state";
import { MOCK_FILE_PROCESSING_FAILURE_TRIGGER } from "./file-processing";
import { MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER } from "./knowledge-documents";
import { MOCK_STREAM_DISCONNECT_TRIGGER } from "./streaming";

/**
 * E03-S045 (AC5): "runbook 列出全部觸發器（grep 驗證清單與程式碼一致的測試）"
 * — reads docs/runbooks/mock-triggers.md and confirms every actual trigger
 * constant's literal value is documented there, so the runbook can't
 * silently drift out of sync with the code the way a purely
 * hand-maintained doc could.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNBOOK_PATH = path.resolve(__dirname, "../../../../docs/runbooks/mock-triggers.md");
const runbook = readFileSync(RUNBOOK_PATH, "utf8");

const ALL_TRIGGERS = [
  ...Object.values(MOCK_ANSWER_STATE_TRIGGERS),
  MOCK_STREAM_DISCONNECT_TRIGGER,
  MOCK_FILE_PROCESSING_FAILURE_TRIGGER,
  MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER,
];

describe("docs/runbooks/mock-triggers.md matches the actual trigger constants (E03-S045)", () => {
  it("lists at least one trigger (the fixture itself isn't accidentally empty)", () => {
    expect(ALL_TRIGGERS.length).toBeGreaterThan(0);
  });

  it.each(ALL_TRIGGERS)("documents the trigger string %s", (trigger) => {
    expect(runbook).toContain(trigger);
  });

  it("documents the mock_triggers flag name and its env var", () => {
    expect(runbook).toContain("mock_triggers");
    expect(runbook).toContain("NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS");
  });

  it("documents the server-side service-error trigger and its gate", () => {
    expect(runbook).toContain("service-error");
    expect(runbook).toContain("AI_KM_DEV_TRIGGERS");
  });
});
