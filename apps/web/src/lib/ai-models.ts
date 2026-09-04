export type AiModel = "standard" | "advanced-local" | "cloud";

export interface AiModelOption {
  id: AiModel;
  label: string;
  disabled?: boolean;
}

/**
 * E03-S005: no source in archive/AI_KM_BMAD_High_Granularity/ names any real
 * model/vendor (grepped for GPT/Claude/Gemini/OpenAI/Anthropic/Llama/
 * Mistral repo-wide — zero hits); the real model registry belongs to
 * E12 (Model & Prompt Platform, Team B), which doesn't exist yet. These
 * three generic options are grounded in SOURCE_BASELINE.md's numbered
 * baseline decisions instead of invented vendor names:
 *   28. Model 呼叫必須經過 Model Gateway.
 *   29. 外部 Cloud LLM 預設關閉.
 *   30. 第一優先部署策略為地端或 Private Environment.
 * — two on-prem/private options enabled by default, one cloud option
 * present but disabled (not hidden — visibly communicates the
 * capability exists but isn't turned on, rather than pretending it
 * doesn't exist). Enabling it is E11-S13 "Model Admin"'s job (Admin
 * Console, not built), not this story's.
 */
export const AI_MODELS: AiModelOption[] = [
  { id: "standard", label: "標準模型（地端）" },
  { id: "advanced-local", label: "進階模型（地端）" },
  { id: "cloud", label: "雲端模型（尚未啟用）", disabled: true },
];

export const DEFAULT_AI_MODEL: AiModel = "standard";
