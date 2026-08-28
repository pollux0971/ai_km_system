import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { VoiceVisualizer } from "./voice-visualizer";

function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function heightOf(el: Element): number {
  return parseFloat((el as HTMLElement).style.height);
}

function scaleOf(el: Element): number {
  const match = /scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform);
  if (!match) throw new Error("no scale() found in transform");
  return parseFloat(match[1]!);
}

describe("VoiceVisualizer", () => {
  afterEach(() => {
    stubMatchMedia(false);
  });

  describe("AC1: each state renders a distinct data-state/class with stable structure", () => {
    it("idle: mic icon only, no listening/transcribing/error markup", () => {
      stubMatchMedia(false);
      const { container } = render(<VoiceVisualizer state="idle" />);
      const root = container.firstElementChild!;

      expect(root).toHaveAttribute("data-state", "idle");
      expect(root.className).toContain("voice-visualizer--idle");
      expect(container.querySelectorAll("svg")).toHaveLength(1);
      expect(container.querySelector('[data-testid^="vv-listening"]')).toBeNull();
      expect(container.querySelector(".vv-arc")).toBeNull();
    });

    it("listening: ripple + 5 equalizer bars, no mic icon", () => {
      stubMatchMedia(false);
      const { container } = render(<VoiceVisualizer state="listening" level={0.5} />);
      const root = container.firstElementChild!;

      expect(root).toHaveAttribute("data-state", "listening");
      expect(container.querySelectorAll('[data-testid="vv-bar"]')).toHaveLength(5);
      expect(container.querySelectorAll('[data-testid^="vv-ripple"]')).toHaveLength(2);
      expect(container.querySelectorAll("svg")).toHaveLength(0);
    });

    it("transcribing: rotating arc + faded mic icon", () => {
      stubMatchMedia(false);
      const { container } = render(<VoiceVisualizer state="transcribing" />);
      const root = container.firstElementChild!;

      expect(root).toHaveAttribute("data-state", "transcribing");
      expect(container.querySelector('[data-testid="vv-arc"]')).not.toBeNull();
      expect(container.querySelectorAll("svg.vv-icon--faded")).toHaveLength(1);
    });

    it("error: mic-error icon (has an extra warning-badge path)", () => {
      stubMatchMedia(false);
      const { container } = render(<VoiceVisualizer state="error" />);
      const root = container.firstElementChild!;

      expect(root).toHaveAttribute("data-state", "error");
      const svg = container.querySelector("svg")!;
      // MicIcon has 2 path/rect primitives beyond the svg itself (rect+path);
      // MicErrorIcon adds 2 more for the warning badge (triangle + dot).
      expect(svg.querySelectorAll("rect, path").length).toBe(4);
    });
  });

  describe("AC2: listening level drives bar height / ripple scale, and is clamped", () => {
    it("level=0 renders the minimum bar height and ripple scale", () => {
      stubMatchMedia(false);
      const { container } = render(<VoiceVisualizer state="listening" level={0} />);
      const bars = container.querySelectorAll('[data-testid="vv-bar"]');
      const outerRipple = container.querySelector('[data-testid="vv-ripple-outer"]')!;

      for (const bar of bars) {
        expect(heightOf(bar)).toBeCloseTo(5, 2); // BAR_MIN_PX
      }
      expect(scaleOf(outerRipple)).toBeCloseTo(0.9, 2); // RIPPLE_MIN_SCALE
    });

    it("level=1 renders taller bars and a larger ripple scale than level=0", () => {
      stubMatchMedia(false);
      const zero = render(<VoiceVisualizer state="listening" level={0} />);
      const one = render(<VoiceVisualizer state="listening" level={1} />);

      const zeroCenterBar = zero.container.querySelectorAll('[data-testid="vv-bar"]')[2]!;
      const oneCenterBar = one.container.querySelectorAll('[data-testid="vv-bar"]')[2]!;
      expect(heightOf(oneCenterBar)).toBeGreaterThan(heightOf(zeroCenterBar));

      const zeroRipple = zero.container.querySelector('[data-testid="vv-ripple-outer"]')!;
      const oneRipple = one.container.querySelector('[data-testid="vv-ripple-outer"]')!;
      expect(scaleOf(oneRipple)).toBeGreaterThan(scaleOf(zeroRipple));
      expect(scaleOf(oneRipple)).toBeLessThanOrEqual(1.6); // RIPPLE_MAX_SCALE
    });

    it("clamps level > 1 to behave identically to level = 1", () => {
      stubMatchMedia(false);
      const over = render(<VoiceVisualizer state="listening" level={5} />);
      const one = render(<VoiceVisualizer state="listening" level={1} />);

      const overRipple = over.container.querySelector('[data-testid="vv-ripple-outer"]')!;
      const oneRipple = one.container.querySelector('[data-testid="vv-ripple-outer"]')!;
      expect(scaleOf(overRipple)).toBeCloseTo(scaleOf(oneRipple), 4);
    });

    it("clamps level < 0 to behave identically to level = 0", () => {
      stubMatchMedia(false);
      const under = render(<VoiceVisualizer state="listening" level={-3} />);
      const zero = render(<VoiceVisualizer state="listening" level={0} />);

      const underRipple = under.container.querySelector('[data-testid="vv-ripple-outer"]')!;
      const zeroRipple = zero.container.querySelector('[data-testid="vv-ripple-outer"]')!;
      expect(scaleOf(underRipple)).toBeCloseTo(scaleOf(zeroRipple), 4);
    });
  });

  describe("AC3: transcribing/error ignore level entirely", () => {
    it("transcribing DOM is identical regardless of level", () => {
      stubMatchMedia(false);
      const a = render(<VoiceVisualizer state="transcribing" level={0} />);
      const b = render(<VoiceVisualizer state="transcribing" level={1} />);
      expect(a.container.innerHTML).toBe(b.container.innerHTML);
    });

    it("error DOM is identical regardless of level", () => {
      stubMatchMedia(false);
      const a = render(<VoiceVisualizer state="error" level={0} />);
      const b = render(<VoiceVisualizer state="error" level={1} />);
      expect(a.container.innerHTML).toBe(b.container.innerHTML);
    });
  });

  describe("AC4: prefers-reduced-motion swaps animated markup for static, state-differentiated markup", () => {
    it("listening: renders data-reduced=true and a single static width-bar instead of ripple/bars", () => {
      stubMatchMedia(true);
      const { container } = render(<VoiceVisualizer state="listening" level={0.8} />);
      const root = container.firstElementChild!;

      expect(root).toHaveAttribute("data-reduced", "true");
      expect(container.querySelector('[data-testid="vv-listening-reduced"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="vv-bar-static"]')).not.toBeNull();
      expect(container.querySelectorAll('[data-testid="vv-bar"]')).toHaveLength(0);
      expect(container.querySelectorAll('[data-testid^="vv-ripple"]')).toHaveLength(0);
    });

    it("listening (reduced motion): the static bar's width still tracks level, and is clamped", () => {
      stubMatchMedia(true);
      const zero = render(<VoiceVisualizer state="listening" level={0} />);
      const high = render(<VoiceVisualizer state="listening" level={0.8} />);
      const over = render(<VoiceVisualizer state="listening" level={5} />);

      const widthOf = (container: HTMLElement) =>
        parseFloat(
          (container.querySelector('[data-testid="vv-bar-static"]') as HTMLElement).style.width,
        );

      expect(widthOf(zero.container)).toBeCloseTo(20, 1); // 20% + 0*80%
      expect(widthOf(high.container)).toBeGreaterThan(widthOf(zero.container));
      expect(widthOf(high.container)).toBeLessThanOrEqual(100);
      // level=5 clamps to the same effective level as level=1 (max), not
      // to the raw 5 — assert against a fresh level=1 render directly.
      const one = render(<VoiceVisualizer state="listening" level={1} />);
      expect(widthOf(over.container)).toBeCloseTo(widthOf(one.container), 4);
    });

    it("transcribing: renders the static-arc class, not the spinning-arc-only class", () => {
      stubMatchMedia(true);
      const { container } = render(<VoiceVisualizer state="transcribing" />);
      const arc = container.querySelector('[data-testid="vv-arc"]')!;
      expect(arc.className).toContain("vv-arc--static");
    });

    it("non-reduced-motion transcribing does NOT have the static-arc class", () => {
      stubMatchMedia(false);
      const { container } = render(<VoiceVisualizer state="transcribing" />);
      const arc = container.querySelector('[data-testid="vv-arc"]')!;
      expect(arc.className).not.toContain("vv-arc--static");
    });

    it("idle/error still show data-reduced=false when the preference is off", () => {
      stubMatchMedia(false);
      const { container } = render(<VoiceVisualizer state="idle" />);
      expect(container.firstElementChild).toHaveAttribute("data-reduced", "false");
    });
  });

  describe("AC5: aria-hidden and no focusable elements, for every state", () => {
    it.each(["idle", "listening", "transcribing", "error"] as const)(
      "state=%s is aria-hidden with zero focusable descendants",
      (state) => {
        stubMatchMedia(false);
        const { container } = render(<VoiceVisualizer state={state} level={0.5} />);
        expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
        expect(
          container.querySelectorAll("button, a, input, select, textarea, [tabindex]"),
        ).toHaveLength(0);
      },
    );
  });

  describe("size prop", () => {
    it("defaults to 56 and applies width/height", () => {
      stubMatchMedia(false);
      const { container } = render(<VoiceVisualizer state="idle" />);
      const root = container.firstElementChild as HTMLElement;
      expect(root).toHaveAttribute("data-size", "56");
      expect(root.style.width).toBe("56px");
      expect(root.style.height).toBe("56px");
    });

    it("accepts 40/72 explicitly", () => {
      stubMatchMedia(false);
      const { container } = render(<VoiceVisualizer state="idle" size={72} />);
      expect(container.firstElementChild).toHaveAttribute("data-size", "72");
    });
  });
});
