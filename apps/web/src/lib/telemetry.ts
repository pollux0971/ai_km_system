import { createLogger } from "@ai-km/logger";

const logger = createLogger("web:telemetry");

/**
 * Interface stub for the E14 (Audit, Security & Observability, Team B)
 * telemetry ingestion endpoint. contracts/openapi/core.yaml has no paths
 * yet, so there is nothing to call — every call site gets a stable,
 * typed shape to code against now, routed through the existing logger
 * (see apps/web/src/lib/auth.ts for the same "mock the not-yet-built
 * backend" pattern applied to E02). Swap trackEvent's body for a real
 * HTTP call once E14's contract exists; the call sites below don't need
 * to change.
 */
export interface TelemetryEvent {
  name: string;
  correlationId: string;
  properties?: Record<string, unknown>;
}

/**
 * Fires a structured telemetry event. Deliberately synchronous and
 * never throws — telemetry must never block or fail the caller's own
 * flow (AC 4/5: a dependency issue here must not corrupt an unrelated
 * user action). Pass `correlationId` to join this event with other
 * telemetry/log entries about the same operation (e.g. an attempt and
 * its outcome); omit it for a standalone event (e.g. a page view),
 * which gets a fresh one.
 */
export function trackEvent(
  name: string,
  options?: { correlationId?: string; properties?: Record<string, unknown> },
): void {
  const event: TelemetryEvent = {
    name,
    correlationId: options?.correlationId ?? crypto.randomUUID(),
    properties: options?.properties,
  };
  logger.info(`telemetry: ${event.name}`, { correlationId: event.correlationId, ...event.properties });
}
