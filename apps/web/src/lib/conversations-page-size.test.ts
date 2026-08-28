import { afterEach, describe, expect, it, vi } from "vitest";
import { readPageSize } from "./conversations";

/**
 * E03-S046. `readPageSize()` reads `process.env` fresh on every call (not
 * once at import time, unlike the eager `CONVERSATIONS_PAGE_SIZE` constant
 * it initializes) — deliberately, so each AC branch below can be exercised
 * directly by mutating the env var, with no `vi.resetModules()` +
 * dynamic-re-import gymnastics needed to force a module to re-evaluate.
 * `vitest.setup.ts` already sets `NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE=2`
 * globally for every other test file's sake — this file restores that
 * value in `afterEach` so it doesn't leak a different value into whichever
 * test file Vitest happens to run next.
 */

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE;
  else process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE = ORIGINAL_ENV;
});

describe("readPageSize (E03-S046)", () => {
  it("defaults to 20 when the env var is unset", () => {
    delete process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE;
    expect(readPageSize()).toBe(20);
  });

  it('parses "2" as 2', () => {
    process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE = "2";
    expect(readPageSize()).toBe(2);
  });

  it('falls back to 20 and warns on "0" (below the 1-200 range)', () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE = "0";
    expect(readPageSize()).toBe(20);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("0");
    warnSpy.mockRestore();
  });

  it('falls back to 20 and warns on "abc" (non-numeric)', () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE = "abc";
    expect(readPageSize()).toBe(20);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('falls back to 20 and warns on "999" (above the 1-200 range)', () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE = "999";
    expect(readPageSize()).toBe(20);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("does not warn when the env var is simply unset (not configured is not invalid)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE;
    readPageSize();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("accepts the boundary values 1 and 200", () => {
    process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE = "1";
    expect(readPageSize()).toBe(1);
    process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE = "200";
    expect(readPageSize()).toBe(200);
  });

  it("rejects non-integer numeric strings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE = "2.5";
    expect(readPageSize()).toBe(20);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
