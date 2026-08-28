import { test, expect, type Browser } from "@playwright/test";
import { loginAs } from "../helpers/auth";

/**
 * E03-S038's own smoke spec (Scope In, item 2): proves the sandbox isolation
 * this story's whole webServer/env setup exists to provide actually holds,
 * using nothing but the two properties `AI_KM_TEST_SANDBOX=true` promises
 * (services/identity's `sandbox-seeders.ts` doc comment) —
 *
 *   1. every LOGIN gets its own fresh, isolated owner — two different
 *      browser contexts (each its own cookie jar, so each does its own
 *      independent login) must never see each other's data;
 *   2. a session, once established, is shared normally within itself — a
 *      second PAGE in the SAME context (same cookies, no second login)
 *      must see what the first page in that context created.
 *
 * Works regardless of whether per-owner seed data (E04-S052) is present —
 * creating one conversation via the existing zero-interaction
 * `/conversations/new` route and diffing `totalCount` before/after is
 * enough to prove isolation on its own, seeded or not.
 */

/**
 * Queries `totalCount` directly (same session cookie, since this runs
 * in-browser) rather than counting rendered `<li>` elements. Two reasons,
 * both found the hard way during this story's own development:
 *
 * 1. `apps/web/src/lib/conversations.ts`'s `CONVERSATIONS_PAGE_SIZE` is 2 —
 *    once E04-S052's seed data (3 conversations per owner) is present, a
 *    DOM count of page 1's `<li>`s is capped at 2 regardless of the real
 *    total, so a "did the count go up by 1" delta check silently breaks
 *    (confirmed by an actual failure: expected 3, received 2). Asking the
 *    API for `totalCount` directly is correct at any seed/page size.
 * 2. It also sidesteps an unrelated timing issue this story already fixed
 *    once for the DOM-based version — SessionGate's own transient
 *    `role="status"` gap during React Strict Mode's mount/cancel/remount
 *    cycle (see git history) — by not depending on any UI render state at
 *    all. The claim under test ("this owner's data is isolated") is a data
 *    claim, not a rendering claim, so verifying it directly on the data is
 *    both more robust and more precise.
 */
async function conversationCount(page: import("@playwright/test").Page): Promise<number> {
  // A brand-new page (e.g. `context.newPage()`, never navigated) starts on
  // `about:blank`, which has no origin a relative fetch URL can resolve
  // against ("Failed to parse URL from /api/v1/..."). Unlike the earlier
  // DOM-counting version, this no longer needs to wait for any render/
  // hydration state, so navigating unconditionally is cheap and safe —
  // no risk of racing a hard-reload's fresh mount, because nothing here
  // reads the DOM at all.
  if (page.url() === "about:blank") {
    await page.goto("/conversations");
  }
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/v1/conversations?page=1&pageSize=200&archived=false", { credentials: "include" });
    if (!res.ok) throw new Error(`GET /conversations failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ totalCount: number }>;
  });
  return result.totalCount;
}

async function createConversationViaZeroInteractionRoute(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/conversations/new");
  await page.waitForURL((url) => url.pathname === "/conversations");
}

test("two browser contexts each logging in as demo-user get independent sandboxes — one context's new conversation is invisible to the other", async ({
  browser,
}: {
  browser: Browser;
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await loginAs(pageA, { username: "demo-user" });
    await loginAs(pageB, { username: "demo-user" });

    const baselineA = await conversationCount(pageA);
    const baselineB = await conversationCount(pageB);

    await createConversationViaZeroInteractionRoute(pageA);

    expect(await conversationCount(pageA)).toBe(baselineA + 1);
    // Context B's sandbox is a different owner entirely — it must not see
    // context A's new conversation, and its own baseline must be unchanged.
    expect(await conversationCount(pageB)).toBe(baselineB);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("a second page in the same context (same session, no second login) sees what the first page created", async ({ browser }: { browser: Browser }) => {
  const context = await browser.newContext();
  try {
    const firstPage = await context.newPage();
    await loginAs(firstPage, { username: "demo-user" });

    const baseline = await conversationCount(firstPage);
    await createConversationViaZeroInteractionRoute(firstPage);

    // Second tab in the SAME context — reuses the existing session cookie,
    // no loginAs() call, so it must land in the exact same sandbox.
    const secondPage = await context.newPage();
    expect(await conversationCount(secondPage)).toBe(baseline + 1);
  } finally {
    await context.close();
  }
});

/**
 * Functional AC3: the fake microphone (playwright.config.ts's
 * `--use-fake-device-for-media-stream` + `--use-file-for-fake-audio-capture`,
 * `use.permissions: ["microphone"]`) grants `getUserMedia({audio:true})`
 * without a real permission prompt (nothing to click — Playwright would hang
 * forever waiting on a real OS/browser dialog otherwise) and returns a
 * genuinely live audio track.
 */
test("a fake microphone is available: getUserMedia({audio:true}) resolves with a live track, no permission prompt", async ({ page }) => {
  await loginAs(page, { username: "demo-user" });

  const track = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const [audioTrack] = stream.getAudioTracks();
    if (!audioTrack) throw new Error("expected an audio track");
    const result = { kind: audioTrack.kind, readyState: audioTrack.readyState, enabled: audioTrack.enabled };
    stream.getTracks().forEach((t) => t.stop());
    return result;
  });

  expect(track).toEqual({ kind: "audio", readyState: "live", enabled: true });
});

/**
 * E03-S035 AC6: `apps/web/next.config.ts`'s `rewrites()` forwards
 * `/api/v1/*` to the real apps/api instance this story's webServer entry
 * starts — verified here against the real server rather than "Next dev
 * server + a fake API" (E03-S035's own AC6 wording), now that a real one
 * exists to verify against.
 *
 * E04-S056 AC2: this test's own purpose is the ROUTE (does the rewrite
 * reach a real apps/api at all), not ASR's operational status — asserting
 * a literal `status: "ok"` coupled this route test to an unrelated optional
 * subsystem (the previous version of this file's own doc comment explains
 * how that produced a permanently-degraded dev/test `/v1/health` once
 * E04-S047 added the ASR subsystem check). Asserting the full response
 * shape (same 3 keys `apps/api/src/server.test.ts`'s own
 * "leaks neither filesystem paths..." test locks in) proves the real
 * backend answered without caring which way ASR happens to be configured.
 * The `ok` direction (default dev/test config, ASR unaffected) is covered
 * by `apps/api/src/server.test.ts`'s "returns 200 with status, version and
 * uptimeMs"; the `degraded` direction by its
 * "AC1/AC3: reports status degraded when a subsystem (asr, unreachable
 * whisper-server default) is down" — both already existing, unmodified.
 */
test("apps/web's /api/v1/health rewrite reaches the real apps/api instance", async ({ page }) => {
  const response = await page.request.get("/api/v1/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(["status", "uptimeMs", "version"]);
  expect(["ok", "degraded"]).toContain(body.status);
  expect(typeof body.version).toBe("string");
  expect(typeof body.uptimeMs).toBe("number");
});
