import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArchiveConversation } from "./archive-conversation";
import { archiveConversation, unarchiveConversation } from "@/lib/conversations";

vi.mock("@/lib/conversations", () => ({
  archiveConversation: vi.fn(),
  unarchiveConversation: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedArchiveConversation = vi.mocked(archiveConversation);
const mockedUnarchiveConversation = vi.mocked(unarchiveConversation);

const DEFAULT_CONVERSATION = {
  id: "c1",
  title: "測試對話",
  lastMessageAt: "2026-08-12T09:15:00.000Z",
  lastMessagePreview: "測試預覽",
  mode: "normal" as const,
  knowledgeScopes: [],
  model: "standard" as const,
};

beforeEach(() => {
  mockedArchiveConversation.mockReset();
  mockedUnarchiveConversation.mockReset();
});

describe("ArchiveConversation (E03-S026)", () => {
  it("shows 封存對話 initially when the conversation is not archived", () => {
    render(<ArchiveConversation conversationId="c1" initialArchived={false} />);

    expect(screen.getByRole("button", { name: "封存對話" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消封存" })).not.toBeInTheDocument();
  });

  it("shows 取消封存 initially when the conversation is already archived", () => {
    render(<ArchiveConversation conversationId="c1" initialArchived={true} />);

    expect(screen.getByRole("button", { name: "取消封存" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "封存對話" })).not.toBeInTheDocument();
  });

  it("clicking 封存對話 calls archiveConversation (not unarchiveConversation) and flips the button to 取消封存", async () => {
    mockedArchiveConversation.mockResolvedValue({ ok: true, value: { ...DEFAULT_CONVERSATION, archived: true } });
    render(<ArchiveConversation conversationId="c1" initialArchived={false} />);

    fireEvent.click(screen.getByRole("button", { name: "封存對話" }));

    await waitFor(() => expect(mockedArchiveConversation).toHaveBeenCalledWith("c1"));
    expect(mockedUnarchiveConversation).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "取消封存" })).toBeInTheDocument();
  });

  it("clicking 取消封存 calls unarchiveConversation (not archiveConversation) and flips the button to 封存對話", async () => {
    mockedUnarchiveConversation.mockResolvedValue({ ok: true, value: { ...DEFAULT_CONVERSATION, archived: false } });
    render(<ArchiveConversation conversationId="c1" initialArchived={true} />);

    fireEvent.click(screen.getByRole("button", { name: "取消封存" }));

    await waitFor(() => expect(mockedUnarchiveConversation).toHaveBeenCalledWith("c1"));
    expect(mockedArchiveConversation).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "封存對話" })).toBeInTheDocument();
  });

  it("shows a distinct error message and keeps the 封存對話 label when archiving fails", async () => {
    mockedArchiveConversation.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });
    render(<ArchiveConversation conversationId="c1" initialArchived={false} />);

    fireEvent.click(screen.getByRole("button", { name: "封存對話" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("封存失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "封存對話" })).toBeInTheDocument();
  });

  it("shows a distinct error message and keeps the 取消封存 label when unarchiving fails", async () => {
    mockedUnarchiveConversation.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });
    render(<ArchiveConversation conversationId="c1" initialArchived={true} />);

    fireEvent.click(screen.getByRole("button", { name: "取消封存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("取消封存失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "取消封存" })).toBeInTheDocument();
  });

  it("disables the button while the toggle is in flight", async () => {
    let resolveArchive!: (value: Awaited<ReturnType<typeof archiveConversation>>) => void;
    mockedArchiveConversation.mockReturnValue(new Promise((resolve) => (resolveArchive = resolve)));
    render(<ArchiveConversation conversationId="c1" initialArchived={false} />);

    fireEvent.click(screen.getByRole("button", { name: "封存對話" }));

    expect(screen.getByRole("button", { name: "封存對話" })).toBeDisabled();

    resolveArchive({ ok: true, value: { ...DEFAULT_CONVERSATION, archived: true } });
    await waitFor(() => expect(screen.getByRole("button", { name: "取消封存" })).not.toBeDisabled());
  });
});
