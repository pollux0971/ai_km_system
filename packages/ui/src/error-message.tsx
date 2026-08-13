import type { ReactNode } from "react";
import { colors } from "@ai-km/design-tokens";

/**
 * E01-S012: unified HTTP/domain error presentation. Semantic codes
 * (matching this codebase's convention — see packages/auth-client's
 * AuthErrorCode — of machine-readable names rather than bare numeric
 * status) mapped to a safe, generic Chinese message. Comments note the
 * typical HTTP status each corresponds to, per SOURCE_BASELINE's older
 * E01-S08 baseline (統一 401/403/404/409/422/429/500).
 *
 * Unknown codes fail safe to DEFAULT_ERROR_MESSAGE rather than leaking
 * raw error text/exception messages to the user (Frontend/UX Boundary:
 * "API error 不直接把 stack trace 暴露給使用者").
 */
const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "請先登入。", // 401
  FORBIDDEN: "您沒有權限執行此操作。", // 403
  NOT_FOUND: "找不到您要的內容。", // 404
  CONFLICT: "資料已被異動，請重新整理後再試。", // 409
  VALIDATION_ERROR: "輸入內容有誤，請檢查後再試。", // 422
  RATE_LIMITED: "操作過於頻繁，請稍後再試。", // 429
  SERVER_ERROR: "系統發生錯誤，請稍後再試。", // 500
  // Domain codes already in use (packages/auth-client's AuthErrorCode):
  INVALID_CREDENTIALS: "帳號或密碼錯誤。",
  ACCOUNT_DISABLED: "此帳號已停用，請聯絡管理員。",
  SERVICE_UNAVAILABLE: "服務暫時無法使用，請稍後再試。",
};

const DEFAULT_ERROR_MESSAGE = "發生未預期的錯誤，請稍後再試。";

export function errorMessageForCode(code: string | undefined): string {
  if (!code) return DEFAULT_ERROR_MESSAGE;
  return ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE;
}

/**
 * Renders `code` through errorMessageForCode() by default. Callers that
 * need context-specific wording for the same code (e.g. login's
 * "登入服務暫時無法使用" vs. the generic "服務暫時無法使用") pass an
 * explicit `message` (or `children`) instead — this still gets the
 * unified role="alert" + danger-color presentation, only the message
 * text itself is overridden.
 */
export function ErrorMessage({
  code,
  message,
  children,
}: {
  code?: string;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <p role="alert" style={{ color: colors.danger }}>
      {children ?? message ?? errorMessageForCode(code)}
    </p>
  );
}
