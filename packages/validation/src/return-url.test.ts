import { describe, expect, it } from "vitest";
import { sanitizeReturnUrl } from "./return-url";

describe("sanitizeReturnUrl", () => {
  it("passes through a plain relative path", () => {
    expect(sanitizeReturnUrl("/dashboard")).toBe("/dashboard");
  });

  it("passes through a relative path with its own query string", () => {
    expect(sanitizeReturnUrl("/knowledge?tab=recent")).toBe("/knowledge?tab=recent");
  });

  it("falls back to / when the value is null", () => {
    expect(sanitizeReturnUrl(null)).toBe("/");
  });

  it("falls back to / when the value is undefined", () => {
    expect(sanitizeReturnUrl(undefined)).toBe("/");
  });

  it("falls back to / when the value is an empty string", () => {
    expect(sanitizeReturnUrl("")).toBe("/");
  });

  it("uses a custom fallback when provided", () => {
    expect(sanitizeReturnUrl(null, "/home")).toBe("/home");
  });

  it("rejects a value with no leading slash", () => {
    expect(sanitizeReturnUrl("dashboard")).toBe("/");
  });

  it("rejects an absolute http URL (open-redirect attempt)", () => {
    expect(sanitizeReturnUrl("http://evil.example/phish")).toBe("/");
  });

  it("rejects an absolute https URL (open-redirect attempt)", () => {
    expect(sanitizeReturnUrl("https://evil.example/phish")).toBe("/");
  });

  it("rejects a protocol-relative //host URL (open-redirect attempt)", () => {
    expect(sanitizeReturnUrl("//evil.example/phish")).toBe("/");
  });

  it("rejects a backslash-prefixed URL some browsers normalize to //", () => {
    expect(sanitizeReturnUrl("/\\evil.example")).toBe("/");
  });

  it("rejects a javascript: pseudo-protocol value", () => {
    expect(sanitizeReturnUrl("javascript:alert(1)")).toBe("/");
  });

  it("rejects a value smuggling a scheme after a relative-looking prefix", () => {
    expect(sanitizeReturnUrl("/redirect?to=https://evil.example")).toBe("/");
  });

  it("rejects a value containing a NUL control character", () => {
    const withNul = "/dashboard" + String.fromCharCode(0) + "/evil";
    expect(sanitizeReturnUrl(withNul)).toBe("/");
  });

  it("rejects a value containing a newline control character", () => {
    const withNewline = "/dashboard" + String.fromCharCode(10) + "Set-Cookie: x=1";
    expect(sanitizeReturnUrl(withNewline)).toBe("/");
  });

  it("rejects a value containing a DEL control character", () => {
    const withDel = "/dashboard" + String.fromCharCode(127);
    expect(sanitizeReturnUrl(withDel)).toBe("/");
  });
});
