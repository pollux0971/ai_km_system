import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "./telemetry";

describe("trackEvent (E01-S019)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the event name with a fresh correlation id when none is supplied", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    trackEvent("test_event", { properties: { foo: "bar" } });

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls.at(0);
    expect(call).toBeDefined();
    const [message, meta] = call as [string, { correlationId: string; foo: string }];
    expect(message).toBe("[web:telemetry] telemetry: test_event");
    expect(meta).toMatchObject({ foo: "bar" });
    expect(typeof meta.correlationId).toBe("string");
    expect(meta.correlationId.length).toBeGreaterThan(0);
  });

  it("reuses a caller-supplied correlation id instead of generating a new one", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    trackEvent("login_success", { correlationId: "fixed-id-123" });

    const call = spy.mock.calls.at(0);
    expect(call).toBeDefined();
    const [, meta] = call as [string, { correlationId: string }];
    expect(meta.correlationId).toBe("fixed-id-123");
  });

  it("generates a different correlation id for each call when none is supplied", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    trackEvent("event_a");
    trackEvent("event_b");

    const callA = spy.mock.calls.at(0);
    const callB = spy.mock.calls.at(1);
    expect(callA).toBeDefined();
    expect(callB).toBeDefined();
    const idA = (callA as [string, { correlationId: string }])[1].correlationId;
    const idB = (callB as [string, { correlationId: string }])[1].correlationId;
    expect(idA).not.toBe(idB);
  });

  it("never throws, even with no properties at all", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    expect(() => trackEvent("no_props_event")).not.toThrow();
  });
});
