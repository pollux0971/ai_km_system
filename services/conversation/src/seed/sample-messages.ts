/**
 * Dev/E2E seed: 1 user + 1 assistant message per sample conversation
 * (E04-S042 spec §"技術決策" — "每筆 seed 對話 1 則 user + 1 則 assistant，
 * 內容取自前端 SAMPLE_CONVERSATIONS.lastMessagePreview")。
 *
 * ASSUMPTION (recorded in EVIDENCE): the spec names `lastMessagePreview` as
 * the content source for these two seeded messages but only explicitly ties
 * it to ONE of them. The assistant message uses it verbatim (a preview like
 * "保固期從出貨日起算 12 個月…" reads as an answer, not a question). The user
 * message has no equivalent source text anywhere in the spec/frontend
 * fixture, so it reuses the conversation's own `title` as a plausible stand-
 * in "question" — deterministic, not invented content unrelated to the seed
 * data.
 *
 * Runs AFTER `seedSampleConversations` (E04-S041) — it looks its 3
 * conversations up by the SAME deterministic UUID v5 recipe rather than by a
 * fresh query, so it depends only on that seed's own id derivation, not on
 * call ordering through a registry that does not exist yet (E02-S032).
 */
import type { Database } from "better-sqlite3";
import { toOwnerKey, type OwnerKey } from "../repository/owner-scope.js";
import { AI_KM_SEED_NAMESPACE, uuidV5 } from "./uuid-v5.js";
import { SAMPLE_CONVERSATION_SEEDS, type SandboxSeeder } from "./sample-conversations.js";

/**
 * Inserts 1 user + 1 assistant message for each of the 3 sample
 * conversations belonging to `ownerKey`, skipping any conversation that was
 * never seeded (defensive — `seedSampleConversations` is expected to have
 * already run, but this must not throw if it has not).
 */
export function seedSampleMessages(db: Database, ownerKey: OwnerKey): void {
  const owner = toOwnerKey(ownerKey);
  const findConversation = db.prepare(`SELECT id FROM conversations WHERE id = ? AND owner_key = ?`);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO messages
       (id, conversation_id, owner_key, role, content, attachment_names, created_at, updated_at)
     VALUES (@id, @conversation_id, @owner_key, @role, @content, '[]', @at, @at)`,
  );

  for (const sample of SAMPLE_CONVERSATION_SEEDS) {
    const conversationId = uuidV5(AI_KM_SEED_NAMESPACE, `${owner}:${sample.slot}`);
    const conversation = findConversation.get(conversationId, owner) as { id: string } | undefined;
    if (!conversation) continue;

    insert.run({
      id: uuidV5(AI_KM_SEED_NAMESPACE, `${owner}:${sample.slot}:user`),
      conversation_id: conversationId,
      owner_key: owner,
      role: "user",
      content: sample.title,
      at: sample.lastMessageAt,
    });
    insert.run({
      id: uuidV5(AI_KM_SEED_NAMESPACE, `${owner}:${sample.slot}:assistant`),
      conversation_id: conversationId,
      owner_key: owner,
      role: "assistant",
      content: sample.lastMessagePreview,
      at: sample.lastMessageAt,
    });
  }
}

/** Placeholder registry — see `sample-conversations.ts`'s equivalent for the full rationale. */
export const messageSandboxSeeders: readonly SandboxSeeder[] = [
  { name: "sample-messages", seed: seedSampleMessages },
];
