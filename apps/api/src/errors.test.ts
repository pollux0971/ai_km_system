import { describe, expect, it } from "vitest";
import { ApiHttpError, ERROR_CODES, toErrorBody } from "./errors.js";

describe("ApiHttpError (E04-S039)", () => {
  it("carries a stable machine-readable code and an HTTP status", () => {
    const e = new ApiHttpError(ERROR_CODES.NOT_FOUND, 404, "找不到這筆資料。");
    expect(e.code).toBe("NOT_FOUND");
    expect(e.statusCode).toBe(404);
    expect(e).toBeInstanceOf(Error);
  });

  it("serialises to the core.yaml Error envelope and nothing more", () => {
    const e = new ApiHttpError(ERROR_CODES.VALIDATION_ERROR, 400, "壞掉了。", { issues: [] });
    expect(Object.keys(toErrorBody(e)).sort()).toEqual(["code", "details", "message"]);
  });

  it("omits `details` entirely when there are none, rather than emitting null", () => {
    const body = toErrorBody(new ApiHttpError(ERROR_CODES.NOT_FOUND, 404, "無。"));
    expect("details" in body).toBe(false);
  });

  it("never leaks a stack through the serialised body", () => {
    const body = toErrorBody(new ApiHttpError(ERROR_CODES.INTERNAL_ERROR, 500, "壞了。"));
    expect(JSON.stringify(body)).not.toContain("at ");
    expect(JSON.stringify(body)).not.toContain(".ts");
  });

  it("exposes exactly the ADR 0003 stable code set", () => {
    expect(Object.keys(ERROR_CODES).sort()).toEqual(
      [
        "CONFLICT",
        "GATEWAY_TIMEOUT",
        "INTERNAL_ERROR",
        "NOT_FOUND",
        "PAYLOAD_TOO_LARGE",
        "PERMISSION_DENIED",
        "SERVICE_UNAVAILABLE",
        "UNAUTHENTICATED",
        "UNSUPPORTED_MEDIA_TYPE",
        "VALIDATION_ERROR",
      ].sort(),
    );
  });
});
