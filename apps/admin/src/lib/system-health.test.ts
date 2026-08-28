import { describe, expect, it } from "vitest";
import { getSystemHealth } from "./system-health";
import { failNextRequest, setHealth } from "@/test/fake-api";

describe("getSystemHealth (E11-S022, E13-S021 real API)", () => {
  it("AC5: returns all 4 real subsystems, none unknown, when every check passes", async () => {
    const result = await getSystemHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subsystems.map((s) => s.name).sort()).toEqual(["api", "asr", "database", "migrations"]);
    expect(result.value.subsystems.every((s) => s.status === "ok")).toBe(true);
  });

  it("surfaces a degraded subsystem with its detail message", async () => {
    setHealth([
      { name: "api", status: "ok" },
      { name: "database", status: "ok" },
      { name: "migrations", status: "ok" },
      { name: "asr", status: "degraded", detail: "whisper-server 未回應健康檢查。" },
    ]);

    const result = await getSystemHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const asr = result.value.subsystems.find((s) => s.name === "asr");
    expect(asr?.status).toBe("degraded");
    expect(asr?.detail).toBe("whisper-server 未回應健康檢查。");
  });

  it("AC2: a 403 from the server surfaces as a PERMISSION_DENIED error", async () => {
    failNextRequest("health", 403, "PERMISSION_DENIED");

    const result = await getSystemHealth();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
  });
});
