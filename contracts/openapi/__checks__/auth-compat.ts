/**
 * E02-S031 Functional AC1 — typecheck-only proof that
 * `contracts/openapi/auth.yaml` produces types compatible with the
 * `@ai-km/auth-client` shapes apps/web has used since E01.
 *
 * Never executed, never bundled. See ./README.md for the commands.
 */
import type { components } from "./generated/auth.js";
import type {
  AuthSession,
  AuthErrorCode,
  LoginCredentials,
} from "../../../packages/auth-client/src/index.js";

type Schemas = components["schemas"];

type AssignableTo<A extends B, B> = A extends B ? true : never;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** The contract's session must be usable everywhere the existing one is. */
export const sessionAssignable: AssignableTo<Schemas["AuthSession"], AuthSession> = true;

/**
 * The domain error codes must be exactly `AuthErrorCode`. Narrower would make
 * a failure the client already handles unrepresentable; wider would mean the
 * client has an unhandled branch.
 */
export const errorCodesExact: Exact<Schemas["AuthErrorCode"], AuthErrorCode> = true;

/**
 * `LoginRequest` bound (E04-S076) against the client's real credentials type
 * instead of only being checked against itself (see `loginRequestTokenFree`
 * below, which is a different, still-needed check — it guards the CONTRACT
 * shape for a forbidden field, not compatibility with an implementation;
 * adding this binding does not make it redundant).
 *
 * WHICH DIRECTION, AND WHY (same argument as `generation-compat.ts`'s
 * `modelAssignable`/`chunkIdFromHit`, and the mirror image of
 * `sessionAssignable` above): `LoginRequest` is a REQUEST the client
 * PRODUCES and the contract schema describes what the server will accept.
 * The meaningful question is "does what the client actually sends satisfy
 * what the contract requires", i.e. is `LoginCredentials` (impl) assignable
 * to `Schemas["LoginRequest"]` (contract) — not the reverse, which would
 * instead be asking "is every field the contract could produce also one the
 * client happens to send", a question that only makes sense for a value the
 * SERVER produces and the client consumes (that is what `sessionAssignable`
 * asks about `AuthSession`, a response). An implementation type carrying
 * MORE fields than the contract requires would still be fine in this
 * direction — assignability tolerates extra fields — which is the "an
 * implementation carrying more fields than the contract is allowed" case.
 *
 * Not `Exact`: `auth.yaml`'s `LoginRequest` also declares
 * `additionalProperties: false`, but that is a runtime-only constraint —
 * openapi-typescript does not encode it as a closed type (no index
 * signature is added either way), so there is nothing at the type level for
 * `Exact` to strengthen here; asking for bidirectional equality would just
 * be asserting today's field list is frozen, which is not a property this
 * seam needs. `Exact`/bidirectional is reserved for cases like
 * `errorCodesExact` above, where both sides genuinely must match one-for-one.
 *
 * CHECKED, NO DIVERGENCE FOUND: both sides are today exactly
 * `{ username: string; password: string }` — `AssignableTo` holds trivially
 * in both directions right now, but the direction asserted below is the one
 * that stays true if either side later adds a field, which is the actual
 * point of pinning a direction instead of whichever happens to compile.
 */
export const loginRequestBindable: AssignableTo<LoginCredentials, Schemas["LoginRequest"]> = true;

const sessionSample: Schemas["AuthSession"] = {
  userId: "demo-user",
  roles: ["general_user"],
  expiresAt: "2026-09-04T05:12:00.000Z",
  name: "示範使用者",
  email: "demo-user@example.com",
  department: "工程部",
  group: "平台組",
};
export const session: AuthSession = sessionSample;

/** A session with only the required fields must still satisfy the client. */
const minimalSample: Schemas["AuthSession"] = {
  userId: "demo-user",
  roles: [],
  expiresAt: "2026-09-04T05:12:00.000Z",
};
export const minimalSession: AuthSession = minimalSample;

/**
 * Security AC — a session token must never be representable in a response
 * body. These resolve to `never` if any token-ish field appears.
 */
type TokenFreeKeys<T> = Extract<keyof T, "token" | "sessionToken" | "accessToken" | "sessionId">;
type TokenFree<T> = [TokenFreeKeys<T>] extends [never] ? true : never;

export const sessionTokenFree: TokenFree<Schemas["AuthSession"]> = true;
export const loginRequestTokenFree: TokenFree<Schemas["LoginRequest"]> = true;

/** Nor may a client name the user it wants to be. */
type OwnerFreeKeys<T> = Extract<keyof T, "userId" | "ownerKey" | "roles">;
type OwnerFree<T> = [OwnerFreeKeys<T>] extends [never] ? true : never;
export const loginRequestOwnerFree: OwnerFree<Schemas["LoginRequest"]> = true;
