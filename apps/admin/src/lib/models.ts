import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S013 "Model admin". Reuses the exact model tiers and vocabulary
 * `apps/web`'s own `lib/ai-models.ts` (`AI_MODELS`/`AiModelOption`,
 * E03-S005) already establishes — same identity, not a coincidentally-
 * similar fictional set — grounded in
 * `archive/AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md`'s own numbered
 * baseline decisions (#28 Model 呼叫必須經過 Model Gateway、#29 外部
 * Cloud LLM 預設關閉、#30 第一優先部署策略為地端), not invented vendor
 * names. `ai-models.ts`'s own doc comment explicitly names this exact
 * story as the one that owns enabling the cloud tier: "Enabling it is
 * E11-S13 'Model Admin's job (Admin Console, not built), not this
 * story's."
 *
 * `id`/`label` are copied from `AI_MODELS`; the cloud tier's label
 * drops apps/web's own "（尚未啟用）" suffix baked into that string —
 * that suffix only made sense in a context with no dedicated status
 * display; this page already shows status as its own field (same
 * "status isn't embedded in the name" shape `users.ts`'s own `status`
 * field already establishes), so keeping the suffix would go stale the
 * moment an admin actually enables it.
 *
 * apps/admin and apps/web stay two independent apps with independent
 * mock stores (same boundary `ALL_ROLES`/`departments.ts`/`groups.ts`
 * already establish) — toggling a model's status here is a
 * self-contained UI-state mock and does NOT affect apps/web's own
 * conversation model selector or any real Model Gateway routing (that
 * belongs to E12 "Model & Prompt Platform", Team B, not built). See
 * EVIDENCE's Assumptions section for the full honesty note.
 */
export type ModelId = "standard" | "advanced-local" | "cloud";

export interface ModelOption {
  id: ModelId;
  label: string;
  status: "enabled" | "disabled";
}

const SEED_MODELS: ModelOption[] = [
  { id: "standard", label: "標準模型（地端）", status: "enabled" },
  { id: "advanced-local", label: "進階模型（地端）", status: "enabled" },
  { id: "cloud", label: "雲端模型", status: "disabled" },
];

const STORAGE_KEY = "ai-km:mock-admin-models";

/** Same sessionStorage-backed reasoning as users.ts's own readStore(). */
function readStore(): ModelOption[] {
  if (typeof window === "undefined") return SEED_MODELS;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SEED_MODELS;
  try {
    return JSON.parse(raw) as ModelOption[];
  } catch {
    return SEED_MODELS;
  }
}

function writeStore(models: ModelOption[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(models));
}

export async function listModels(): Promise<Result<ModelOption[], ApiError>> {
  return { ok: true, value: readStore() };
}

/** Two separate functions rather than one boolean toggle — same shape disableUser/enableUser already establish. */
export async function disableModel(id: string): Promise<Result<ModelOption, ApiError>> {
  const store = readStore();
  const existing = store.find((model) => model.id === id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個模型。" } };
  }

  const updated: ModelOption = { ...existing, status: "disabled" };
  writeStore(store.map((model) => (model.id === id ? updated : model)));
  return { ok: true, value: updated };
}

export async function enableModel(id: string): Promise<Result<ModelOption, ApiError>> {
  const store = readStore();
  const existing = store.find((model) => model.id === id);
  if (!existing) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個模型。" } };
  }

  const updated: ModelOption = { ...existing, status: "enabled" };
  writeStore(store.map((model) => (model.id === id ? updated : model)));
  return { ok: true, value: updated };
}
