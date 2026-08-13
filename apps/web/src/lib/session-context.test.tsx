import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { CurrentUserProvider, useCurrentUser } from "./session-context";

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
