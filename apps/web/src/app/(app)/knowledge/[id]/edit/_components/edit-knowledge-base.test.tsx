import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import EditKnowledgeBase from "./edit-knowledge-base";
import { getKnowledgeBase, updateKnowledgeBase } from "@/lib/knowledge-bases";
import { trackEvent } from "@/lib/telemetry";

const { mockReplace, mockRefresh, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  const mockRefresh = vi.fn();
  // Stable reference — see session-gate.test.tsx for why this matters.
  return { mockReplace, mockRefresh, mockRouter: { replace: mockReplace, refresh: mockRefresh } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/knowledge-bases", () => ({
  getKnowledgeBase: vi.fn(),
  updateKnowledgeBase: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase);
const mockedUpdateKnowledgeBase = vi.mocked(updateKnowledgeBase);
const mockedTrackEvent = vi.mocked(trackEvent);

const sampleKnowledgeBase = {
  id: "kb1",
  name: "研發部門知識庫",
  description: "內部技術文件。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedGetKnowledgeBase.mockReset();
  mockedUpdateKnowledgeBase.mockReset();
  mockedTrackEvent.mockReset();
});

describe("EditKnowledgeBase (E05-S004)", () => {
  it("shows a loading state before the knowledge base resolves", () => {
    mockedGetKnowledgeBase.mockReturnValue(new Promise(() => {}));

    render(<EditKnowledgeBase id="kb1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the form pre-filled with the existing name and description once loaded", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<EditKnowledgeBase id="kb1" />);

    expect(await screen.findByLabelText("知識庫名稱")).toHaveValue("研發部門知識庫");
    expect(screen.getByLabelText("說明")).toHaveValue("內部技術文件。");
    expect(screen.getByRole("button", { name: "儲存" })).toBeEnabled();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<EditKnowledgeBase id="kb1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入知識庫。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: null });

    render(<EditKnowledgeBase id="does-not-exist" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });

  it("disables the save button when the name is cleared to empty/whitespace", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<EditKnowledgeBase id="kb1" />);
    await screen.findByLabelText("知識庫名稱");

    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();
  });

  it("the cancel link points back to /knowledge", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<EditKnowledgeBase id="kb1" />);
    await screen.findByLabelText("知識庫名稱");

    expect(screen.getByRole("link", { name: "取消" })).toHaveAttribute("href", "/knowledge");
  });

  it("submits the trimmed name and description, then redirects to /knowledge and refreshes the router cache", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBase.mockResolvedValue({
      ok: true,
      value: { ...sampleKnowledgeBase, name: "研發部門知識庫（新）", description: "更新後的說明。" },
    });

    render(<EditKnowledgeBase id="kb1" />);
    await screen.findByLabelText("知識庫名稱");

    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "  研發部門知識庫（新）  " } });
    fireEvent.change(screen.getByLabelText("說明"), { target: { value: "  更新後的說明。  " } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/knowledge"));
    expect(mockedUpdateKnowledgeBase).toHaveBeenCalledWith("kb1", "研發部門知識庫（新）", "  更新後的說明。  ");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct error alert when saving fails, does not navigate away, and keeps the entered values", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBase.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<EditKnowledgeBase id="kb1" />);
    await screen.findByLabelText("知識庫名稱");

    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "研發部門知識庫（新）" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("無法儲存知識庫");
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("知識庫名稱")).toHaveValue("研發部門知識庫（新）");
  });

  it("disables the save button while the request is pending, preventing a double submit", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    let resolveUpdate!: (result: Awaited<ReturnType<typeof updateKnowledgeBase>>) => void;
    mockedUpdateKnowledgeBase.mockReturnValueOnce(new Promise((resolve) => (resolveUpdate = resolve)));

    render(<EditKnowledgeBase id="kb1" />);
    await screen.findByLabelText("知識庫名稱");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    resolveUpdate({ ok: true, value: sampleKnowledgeBase });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    expect(mockedUpdateKnowledgeBase).toHaveBeenCalledTimes(1);
  });

  it("emits attempt and success telemetry sharing the same correlation id", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<EditKnowledgeBase id="kb1" />);
    await screen.findByLabelText("知識庫名稱");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_update_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_update_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const successId = (successCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(successId);
  });

  it("emits failure telemetry with the error code when saving fails", async () => {
    mockedGetKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });
    mockedUpdateKnowledgeBase.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<EditKnowledgeBase id="kb1" />);
    await screen.findByLabelText("知識庫名稱");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_update_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("SERVICE_UNAVAILABLE");
  });
});
