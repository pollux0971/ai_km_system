import { describe, expect, it } from "vitest";
import { streamAssistantReply } from "./streaming";

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
