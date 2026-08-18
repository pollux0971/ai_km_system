import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Sidebar from "./sidebar";
import { CurrentUserProvider } from "@/lib/session-context";
import { archiveConversation, createConversation } from "@/lib/conversations";

// ux/enterprise-polish: Sidebar now reads usePathname() (active-item
// highlight + history refetch trigger), which needs a mock outside a real
// Next.js runtime — same local-mock convention login-form.test.tsx et al.
// already use. Required infra for the new component shape; every
// pre-existing assertion below is unchanged.
const { mockedUsePathname } = vi.hoisted(() => ({ mockedUsePathname: vi.fn(() => "/") }));
vi.mock("next/navigation", () => ({ usePathname: mockedUsePathname }));

function renderSidebarAs(roles: string[]) {
  const session = { userId: "u1", roles, expiresAt: "2099-01-01T00:00:00.000Z" };
  return render(
    <CurrentUserProvider value={session}>
      <Sidebar />
    </CurrentUserProvider>,
  );
}

describe("Sidebar", () => {
  it("renders a navigation landmark with a Home link for any authenticated user", () => {
    renderSidebarAs(["general_user"]);

    const nav = screen.getByRole("navigation", { name: "主導覽" });
    const homeLink = screen.getByRole("link", { name: "首頁" });

    expect(nav).toContainElement(homeLink);
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("does not show Maintenance/ERP links to a general_user", () => {
    renderSidebarAs(["general_user"]);

    expect(screen.queryByRole("link", { name: "維修助手" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ERP 助手" })).not.toBeInTheDocument();
  });

  it("shows the Maintenance link to a maintenance_engineer", () => {
    renderSidebarAs(["maintenance_engineer"]);

    expect(screen.getByRole("link", { name: "維修助手" })).toHaveAttribute("href", "/maintenance");
    expect(screen.queryByRole("link", { name: "ERP 助手" })).not.toBeInTheDocument();
  });

  it("shows the ERP link to a sales_purchasing user", () => {
    renderSidebarAs(["sales_purchasing"]);

    expect(screen.getByRole("link", { name: "ERP 助手" })).toHaveAttribute("href", "/erp");
    expect(screen.queryByRole("link", { name: "維修助手" })).not.toBeInTheDocument();
  });
});

describe("Sidebar new-chat entry (ux/enterprise-polish)", () => {
  it("renders a prominent 開始新對話 link to the auto-create route", () => {
    renderSidebarAs(["general_user"]);

    expect(screen.getByRole("link", { name: "開始新對話" })).toHaveAttribute("href", "/conversations/new");
  });
});

describe("Sidebar conversation history (ux/enterprise-polish)", () => {
  it("lists every unarchived conversation as a link into its own detail page", async () => {
    renderSidebarAs(["general_user"]);

    const historyNav = await screen.findByRole("navigation", { name: "歷史對話" });
    const link = await screen.findByRole("link", { name: "產品保固政策詢問" });
    expect(historyNav).toContainElement(link);
    expect(link).toHaveAttribute("href", "/conversations/sample-1");
    expect(screen.getByRole("link", { name: "設備 E-204 錯誤代碼排查" })).toHaveAttribute("href", "/conversations/sample-2");
    expect(screen.getByRole("link", { name: "Q3 銷售報表彙整" })).toHaveAttribute("href", "/conversations/sample-3");
  });

  it("does not list an archived conversation", async () => {
    const created = await createConversation();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await archiveConversation(created.value.id);

    renderSidebarAs(["general_user"]);

    // Wait for the loaded state first so the negative check isn't a
    // false pass against the still-empty pre-fetch render.
    await screen.findByRole("link", { name: "產品保固政策詢問" });
    expect(screen.queryByRole("link", { name: created.value.title })).not.toBeInTheDocument();
  });

  it("marks the currently open conversation with aria-current", async () => {
    mockedUsePathname.mockReturnValue("/conversations/sample-2");

    renderSidebarAs(["general_user"]);

    const activeLink = await screen.findByRole("link", { name: "設備 E-204 錯誤代碼排查" });
    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "產品保固政策詢問" })).not.toHaveAttribute("aria-current");

    mockedUsePathname.mockReturnValue("/");
  });
});
