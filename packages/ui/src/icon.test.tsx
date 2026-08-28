import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Icon } from "./icon";

describe("Icon", () => {
  it("renders an aria-hidden span with the icon name as text and the md-icon class", () => {
    const { container } = render(<Icon name="mic" />);

    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span).toHaveTextContent("mic");
    expect(span).toHaveClass("md-icon");
    expect(span).toHaveAttribute("aria-hidden", "true");
    expect(span).not.toHaveAttribute("role");
    expect(span).not.toHaveAttribute("aria-label");
  });

  it("exposes role=img and aria-label, and aria-hidden=false, when a label is given", () => {
    render(<Icon name="mic" label="開始錄音" />);

    const icon = screen.getByRole("img", { name: "開始錄音" });
    expect(icon).toHaveTextContent("mic");
    expect(icon).toHaveAttribute("aria-hidden", "false");
  });

  it("renders a different icon name verbatim as text (no enum, any string ligature-renders)", () => {
    const { container } = render(<Icon name="search" />);

    expect(container.querySelector("span")).toHaveTextContent("search");
  });

  it("defaults to unfilled (FILL 0) and toggles to filled (FILL 1)", () => {
    const { container: unfilled } = render(<Icon name="star" />);
    const { container: filled } = render(<Icon name="star" filled />);

    expect(unfilled.querySelector("span")?.style.fontVariationSettings).toContain("'FILL' 0");
    expect(filled.querySelector("span")?.style.fontVariationSettings).toContain("'FILL' 1");
  });

  it("defaults to the M3 24dp baseline size", () => {
    const { container } = render(<Icon name="mic" />);

    expect(container.querySelector("span")?.style.fontSize).toBe("24px");
  });

  it("size sets font-size and the opsz variation axis together", () => {
    const { container } = render(<Icon name="mic" size={36} />);

    const style = container.querySelector("span")?.style;
    expect(style?.fontSize).toBe("36px");
    expect(style?.fontVariationSettings).toContain("'opsz' 36");
  });

  it("clamps opsz to the font's actual variable-axis range (20-48) for an out-of-range size", () => {
    const { container: tooSmall } = render(<Icon name="mic" size={8} />);
    const { container: tooLarge } = render(<Icon name="mic" size={96} />);

    expect(tooSmall.querySelector("span")?.style.fontVariationSettings).toContain("'opsz' 20");
    expect(tooSmall.querySelector("span")?.style.fontSize).toBe("8px");
    expect(tooLarge.querySelector("span")?.style.fontVariationSettings).toContain("'opsz' 48");
    expect(tooLarge.querySelector("span")?.style.fontSize).toBe("96px");
  });

  it("uses the self-hosted Material Symbols font family via the CSS variable, not a Google Fonts reference", () => {
    const { container } = render(<Icon name="mic" />);

    const fontFamily = container.querySelector("span")?.style.fontFamily;
    expect(fontFamily).toBe("var(--font-material-symbols)");
  });
});
