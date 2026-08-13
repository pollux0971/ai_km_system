import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import LoginForm from "./login-form";
import { authClient } from "@/lib/auth";

const { mockPush, mockSearchParamsGet } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSearchParamsGet: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}));

const mockedLogin = vi.mocked(authClient.login);

const validSession = {
  userId: "u1",
  roles: ["general_user"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

beforeEach(() => {
  mockedLogin.mockReset();
  mockPush.mockReset();
  mockSearchParamsGet.mockReset();
  mockSearchParamsGet.mockReturnValue(null);
});

function fillAndSubmit(username: string, password: string) {
  fireEvent.change(screen.getByLabelText("帳號"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("密碼"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "登入" }));
}

describe("LoginForm", () => {
  it("validates required fields without calling authClient.login (fail-closed)", () => {
    render(<LoginForm />);

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
    render(<LoginForm />);

    fillAndSubmit("demo-user", "demo-pass-123");

    const pendingButton = await screen.findByRole("button", { name: "登入中…" });
    expect(pendingButton).toBeDisabled();

    resolveLogin({ ok: true, value: validSession });
    await waitFor(() => expect(screen.getByText("登入成功。")).toBeInTheDocument());
  });

  it("shows a success message when login succeeds", async () => {
    mockedLogin.mockResolvedValue({ ok: true, value: validSession });
    render(<LoginForm />);

    fillAndSubmit("demo-user", "demo-pass-123");

    expect(await screen.findByText("登入成功。")).toBeInTheDocument();
  });

  it("shows an invalid-credential message and never renders it as success", async () => {
    mockedLogin.mockResolvedValue({
      ok: false,
      error: { code: "INVALID_CREDENTIALS", message: "帳號或密碼錯誤。" },
    });
    render(<LoginForm />);

    fillAndSubmit("nope", "nope");

    expect(await screen.findByText("帳號或密碼錯誤。")).toBeInTheDocument();
    expect(screen.queryByText("登入成功。")).not.toBeInTheDocument();
  });

  it("shows a disabled-account message", async () => {
    mockedLogin.mockResolvedValue({
      ok: false,
      error: { code: "ACCOUNT_DISABLED", message: "此帳號已停用，請聯絡管理員。" },
    });
    render(<LoginForm />);

    fillAndSubmit("disabled", "irrelevant");

    expect(await screen.findByText("此帳號已停用，請聯絡管理員。")).toBeInTheDocument();
  });

  it("shows a service-unavailable message and never renders it as success (AC4: no false success)", async () => {
    mockedLogin.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "登入服務暫時無法使用，請稍後再試。" },
    });
    render(<LoginForm />);

    fillAndSubmit("service-error", "irrelevant");

    expect(await screen.findByText("登入服務暫時無法使用，請稍後再試。")).toBeInTheDocument();
    expect(screen.queryByText("登入成功。")).not.toBeInTheDocument();
  });

  it("SSO button shows a not-yet-configured notice without calling authClient.login", () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole("button", { name: "使用 SSO 登入" }));

    expect(
      screen.getByText("SSO 尚未設定，請聯絡 IT 管理員或使用本機帳號登入。"),
    ).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  describe("E01-S003: return-url redirect", () => {
    it("redirects to the returnUrl from the query string after a successful login", async () => {
      mockSearchParamsGet.mockReturnValue("/dashboard");
      mockedLogin.mockResolvedValue({ ok: true, value: validSession });
      render(<LoginForm />);

      fillAndSubmit("demo-user", "demo-pass-123");

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
    });

    it("defaults to / after a successful login when no returnUrl is present", async () => {
      mockedLogin.mockResolvedValue({ ok: true, value: validSession });
      render(<LoginForm />);

      fillAndSubmit("demo-user", "demo-pass-123");

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    });

    it("falls back to / for an absolute external returnUrl (open-redirect defense)", async () => {
      mockSearchParamsGet.mockReturnValue("https://evil.example/phish");
      mockedLogin.mockResolvedValue({ ok: true, value: validSession });
      render(<LoginForm />);

      fillAndSubmit("demo-user", "demo-pass-123");

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    });

    it("does not navigate anywhere when the login attempt fails", async () => {
      mockSearchParamsGet.mockReturnValue("/dashboard");
      mockedLogin.mockResolvedValue({
        ok: false,
        error: { code: "INVALID_CREDENTIALS", message: "帳號或密碼錯誤。" },
      });
      render(<LoginForm />);

      fillAndSubmit("nope", "nope");

      await screen.findByText("帳號或密碼錯誤。");
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
