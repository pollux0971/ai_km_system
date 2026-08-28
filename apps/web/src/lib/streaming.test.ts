import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_STREAM_DISCONNECT_TRIGGER, shouldSimulateStreamDisconnect, streamAssistantReply } from "./streaming";

describe("streamAssistantReply (E03-S010)", () => {
  it("yields more than one chunk (genuinely progressive, not one giant chunk)", async () => {
    const chunks: string[] = [];
    for await (const chunk of streamAssistantReply(0)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(1);
  });

  it("concatenating every yielded chunk reproduces the full reply with no gaps or duplication", async () => {
    const chunks: string[] = [];
    for await (const chunk of streamAssistantReply(0)) {
      chunks.push(chunk);
    }

    const full = chunks.join("");
    expect(full.length).toBeGreaterThan(0);

    const second = await collectFull();
    expect(full).toBe(second);
  });

  it("is clearly labeled as a simulated reply, not text that could pass as a real AI answer", async () => {
    const full = await collectFull();

    expect(full).toContain("模擬回覆");
  });
});

async function collectFull(): Promise<string> {
  let result = "";
  for await (const chunk of streamAssistantReply(0)) {
    result += chunk;
  }
  return result;
}

describe("streamAssistantReply default pacing (E03-S010)", () => {
  it("defaults to a non-zero delay between chunks (a visibly progressive stream, not an instant dump)", async () => {
    const start = Date.now();
    let chunkCount = 0;
    for await (const _chunk of streamAssistantReply()) {
      chunkCount += 1;
      if (chunkCount >= 3) break;
    }
    const elapsed = Date.now() - start;

    // 3 chunks at the default pacing means at least 3 delays were
    // awaited — a generous lower bound (well under 3 × 20ms) to absorb
    // CI timing jitter while still ruling out an effectively-instant
    // default.
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

describe("shouldSimulateStreamDisconnect (E03-S031)", () => {
  it("returns false for ordinary question text", () => {
    expect(shouldSimulateStreamDisconnect("保固期限是多久？")).toBe(false);
  });

  it("returns true when the mock trigger is present anywhere in the text", () => {
    expect(shouldSimulateStreamDisconnect(`保固期限是多久？ ${MOCK_STREAM_DISCONNECT_TRIGGER}`)).toBe(true);
    expect(shouldSimulateStreamDisconnect(MOCK_STREAM_DISCONNECT_TRIGGER)).toBe(true);
  });
});

// E03-S045 (AC1): vitest.setup.ts sets mock_triggers to "true" globally —
// this test locally overrides it to exercise the flag-OFF default.
describe("shouldSimulateStreamDisconnect respects the mock_triggers flag (E03-S045)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores the trigger phrase and returns false when mock_triggers is disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS", "false");
    expect(shouldSimulateStreamDisconnect(MOCK_STREAM_DISCONNECT_TRIGGER)).toBe(false);
  });
});

describe("streamAssistantReply simulateDisconnect (E03-S031)", () => {
  it("defaults to false — omitting the argument behaves exactly as before this story, completing the full reply", async () => {
    const chunks: string[] = [];
    for await (const chunk of streamAssistantReply(0)) {
      chunks.push(chunk);
    }

    expect(chunks.join("")).toContain("模擬回覆");
  });

  it("throws roughly halfway through when true, after yielding some real content first (not zero, not the full reply)", async () => {
    const chunks: string[] = [];

    await expect(async () => {
      for await (const chunk of streamAssistantReply(0, true)) {
        chunks.push(chunk);
      }
    }).rejects.toThrow();

    expect(chunks.length).toBeGreaterThan(0);

    const fullLength = await collectFull();
    expect(chunks.length).toBeLessThan(fullLength.length);
  });

  it("is deterministic — throws at the same point every time for the same input", async () => {
    async function collectUntilThrow(): Promise<number> {
      let count = 0;
      try {
        for await (const _chunk of streamAssistantReply(0, true)) {
          count += 1;
        }
      } catch {
        // expected
      }
      return count;
    }

    const first = await collectUntilThrow();
    const second = await collectUntilThrow();
    expect(first).toBe(second);
  });
});
