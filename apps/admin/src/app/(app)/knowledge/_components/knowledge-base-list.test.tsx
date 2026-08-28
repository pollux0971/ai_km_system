import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import KnowledgeBaseList from "./knowledge-base-list";
import { listKnowledgeBases } from "@/lib/knowledge-bases";

vi.mock("@/lib/knowledge-bases", () => ({
  listKnowledgeBases: vi.fn(),
}));

const mockedListKnowledgeBases = vi.mocked(listKnowledgeBases);

describe("KnowledgeBaseList (E11-S011)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListKnowledgeBases.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeBaseList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListKnowledgeBases.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeBaseList />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there are no knowledge bases", async () => {
    mockedListKnowledgeBases.mockResolvedValue({ ok: true, value: [] });

    render(<KnowledgeBaseList />);

    expect(await screen.findByText("尚無知識庫。")).toBeInTheDocument();
  });

  it("shows each knowledge base's own name and description once loaded", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: [
        { id: "kb-1", name: "產品保固政策", description: "保固期限說明。", updatedAt: "2026-08-13T01:00:00.000Z" },
        { id: "kb-2", name: "設備維修標準作業程序", description: "維修 SOP 文件集。", updatedAt: "2026-08-11T06:30:00.000Z" },
      ],
    });

    render(<KnowledgeBaseList />);

    expect(await screen.findByText("產品保固政策")).toBeInTheDocument();
    expect(screen.getByText("保固期限說明。")).toBeInTheDocument();
    expect(screen.getByText("設備維修標準作業程序")).toBeInTheDocument();
    expect(screen.getByText("維修 SOP 文件集。")).toBeInTheDocument();
  });

  it("renders every knowledge base it's given, not just the first few — a silent truncation would slip past a 2-item fixture", async () => {
    const names = ["產品保固政策", "設備維修標準作業程序", "人力資源與請假規範", "資安管理規範", "供應商合約範本", "教育訓練教材"];
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: names.map((name, index) => ({
        id: `kb-${index}`,
        name,
        description: `${name} 的描述。`,
        updatedAt: "2026-08-13T01:00:00.000Z",
      })),
    });

    render(<KnowledgeBaseList />);

    await screen.findByText("產品保固政策");
    for (const name of names) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("does not show the empty state once knowledge bases are loaded", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: [{ id: "kb-1", name: "產品保固政策", description: "保固期限說明。", updatedAt: "2026-08-13T01:00:00.000Z" }],
    });

    render(<KnowledgeBaseList />);

    await screen.findByText("產品保固政策");
    expect(screen.queryByText("尚無知識庫。")).not.toBeInTheDocument();
  });

  it("shows each knowledge base's last-updated time", async () => {
    mockedListKnowledgeBases.mockResolvedValue({
      ok: true,
      value: [{ id: "kb-1", name: "產品保固政策", description: "保固期限說明。", updatedAt: "2026-08-13T01:00:00.000Z" }],
    });

    render(<KnowledgeBaseList />);
    await screen.findByText("產品保固政策");

    expect(document.querySelector('time[datetime="2026-08-13T01:00:00.000Z"]')).toBeInTheDocument();
  });
});
