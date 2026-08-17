import { beforeEach, describe, expect, it } from "vitest";
import { disableModel, enableModel, listModels } from "./models";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("listModels (E11-S013)", () => {
  it("returns the seeded models, reusing the exact tiers apps/web's own AI_MODELS already establishes", async () => {
    const result = await listModels();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      { id: "standard", label: "標準模型（地端）", status: "enabled" },
      { id: "advanced-local", label: "進階模型（地端）", status: "enabled" },
      { id: "cloud", label: "雲端模型", status: "disabled" },
    ]);
  });
});

describe("disableModel (E11-S013)", () => {
  it("disables an enabled model and persists it, visible via a subsequent listModels() call", async () => {
    const result = await disableModel("standard");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("disabled");

    const list = await listModels();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value.find((model) => model.id === "standard")?.status).toBe("disabled");
  });

  it("only changes the targeted model's status, leaving every other model untouched", async () => {
    const before = await listModels();
    if (!before.ok) throw new Error("expected ok");
    const othersBefore = before.value.filter((model) => model.id !== "standard");

    await disableModel("standard");

    const after = await listModels();
    if (!after.ok) throw new Error("expected ok");
    const othersAfter = after.value.filter((model) => model.id !== "standard");
    expect(othersAfter).toEqual(othersBefore);
  });

  it("returns NOT_FOUND for an unknown model id", async () => {
    const result = await disableModel("not-a-real-model");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("enableModel (E11-S013)", () => {
  it("enables a disabled model (e.g. cloud) and persists it, visible via a subsequent listModels() call", async () => {
    const result = await enableModel("cloud");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("enabled");

    const list = await listModels();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value.find((model) => model.id === "cloud")?.status).toBe("enabled");
  });

  it("returns NOT_FOUND for an unknown model id", async () => {
    const result = await enableModel("not-a-real-model");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
  });
});
