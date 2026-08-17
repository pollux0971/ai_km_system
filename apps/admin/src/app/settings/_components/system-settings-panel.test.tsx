import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SystemSettingsPanel from "./system-settings-panel";
import { disableSso, enableSso, getSystemSettings } from "@/lib/system-settings";

vi.mock("@/lib/system-settings", () => ({
  getSystemSettings: vi.fn(),
  disableSso: vi.fn(),
  enableSso: vi.fn(),
}));

const mockedGetSystemSettings = vi.mocked(getSystemSettings);
const mockedDisableSso = vi.mocked(disableSso);
const mockedEnableSso = vi.mocked(enableSso);

beforeEach(() => {
  mockedGetSystemSettings.mockReset();
  mockedDisableSso.mockReset();
  mockedEnableSso.mockReset();
});

describe("SystemSettingsPanel (E11-S020)", () => {
  it("shows a loading indicator before the fetch resolves", () => {
    mockedGetSystemSettings.mockReturnValue(new Promise(() => {}));

    render(<SystemSettingsPanel />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedGetSystemSettings.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<SystemSettingsPanel />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows 已啟用 and a 停用 button when ssoEnabled is true", async () => {
    mockedGetSystemSettings.mockResolvedValue({ ok: true, value: { ssoEnabled: true } });

    render(<SystemSettingsPanel />);

    expect(await screen.findByText("已啟用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "啟用" })).not.toBeInTheDocument();
  });

  it("shows 已停用 and a 啟用 button when ssoEnabled is false", async () => {
    mockedGetSystemSettings.mockResolvedValue({ ok: true, value: { ssoEnabled: false } });

    render(<SystemSettingsPanel />);

    expect(await screen.findByText("已停用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "啟用" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停用" })).not.toBeInTheDocument();
  });

  it("clicking 停用 calls disableSso (not enableSso) and updates the displayed state", async () => {
    mockedGetSystemSettings.mockResolvedValue({ ok: true, value: { ssoEnabled: true } });
    mockedDisableSso.mockResolvedValue({ ok: true, value: { ssoEnabled: false } });

    render(<SystemSettingsPanel />);
    await screen.findByText("已啟用");

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    await waitFor(() => expect(mockedDisableSso).toHaveBeenCalledTimes(1));
    expect(mockedEnableSso).not.toHaveBeenCalled();
    expect(await screen.findByText("已停用")).toBeInTheDocument();
  });

  it("clicking 啟用 calls enableSso (not disableSso) and updates the displayed state", async () => {
    mockedGetSystemSettings.mockResolvedValue({ ok: true, value: { ssoEnabled: false } });
    mockedEnableSso.mockResolvedValue({ ok: true, value: { ssoEnabled: true } });

    render(<SystemSettingsPanel />);
    await screen.findByText("已停用");

    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    await waitFor(() => expect(mockedEnableSso).toHaveBeenCalledTimes(1));
    expect(mockedDisableSso).not.toHaveBeenCalled();
    expect(await screen.findByText("已啟用")).toBeInTheDocument();
  });

  it("shows a distinct error message and keeps the current state when toggling fails", async () => {
    mockedGetSystemSettings.mockResolvedValue({ ok: true, value: { ssoEnabled: true } });
    mockedDisableSso.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<SystemSettingsPanel />);
    await screen.findByText("已啟用");

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    expect(await screen.findByText("設定更新失敗，請稍後再試。")).toBeInTheDocument();
    expect(screen.getByText("已啟用")).toBeInTheDocument();
  });
});
