import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import KnowledgeFolderSyncEditor from "./knowledge-folder-sync-editor";
import { getKnowledgeBase, updateKnowledgeBaseFolderSync } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
  updateKnowledgeBaseFolderSync: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);
const mockedUpdateKnowledgeBaseFolderSync = vi.mocked(updateKnowledgeBaseFolderSync);
const mockedTrackEvent = vi.mocked(trackEvent);

const sampleKnowledgeBase = {
  id: "kb1",
  name: "研發部門知識庫",
  description: "內部技術文件。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockedGetKnowledgeBase.mockReset();
  mockedUpdateKnowledgeBaseFolderSync.mockReset();
  mockedTrackEvent.mockReset();
});

describe("KnowledgeFolderSyncEditor (E05-S016)", () => {
  it("shows a loading state before the knowledge base resolves", () => {
    mockedGetKnowledgeBase.mockReturnValue(new Promise(() => {}));

    render(<KnowledgeFolderSyncEditor id="kb1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<KnowledgeFolderSyncEditor id="kb1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<KnowledgeFolderSyncEditor id="does-not-exist" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });

  it("shows an empty path and unchecked box when folder sync has never been configured", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeFolderSyncEditor id="kb1" />);

    expect(await screen.findByLabelText("資料夾路徑")).toHaveValue("");
    expect(screen.getByLabelText("啟用資料夾同步")).not.toBeChecked();
  });

  it("pre-fills the path and checkbox from the existing configuration", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, folderSyncPath: "/mnt/shared/policies", folderSyncEnabled: true },
    });

    render(<KnowledgeFolderSyncEditor id="kb1" />);

    expect(await screen.findByLabelText("資料夾路徑")).toHaveValue("/mnt/shared/policies");
    expect(screen.getByLabelText("啟用資料夾同步")).toBeChecked();
  });

  it("saving succeeds and shows a 已儲存 confirmation", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseFolderSync.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, folderSyncPath: "/mnt/shared/policies", folderSyncEnabled: true },
    });

    render(<KnowledgeFolderSyncEditor id="kb1" />);
    await screen.findByLabelText("資料夾路徑");

    fireEvent.change(screen.getByLabelText("資料夾路徑"), { target: { value: "/mnt/shared/policies" } });
    fireEvent.click(screen.getByLabelText("啟用資料夾同步"));
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByRole("status")).toHaveTextContent("已儲存。");
    expect(mockedUpdateKnowledgeBaseFolderSync).toHaveBeenCalledWith("kb1", "/mnt/shared/policies", true);
  });

  it("shows the SPECIFIC validation message and keeps the entered path when enabling without a path fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseFolderSync.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "啟用資料夾同步前，請先輸入資料夾路徑。" },
    });

    render(<KnowledgeFolderSyncEditor id="kb1" />);
    await screen.findByLabelText("資料夾路徑");
    fireEvent.click(screen.getByLabelText("啟用資料夾同步"));
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("啟用資料夾同步前，請先輸入資料夾路徑。");
    expect(screen.getByLabelText("啟用資料夾同步")).toBeChecked();
  });

  it("clears the 已儲存 confirmation as soon as the path is edited again", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseFolderSync.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, folderSyncPath: "/a", folderSyncEnabled: false },
    });

    render(<KnowledgeFolderSyncEditor id="kb1" />);
    await screen.findByLabelText("資料夾路徑");
    fireEvent.change(screen.getByLabelText("資料夾路徑"), { target: { value: "/a" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await screen.findByRole("status");

    fireEvent.change(screen.getByLabelText("資料夾路徑"), { target: { value: "/a/b" } });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears a previous error as soon as the checkbox is toggled again", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseFolderSync.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "啟用資料夾同步前，請先輸入資料夾路徑。" },
    });

    render(<KnowledgeFolderSyncEditor id="kb1" />);
    await screen.findByLabelText("資料夾路徑");
    fireEvent.click(screen.getByLabelText("啟用資料夾同步"));
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByLabelText("啟用資料夾同步"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the path input, checkbox, and 儲存 button while a save is in flight, preventing a double submit", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    let resolveUpdate!: (result: Awaited<ReturnType<typeof updateKnowledgeBaseFolderSync>>) => void;
    mockedUpdateKnowledgeBaseFolderSync.mockReturnValueOnce(new Promise((resolve) => (resolveUpdate = resolve)));

    render(<KnowledgeFolderSyncEditor id="kb1" />);
    await screen.findByLabelText("資料夾路徑");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled());
    expect(screen.getByLabelText("資料夾路徑")).toBeDisabled();
    expect(screen.getByLabelText("啟用資料夾同步")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    resolveUpdate({ ok: true, value: sampleKnowledgeBase });
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    expect(mockedUpdateKnowledgeBaseFolderSync).toHaveBeenCalledTimes(1);
  });

  it("shows a 返回知識庫詳情 link pointing back at /knowledge/{id}", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<KnowledgeFolderSyncEditor id="kb1" />);
    await screen.findByLabelText("資料夾路徑");

    expect(screen.getByRole("link", { name: "返回知識庫詳情" })).toHaveAttribute("href", "/knowledge/kb1");
  });

  it("emits attempt and success telemetry sharing the same correlation id, including enabled but NEVER the path", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseFolderSync.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, folderSyncPath: "/mnt/internal/secret-project", folderSyncEnabled: true },
    });

    render(<KnowledgeFolderSyncEditor id="kb1" />);
    await screen.findByLabelText("資料夾路徑");
    fireEvent.change(screen.getByLabelText("資料夾路徑"), { target: { value: "/mnt/internal/secret-project" } });
    fireEvent.click(screen.getByLabelText("啟用資料夾同步"));
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(mockedUpdateKnowledgeBaseFolderSync).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_folder_sync_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_folder_sync_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attempt = attemptCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    const success = successCall as [string, { correlationId: string; properties: Record<string, unknown> }];
    expect(attempt[1].correlationId).toBe(success[1].correlationId);
    expect(attempt[1].properties).toMatchObject({ knowledgeBaseId: "kb1", enabled: true });
    expect(success[1].properties).toMatchObject({ knowledgeBaseId: "kb1", enabled: true });
    for (const call of mockedTrackEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("secret-project");
    }
  });

  it("emits failure telemetry with the error code when saving fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBaseFolderSync.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "啟用資料夾同步前，請先輸入資料夾路徑。" },
    });

    render(<KnowledgeFolderSyncEditor id="kb1" />);
    await screen.findByLabelText("資料夾路徑");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_folder_sync_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("VALIDATION_ERROR");
  });
});
