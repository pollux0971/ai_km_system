/**
 * In-process change-event pub/sub (E04-S044, ADR 0003 §7).
 *
 * One `ChangeEventBus` instance is shared by every SSE connection within a
 * single `apps/api` process. Explicitly single-process — cross-process
 * fan-out (Redis, etc.) is a documented non-goal of this story.
 *
 * A route calls `publish()` only AFTER the write's `db.transaction(...)()`
 * call has already returned successfully — never from inside the
 * transaction closure. That ordering, not anything in this file, is what
 * guarantees a rolled-back write is never announced: the code that would
 * call `publish()` is unreachable unless the transaction already committed.
 */
import { EventEmitter } from "node:events";
import type { ChangeEventRow } from "../repository/change-events.repository.js";
import type { OwnerKey } from "../repository/owner-scope.js";

export const DEFAULT_MAX_CONNECTIONS_PER_OWNER = 20;

export type ChangeEventListener = (event: ChangeEventRow) => void;

export interface ChangeEventBusOptions {
  /** Overridden by tests only — production always uses the 20-connection default (contract). */
  readonly maxConnectionsPerOwner?: number;
}

export class ChangeEventBus {
  private readonly emitter = new EventEmitter();
  private readonly counts = new Map<OwnerKey, number>();
  private readonly maxConnectionsPerOwner: number;

  constructor(options: ChangeEventBusOptions = {}) {
    this.maxConnectionsPerOwner = options.maxConnectionsPerOwner ?? DEFAULT_MAX_CONNECTIONS_PER_OWNER;
    // This bus's own cap enforces the real limit; EventEmitter's built-in
    // "possible memory leak" warning at 10 listeners is noise on top of it.
    this.emitter.setMaxListeners(0);
  }

  connectionCount(ownerKey: OwnerKey): number {
    return this.counts.get(ownerKey) ?? 0;
  }

  /**
   * Registers `listener` for `ownerKey`'s events. Returns an unsubscribe
   * function, or `null` if this owner is already at
   * `maxConnectionsPerOwner` — the caller (the route) is responsible for
   * turning that into a 429 `TOO_MANY_CONNECTIONS` and never opening a
   * stream for it.
   */
  subscribe(ownerKey: OwnerKey, listener: ChangeEventListener): (() => void) | null {
    if (this.connectionCount(ownerKey) >= this.maxConnectionsPerOwner) return null;

    this.counts.set(ownerKey, this.connectionCount(ownerKey) + 1);
    this.emitter.on(ownerKey, listener);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.emitter.off(ownerKey, listener);
      const remaining = this.connectionCount(ownerKey) - 1;
      if (remaining <= 0) this.counts.delete(ownerKey);
      else this.counts.set(ownerKey, remaining);
    };
  }

  /** Fans `event` out to every current subscriber of `ownerKey`. A no-op if there are none. */
  publish(ownerKey: OwnerKey, event: ChangeEventRow): void {
    this.emitter.emit(ownerKey, event);
  }
}
