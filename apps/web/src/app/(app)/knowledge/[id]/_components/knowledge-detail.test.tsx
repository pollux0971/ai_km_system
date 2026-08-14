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
