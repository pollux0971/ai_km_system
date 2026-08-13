import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageContent } from "./message-content";

// Badges are queried via role "superscript" (the <sup> element's own
// correct implicit ARIA role — see message-content.tsx's doc comment
// for why this is used instead of an explicit role="doc-noteref": real
// browser accessibility trees don't reliably expose that DPUB role, so
// asserting on it wouldn't hold up under the same E2E tooling used for
// this component's citation-badge.spec.ts).
describe("MessageContent (E03-S013)", () => {
  it("renders plain content unchanged when withCitations is false", () => {
    render(<MessageContent content="這是一般文字 [1] 不應該被當成引用。" withCitations={false} />);

    expect(screen.getByText("這是一般文字 [1] 不應該被當成引用。")).toBeInTheDocument();
    expect(screen.queryByRole("superscript")).not.toBeInTheDocument();
  });

  it("renders a [N] marker as a distinct citation badge when withCitations is true", () => {
    render(<MessageContent content="本季華北區成長 12%[1]，主要來自新客戶導入。" withCitations={true} />);

    const badge = screen.getByRole("superscript");
    expect(badge).toHaveTextContent("[1]");
    expect(screen.getByText(/本季華北區成長 12%/)).toBeInTheDocument();
    expect(screen.getByText(/主要來自新客戶導入/)).toBeInTheDocument();
  });

  it("renders multiple distinct citation badges in one message", () => {
    render(<MessageContent content="第一個來源[1]，第二個來源[2]。" withCitations={true} />);

    const badges = screen.getAllByRole("superscript");
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent("[1]");
    expect(badges[1]).toHaveTextContent("[2]");
  });

  it("renders content with no citation markers as plain text, even with withCitations true", () => {
    render(<MessageContent content="這則回覆完全沒有引用標記。" withCitations={true} />);

    expect(screen.getByText("這則回覆完全沒有引用標記。")).toBeInTheDocument();
    expect(screen.queryByRole("superscript")).not.toBeInTheDocument();
  });

  it("does not treat a non-numeric bracketed segment as a citation", () => {
    render(<MessageContent content="請參考附錄 [A] 的說明。" withCitations={true} />);

    expect(screen.queryByRole("superscript")).not.toBeInTheDocument();
    expect(screen.getByText(/請參考附錄 \[A\] 的說明/)).toBeInTheDocument();
  });

  it("gives each citation badge a distinct accessible label matching its number", () => {
    render(<MessageContent content="第一個來源[1]，第二個來源[2]。" withCitations={true} />);

    expect(screen.getByRole("superscript", { name: "引用來源 1" })).toBeInTheDocument();
    expect(screen.getByRole("superscript", { name: "引用來源 2" })).toBeInTheDocument();
  });
});
