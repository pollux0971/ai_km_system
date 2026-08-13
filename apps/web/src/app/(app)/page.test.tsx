import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "./page";
import { CurrentUserProvider } from "@/lib/session-context";

const session = {
  userId: "u1",
  roles: ["general_user"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

describe("HomePage", () => {
  it("greets the current user by id", () => {
    render(
      <CurrentUserProvider value={session}>
        <HomePage />
      </CurrentUserProvider>,
    );

    expect(screen.getByRole("heading", { name: "歡迎回來", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("u1，這是你的工作台首頁。")).toBeInTheDocument();
  });

  it("wires the real RecentConversations widget into 最近對話 (state detail lives in recent-conversations.test.tsx)", async () => {
    render(
      <CurrentUserProvider value={session}>
        <HomePage />
      </CurrentUserProvider>,
    );

    expect(screen.getByRole("heading", { name: "最近對話", level: 2 })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "查看全部對話" })).toBeInTheDocument();
  });

  it("wires the real QuickEntryCards widget into 快速入口 (state detail lives in quick-entry-cards.test.tsx)", () => {
    render(
      <CurrentUserProvider value={session}>
        <HomePage />
      </CurrentUserProvider>,
    );

    expect(screen.getByRole("heading", { name: "快速入口", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /知識庫/ })).toHaveAttribute("href", "/knowledge");
  });
});
