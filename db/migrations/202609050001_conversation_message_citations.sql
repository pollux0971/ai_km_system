-- 03-conversation/phase-2 (I2, ADR 0016) — a message produced through the
-- RAG path carries its grounding citations.
--
-- Additive only (db/migrations/README.md "Adding one"): a new, nullable
-- column on the existing `messages` table from
-- `202608280001_conversation_domain.sql`. NULL means "this message was never
-- produced by the RAG path" (absent in the API response — ADR 0016 D3);
-- `'[]'` means "the RAG path ran and found nothing to cite" (an empty array
-- in the API response). The repository layer (`messages.repository.ts`)
-- is what turns NULL into a genuinely absent JSON key rather than `null`.
--
-- Shape mirrors `contracts/openapi/conversations.yaml`'s `Message.citations`
-- (itself `$ref`-ing `generation.yaml`'s `Citation`): an array of
-- `{chunkId, documentId, startOffset, endOffset}`.
ALTER TABLE messages
  ADD COLUMN citations TEXT CHECK (citations IS NULL OR json_valid(citations));
