import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KnowledgeSelector } from "./knowledge-selector";
import { setConversationKnowledgeScope } from "@/lib/conversations";
import { CurrentUserProvider } from "@/lib/session-context";

vi.mock("@/lib/conversations", () => ({
  setConversationKnowledgeScope: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedSetConversationKnowledgeScope = vi.mocked(setConversationKnowledgeScope);

function renderSelectorAs(roles: string[], initialScope: "company" | "department" | "project" | "private" | "qna" | null) {
  const session = { userId: "u1", roles, expiresAt: "2099-01-01T00:00:00.000Z" };
  return render(
    <CurrentUserProvider value={session}>
      <KnowledgeSelector conversationId="c1" initialScope={initialScope} />
    </CurrentUserProvider>,
  );
}

beforeEach(() => {
  mockedSetConversationKnowledgeScope.mockReset();
});

describe("KnowledgeSelector (E03-S003)", () => {
  it("shows '尚未選擇' selected when the conversation has no scope yet", () => {
    renderSelectorAs(["general_user"], null);

    expect(screen.getByRole("combobox", { name: "知識來源" })).toHaveValue("");
  });

  it("shows the initial scope selected when one is already set", () => {
    renderSelectorAs(["general_user"], "department");

    expect(screen.getByRole("combobox", { name: "知識來源" })).toHaveValue("department");
  });

  it("offers all five scopes to a general_user — none are currently role-restricted", () => {
    renderSelectorAs(["general_user"], null);

    const select = screen.getByRole("combobox", { name: "知識來源" });
    const optionLabels = Array.from(select.querySelectorAll("option")).map((option) => option.textContent);
    expect(optionLabels).toEqual(["尚未選擇", "公司知識庫", "部門知識庫", "專案知識庫", "個人知識庫", "問答庫"]);
  });

  it("switches to the selected scope once the update succeeds", async () => {
    mockedSetConversationKnowledgeScope.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "t",
        lastMessageAt: "2026-08-14T00:00:00.000Z",
        lastMessagePreview: "p",
        mode: "normal",
        knowledgeScope: "qna",
      },
    });

    renderSelectorAs(["general_user"], null);
    fireEvent.change(screen.getByRole("combobox", { name: "知識來源" }), { target: { value: "qna" } });

    await waitFor(() => expect(screen.getByRole("combobox", { name: "知識來源" })).toHaveValue("qna"));
    expect(mockedSetConversationKnowledgeScope).toHaveBeenCalledWith("c1", "qna");
  });

  it("can switch back to '尚未選擇' (unselecting), sending null", async () => {
    mockedSetConversationKnowledgeScope.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "t",
        lastMessageAt: "2026-08-14T00:00:00.000Z",
        lastMessagePreview: "p",
        mode: "normal",
        knowledgeScope: null,
      },
    });

    renderSelectorAs(["general_user"], "company");
    fireEvent.change(screen.getByRole("combobox", { name: "知識來源" }), { target: { value: "" } });

    await waitFor(() => expect(screen.getByRole("combobox", { name: "知識來源" })).toHaveValue(""));
    expect(mockedSetConversationKnowledgeScope).toHaveBeenCalledWith("c1", null);
  });

  it("shows a distinct error state and keeps the previous scope when the switch fails", async () => {
    mockedSetConversationKnowledgeScope.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到這個對話。" },
    });

    renderSelectorAs(["general_user"], "company");
    fireEvent.change(screen.getByRole("combobox", { name: "知識來源" }), { target: { value: "qna" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("切換知識來源失敗，請稍後再試。");
    expect(screen.getByRole("combobox", { name: "知識來源" })).toHaveValue("company");
  });

  it("does not call setConversationKnowledgeScope when re-selecting the already-active scope", () => {
    renderSelectorAs(["general_user"], "company");

    fireEvent.change(screen.getByRole("combobox", { name: "知識來源" }), { target: { value: "company" } });

    expect(mockedSetConversationKnowledgeScope).not.toHaveBeenCalled();
  });
});
