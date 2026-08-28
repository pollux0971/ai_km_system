/**
 * Identity domain Fastify plugin (E02-S032, ADR 0005).
 *
 * `POST /auth/login`, `POST /auth/logout`, `GET /auth/session` — the frozen
 * slice of contracts/openapi/auth.yaml (E02-S031) — plus the real
 * `requireSession` that composes over whatever apps/api/src/auth-decorator.ts
 * (E04-S039) had already decorated (see require-session.ts's docstring for
 * why that composition, not a replacement).
 *
 * Wrapped in `fastify-plugin` so `app.requireSession = …` mutates the SAME
 * instance every other domain plugin sees — without it, Fastify's
 * encapsulation would give this plugin its own child instance and the
 * override would be invisible everywhere else.
 */
import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { loadIdentityConfig, type IdentityConfig } from "./config.js";
import { DUMMY_SALT, dummyHash, generateSessionToken, hashSessionToken, verifyPassword } from "./crypto.js";
import {
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  findSessionWithUserByTokenHash,
  findUserByUsername,
  identityTablesExist,
  insertSession,
  seedDemoUsers,
  type UserRow,
} from "./repository.js";
import { runSandboxSeeders } from "./sandbox-seeders.js";
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_LIMIT_MS,
  buildRealRequireSession,
  clearSessionCookie,
  composeRequireSession,
  setSessionCookie,
} from "./require-session.js";
// `fastify-types.d.ts` is a pure ambient-declaration file (module
// augmentation only, no runtime exports); tsconfig's `include: ["src"]`
// already pulls it into this package's typecheck without an explicit
// import — and importing it as a value here would make the bundler go
// looking for a compiled fastify-types.js that does not exist.

const LOGIN_REQUEST_SCHEMA = {
  type: "object",
  required: ["username", "password"],
  additionalProperties: false,
  properties: {
    username: { type: "string", minLength: 1, maxLength: 64 },
    password: { type: "string", minLength: 1, maxLength: 256 },
  },
} as const;

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

interface AuthSessionBody {
  userId: string;
  roles: string[];
  expiresAt: string;
  name: string;
  email: string;
  department: string;
  group: string;
}

function toAuthSessionBodyFromUser(user: UserRow, expiresAtIso: string): AuthSessionBody {
  return {
    userId: user.id,
    roles: JSON.parse(user.roles) as string[],
    expiresAt: expiresAtIso,
    name: user.name,
    email: user.email,
    department: user.department,
    group: user.group_name,
  };
}

function sweepExpiredSessions(app: FastifyInstance): void {
  // No-op before migrations have run (AI_KM_AUTO_MIGRATE=false deploys) —
  // see identityTablesExist's docstring. Checked on every call, not cached,
  // since the hourly interval can outlive an in-place migration.
  if (!identityTablesExist(app.db)) return;
  const nowMs = Date.now();
  const removed = deleteExpiredSessions(
    app.db,
    new Date(nowMs).toISOString(),
    new Date(nowMs - SESSION_IDLE_LIMIT_MS).toISOString(),
  );
  if (removed > 0) app.log.debug({ removed }, "swept expired/idle sessions");
}

