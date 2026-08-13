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

  it("shows placeholder sections for the widgets E01-S008/E01-S009 own", () => {
    render(
      <CurrentUserProvider value={session}>
        <HomePage />
      </CurrentUserProvider>,
    );

    expect(screen.getByRole("heading", { name: "最近對話", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "快速入口", level: 2 })).toBeInTheDocument();
  });
});
