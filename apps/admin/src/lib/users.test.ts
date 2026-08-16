import { beforeEach, describe, expect, it } from "vitest";
import { createUser, getUser, listUsers } from "./users";

// E11-S004 introduces sessionStorage-backed persistence (createUser needs
// somewhere to write to) — same reset-between-tests precedent
// knowledge-documents.test.ts's own beforeEach already establishes, so
// each test starts from the same clean SAMPLE_USERS baseline rather than
// accumulating users created by earlier tests in this file.
beforeEach(() => {
  window.sessionStorage.clear();
});

describe("listUsers (E11-S002)", () => {
  it("returns a non-empty list of seeded users", async () => {
    const result = await listUsers();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
  });

  it("every user has the fields a list view needs (name, email, department, roles, status)", async () => {
    const result = await listUsers();
    if (!result.ok) throw new Error("expected ok");

    for (const user of result.value) {
      expect(user.userId).toBeTruthy();
      expect(user.name).toBeTruthy();
      expect(user.email).toBeTruthy();
      expect(user.department).toBeTruthy();
      expect(user.roles.length).toBeGreaterThan(0);
      expect(["active", "disabled"]).toContain(user.status);
    }
  });

  it("includes at least one disabled user, so the list-level status display is genuinely exercised", async () => {
    const result = await listUsers();
    if (!result.ok) throw new Error("expected ok");

    expect(result.value.some((user) => user.status === "disabled")).toBe(true);
  });

  it("includes users spanning more than one role, not just a single uniform role", async () => {
    const result = await listUsers();
    if (!result.ok) throw new Error("expected ok");

    const distinctRoles = new Set(result.value.flatMap((user) => user.roles));
    expect(distinctRoles.size).toBeGreaterThan(1);
  });

  it("every user also has a createdAt timestamp", async () => {
    const result = await listUsers();
    if (!result.ok) throw new Error("expected ok");

    for (const user of result.value) {
      expect(user.createdAt).toBeTruthy();
      expect(Number.isNaN(Date.parse(user.createdAt))).toBe(false);
    }
  });
});

describe("getUser (E11-S003)", () => {
  it("returns the matching user for a known id, not just whichever record happens to be first", async () => {
    const list = await listUsers();
    if (!list.ok) throw new Error("expected ok");
    // Deliberately NOT list.value[0] — a lookup that always returned the
    // first record regardless of the requested id would still pass a
    // test written against the first record.
    const knownUser = list.value.find((user) => user.userId === "mock-user-it-admin")!;
    expect(knownUser).toBeTruthy();
    expect(knownUser).not.toBe(list.value[0]);

    const result = await getUser(knownUser.userId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(knownUser);
  });

  it("returns null (not an error) for an unknown id", async () => {
    const result = await getUser("not-a-real-user-id");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });
});

describe("createUser (E11-S004)", () => {
  const validInput = {
    name: "新進使用者",
    email: "new-user@example.com",
    department: "業務部",
    roles: ["sales_purchasing"] as const,
  };

  it("creates a new user with a generated userId, createdAt, and active status", async () => {
    const result = await createUser(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userId).toBeTruthy();
    expect(Number.isNaN(Date.parse(result.value.createdAt))).toBe(false);
    expect(result.value.status).toBe("active");
    expect(result.value.name).toBe(validInput.name);
    expect(result.value.email).toBe(validInput.email);
    expect(result.value.department).toBe(validInput.department);
    expect(result.value.roles).toEqual(validInput.roles);
  });

  it("trims whitespace from name, email, and department", async () => {
    const result = await createUser({
      ...validInput,
      name: "  空白使用者  ",
      email: "  spaced@example.com  ",
      department: "  資訊部  ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("空白使用者");
    expect(result.value.email).toBe("spaced@example.com");
    expect(result.value.department).toBe("資訊部");
  });

  it("makes the newly created user visible via a subsequent listUsers() call", async () => {
    const created = await createUser(validInput);
    if (!created.ok) throw new Error("expected ok");

    const list = await listUsers();
    if (!list.ok) throw new Error("expected ok");
    expect(list.value.some((user) => user.userId === created.value.userId)).toBe(true);
  });

  it("makes the newly created user visible via a subsequent getUser() call", async () => {
    const created = await createUser(validInput);
    if (!created.ok) throw new Error("expected ok");

    const fetched = await getUser(created.value.userId);
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value).toEqual(created.value);
  });

  it("rejects an empty name", async () => {
    const result = await createUser({ ...validInput, name: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty email", async () => {
    const result = await createUser({ ...validInput, email: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty department", async () => {
    const result = await createUser({ ...validInput, department: "   " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects zero roles", async () => {
    const result = await createUser({ ...validInput, roles: [] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unknown role", async () => {
    // @ts-expect-error deliberately outside the Role union, mirroring
    // selectErpQueryScenario's own "server validates too" test for an
    // out-of-whitelist id from a possibly-bypassed client.
    const result = await createUser({ ...validInput, roles: ["not-a-real-role"] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a role list that mixes one valid role with one unknown role — not just an all-invalid list", async () => {
    // Deliberately NOT all-invalid: a validity check that only requires
    // *some* entry to be legal (rather than *every* entry) would let this
    // slip through and persist the bogus role alongside the real one.
    const result = await createUser({
      ...validInput,
      // @ts-expect-error deliberately outside the Role union, same as above.
      roles: ["sales_purchasing", "not-a-real-role"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not persist anything when validation fails (no partial side effect)", async () => {
    const before = await listUsers();
    if (!before.ok) throw new Error("expected ok");

    await createUser({ ...validInput, name: "" });

    const after = await listUsers();
    if (!after.ok) throw new Error("expected ok");
    expect(after.value.length).toBe(before.value.length);
  });
});
