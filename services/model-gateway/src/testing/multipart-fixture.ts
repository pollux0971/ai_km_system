/**
 * Test-only multipart/form-data request body builder for `app.inject()` —
 * Fastify's inject engine takes a raw payload + content-type header, it
 * does not assemble multipart bodies itself. `form-data` is the
 * established Node package for exactly this (buffer + matching boundary
 * headers), used here only in test code.
 */
import FormDataNode from "form-data";

export interface MultipartFixtureFields {
  readonly audio?: { buffer: Buffer; filename?: string; contentType?: string } | undefined;
  readonly language?: string;
  readonly conversationId?: string;
  /** Extra raw fields, for testing unknown/malformed submissions. */
  readonly extra?: Record<string, string>;
}

export interface MultipartFixture {
  readonly payload: Buffer;
  readonly headers: Record<string, string>;
}

export function makeMultipartRequest(fields: MultipartFixtureFields): MultipartFixture {
  const form = new FormDataNode();

  if (fields.audio) {
    form.append("audio", fields.audio.buffer, {
      filename: fields.audio.filename ?? "audio.wav",
      contentType: fields.audio.contentType ?? "audio/wav",
    });
  }
  if (fields.language !== undefined) form.append("language", fields.language);
  if (fields.conversationId !== undefined) form.append("conversationId", fields.conversationId);
  for (const [key, value] of Object.entries(fields.extra ?? {})) {
    form.append(key, value);
  }

  return {
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  };
}
