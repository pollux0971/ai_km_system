import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import KnowledgeDetail from "./knowledge-detail";
import { getKnowledgeBase } from "@/lib/knowledge-bases";
import { listKnowledgeBaseDocuments } from "@/lib/knowledge-documents";

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
}));

vi.mock("@/lib/knowledge-documents", () => ({
  listKnowledgeBaseDocuments: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);
const mockedListKnowledgeBaseDocuments = vi.mocked(listKnowledgeBaseDocuments);

const sampleKnowledgeBase = {
  id: "kb1",
  name: "研發部門知識庫",
  description: "內部技術文件與架構決策紀錄。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockedGetKnowledgeBase.mockReset();
  mockedListKnowledgeBaseDocuments.mockReset();
  // Default: no documents. Every existing test that doesn't itself care
  // about the E05-S010 document-count summary relies on this default
  // rather than mocking listKnowledgeBaseDocuments individually — same
  // "one shared default, only the tests that care override it" approach
  // that keeps this file's earlier tests (S006-S009) unchanged by S010.
  mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });
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

  it("shows a 模型設定 link pointing at /knowledge/{id}/model", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("link", { name: "模型設定" })).toHaveAttribute("href", "/knowledge/kb1/model");
  });

  it("shows 尚未綁定 for the bound model when none has been configured yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    const summary = await screen.findByText("綁定模型:", { exact: false });
    expect(summary).toHaveTextContent("尚未綁定");
  });

  it("shows the AI_MODELS label (not the raw id) when a model is bound", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, boundModel: "advanced-local" },
    });

    render(<KnowledgeDetail id="kb1" />);

    const summary = await screen.findByText("綁定模型:", { exact: false });
    expect(summary).toHaveTextContent("進階模型（地端）");
  });

  it("shows a 文件列表 link pointing at /knowledge/{id}/documents", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("link", { name: "文件列表" })).toHaveAttribute("href", "/knowledge/kb1/documents");
  });

  it("shows 尚無文件 when the document count is zero", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeDetail id="kb1" />);

    const summary = await screen.findByText("文件:", { exact: false });
    expect(summary).toHaveTextContent("尚無文件");
  });

  it("shows the document count once documents exist", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({
      ok: true,
      value: [
        { id: "doc1", knowledgeBaseId: "kb1", name: "a.pdf", sizeBytes: 1000, uploadedAt: "2026-08-10T00:00:00.000Z" },
        { id: "doc2", knowledgeBaseId: "kb1", name: "b.pdf", sizeBytes: 2000, uploadedAt: "2026-08-11T00:00:00.000Z" },
      ],
    });

    render(<KnowledgeDetail id="kb1" />);

    const summary = await screen.findByText("文件:", { exact: false });
    expect(summary).toHaveTextContent("2 份文件");
  });

  it("degrades the document count to a － placeholder (not a full-page error) when only the document fetch fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedListKnowledgeBaseDocuments.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("heading", { name: "研發部門知識庫", level: 1 })).toBeInTheDocument();
    const summary = await screen.findByText("文件:", { exact: false });
    expect(summary).toHaveTextContent("－");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not call listKnowledgeBaseDocuments when the knowledge base itself is not found", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<KnowledgeDetail id="does-not-exist" />);
    await screen.findByRole("alert");

    expect(mockedListKnowledgeBaseDocuments).not.toHaveBeenCalled();
  });

  it("shows a 資料夾同步設定 link pointing at /knowledge/{id}/folder-sync", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    expect(await screen.findByRole("link", { name: "資料夾同步設定" })).toHaveAttribute(
      "href",
      "/knowledge/kb1/folder-sync",
    );
  });

  it("shows 尚未設定 for folder sync when no path has been configured yet", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeDetail id="kb1" />);

    const summary = await screen.findByText("資料夾同步:", { exact: false });
    expect(summary).toHaveTextContent("尚未設定");
  });

  it("shows 已啟用 for folder sync when a path is configured and sync is on", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, folderSyncPath: "/mnt/shared/policies", folderSyncEnabled: true },
    });

    render(<KnowledgeDetail id="kb1" />);

    const summary = await screen.findByText("資料夾同步:", { exact: false });
    expect(summary).toHaveTextContent("已啟用");
  });

  it("shows 已停用 for folder sync when a path is configured but sync is off", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, folderSyncPath: "/mnt/shared/policies", folderSyncEnabled: false },
    });

    render(<KnowledgeDetail id="kb1" />);

    const summary = await screen.findByText("資料夾同步:", { exact: false });
    expect(summary).toHaveTextContent("已停用");
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
