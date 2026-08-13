import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorMessage, errorMessageForCode } from "./error-message";

describe("errorMessageForCode", () => {
  it("maps every HTTP-status-flavored code to a Chinese message", () => {
    expect(errorMessageForCode("UNAUTHORIZED")).toBe("請先登入。");
    expect(errorMessageForCode("FORBIDDEN")).toBe("您沒有權限執行此操作。");
    expect(errorMessageForCode("NOT_FOUND")).toBe("找不到您要的內容。");
    expect(errorMessageForCode("CONFLICT")).toBe("資料已被異動，請重新整理後再試。");
    expect(errorMessageForCode("VALIDATION_ERROR")).toBe("輸入內容有誤，請檢查後再試。");
    expect(errorMessageForCode("RATE_LIMITED")).toBe("操作過於頻繁，請稍後再試。");
    expect(errorMessageForCode("SERVER_ERROR")).toBe("系統發生錯誤，請稍後再試。");
  });

  it("maps the domain codes already in use by packages/auth-client", () => {
    expect(errorMessageForCode("INVALID_CREDENTIALS")).toBe("帳號或密碼錯誤。");
    expect(errorMessageForCode("ACCOUNT_DISABLED")).toBe("此帳號已停用，請聯絡管理員。");
    expect(errorMessageForCode("SERVICE_UNAVAILABLE")).toBe("服務暫時無法使用，請稍後再試。");
  });

  it("fails safe to a generic message for an unrecognized code (never leaks raw error text)", () => {
    expect(errorMessageForCode("SOME_UNKNOWN_BACKEND_CODE")).toBe("發生未預期的錯誤，請稍後再試。");
  });

  it("fails safe to the generic message when no code is given", () => {
    expect(errorMessageForCode(undefined)).toBe("發生未預期的錯誤，請稍後再試。");
  });
});

describe("ErrorMessage", () => {
  it("renders a role=alert region resolved from a code", () => {
    render(<ErrorMessage code="NOT_FOUND" />);

    expect(screen.getByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });

  it("prefers an explicit message over the code-resolved one", () => {
    render(<ErrorMessage code="SERVICE_UNAVAILABLE" message="登入服務暫時無法使用，請稍後再試。" />);

    expect(screen.getByRole("alert")).toHaveTextContent("登入服務暫時無法使用，請稍後再試。");
  });

  it("prefers children over both message and code", () => {
    render(
      <ErrorMessage code="NOT_FOUND" message="ignored">
        自訂錯誤內容
      </ErrorMessage>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("自訂錯誤內容");
  });

  it("falls back to the generic message when neither code nor message/children is given", () => {
    render(<ErrorMessage />);

    expect(screen.getByRole("alert")).toHaveTextContent("發生未預期的錯誤，請稍後再試。");
  });
});
