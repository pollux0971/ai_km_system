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

function makeFile(name: string, sizeBytes: number): File {
  const file = new File(["x".repeat(Math.min(sizeBytes, 1))], name);
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("MessageComposer (E03-S006/S007/S008/S009)", () => {
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
      expect.objectContaining({ properties: { conversationId: "c1", length: 2, attachmentCount: 0 } }),
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
      expect.objectContaining({ properties: { conversationId: "c1", length: 2, attachmentCount: 0 } }),
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

  it("E03-S008: enables submit once a file is attached, even with no text", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10)] } });

    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });

  it("E03-S008: lists the attached file", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf", 10)] } });

    expect(screen.getByRole("listitem")).toHaveTextContent("報表.pdf");
  });

  it("E03-S008: submitting an attachment-only draft clears the attachment and reports attachmentCount, without any filename", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("機密文件.docx", 10)] } });

    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(screen.queryByText(/機密文件\.docx/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_compose_submit",
      expect.objectContaining({ properties: { conversationId: "c1", length: 0, attachmentCount: 1 } }),
    );
    const [, payload] = mockedTrackEvent.mock.calls[0] as [string, { properties?: Record<string, unknown> }];
    expect(JSON.stringify(payload)).not.toContain("機密文件");
  });

  it("E03-S008: submitting with both text and an attachment reports both in one event", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10), makeFile("b.txt", 10)] } });

    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_compose_submit",
      expect.objectContaining({ properties: { conversationId: "c1", length: 2, attachmentCount: 2 } }),
    );
  });

  it("E03-S008: removing the only attachment (with no text) disables submit again", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10)] } });
    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "移除 a.txt" }));

    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
    expect(screen.queryByText(/a\.txt/)).not.toBeInTheDocument();
  });

  it("E03-S009: calls onSubmit with the trimmed content and attachment names once a valid draft is submitted", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "  你好  " } });
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10)] } });

    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(onSubmit).toHaveBeenCalledWith("你好", ["a.txt"]);
  });

  it("E03-S009: does not call onSubmit when bypassing the disabled button to submit an invalid draft", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} />);

    const form = screen.getByRole("button", { name: "送出" }).closest("form");
    fireEvent.submit(form as HTMLFormElement);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("E03-S009: still works without an onSubmit prop (optional, backward compatible with S06-S08)", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    expect(() => fireEvent.click(screen.getByRole("button", { name: "送出" }))).not.toThrow();
    expect(screen.getByLabelText("訊息")).toHaveValue("");
  });

  it("E03-S017: defaults disabled to false — pre-S017 behavior (submit enabled once valid) is unchanged", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });

  it("E03-S017: disabled=true keeps submit disabled even with an otherwise-valid draft", () => {
    render(<MessageComposer conversationId="c1" disabled={true} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("E03-S017: disabled=true still lets the user type and attach files ahead — only sending is blocked", () => {
    render(<MessageComposer conversationId="c1" disabled={true} />);

    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10)] } });

    expect(screen.getByLabelText("訊息")).toHaveValue("你好");
    expect(screen.getByRole("listitem")).toHaveTextContent("a.txt");
  });

  it("E03-S017: pressing Enter does not submit while disabled=true, even with a valid draft", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} disabled={true} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: false });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("訊息")).toHaveValue("你好");
  });

  it("E03-S017: does not call onSubmit when bypassing the disabled button via direct form submit while disabled=true", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} disabled={true} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    const form = screen.getByRole("button", { name: "送出" }).closest("form");
    fireEvent.submit(form as HTMLFormElement);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it("E03-S017: re-enables submit once disabled flips back to false, without losing the draft", () => {
    const { rerender } = render(<MessageComposer conversationId="c1" disabled={true} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();

    rerender(<MessageComposer conversationId="c1" disabled={false} />);

    expect(screen.getByLabelText("訊息")).toHaveValue("你好");
    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });
});
