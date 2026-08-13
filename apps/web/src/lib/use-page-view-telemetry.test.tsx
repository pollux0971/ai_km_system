import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePageViewTelemetry } from "./use-page-view-telemetry";

const mockUsePathname = vi.hoisted(() => vi.fn());
const mockTrackEvent = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ usePathname: mockUsePathname }));
vi.mock("./telemetry", () => ({ trackEvent: mockTrackEvent }));

beforeEach(() => {
  mockUsePathname.mockReset();
  mockTrackEvent.mockReset();
});

describe("usePageViewTelemetry (E01-S019)", () => {
  it("fires a page_view event with the current pathname on mount", () => {
    mockUsePathname.mockReturnValue("/");

    renderHook(() => usePageViewTelemetry());

    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent).toHaveBeenCalledWith("page_view", { properties: { pathname: "/" } });
  });

  it("fires again when the pathname changes", () => {
    mockUsePathname.mockReturnValue("/profile");
    const { rerender } = renderHook(() => usePageViewTelemetry());
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);

    mockUsePathname.mockReturnValue("/knowledge");
    rerender();

    expect(mockTrackEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackEvent).toHaveBeenLastCalledWith("page_view", { properties: { pathname: "/knowledge" } });
  });

  it("does not fire again on a re-render with the same pathname", () => {
    mockUsePathname.mockReturnValue("/");
    const { rerender } = renderHook(() => usePageViewTelemetry());

    rerender();

    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
  });
});
