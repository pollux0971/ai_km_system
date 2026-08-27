/**
 * E02-S031 Functional AC1 — typecheck-only proof that
 * `contracts/openapi/auth.yaml` produces types compatible with the
 * `@ai-km/auth-client` shapes apps/web has used since E01.
 *
 * Never executed, never bundled. See ./README.md for the commands.
 */
import type { components } from "./generated/auth.js";
import type { AuthSession, AuthErrorCode } from "../../../packages/auth-client/src/index.js";

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
