import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { CurrentUserProvider, useCurrentUser, useOptionalCurrentUser } from "./session-context";

const session = {
  userId: "u1",
  roles: ["general_user"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

describe("useCurrentUser", () => {
  it("returns the session provided by CurrentUserProvider", () => {
    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: ({ children }) => <CurrentUserProvider value={session}>{children}</CurrentUserProvider>,
    });

    expect(result.current).toEqual(session);
  });

  it("throws when called outside a CurrentUserProvider (fail-closed, not a silent empty user)", () => {
    expect(() => renderHook(() => useCurrentUser())).toThrow(
      "useCurrentUser() must be called within the authenticated (app) shell",
    );
  });
});

describe("useOptionalCurrentUser (E13-S009)", () => {
  it("returns the session provided by CurrentUserProvider", () => {
    const { result } = renderHook(() => useOptionalCurrentUser(), {
      wrapper: ({ children }) => <CurrentUserProvider value={session}>{children}</CurrentUserProvider>,
    });

    expect(result.current).toEqual(session);
  });

  it("returns null (not a throw) outside a CurrentUserProvider", () => {
    const { result } = renderHook(() => useOptionalCurrentUser());

    expect(result.current).toBeNull();
  });
});
