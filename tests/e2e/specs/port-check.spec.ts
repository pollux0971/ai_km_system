import { test, expect } from "@playwright/test";
import net from "node:net";
import {
  resolveReuseExistingServer,
  findOccupiedPorts,
  assertPortsFreeForCI,
} from "../helpers/port-check";

/**
 * E01-S030. Unit-tests `helpers/port-check.ts`'s pure logic directly —
 * deliberately not an integration test against a real `playwright test`
 * CI run (the spec's own AC2/AC3 wording: "不需真的跑一次 Playwright").
 * AC2's "先佔用一個高位 port模擬" is implemented with a real, throwaway
 * `net` listener on an OS-assigned ephemeral port — genuine port
 * occupation, not a mock.
 */

function listenOnEphemeralPort(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("listenOnEphemeralPort: unexpected server.address()"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

test.describe("resolveReuseExistingServer", () => {
  test("AC1: CI unset -> true (unchanged local-dev behaviour)", () => {
    const original = process.env.CI;
    delete process.env.CI;
    try {
      expect(resolveReuseExistingServer()).toBe(true);
    } finally {
      if (original !== undefined) process.env.CI = original;
    }
  });

  test("CI=true -> false", () => {
    const original = process.env.CI;
    process.env.CI = "true";
    try {
      expect(resolveReuseExistingServer()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.CI;
      else process.env.CI = original;
    }
  });
});

test.describe("findOccupiedPorts / assertPortsFreeForCI", () => {
  test("AC2: an occupied port is detected and identified", async () => {
    const { server, port } = await listenOnEphemeralPort();
    try {
      const occupied = findOccupiedPorts([port]);
      expect(occupied).toHaveLength(1);
      const [first] = occupied;
      expect(first?.port).toBe(port);
      expect(first?.listing).toContain(String(port));
    } finally {
      await closeServer(server);
    }
  });

  test("AC2: assertPortsFreeForCI throws with the port and process info when CI=true and the port is occupied", async () => {
    const { server, port } = await listenOnEphemeralPort();
    const original = process.env.CI;
    process.env.CI = "true";
    try {
      expect(() => assertPortsFreeForCI([port])).toThrowError(
        new RegExp(`port ${port}`),
      );
    } finally {
      if (original === undefined) delete process.env.CI;
      else process.env.CI = original;
      await closeServer(server);
    }
  });

  test("AC3: assertPortsFreeForCI does not throw when CI=true and the port is free", async () => {
    const { server, port } = await listenOnEphemeralPort();
    await closeServer(server); // free the port again before asserting

    const original = process.env.CI;
    process.env.CI = "true";
    try {
      expect(() => assertPortsFreeForCI([port])).not.toThrow();
    } finally {
      if (original === undefined) delete process.env.CI;
      else process.env.CI = original;
    }
  });

  test("assertPortsFreeForCI is a no-op outside CI even when the port is occupied", async () => {
    const { server, port } = await listenOnEphemeralPort();
    const original = process.env.CI;
    delete process.env.CI;
    try {
      expect(() => assertPortsFreeForCI([port])).not.toThrow();
    } finally {
      if (original !== undefined) process.env.CI = original;
      await closeServer(server);
    }
  });
});
