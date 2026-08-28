/**
 * UUID v5 (namespace + SHA-1), RFC 4122 §4.3.
 *
 * Used only by the dev/E2E seed (E04-S041 spec §"Dev seed") so the same
 * ownerKey always derives the same three fixed conversation ids — that is
 * what makes `seedSampleConversations` idempotent under repeated calls
 * (AC11) without needing a separate "have I seeded this owner before" flag.
 */
import { createHash } from "node:crypto";

/**
 * Fixed, arbitrary namespace for AI KM dev-seed ids. Any valid UUID is a
 * legal RFC 4122 v5 namespace — this one is not derived from anything, it
 * was simply generated once. It must never change: changing it would shift
 * every already-seeded sandbox's conversation ids.
 */
export const AI_KM_SEED_NAMESPACE = "8f5a9b7e-1c2d-4e3f-9a4b-6c7d8e9f0a1b";

function parseUuid(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new TypeError(`不是合法的 UUID,無法作為 v5 namespace:${uuid}`);
  }
  return Buffer.from(hex, "hex");
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join(
    "-",
  );
}

/** Deterministic name-based UUID: same (namespace, name) always yields the same id. */
export function uuidV5(namespace: string, name: string): string {
  const namespaceBytes = parseUuid(namespace);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1").update(namespaceBytes).update(nameBytes).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  return formatUuid(bytes);
}
