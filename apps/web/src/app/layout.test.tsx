import { describe, expect, it } from "vitest";
import { viewport } from "./layout";

describe("root layout viewport (E01-S016)", () => {
  it("sets device-width with initial scale 1 (desktop-correct DPI/zoom baseline)", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
  });
});
