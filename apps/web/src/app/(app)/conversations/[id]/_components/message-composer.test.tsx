import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MessageComposer } from "./message-composer";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  mockedTrackEvent.mockReset();
});

describe("MessageComposer (E03-S006/S007)", () => {
  it("starts empty with the submit button disabled", () => {
    render(<MessageComposer conversationId="c1" />);

    expect(screen.getByLabelText("訊息")).toHaveValue("");
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("enables the submit button once non-whitespace text is entered", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });

  it("keeps the submit button disabled for whitespace-only input", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("clears the draft and emits telemetry (without the raw text) on submit", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(screen.getByLabelText("訊息")).toHaveValue("");
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_compose_submit",
      expect.objectContaining({ properties: { conversationId: "c1", length: 2 } }),
    );
    const [, payload] = mockedTrackEvent.mock.calls[0] as [string, { properties?: Record<string, unknown> }];
    expect(JSON.stringify(payload)).not.toContain("你好");
  });

  it("does not submit (no telemetry, draft unchanged) when bypassing the disabled button to submit an invalid draft", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "   " } });

    const form = screen.getByRole("button", { name: "送出" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(mockedTrackEvent).not.toHaveBeenCalled();
    expect(screen.getByLabelText("訊息")).toHaveValue("   ");
  });

  it("E03-S007: pressing Enter (without Shift) submits a valid draft, same as clicking 送出", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: false });

    expect(screen.getByLabelText("訊息")).toHaveValue("");
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_compose_submit",
      expect.objectContaining({ properties: { conversationId: "c1", length: 2 } }),
    );
  });

  it("E03-S007: pressing Shift+Enter does not submit, leaving the draft for a newline instead", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: true });

    expect(screen.getByLabelText("訊息")).toHaveValue("你好");
    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it("E03-S007: pressing Enter (without Shift) on an empty draft does not submit", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: false });

    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it("E03-S007: pressing Enter (without Shift) on a whitespace-only draft does not submit", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "   " } });

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: false });

    expect(mockedTrackEvent).not.toHaveBeenCalled();
    expect(screen.getByLabelText("訊息")).toHaveValue("   ");
  });
});
