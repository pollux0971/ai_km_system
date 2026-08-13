import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Explicit registration (rather than relying on RTL's global-afterEach
// auto-detection) since this project imports test globals per-file instead
// of enabling vitest's `test.globals`. Without this, renders from earlier
// tests in the same file stay mounted and later queries see duplicates.
afterEach(() => {
  cleanup();
});
