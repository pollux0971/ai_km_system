import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NotificationCenter from "./notification-center";
import { getNotifications } from "@/lib/notifications";

vi.mock("@/lib/notifications", () => ({
  getNotifications: vi.fn(),
}));

const mockedGetNotifications = vi.mocked(getNotifications);

beforeEach(() => {
  mockedGetNotifications.mockReset();
});

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /^通知/ }));
}

describe("NotificationCenter", () => {
  it("shows no unread-count badge before notifications resolve", () => {
    mockedGetNotifications.mockReturnValue(new Promise(() => {}));

    render(<NotificationCenter />);

    expect(screen.getByRole("button", { name: "通知" })).toBeInTheDocument();
  });

  it("shows the unread count in the trigger once notifications load", async () => {
    mockedGetNotifications.mockResolvedValue({
      ok: true,
      value: [
        { id: "n1", title: "未讀通知", createdAt: "2026-08-13T00:00:00.000Z", read: false },
        { id: "n2", title: "已讀通知", createdAt: "2026-08-12T00:00:00.000Z", read: true },
      ],
    });

    render(<NotificationCenter />);

    expect(await screen.findByRole("button", { name: "通知（1）" })).toBeInTheDocument();
  });

  it("does not show a count badge when there are no unread notifications", async () => {
    mockedGetNotifications.mockResolvedValue({
      ok: true,
      value: [{ id: "n1", title: "已讀通知", createdAt: "2026-08-12T00:00:00.000Z", read: true }],
    });

    render(<NotificationCenter />);

    expect(await screen.findByRole("button", { name: "通知" })).toBeInTheDocument();
  });

  it("opens a dialog panel listing notifications when clicked", async () => {
    mockedGetNotifications.mockResolvedValue({
      ok: true,
      value: [{ id: "n1", title: "測試通知標題", createdAt: "2026-08-13T00:00:00.000Z", read: false }],
    });

    render(<NotificationCenter />);
    await screen.findByRole("button", { name: "通知（1）" });

    expect(screen.queryByRole("dialog", { name: "通知中心" })).not.toBeInTheDocument();

    openPanel();

    expect(screen.getByRole("dialog", { name: "通知中心" })).toBeInTheDocument();
    expect(screen.getByText("測試通知標題")).toBeInTheDocument();
  });

  it("shows an error state distinct from empty when loading fails", async () => {
    mockedGetNotifications.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<NotificationCenter />);
    await screen.findByRole("button", { name: "通知" });
    openPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入通知。");
    expect(screen.queryByText("目前沒有通知。")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no notifications at all", async () => {
    mockedGetNotifications.mockResolvedValue({ ok: true, value: [] });

    render(<NotificationCenter />);
    await screen.findByRole("button", { name: "通知" });
    openPanel();

    expect(await screen.findByText("目前沒有通知。")).toBeInTheDocument();
  });
});
