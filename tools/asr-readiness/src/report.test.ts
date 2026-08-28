import { describe, expect, it } from "vitest";
import { exitCodeForLevel, formatReport } from "./report.js";

describe("exitCodeForLevel", () => {
  it("is 0 only for ready", () => {
    expect(exitCodeForLevel("ready")).toBe(0);
    expect(exitCodeForLevel("degraded")).toBe(1);
    expect(exitCodeForLevel("not_ready")).toBe(1);
  });
});

describe("formatReport", () => {
  it("includes the summary, every detail line, and no next-steps section when empty", () => {
    const output = formatReport({
      level: "ready",
      summary: "環境就緒",
      details: ["GPU: NVIDIA GeForce GTX 1650 (4096 MiB)", "模型: 找到 q5_0"],
      nextSteps: [],
    });
    expect(output).toContain("環境就緒");
    expect(output).toContain("GPU: NVIDIA GeForce GTX 1650 (4096 MiB)");
    expect(output).toContain("模型: 找到 q5_0");
    expect(output).not.toContain("下一步");
  });

  it("includes a 下一步 section with each step when nextSteps is non-empty", () => {
    const output = formatReport({
      level: "not_ready",
      summary: "缺少 whisper-server",
      details: [],
      nextSteps: ["下載並建置 whisper.cpp", "把 whisper-server 放進 PATH"],
    });
    expect(output).toContain("下一步:");
    expect(output).toContain("下載並建置 whisper.cpp");
    expect(output).toContain("把 whisper-server 放進 PATH");
  });

  it("uses a distinct icon per level", () => {
    const ready = formatReport({ level: "ready", summary: "x", details: [], nextSteps: [] });
    const degraded = formatReport({ level: "degraded", summary: "x", details: [], nextSteps: [] });
    const notReady = formatReport({ level: "not_ready", summary: "x", details: [], nextSteps: [] });
    const icons = new Set([ready[0], degraded[0], notReady[0]]);
    expect(icons.size).toBe(3);
  });
});
