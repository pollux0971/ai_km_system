/**
 * `evidence-tier.ts` (Provider Fidelity gate) — until now had ZERO test
 * coverage anywhere in the repo, discovered while retiring
 * `services/rag-skeleton` (E04-S064). `@ai-km/rag-skeleton`'s
 * `walking-skeleton.integration.test.ts` ("provider fidelity 守門" describe
 * block) and `fake-server-contract.integration.test.ts`'s AC-C1 exercised
 * `requireProviderFidelity`/`effectiveFidelity` only through
 * `RagPipeline.fidelity`/`RagPipeline.requireFidelity()` — a thin
 * pass-through with no logic of its own. Deleting the skeleton without
 * relocating these left the actual gating logic (this file) with no test at
 * all: a gate nobody has ever proven can fire is not a gate.
 */
import { describe, expect, it } from "vitest";
import {
  effectiveFidelity,
  requireProviderFidelity,
  ProviderFidelityError,
  type FidelityRatedComponent,
} from "./evidence-tier.js";

const PF1_EMBEDDING: FidelityRatedComponent = { componentId: "embedding:deterministic", fidelityCeiling: "PF1" };
const PF1_GENERATION: FidelityRatedComponent = { componentId: "generation:canned", fidelityCeiling: "PF1" };
const PF1_STORE: FidelityRatedComponent = { componentId: "vector-store:in-memory", fidelityCeiling: "PF1" };
const PF2_EMBEDDING: FidelityRatedComponent = { componentId: "embedding:http-fake", fidelityCeiling: "PF2" };
const PF2_GENERATION: FidelityRatedComponent = { componentId: "generation:http-fake", fidelityCeiling: "PF2" };

describe("evidence-tier — provider fidelity gate (relocated from rag-skeleton)", () => {
  it(
    "AC-F1 (PF2) 這組測試宣稱的層級與實際元件相符:宣稱 PF2 時 PF2 元件通過," +
      "宣稱 PF3 時同樣的 PF2 元件被擋下,且錯誤訊息點名 PF3",
    () => {
      // Relocation of rag-skeleton's fake-server-contract AC-C1.
      expect(() => requireProviderFidelity("PF2", [PF2_EMBEDDING, PF2_GENERATION])).not.toThrow();
      expect(() => requireProviderFidelity("PF3", [PF2_EMBEDDING, PF2_GENERATION])).toThrow(/PF3/);
    },
  );

  it(
    "AC-F2 (PF1) 宣稱 PF3 但元件上限只有 PF1 時,requireProviderFidelity 在斷言之前就丟出 " +
      "ProviderFidelityError,且錯誤訊息點名違規元件",
    () => {
      // Relocation of rag-skeleton's walking-skeleton "宣稱 PF3 但使用假
      // provider 時,測試在斷言之前就失敗".
      const components = [PF1_EMBEDDING, PF1_GENERATION, PF1_STORE];
      expect(effectiveFidelity(components)).toBe("PF1");
      expect(() => requireProviderFidelity("PF3", components)).toThrow(ProviderFidelityError);
      expect(() => requireProviderFidelity("PF3", components)).toThrow(/embedding:deterministic/);
    },
  );

  it("AC-F3 (PF1) 宣稱 PF1 時通過——較低層級的宣稱不受阻擋", () => {
    // Relocation of rag-skeleton's walking-skeleton "宣稱 PF1 時通過".
    const components = [PF1_EMBEDDING, PF1_GENERATION, PF1_STORE];
    expect(() => requireProviderFidelity("PF1", components)).not.toThrow();
  });
});
