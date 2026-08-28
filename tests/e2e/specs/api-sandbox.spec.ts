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
 * Deliberately does not depend on seed data (E04-S052, not yet merged as of
 * this story — see EVIDENCE) — creating a conversation via the existing
 * zero-interaction `/conversations/new` route and then counting list items
 * is enough to prove isolation on its own, with or without seeded rows
 * present.
 */

async function conversationCount(page: import("@playwright/test").Page): Promise<number> {
  // Only navigate if not already there. A forced `page.goto("/conversations")`
  // when we're already on that exact URL (e.g. right after
  // createConversationViaZeroInteractionRoute's client-side router.replace
  // already landed here) triggers a real hard reload — confirmed via a
  // console-log trace (browser console captured during diagnosis): the
  // ALREADY-mounted ConversationList had already fetched and logged the
  // correct post-create count, but the subsequent hard reload's fresh mount
  // never even logged a "loading conversation list" line at all before the
  // test's `.count()` read ran — Next.js dev-mode SSR/hydration on a fresh
  // hard reload is not guaranteed to have attached the client component's
  // live state by the time a bare `.count()` (after only waiting for
  // role=status to clear, which can trivially pass pre-hydration) runs.
  // Reusing the page already on the right URL sidesteps this entirely and
  // matches what a real user would see (they don't reload after creating).
  if (new URL(page.url()).pathname !== "/conversations") {
    await page.goto("/conversations");
  }
  // SessionGate (apps/web/src/app/(app)/session-gate.tsx) renders its OWN
  // role="status" loading indicator while `authClient.getSession()` is
  // in flight, BEFORE ConversationsPage (and ConversationList inside it)
  // ever mounts at all. A React dev-mode Strict Mode double-invoke of
  // SessionGate's effect (mount -> cancelled cleanup -> real remount) can
  // make role="status" transiently disappear and reappear — briefly zero
  // between the cancelled first mount unmounting and the real second mount
  // starting its own loading state — which can fool a bare "wait for
  // status count to reach 0" into resolving during that gap, well before
  // ConversationList has even mounted, let alone fetched (confirmed via a
  // console-log trace: neither session-gate's nor conversation-list's own
  // logger calls had fired at all by the time such a premature check
  // passed). Waiting for the page's own always-rendered heading — which
  // only exists once SessionGate has reached its "authenticated" state —
  // is a positive signal immune to that transient gap, unlike waiting for
  // an absence.
  await expect(page.getByRole("heading", { name: "對話", level: 1, exact: true })).toBeVisible({ timeout: 20000 });
  // conversation-list.tsx fetches client-side (`"use client"` + useEffect) —
  // navigation alone doesn't wait for that async fetch to settle, so a bare
  // `.count()` right after would race the "loading" state and undercount.
  // Wait for the loading indicator (role="status", same pattern as
  // waitForThreadToSettle in the other E13/E03 specs) to be gone before
  // counting.
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0, { timeout: 20000 });
  // conversation-list.tsx's error state (`ErrorMessage`, role="alert") and
  // its genuinely-empty state are both zero `listitem`s — indistinguishable
  // by count alone. Surface the alert's own text on failure rather than
  // let an unexpected fetch error masquerade as "correctly empty".
  const alert = page.getByRole("main").getByRole("alert");
  if ((await alert.count()) > 0) {
    throw new Error(`conversation list failed to load: "${await alert.first().textContent()}"`);
  }
  return page.getByRole("main").getByRole("listitem").count();
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
 */
test("apps/web's /api/v1/health rewrite reaches the real apps/api instance", async ({ page }) => {
  const response = await page.request.get("/api/v1/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ status: "ok" });
});
