"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { sanitizeReturnUrl } from "@ai-km/validation";
import { authClient } from "@/lib/auth";

const logger = createLogger("admin:login");

type FieldErrors = { username?: string; password?: string };

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; code: string; message: string };

/** Mirrors apps/web/src/app/(public)/login/login-form.tsx's error copy (E01-S012) — same codes, same wording. */
function describeError(code: string): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "帳號或密碼錯誤。";
    case "ACCOUNT_DISABLED":
      return "此帳號已停用，請聯絡管理員。";
    case "SERVICE_UNAVAILABLE":
      return "登入服務暫時無法使用，請稍後再試。";
    default:
      return "發生未預期的錯誤，請稍後再試。";
  }
}

/**
 * E11-S026 admin login page — the "minimal login page" the spec calls for:
 * same session-cookie login as apps/web's own LoginForm (E01-S002/S003),
 * without the SSO section or telemetry wiring apps/web additionally has
 * (out of this story's scope). `sanitizeReturnUrl` reuses E01-S003's own
 * open-redirect defense verbatim (same package, same adversarial vectors —
 * see login-form.test.tsx).
 */
export default function LoginForm() {
  const usernameId = useId();
  const passwordId = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  const submitting = state.status === "submitting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {};
    if (!username.trim()) errors.username = "請輸入帳號";
    if (!password) errors.password = "請輸入密碼";
    setFieldErrors(errors);
    if (errors.username || errors.password) {
      // fail-closed: no client call, no partial side effect.
      return;
    }

    const correlationId = crypto.randomUUID();
    setState({ status: "submitting" });
    logger.info("login attempt", { correlationId, username });

    const result = await authClient.login({ username, password });

    if (result.ok) {
      logger.info("login succeeded", { correlationId, username });
      setState({ status: "success" });
      const destination = sanitizeReturnUrl(searchParams.get("returnUrl"));
      router.push(destination);
      return;
    }

    logger.warn("login failed", { correlationId, username, code: result.error.code });
    setState({ status: "error", code: result.error.code, message: describeError(result.error.code) });
  }

  return (
    <main className="login-card">
      <h1>AI KM 管理主控台登入</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={usernameId}>帳號</label>
          <br />
          <input
            id={usernameId}
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            disabled={submitting}
            onChange={(event) => setUsername(event.target.value)}
            aria-invalid={Boolean(fieldErrors.username)}
            aria-describedby={fieldErrors.username ? `${usernameId}-error` : undefined}
          />
          {fieldErrors.username && (
            <p id={`${usernameId}-error`} role="alert">
              {fieldErrors.username}
            </p>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor={passwordId}>密碼</label>
          <br />
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={submitting}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? `${passwordId}-error` : undefined}
          />
          {fieldErrors.password && (
            <p id={`${passwordId}-error`} role="alert">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? "登入中…" : "登入"}
        </button>
      </form>

      {state.status === "success" && (
        <p role="status" style={{ marginTop: 16 }}>
          登入成功。
        </p>
      )}
      {state.status === "error" && (
        <div style={{ marginTop: 16 }}>
          <ErrorMessage message={state.message} />
        </div>
      )}
    </main>
  );
}
