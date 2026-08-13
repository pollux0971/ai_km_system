import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ModelSelector } from "./model-selector";
import { setConversationModel } from "@/lib/conversations";

vi.mock("@/lib/conversations", () => ({
  setConversationModel: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedSetConversationModel = vi.mocked(setConversationModel);

beforeEach(() => {
  mockedSetConversationModel.mockReset();
});

describe("ModelSelector (E03-S005)", () => {
  it("shows the initial model selected", () => {
    render(<ModelSelector conversationId="c1" initialModel="advanced-local" />);

    expect(screen.getByRole("combobox", { name: "AI 模型" })).toHaveValue("advanced-local");
  });

  it("lists all three models, with the cloud option disabled", () => {
    render(<ModelSelector conversationId="c1" initialModel="standard" />);

    const select = screen.getByRole("combobox", { name: "AI 模型" });
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.map((option) => option.textContent)).toEqual([
      "標準模型（地端）",
      "進階模型（地端）",
      "雲端模型（尚未啟用）",
    ]);
    const cloudOption = options.find((option) => option.textContent === "雲端模型（尚未啟用）");
    expect(cloudOption).toBeDisabled();
  });

  it("switches to the selected model once the update succeeds", async () => {
    mockedSetConversationModel.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "t",
        lastMessageAt: "2026-08-14T00:00:00.000Z",
        lastMessagePreview: "p",
        mode: "advanced",
        knowledgeScopes: [],
        model: "advanced-local",
      },
    });

    render(<ModelSelector conversationId="c1" initialModel="standard" />);
    fireEvent.change(screen.getByRole("combobox", { name: "AI 模型" }), { target: { value: "advanced-local" } });

    await waitFor(() => expect(screen.getByRole("combobox", { name: "AI 模型" })).toHaveValue("advanced-local"));
    expect(mockedSetConversationModel).toHaveBeenCalledWith("c1", "advanced-local");
  });

  it("shows a distinct error state and keeps the previous model when the switch fails", async () => {
    mockedSetConversationModel.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "這個模型目前無法使用。" },
    });

    render(<ModelSelector conversationId="c1" initialModel="standard" />);
    fireEvent.change(screen.getByRole("combobox", { name: "AI 模型" }), { target: { value: "advanced-local" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("切換模型失敗，請稍後再試。");
    expect(screen.getByRole("combobox", { name: "AI 模型" })).toHaveValue("standard");
  });

  it("does not call setConversationModel when re-selecting the already-active model", () => {
    render(<ModelSelector conversationId="c1" initialModel="standard" />);

    fireEvent.change(screen.getByRole("combobox", { name: "AI 模型" }), { target: { value: "standard" } });

    expect(mockedSetConversationModel).not.toHaveBeenCalled();
  });
});
