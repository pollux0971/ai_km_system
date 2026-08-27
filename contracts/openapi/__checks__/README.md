# contracts/openapi/__checks__

Typecheck-only gates for the contracts in `contracts/openapi/`. Nothing here
ships, is bundled, or is executed — these files exist so that a contract
cannot drift away from the shapes its consumers already depend on without
something going red.

Introduced by **E04-S038** (Functional AC2).

## What `conversations-compat.ts` proves

It imports the **real** frontend types (`apps/web/src/lib/conversations.ts`,
`messages.ts`, `answer-state.ts`, `knowledge-scopes.ts`, `ai-models.ts`) — not
a hand-copied mirror — and asserts, at compile time, that:

- the contract's `ConversationMode`, `AiModel`, `KnowledgeScope`,
  `AnswerState`, `AnswerFeedbackVerdict` and `FeedbackReason` enums are
  **exactly** the frontend unions (a merely *narrower* contract would make
  values the UI can already produce unrepresentable, so assignability alone is
  not enough here);
- `Conversation`, `ConversationListPage` and `Message` are assignable to
  `ConversationSummary`, `ConversationListPage` and `Message`;
- no request or entity schema carries an owner-naming field
  (`userId` / `ownerKey` / `ownerId` / `owner`) — the Security AC that
  ownership is decided server-side from the session.

## Running it

```bash
# 1. regenerate the types from the contract
pnpm --filter @ai-km/api-client exec openapi-typescript \
  ../../contracts/openapi/conversations.yaml \
  -o ../../contracts/openapi/__checks__/generated/conversations.d.ts

# 2. the gate itself
./node_modules/.bin/tsc -p contracts/openapi/__checks__/tsconfig.json --noEmit

# 3. spec lint (0 errors required)
pnpm --package=@redocly/cli@1.25.11 dlx redocly lint \
  contracts/openapi/conversations.yaml
```

`generated/` is committed so a reviewer can run step 2 without step 1, and so
that a contract change that breaks compatibility shows up as a reviewable
diff rather than only as a local failure.

## Not yet wired into CI

E04-S038's development boundary allows `contracts/**` only, so this gate is
not registered in `turbo.json` / the root `package.json` scripts. **E03-S034**
(`@ai-km/api-client` codegen pipeline + drift gate) is the story that owns
that wiring; until it lands, run the commands above by hand.
