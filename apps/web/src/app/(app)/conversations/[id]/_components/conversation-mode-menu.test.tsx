import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConversationModeMenu } from "./conversation-mode-menu";

describe("ConversationModeMenu (ux/enterprise-polish)", () => {
  it("shows the current mode on the trigger and keeps the panel closed by default", () => {
    render(
      <ConversationModeMenu mode="normal">
        <button type="button">一般模式</button>
      </ConversationModeMenu>,
    );

    const trigger = screen.getByRole("button", { name: "對話模式：一般" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "選擇對話模式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "一般模式" })).not.toBeInTheDocument();
  });

  it("opens the panel (revealing its children) on click and closes it again on a second click", () => {
    render(
      <ConversationModeMenu mode="advanced">
        <button type="button">進階模式</button>
      </ConversationModeMenu>,
    );

    const trigger = screen.getByRole("button", { name: "對話模式：進階" });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: "選擇對話模式" });
    expect(panel).toContainElement(screen.getByRole("button", { name: "進階模式" }));

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "進階模式" })).not.toBeInTheDocument();
  });

  it("falls back to 一般 on the trigger while the mode is still unknown (null)", () => {
    render(
      <ConversationModeMenu mode={null}>
        <span>children</span>
      </ConversationModeMenu>,
    );

    expect(screen.getByRole("button", { name: "對話模式：一般" })).toBeInTheDocument();
  });
});
