import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// See apps/web/vitest.setup.ts for why this is explicit rather than relying
// on RTL's global-afterEach auto-detection.
afterEach(() => {
  cleanup();
});
