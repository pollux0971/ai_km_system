import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeList from "./knowledge-list";
import { listKnowledgeBases } from "@/lib/knowledge-bases";

vi.mock("@/lib/knowledge-bases", () => ({
  listKnowledgeBases: vi.fn(),
}));

const mockedListKnowledgeBases = vi.mocked(listKnowledgeBases);

describe("KnowledgeList (E05-S001)", () => {
  it("shows a loading state before the list resolves", () => {
    mockedListKnowledgeBases.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows each knowledge base's name, description, and timestamp once loaded", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: [{ id: "kb1", name: "測試知識庫", description: "測試描述", updatedAt: "2026-08-13T01:00:00.000Z" }],
    });

    render(<KnowledgeList />);

    expect(await screen.findByText("測試知識庫")).toBeInTheDocument();
    expect(screen.getByText("測試描述")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<KnowledgeList />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫列表。");
  });

  it("shows an empty state (not an error) when there are no knowledge bases", async () => {
    mockedListKnowledgeBases.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeList />);

    expect(await screen.findByText("尚無知識庫。")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("KnowledgeList search (E05-S002)", () => {
  it("typing into the search box re-fetches with the typed query", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: [{ id: "kb1", name: "測試知識庫", description: "測試描述", updatedAt: "2026-08-13T01:00:00.000Z" }],
    });

    render(<KnowledgeList />);
    await screen.findByText("測試知識庫");

    fireEvent.change(screen.getByLabelText("搜尋知識庫"), { target: { value: "保固" } });

    await waitFor(() => expect(mockedListKnowledgeBases).toHaveBeenLastCalledWith("保固"));
  });

  it("shows a distinct empty message (not the generic '尚無知識庫' one) when a search matches nothing", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: [{ id: "kb1", name: "測試知識庫", description: "測試描述", updatedAt: "2026-08-13T01:00:00.000Z" }],
    });
    render(<KnowledgeList />);
    await screen.findByText("測試知識庫");

    mockedListKnowledgeBases.mockResolvedValueOnce({ ok: true, value: [] });
    fireEvent.change(screen.getByLabelText("搜尋知識庫"), { target: { value: "找不到" } });

    expect(await screen.findByText("查無符合「找不到」的知識庫。")).toBeInTheDocument();
    expect(screen.queryByText("尚無知識庫。")).not.toBeInTheDocument();
  });

  it("the search box stays visible and keeps its typed value through a loading render, then an error render, not just the loaded state", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: [{ id: "kb1", name: "測試知識庫", description: "測試描述", updatedAt: "2026-08-13T01:00:00.000Z" }],
    });
    render(<KnowledgeList />);
    await screen.findByText("測試知識庫");

    let resolveSearch!: (result: Awaited<ReturnType<typeof listKnowledgeBases>>) => void;
    mockedListKnowledgeBases.mockReturnValueOnce(new Promise((resolve) => (resolveSearch = resolve)));
    fireEvent.change(screen.getByLabelText("搜尋知識庫"), { target: { value: "保固" } });

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByLabelText("搜尋知識庫")).toHaveValue("保固");

    resolveSearch({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫列表。");
    expect(screen.getByLabelText("搜尋知識庫")).toHaveValue("保固");
  });
});

describe("KnowledgeList edit link (E05-S004)", () => {
  it("shows a 編輯 link per item, pointing at /knowledge/{id}/edit", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: [
        { id: "kb1", name: "測試知識庫一", description: "描述一", updatedAt: "2026-08-13T01:00:00.000Z" },
        { id: "kb2", name: "測試知識庫二", description: "描述二", updatedAt: "2026-08-12T01:00:00.000Z" },
      ],
    });

    render(<KnowledgeList />);
    await screen.findByText("測試知識庫一");

    const editLinks = screen.getAllByRole("link", { name: "編輯" });
    expect(editLinks).toHaveLength(2);
    expect(editLinks[0]).toHaveAttribute("href", "/knowledge/kb1/edit");
    expect(editLinks[1]).toHaveAttribute("href", "/knowledge/kb2/edit");
  });
});

describe("KnowledgeList detail link (E05-S005)", () => {
  it("links each item's name to /knowledge/{id}", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: [
        { id: "kb1", name: "測試知識庫一", description: "描述一", updatedAt: "2026-08-13T01:00:00.000Z" },
        { id: "kb2", name: "測試知識庫二", description: "描述二", updatedAt: "2026-08-12T01:00:00.000Z" },
      ],
    });

    render(<KnowledgeList />);
    await screen.findByText("測試知識庫一");

    expect(screen.getByRole("link", { name: "測試知識庫一" })).toHaveAttribute("href", "/knowledge/kb1");
    expect(screen.getByRole("link", { name: "測試知識庫二" })).toHaveAttribute("href", "/knowledge/kb2");
  });
});
