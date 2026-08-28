/**
 * Dev/E2E seed: the 3 sample conversations (E04-S041 spec §"Dev seed").
 *
 * Content is field-for-field identical to `SAMPLE_CONVERSATIONS` in
 * `apps/web/src/lib/conversations.ts` (title, lastMessageAt, preview, mode,
 * knowledgeScopes, model) — that is the frozen source of truth this seed
 * exists to reproduce server-side, not a new invention.
 *
 * Ids are derived from `ownerKey` with UUID v5 rather than hard-coded, so
 * calling this twice for the same owner is idempotent (AC11) without a
 * separate "already seeded" flag, and two different owners' sandboxes never
 * collide on id.
 *
 * `E02-S032` (not yet merged as of this story) is expected to own the real
 * `sandboxSeeders` registry and call into this. Until it exists,
 * `conversationSandboxSeeders` is this package's own placeholder export —
 * E02-S032 can import it from `@ai-km/service-conversation` once it lands,
 * without this story inventing E02-S032's registry shape.
 */
import type { Database } from "better-sqlite3";
import { toOwnerKey, type OwnerKey } from "../repository/owner-scope.js";
import { AI_KM_SEED_NAMESPACE, uuidV5 } from "./uuid-v5.js";

interface SampleConversationSeed {
  readonly slot: string;
  readonly title: string;
  readonly lastMessageAt: string;
  readonly lastMessagePreview: string;
  readonly mode: "normal" | "advanced";
  readonly knowledgeScopes: readonly string[];
  readonly model: "standard" | "advanced-local" | "cloud";
}

/** Verbatim copy of apps/web's SAMPLE_CONVERSATIONS — see file header. */
const SAMPLES: readonly SampleConversationSeed[] = [
  {
    slot: "sample-1",
    title: "產品保固政策詢問",
    lastMessageAt: "2026-08-12T09:15:00.000Z",
    lastMessagePreview: "保固期從出貨日起算 12 個月，涵蓋原廠零件更換。",
    mode: "normal",
    knowledgeScopes: ["company", "qna"],
    model: "standard",
  },
  {
    slot: "sample-2",
    title: "設備 E-204 錯誤代碼排查",
    lastMessageAt: "2026-08-11T14:30:00.000Z",
    lastMessagePreview: "請確認感測器接線是否鬆脫，並重新校正歸零。",
    mode: "normal",
    knowledgeScopes: [],
    model: "standard",
  },
  {
    slot: "sample-3",
    title: "Q3 銷售報表彙整",
    lastMessageAt: "2026-08-10T02:00:00.000Z",
    lastMessagePreview: "本季華北區成長 12%，主要來自新客戶導入。",
    mode: "advanced",
    knowledgeScopes: [],
    model: "advanced-local",
  },
];

/**
 * Inserts the 3 sample conversations for `ownerKey`, skipping any that
 * already exist (by the owner-derived id) — safe to call on every sandbox
 * startup.
 */
export function seedSampleConversations(db: Database, ownerKey: OwnerKey): void {
  const owner = toOwnerKey(ownerKey);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO conversations
       (id, owner_key, title, mode, knowledge_scopes, model, archived, last_message_at, last_message_preview, created_at, updated_at)
     VALUES (@id, @owner_key, @title, @mode, @knowledge_scopes, @model, 0, @last_message_at, @last_message_preview, @created_at, @updated_at)`,
  );

  for (const sample of SAMPLES) {
    insert.run({
      id: uuidV5(AI_KM_SEED_NAMESPACE, `${owner}:${sample.slot}`),
      owner_key: owner,
      title: sample.title,
      mode: sample.mode,
      knowledge_scopes: JSON.stringify(sample.knowledgeScopes),
      model: sample.model,
      last_message_at: sample.lastMessageAt,
      last_message_preview: sample.lastMessagePreview,
      // No message has ever been sent in a seeded sample, so createdAt is
      // set to the same instant as lastMessageAt — the same rule
      // createConversation uses for a brand new, message-less conversation.
      created_at: sample.lastMessageAt,
      updated_at: sample.lastMessageAt,
    });
  }
}

export interface SandboxSeeder {
  readonly name: string;
  seed(db: Database, ownerKey: OwnerKey): void;
}

/**
 * Placeholder registry — see file header. E02-S032 is expected to fold
 * this into its own cross-domain `sandboxSeeders` list.
 */
export const conversationSandboxSeeders: readonly SandboxSeeder[] = [
  { name: "sample-conversations", seed: seedSampleConversations },
];
