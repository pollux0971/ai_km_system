import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S011 "Knowledge admin". Field names (`id`/`name`/`description`/
 * `updatedAt`) and seed content are deliberately identical to
 * `apps/web`'s own `KnowledgeBaseSummary`/`SAMPLE_KNOWLEDGE_BASES`
 * (`lib/knowledge-bases.ts`, E05-S001) — same "same identity, not a
 * coincidentally-similar fictional one" reasoning `users.ts`'s own
 * `SAMPLE_USERS` doc comment already establishes for reusing
 * `@ai-km/auth-client`'s real accounts. apps/admin and apps/web stay
 * two independent apps with independent mock stores (same boundary
 * `ALL_ROLES` already establishes in `users.ts` — "not from apps/web
 * cross-app import"), so this is a separate, parallel seed, not a
 * shared import.
 *
 * Unlike `E11-S009`/`E11-S010` (Department/Group — nothing else in this
 * codebase could create those entities, so their own admin story owns
 * list+create), Knowledge Base already has a full, real creation and
 * management flow living in `apps/web`'s own E05 epic (30 approved
 * stories: search, permissions, members, prompt/model binding, folder
 * sync, document lifecycle...). This story is a read-only admin
 * oversight list — same shape `RoleList` (E11-S006) already establishes
 * for a read-only list — not a second, disconnected creation surface
 * for an entity that already has one canonical owner.
 */
export interface KnowledgeBaseSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

const SAMPLE_KNOWLEDGE_BASES: KnowledgeBaseSummary[] = [
  {
    id: "kb-sample-1",
    name: "產品保固政策",
    description: "保固期限、涵蓋範圍與理賠流程等相關文件。",
    updatedAt: "2026-08-13T01:00:00.000Z",
  },
  {
    id: "kb-sample-2",
    name: "設備維修標準作業程序",
    description: "常見設備故障排除步驟與維修 SOP 文件集。",
    updatedAt: "2026-08-11T06:30:00.000Z",
  },
  {
    id: "kb-sample-3",
    name: "人力資源與請假規範",
    description: "請假、加班、差旅申請等人資相關政策文件。",
    updatedAt: "2026-08-09T02:15:00.000Z",
  },
];

export async function listKnowledgeBases(): Promise<Result<KnowledgeBaseSummary[], ApiError>> {
  return { ok: true, value: SAMPLE_KNOWLEDGE_BASES };
}
