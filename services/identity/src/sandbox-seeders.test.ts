import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetSandboxSeedersForTest, registerSandboxSeeder, runSandboxSeeders } from "./sandbox-seeders.js";

afterEach(() => {
  _resetSandboxSeedersForTest();
});

describe("sandbox seeder registry", () => {
  it("calls every registered seeder with the given ownerKey", async () => {
    const a = vi.fn();
    const b = vi.fn();
    registerSandboxSeeder(a);
    registerSandboxSeeder(b);

    await runSandboxSeeders("u-1:sbx:abc");

    expect(a).toHaveBeenCalledWith("u-1:sbx:abc");
    expect(b).toHaveBeenCalledWith("u-1:sbx:abc");
  });

  it("calls seeders in registration order", async () => {
    const order: string[] = [];
    registerSandboxSeeder(() => {
      order.push("first");
    });
    registerSandboxSeeder(() => {
      order.push("second");
    });

    await runSandboxSeeders("u-1:sbx:abc");

    expect(order).toEqual(["first", "second"]);
  });

  it("awaits an async seeder before moving to the next", async () => {
    const order: string[] = [];
    registerSandboxSeeder(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("slow");
    });
    registerSandboxSeeder(() => {
      order.push("fast");
    });

    await runSandboxSeeders("u-1:sbx:abc");

    expect(order).toEqual(["slow", "fast"]);
  });

  it("calls no seeder when none is registered", async () => {
    await expect(runSandboxSeeders("u-1:sbx:abc")).resolves.toBeUndefined();
  });

  it("_resetSandboxSeedersForTest clears prior registrations", async () => {
    const fn = vi.fn();
    registerSandboxSeeder(fn);
    _resetSandboxSeedersForTest();

    await runSandboxSeeders("u-1:sbx:abc");

    expect(fn).not.toHaveBeenCalled();
  });
});
