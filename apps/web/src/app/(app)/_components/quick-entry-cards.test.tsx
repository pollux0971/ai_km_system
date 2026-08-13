import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import QuickEntryCards from "./quick-entry-cards";
import { CurrentUserProvider } from "@/lib/session-context";
import { visibleEntryCards } from "@/lib/nav-items";

vi.mock("@/lib/nav-items", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nav-items")>();
  return { ...actual, visibleEntryCards: vi.fn(actual.visibleEntryCards) };
});

const mockedVisibleEntryCards = vi.mocked(visibleEntryCards);

function renderCardsAs(roles: string[]) {
  const session = { userId: "u1", roles, expiresAt: "2099-01-01T00:00:00.000Z" };
  return render(
    <CurrentUserProvider value={session}>
      <QuickEntryCards />
    </CurrentUserProvider>,
  );
}

describe("QuickEntryCards", () => {
  it("shows only the Knowledge card to a general_user", () => {
    renderCardsAs(["general_user"]);

    expect(screen.getByRole("link", { name: /知識庫/ })).toHaveAttribute("href", "/knowledge");
    expect(screen.queryByRole("link", { name: /維修助手/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ERP 助手/ })).not.toBeInTheDocument();
  });

  it("shows the Maintenance card (with its description) to a maintenance_engineer", () => {
    renderCardsAs(["maintenance_engineer"]);

    const card = screen.getByRole("link", { name: /維修助手/ });
    expect(card).toHaveAttribute("href", "/maintenance");
    expect(card).toHaveTextContent("設備故障排除、錯誤代碼與 SOP 查詢。");
  });

  it("shows the ERP card to a sales_purchasing user", () => {
    renderCardsAs(["sales_purchasing"]);

    expect(screen.getByRole("link", { name: /ERP 助手/ })).toHaveAttribute("href", "/erp");
  });

  it("shows all three cards to a super_administrator", () => {
    renderCardsAs(["super_administrator"]);

    expect(screen.getByRole("link", { name: /知識庫/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /維修助手/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ERP 助手/ })).toBeInTheDocument();
  });

  it("shows a fallback message when no cards are visible (defensive — unreachable via current role mapping, but must not crash)", () => {
    mockedVisibleEntryCards.mockReturnValueOnce([]);

    renderCardsAs(["general_user"]);

    expect(screen.getByText("目前沒有可用的快速入口。")).toBeInTheDocument();
  });
});
