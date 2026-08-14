import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewKnowledgeBasePage from "./page";
import { createKnowledgeBase } from "@/lib/knowledge-bases";
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
  createKnowledgeBase: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedCreateKnowledgeBase = vi.mocked(createKnowledgeBase);
const mockedTrackEvent = vi.mocked(trackEvent);

const sampleKnowledgeBase = {
  id: "kb-new-1",
  name: "研發部門知識庫",
  description: "內部技術文件。",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedCreateKnowledgeBase.mockReset();
  mockedTrackEvent.mockReset();
});

describe("NewKnowledgeBasePage (E05-S003)", () => {
  it("renders name and description fields with the submit button disabled until a name is entered", () => {
    render(<NewKnowledgeBasePage />);

    expect(screen.getByLabelText("知識庫名稱")).toHaveValue("");
    expect(screen.getByLabelText("說明")).toHaveValue("");
    expect(screen.getByRole("button", { name: "建立" })).toBeDisabled();
  });

  it("keeps the submit button disabled for a whitespace-only name", () => {
    render(<NewKnowledgeBasePage />);

    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "建立" })).toBeDisabled();
  });

  it("enables the submit button once a name is entered", () => {
    render(<NewKnowledgeBasePage />);

    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "研發部門知識庫" } });

    expect(screen.getByRole("button", { name: "建立" })).toBeEnabled();
  });

  it("the cancel link points back to /knowledge", () => {
    render(<NewKnowledgeBasePage />);

    expect(screen.getByRole("link", { name: "取消" })).toHaveAttribute("href", "/knowledge");
  });

  it("submits the trimmed name and description, then redirects to /knowledge and refreshes the router cache", async () => {
    mockedCreateKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<NewKnowledgeBasePage />);
    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "  研發部門知識庫  " } });
    fireEvent.change(screen.getByLabelText("說明"), { target: { value: "  內部技術文件。  " } });
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/knowledge"));
    expect(mockedCreateKnowledgeBase).toHaveBeenCalledWith("研發部門知識庫", "  內部技術文件。  ");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct error alert when creation fails, does not navigate away, and keeps the entered values", async () => {
    mockedCreateKnowledgeBase.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<NewKnowledgeBasePage />);
    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "研發部門知識庫" } });
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("無法建立知識庫");
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("知識庫名稱")).toHaveValue("研發部門知識庫");
  });

  it("disables the submit button while the request is pending, preventing a double submit", async () => {
    let resolveCreate!: (result: Awaited<ReturnType<typeof createKnowledgeBase>>) => void;
    mockedCreateKnowledgeBase.mockReturnValueOnce(new Promise((resolve) => (resolveCreate = resolve)));

    render(<NewKnowledgeBasePage />);
    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "研發部門知識庫" } });
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "建立" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    resolveCreate({ ok: true, value: sampleKnowledgeBase });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    expect(mockedCreateKnowledgeBase).toHaveBeenCalledTimes(1);
  });

  it("emits attempt and success telemetry sharing the same correlation id", async () => {
    mockedCreateKnowledgeBase.mockResolvedValue({ ok: true, value: sampleKnowledgeBase });

    render(<NewKnowledgeBasePage />);
    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "研發部門知識庫" } });
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_create_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_create_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const successId = (successCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(successId);
  });

  it("emits failure telemetry with the error code when creation fails", async () => {
    mockedCreateKnowledgeBase.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<NewKnowledgeBasePage />);
    fireEvent.change(screen.getByLabelText("知識庫名稱"), { target: { value: "研發部門知識庫" } });
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    await screen.findByRole("alert");

    const failureCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "knowledge_base_create_failure");
    expect(failureCall).toBeDefined();
    expect((failureCall as [string, { properties: { code: string } }])[1].properties.code).toBe("SERVICE_UNAVAILABLE");
  });
});