function buildLoginHandler(app: FastifyInstance, config: IdentityConfig) {
  return async function login(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    const { username, password } = request.body as { username: string; password: string };

    // Dev trigger (AC6): checked before any DB lookup, so it works even for
    // a username with no seeded row, and never fires unless explicitly
    // enabled — loadIdentityConfig already refuses to start with this true
    // in production.
    if (config.devTriggers && username === "service-error") {
      reply.code(503);
      return { code: "SERVICE_UNAVAILABLE", message: "認證服務暫時無法使用,請稍後再試。" };
    }

    const user = findUserByUsername(app.db, username);
    if (!user) {
      // AC2: pay for a real scrypt computation even though there is no row,
      // so "unknown username" and "wrong password" cost the same wall clock.
      await verifyPassword(password, DUMMY_SALT, await dummyHash());
      reply.code(401);
      return { code: "INVALID_CREDENTIALS", message: "帳號或密碼不正確。" };
    }

    const passwordOk = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!passwordOk) {
      reply.code(401);
      return { code: "INVALID_CREDENTIALS", message: "帳號或密碼不正確。" };
    }

    // Disabled is revealed only once the password is proven correct — see
    // ADR 0005 / auth.yaml's AccountDisabled description for why that
    // ordering matters: a disabled account with a WRONG password must stay
    // indistinguishable from any other wrong-password attempt.
    if (user.disabled === 1) {
      reply.code(403);
      return { code: "ACCOUNT_DISABLED", message: "此帳號已停用,請聯絡系統管理員。" };
    }

    const ownerKey = config.testSandbox ? `${user.id}:sbx:${randomUUID()}` : user.id;
    if (config.testSandbox) {
      await runSandboxSeeders(ownerKey);
    }

    const token = generateSessionToken();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresAtIso = new Date(nowMs + SESSION_ABSOLUTE_TTL_MS).toISOString();

    insertSession(app.db, {
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      userId: user.id,
      ownerKey,
      createdAt: nowIso,
      lastSeenAt: nowIso,
      expiresAt: expiresAtIso,
    });

    setSessionCookie(reply, request, token);
    reply.code(200);
    return toAuthSessionBodyFromUser(user, expiresAtIso);
  };
}

function buildLogoutHandler(app: FastifyInstance) {
  return async function logout(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token === "string" && token.length > 0) {
      deleteSessionByTokenHash(app.db, hashSessionToken(token));
    }
    clearSessionCookie(reply, request);
    reply.code(204);
    return reply.send();
  };
}

function buildSessionHandler(app: FastifyInstance) {
  return async function getSession(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
    // requireSession already proved this cookie is valid and populated
    // request.auth; re-reading it here gets the profile fields (name/email/…)
    // that AuthContext deliberately does not carry.
    const token = request.cookies?.[SESSION_COOKIE_NAME] as string;
    const row = findSessionWithUserByTokenHash(app.db, hashSessionToken(token));
    if (!row) {
      // Vanishingly unlikely (requireSession just found it), but if the row
      // disappeared between the preHandler and here, fail closed rather than
      // synthesise a response from stale request.auth data.
      reply.code(401);
      return { code: "UNAUTHENTICATED", message: "請先登入。" };
    }
    reply.code(200);
    const body: AuthSessionBody = {
      userId: row.user_id,
      roles: JSON.parse(row.roles) as string[],
      expiresAt: row.expires_at,
      name: row.name,
      email: row.email,
      department: row.department,
      group: row.group_name,
    };
    return body;
  };
}

const identityPluginImpl: FastifyPluginAsync = async (app) => {
  const config = loadIdentityConfig();

  // The E04-S039 seam this plugin composes over — see require-session.ts.
  // Read defensively: outside a full apps/api server (e.g. this package's
  // own tests) nothing may have decorated it yet.
  const previousRequireSession: preHandlerHookHandler | undefined =
    typeof app.requireSession === "function" ? app.requireSession : undefined;

  // Registration must not crash a server started with AI_KM_AUTO_MIGRATE=false
  // before its first `pnpm migrate` — see identityTablesExist's docstring.
  if (identityTablesExist(app.db)) {
    await seedDemoUsers(app.db, config, new Date().toISOString());
  }

  sweepExpiredSessions(app);
  const cleanupTimer = setInterval(() => sweepExpiredSessions(app), CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
  app.addHook("onClose", async () => {
    clearInterval(cleanupTimer);
  });

  const realRequireSession = buildRealRequireSession(app.db);
  app.requireSession = composeRequireSession(realRequireSession, previousRequireSession);

  app.post("/v1/auth/login", { schema: { body: LOGIN_REQUEST_SCHEMA } }, buildLoginHandler(app, config));
  app.post("/v1/auth/logout", buildLogoutHandler(app));
  app.get("/v1/auth/session", { preHandler: realRequireSession }, buildSessionHandler(app));
};

export const identityPlugin = fp(identityPluginImpl, { name: "ai-km-identity" });
