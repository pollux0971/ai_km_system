import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
