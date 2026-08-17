import { test, expect } from "@playwright/test";

/**
 * E11-S018 "Document failure queue" critical seam — same no-session-gate
 * shape admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's own doc comment for why). Only the empty state
 * is reachable here (see document-failures.ts's own doc comment for
 * why — admin has no real cross-knowledge-base channel to observe
 * processing failures yet) — this honestly exercises exactly that real
 * production state.
 */
test("E11-S018: navigating from the admin home to 文件失敗佇列 shows the honest empty state — no real cross-KB failure channel exists yet", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "文件失敗佇列" }).click();
  await page.waitForURL((url) => url.pathname === "/document-failures");

  await expect(page.getByRole("heading", { name: "文件失敗佇列", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("尚無處理失敗的文件。", { exact: true })).toBeVisible();
});
