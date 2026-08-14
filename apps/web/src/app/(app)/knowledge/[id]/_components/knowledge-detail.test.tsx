import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import KnowledgeDetail from "./knowledge-detail";
import { getKnowledgeBase } from "@/lib/knowledge-bases";

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);

const sampleKnowledgeBase = {
  id: "kb1",
  name: "研發部門知識庫",
  description: "內部技術文件與架構決策紀錄。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockedGetKnowledgeBase.mockReset();
});

describe("KnowledgeDetail (E05-S005)", () => {
  it("shows a loading state before the knowledge base resolves", () => {
    mockedGetKnowledgeBase.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeDetail id="kb1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the name, description, and updated timestamp once loaded", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("heading", { name: "研發部門知識庫", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("內部技術文件與架構決策紀錄。")).toBeInTheDocument();
    // Asserts via the <time> element's machine-readable dateTime attribute,
    // not its Intl-formatted rendered text — same reasoning no existing
    // test in this codebase (knowledge-list.test.tsx included) asserts on
    // a toLocaleString() rendering: zh-TW formatting inserts a U+2009 THIN
    // SPACE before 上午/下午 that Testing Library's DOM-text normalizer
    // collapses but a raw freshly-computed comparison string wouldn't,
    // causing a byte-level mismatch invisible to the eye — confirmed (via
    // a standalone Node repro of the exact codepoints) as the actual cause
    // of this exact assertion's first-run failure during this story's own
    // development.
    expect(document.querySelector("time")).toHaveAttribute("datetime", sampleKnowledgeBase.updatedAt);
  });

  it("shows an 編輯 link pointing at /knowledge/{id}/edit", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("link", { name: "編輯" })).toHaveAttribute("href", "/knowledge/kb1/edit");
  });

  it("shows a 權限設定 link pointing at /knowledge/{id}/permissions", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("link", { name: "權限設定" })).toHaveAttribute("href", "/knowledge/kb1/permissions");
  });

  it("shows 尚未設定 when no permission has been configured yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    // Scoped to the "可存取角色:" summary specifically — E05-S008 added a
    // second, independent "尚未設定" summary (bound prompt) that's ALSO
    // unconfigured for this same sampleKnowledgeBase fixture, so a bare
    // findByText("尚未設定") is ambiguous (matches both) as of this story.
    const summary = await screen.findByText("可存取角色:", { exact: false });
    expect(summary).toHaveTextContent("尚未設定");
  });

  it("shows the labeled roles when a permission is configured", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, visibleToRoles: ["maintenance_engineer", "knowledge_manager"] },
    });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByText("維修工程師、知識管理者")).toBeInTheDocument();
  });

  it("shows a 成員設定 link pointing at /knowledge/{id}/members", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("link", { name: "成員設定" })).toHaveAttribute("href", "/knowledge/kb1/members");
  });

  it("shows 尚無成員 when no members have been configured yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByText("尚無成員")).toBeInTheDocument();
  });

  it("shows the joined member list when members are configured", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, members: ["demo-user", "demo-sales"] },
    });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByText("demo-user、demo-sales")).toBeInTheDocument();
  });

  it("shows a 提示詞設定 link pointing at /knowledge/{id}/prompt", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("link", { name: "提示詞設定" })).toHaveAttribute("href", "/knowledge/kb1/prompt");
  });

  it("shows 尚未設定 for the bound prompt when none has been configured yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    const summary = await screen.findByText("綁定提示詞:", { exact: false });
    expect(summary).toHaveTextContent("尚未設定");
  });

  it("shows 已設定 (not the prompt text itself) when a prompt is bound", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, boundPrompt: "請用友善、簡潔的語氣回答客服問題。" },
    });

    render(<KnowledgeDetail id="kb1" />);

    const summary = await screen.findByText("綁定提示詞:", { exact: false });
    expect(summary).toHaveTextContent("已設定");
    expect(screen.queryByText("請用友善、簡潔的語氣回答客服問題。")).not.toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<KnowledgeDetail id="does-not-exist" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });

  it("calls getKnowledgeBase with the given id", () => {
    mockedGetKnowledgeBase.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeDetail id="kb-sample-2" />);

    expect(mockedGetKnowledgeBase).toHaveBeenCalledWith("kb-sample-2");
  });
});
