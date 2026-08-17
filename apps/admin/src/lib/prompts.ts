import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S012 "Prompt admin". `Prompt` is this file's own local entity —
 * unlike `departments.ts`/`groups.ts` (E11-S009/S010, real names
 * already existed elsewhere in this codebase as free text to seed
 * from), no real prompt TEXT exists anywhere in this repo yet, so
 * there's nothing genuine to reuse — inventing specific prompt wording
 * would be fabricating a product/business decision this story has no
 * authority to make. This starts with an empty catalog instead; admins
 * populate it via `createPrompt`, and the E2E test exercises that
 * create path directly rather than asserting invented seed content.
 *
 * `contracts/` has no prompt schema (same "not yet populated" situation
 * `contracts/permissions/README.md` already documents for the sibling
 * Role/Permission concept). `AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md`
 * names "E12-S18 Prompt registry"/"E12-S19 Prompt version entity" as
 * Team B's (E12 "Model & Prompt Platform") job to define, not yet
 * built — `apps/web`'s own `knowledge-prompt-editor.tsx` doc comment
 * (E05-S008) already anticipates this exact story by name ("E11-S12
 * 'Prompt Admin' ... not yet built") as the future owner of a real
 * Prompt entity. Same "self-contained frontend mock, not blocked on
 * Team B" treatment `departments.ts`'s own doc comment already
 * establishes.
 */
export interface Prompt {
  promptId: string;
  name: string;
  content: string;
}

const SEED_PROMPTS: Prompt[] = [];

const STORAGE_KEY = "ai-km:mock-admin-prompts";

/** Same sessionStorage-backed reasoning as departments.ts's own readStore(). */
function readStore(): Prompt[] {
  if (typeof window === "undefined") return SEED_PROMPTS;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return SEED_PROMPTS;
  try {
    return JSON.parse(raw) as Prompt[];
  } catch {
    return SEED_PROMPTS;
  }
}

function writeStore(prompts: Prompt[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
}

export async function listPrompts(): Promise<Result<Prompt[], ApiError>> {
  return { ok: true, value: readStore() };
}

/** Both `name` (identifies the prompt) and `content` (its actual text) are required. */
export async function createPrompt(input: { name: string; content: string }): Promise<Result<Prompt, ApiError>> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入提示詞名稱。" } };
  }

  const content = input.content.trim();
  if (!content) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入提示詞內容。" } };
  }

  const prompt: Prompt = { promptId: crypto.randomUUID(), name, content };
  writeStore([...readStore(), prompt]);
  return { ok: true, value: prompt };
}
