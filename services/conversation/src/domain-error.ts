/**
 * A deliberate domain-level HTTP failure (403/404/400 business-rule cases
 * this route layer decides itself, as opposed to schema validation Fastify
 * already rejects automatically).
 *
 * Not `apps/api/src/errors.ts`'s `ApiHttpError` — see `plugin-types.ts` for
 * why this package cannot depend on that class. `apps/api`'s real error
 * handler still produces the CONTRACT-correct `{code, message}` envelope
 * for this: its fallback branch keys off `typeof error.statusCode ===
 * "number"` and maps the status to the same stable `code` regardless of
 * the thrown error's class, using its own generic Traditional-Chinese
 * message for that code. The contract only requires `code` (enum-correct)
 * and `message: string` — it never pins an exact wording — so this is
 * fully contract-compliant, just less specific than a hand-authored
 * message would be. See EVIDENCE for the full reasoning.
 */
export class ConversationDomainError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ConversationDomainError";
    this.statusCode = statusCode;
  }
}
