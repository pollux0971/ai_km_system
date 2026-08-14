import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationContextIndicator } from "./conversation-context-indicator";

describe("ConversationContextIndicator (E03-S018)", () => {
  it("shows a distinct empty-context message when there are no prior messages", () => {
    render(<ConversationContextIndicator messageCount={0} />);

    expect(screen.getByText("上下文：目前尚無先前訊息。")).toBeInTheDocument();
  });

  it("shows the exact count of prior messages when there is one", () => {
    render(<ConversationContextIndicator messageCount={1} />);

    expect(screen.getByText("上下文：包含 1 則先前訊息。")).toBeInTheDocument();
  });

  it("shows the exact count of prior messages for a full multi-turn history", () => {
    render(<ConversationContextIndicator messageCount={4} />);

    expect(screen.getByText("上下文：包含 4 則先前訊息。")).toBeInTheDocument();
  });
});
