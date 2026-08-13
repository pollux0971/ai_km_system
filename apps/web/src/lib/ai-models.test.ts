import { describe, expect, it } from "vitest";
import { AI_MODELS, DEFAULT_AI_MODEL } from "./ai-models";

describe("AI_MODELS (E03-S005)", () => {
  it("has exactly the three generic model options", () => {
    expect(AI_MODELS.map((option) => option.id)).toEqual(["standard", "advanced-local", "cloud"]);
  });

  it("the cloud option is disabled by default, per SOURCE_BASELINE decision #29", () => {
    const cloud = AI_MODELS.find((option) => option.id === "cloud");
    expect(cloud?.disabled).toBe(true);
  });

  it("the two on-prem/local options are enabled", () => {
    const standard = AI_MODELS.find((option) => option.id === "standard");
    const advancedLocal = AI_MODELS.find((option) => option.id === "advanced-local");
    expect(standard?.disabled).toBeFalsy();
    expect(advancedLocal?.disabled).toBeFalsy();
  });
});

describe("DEFAULT_AI_MODEL", () => {
  it("defaults to an enabled (non-disabled) model", () => {
    const defaultOption = AI_MODELS.find((option) => option.id === DEFAULT_AI_MODEL);
    expect(defaultOption?.disabled).toBeFalsy();
  });
});
