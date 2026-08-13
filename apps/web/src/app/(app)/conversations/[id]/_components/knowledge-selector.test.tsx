import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KnowledgeSelector } from "./knowledge-selector";
import { setConversationKnowledgeScopes } from "@/lib/conversations";
import { CurrentUserProvider } from "@/lib/session-context";
import type { KnowledgeScope } from "@/lib/knowledge-scopes";

vi.mock("@/lib/conversations", () => ({
  setConversationKnowledgeScopes: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedSetConversationKnowledgeScopes = vi.mocked(setConversationKnowledgeScopes);

function renderSelectorAs(roles: string[], initialScopes: KnowledgeScope[]) {
  const session = { userId: "u1", roles, expiresAt: "2099-01-01T00:00:00.000Z" };
  return render(
    <CurrentUserProvider value={session}>
      <KnowledgeSelector conversationId="c1" initialScopes={initialScopes} />
    </CurrentUserProvider>,
  );
}

beforeEach(() => {
  mockedSetConversationKnowledgeScopes.mockReset();
});

describe("KnowledgeSelector (E03-S003/S004)", () => {
  it("shows nothing checked when the conversation has no scopes yet", () => {
    renderSelectorAs(["general_user"], []);

    for (const label of ["公司知識庫", "部門知識庫", "專案知識庫", "個人知識庫", "問答庫"]) {
      expect(screen.getByRole("checkbox", { name: label })).not.toBeChecked();
    }
  });

  it("shows the initial scopes checked when several are already set", () => {
    renderSelectorAs(["general_user"], ["company", "qna"]);

    expect(screen.getByRole("checkbox", { name: "公司知識庫" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "問答庫" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "部門知識庫" })).not.toBeChecked();
  });

  it("offers all five scopes to a general_user — none are currently role-restricted", () => {
    renderSelectorAs(["general_user"], []);

    expect(screen.getByRole("group", { name: "知識來源" })).toBeInTheDocument();
    for (const label of ["公司知識庫", "部門知識庫", "專案知識庫", "個人知識庫", "問答庫"]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
    }
  });

  it("checking a box adds that scope to the selection once the update succeeds", async () => {
    mockedSetConversationKnowledgeScopes.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "t",
        lastMessageAt: "2026-08-14T00:00:00.000Z",
        lastMessagePreview: "p",
        mode: "normal",
        knowledgeScopes: ["company"],
      },
    });

    renderSelectorAs(["general_user"], []);
    fireEvent.click(screen.getByRole("checkbox", { name: "公司知識庫" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "公司知識庫" })).toBeChecked());
    expect(mockedSetConversationKnowledgeScopes).toHaveBeenCalledWith("c1", ["company"]);
  });

  it("unchecking a box removes that scope, sending the rest of the selection unchanged", async () => {
    mockedSetConversationKnowledgeScopes.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "t",
        lastMessageAt: "2026-08-14T00:00:00.000Z",
        lastMessagePreview: "p",
        mode: "normal",
        knowledgeScopes: ["qna"],
      },
    });

    renderSelectorAs(["general_user"], ["company", "qna"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "公司知識庫" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "公司知識庫" })).not.toBeChecked());
    expect(mockedSetConversationKnowledgeScopes).toHaveBeenCalledWith("c1", ["qna"]);
    expect(screen.getByRole("checkbox", { name: "問答庫" })).toBeChecked();
  });

  it("shows a distinct error state and keeps the previous selection when the switch fails", async () => {
    mockedSetConversationKnowledgeScopes.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個對話。" },
    });

    renderSelectorAs(["general_user"], ["company"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "問答庫" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("切換知識來源失敗，請稍後再試。");
    expect(screen.getByRole("checkbox", { name: "公司知識庫" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "問答庫" })).not.toBeChecked();
  });

  it("disables every checkbox while a switch is in flight, preventing a second toggle from racing the first", async () => {
    mockedSetConversationKnowledgeScopes.mockReturnValue(new Promise(() => {}));

    renderSelectorAs(["general_user"], []);
    fireEvent.click(screen.getByRole("checkbox", { name: "公司知識庫" }));

    expect(await screen.findByRole("status")).toHaveTextContent("切換中…");
    expect(screen.getByRole("checkbox", { name: "公司知識庫" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "問答庫" })).toBeDisabled();
  });
});
