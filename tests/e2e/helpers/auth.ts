import type { Page } from "@playwright/test";

/**
 * E03-S038. A new helper — existing specs keep their own inline `login()`
 * (each already duplicates the same 5 lines; retrofitting them to import
 * this instead is out of this story's scope, see spec's Non-Goals). This
 * exists for specs written from here on (this story's own `api-sandbox`
 * smoke spec, and future E03-S038-consumer stories) that need to log in as
 * something other than the single default demo-user, e.g. a specific admin
 * role's seeded account (E02-S033).
 *
 * All seeded demo accounts (`services/identity/src/repository.ts`) share
 * the same password, so `password` defaults to it — callers only need to
 * override it for a genuinely different scenario (e.g. proving a wrong
 * password is rejected).
 */
export interface DemoAccount {
  username: string;
  password?: string;
}

const DEFAULT_DEMO_PASSWORD = "demo-pass-123";

export async function loginAs(page: Page, account: DemoAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(account.username);
  await page.getByLabel("密碼").fill(account.password ?? DEFAULT_DEMO_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}
