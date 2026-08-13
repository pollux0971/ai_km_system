import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginPage from "./page";
import { authClient } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  authClient: {
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  },
}));

const mockedLogin = vi.mocked(authClient.login);

const validSession = {
  userId: "u1",
  roles: ["general_user"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

beforeEach(() => {
  mockedLogin.mockReset();
});

function fillAndSubmit(username: string, password: string) {
  fireEvent.change(screen.getByLabelText("帳號"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("密碼"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "登入" }));
}

describe("LoginPage", () => {
  it("validates required fields without calling authClient.login (fail-closed)", () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "登入" }));

    expect(screen.getByText("請輸入帳號")).toBeInTheDocument();
    expect(screen.getByText("請輸入密碼")).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("shows a loading state while the call is pending, then success once it resolves", async () => {
    let resolveLogin: (value: { ok: true; value: typeof validSession }) => void = () => {};
    mockedLogin.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    render(<LoginPage />);

    fillAndSubmit("demo-user", "demo-pass-123");

    const pendingButton = await screen.findByRole("button", { name: "登入中…" });
    expect(pendingButton).toBeDisabled();

    resolveLogin({ ok: true, value: validSession });
    await waitFor(() => expect(screen.getByText("登入成功。")).toBeInTheDocument());
  });

  it("shows a success message when login succeeds", async () => {
    mockedLogin.mockResolvedValue({ ok: true, value: validSession });
    render(<LoginPage />);

    fillAndSubmit("demo-user", "demo-pass-123");

    expect(await screen.findByText("登入成功。")).toBeInTheDocument();
  });

  it("shows an invalid-credential message and never renders it as success", async () => {
    mockedLogin.mockResolvedValue({
      ok: false,
      error: { code: "INVALID_CREDENTIALS", message: "帳號或密碼錯誤。" },
    });
    render(<LoginPage />);

    fillAndSubmit("nope", "nope");

    expect(await screen.findByText("帳號或密碼錯誤。")).toBeInTheDocument();
    expect(screen.queryByText("登入成功。")).not.toBeInTheDocument();
  });

  it("shows a disabled-account message", async () => {
    mockedLogin.mockResolvedValue({
      ok: false,
      error: { code: "ACCOUNT_DISABLED", message: "此帳號已停用，請聯絡管理員。" },
    });
    render(<LoginPage />);

    fillAndSubmit("disabled", "irrelevant");

    expect(await screen.findByText("此帳號已停用，請聯絡管理員。")).toBeInTheDocument();
  });

  it("shows a service-unavailable message and never renders it as success (AC4: no false success)", async () => {
    mockedLogin.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "登入服務暫時無法使用，請稍後再試。" },
    });
    render(<LoginPage />);

    fillAndSubmit("service-error", "irrelevant");

    expect(await screen.findByText("登入服務暫時無法使用，請稍後再試。")).toBeInTheDocument();
    expect(screen.queryByText("登入成功。")).not.toBeInTheDocument();
  });

  it("SSO button shows a not-yet-configured notice without calling authClient.login", () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "使用 SSO 登入" }));

    expect(
      screen.getByText("SSO 尚未設定，請聯絡 IT 管理員或使用本機帳號登入。"),
    ).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });
});
