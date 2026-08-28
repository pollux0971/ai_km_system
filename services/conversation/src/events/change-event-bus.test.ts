import { describe, expect, it } from "vitest";
import { ChangeEventBus } from "./change-event-bus.js";
import { toOwnerKey } from "../repository/owner-scope.js";

const OWNER = toOwnerKey("owner-1");
const OTHER_OWNER = toOwnerKey("owner-2");

const EVENT = {
  seq: 1,
  type: "conversation.created" as const,
  conversationId: "c1",
  occurredAt: "2026-08-28T05:00:00.000Z",
};

describe("ChangeEventBus.subscribe/publish", () => {
  it("delivers a published event only to subscribers of that owner", () => {
    const bus = new ChangeEventBus();
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    bus.subscribe(OWNER, (e) => receivedA.push(e));
    bus.subscribe(OTHER_OWNER, (e) => receivedB.push(e));

    bus.publish(OWNER, EVENT);

    expect(receivedA).toEqual([EVENT]);
    expect(receivedB).toEqual([]);
  });

  it("delivers to every subscriber of the same owner", () => {
    const bus = new ChangeEventBus();
    const received1: unknown[] = [];
    const received2: unknown[] = [];
    bus.subscribe(OWNER, (e) => received1.push(e));
    bus.subscribe(OWNER, (e) => received2.push(e));

    bus.publish(OWNER, EVENT);

    expect(received1).toEqual([EVENT]);
    expect(received2).toEqual([EVENT]);
  });

  it("publishing to an owner with no subscribers is a silent no-op", () => {
    const bus = new ChangeEventBus();
    expect(() => bus.publish(OWNER, EVENT)).not.toThrow();
  });
});

describe("ChangeEventBus unsubscribe", () => {
  it("the returned unsubscribe function stops delivery", () => {
    const bus = new ChangeEventBus();
    const received: unknown[] = [];
    const unsubscribe = bus.subscribe(OWNER, (e) => received.push(e));
    unsubscribe?.();
    bus.publish(OWNER, EVENT);
    expect(received).toEqual([]);
  });

  it("unsubscribing one listener does not affect another for the same owner", () => {
    const bus = new ChangeEventBus();
    const received: unknown[] = [];
    const unsubscribeFirst = bus.subscribe(OWNER, () => {
      throw new Error("should have been unsubscribed");
    });
    bus.subscribe(OWNER, (e) => received.push(e));
    unsubscribeFirst?.();

    bus.publish(OWNER, EVENT);
    expect(received).toEqual([EVENT]);
  });

  it("connectionCount drops to 0 after the last subscriber unsubscribes", () => {
    const bus = new ChangeEventBus();
    const a = bus.subscribe(OWNER, () => {});
    const b = bus.subscribe(OWNER, () => {});
    expect(bus.connectionCount(OWNER)).toBe(2);
    a?.();
    expect(bus.connectionCount(OWNER)).toBe(1);
    b?.();
    expect(bus.connectionCount(OWNER)).toBe(0);
  });
});

describe("ChangeEventBus connection limit (AC6)", () => {
  it("allows up to maxConnectionsPerOwner subscriptions", () => {
    const bus = new ChangeEventBus({ maxConnectionsPerOwner: 3 });
    expect(bus.subscribe(OWNER, () => {})).not.toBeNull();
    expect(bus.subscribe(OWNER, () => {})).not.toBeNull();
    expect(bus.subscribe(OWNER, () => {})).not.toBeNull();
  });

  it("returns null for the connection over the limit, without disturbing existing ones", () => {
    const bus = new ChangeEventBus({ maxConnectionsPerOwner: 2 });
    const a = bus.subscribe(OWNER, () => {});
    const b = bus.subscribe(OWNER, () => {});
    const rejected = bus.subscribe(OWNER, () => {});
    expect(rejected).toBeNull();
    expect(bus.connectionCount(OWNER)).toBe(2);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });

  it("frees a slot once a connection unsubscribes, allowing a new one", () => {
    const bus = new ChangeEventBus({ maxConnectionsPerOwner: 1 });
    const a = bus.subscribe(OWNER, () => {});
    expect(bus.subscribe(OWNER, () => {})).toBeNull();
    a?.();
    expect(bus.subscribe(OWNER, () => {})).not.toBeNull();
  });

  it("the limit is per-owner — another owner is unaffected", () => {
    const bus = new ChangeEventBus({ maxConnectionsPerOwner: 1 });
    bus.subscribe(OWNER, () => {});
    expect(bus.subscribe(OTHER_OWNER, () => {})).not.toBeNull();
  });

  it("defaults to 20 connections per owner in production", () => {
    const bus = new ChangeEventBus();
    for (let i = 0; i < 20; i += 1) {
      expect(bus.subscribe(OWNER, () => {})).not.toBeNull();
    }
    expect(bus.subscribe(OWNER, () => {})).toBeNull();
  });
});
