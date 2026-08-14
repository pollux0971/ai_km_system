import { test, expect } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S010 critical flow: the KB document list at /knowledge/[id]/documents,
 * and the detail page's (E05-S005) document-count summary reflecting the
 * same seeded data. Navigation after login always uses in-app link
 * clicks, never page.goto() — see conversations.spec.ts's file doc
 * comment for why (the mock AuthClient's session is a plain in-memory
 * closure variable; page.goto() is a hard reload that wipes it).
 *
 * Seed data (lib/knowledge-documents.ts): kb-sample-1 ("產品保固政策")
 * has 3 documents, kb-sample-2 ("設備維修標準作業程序") has 1,
 * kb-sample-3 ("人力資源與請假規範") has 0 — deliberately covering the
 * multi/single/empty list-size states across the existing KB fixtures.
 *
 * E05-S011 adds the upload flow itself (KnowledgeDocumentUpload,
 * embedded directly on this same page) — uploading into both the empty
 * kb-sample-3 (flips the empty state away) and the already-populated
 * kb-sample-1 (appends without disturbing the existing 3), and
 * confirming the detail page's document-count summary reflects the
 * change after navigating back, same as every other field's own
 * detail-page integration test in this file's sibling specs.
 * page.setInputFiles() with an in-memory buffer, not a real file on
 * disk — no real upload happens (see addKnowledgeBaseDocument's own
 * doc comment), so only the File's name/size matter, not its content.
 *
 * E05-S012 extends the same upload widget to accept multiple files at
 * once (setInputFiles with an array) — one critical flow confirming
 * every selected file lands in the final list and the detail page's
 * count reflects the whole batch, not just one of them.
 *
 * E05-S013 adds a second, folder-specific input (webkitdirectory) — a
 * real-browser check that the attribute is genuinely applied (Playwright
 * runs against real Chromium, unlike the jsdom-based unit tests) and
 * that files selected through it flow through the exact same
 * preview/upload/refresh pipeline. Playwright's setInputFiles can't
 * drive an actual OS folder picker, so it can't produce a genuine
 * webkitRelativePath here — that specific behavior (preserving the
 * relative path as the document name) is unit-tested instead, where
 * the property can be set directly on a File object.
 *
 * E05-S014 adds KnowledgeDocumentUrlImport (a text input + 匯入
 * button, separate from the upload widget) — importing a URL and
 * confirming it lands in the list with no size shown (a URL-imported
 * document has no sizeBytes) and the detail page's count updates.
 *
 * E05-S015 adds KnowledgeDocumentTextInput (title + content textarea +
 * 新增 button) — typing knowledge directly and confirming it lands in
 * the list WITH a size shown this time (unlike URL import, the typed
 * content is real and its byte length is genuinely computed, not
 * omitted).
 *
 * E05-S017 adds a per-file progress counter to the SAME upload widget
 * (KnowledgeDocumentUpload) — this is a genuine real-timer check (the
 * only one in this file), deliberately NOT mocking
 * lib/upload-progress.ts's delay the way the unit tests do, because the
 * whole point of this assertion is proving the counter is actually
 * visible for a real, non-negligible stretch of wall-clock time in a
 * real browser, not just correct in principle. Two files at the
 * default 500ms/file pacing keeps this comfortably under Playwright's
 * default assertion timeout while still giving each intermediate count
 * a solid, non-flaky window to be caught in.
 *
 * E05-S018 adds a second real-timer phase to that same single-file
 * upload — 解析中 following 上傳中 — confirming both are genuinely
 * visible in sequence in a real browser, not just correct in the
 * mocked unit tests.
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

function sidebarNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "主導覽" });
}

// Scoped the same way as sidebarNav — the app shell's own <nav><ul><li>
// items would otherwise ambiguously match a bare getByRole("listitem")
// alongside the upload widget's own preview list.
function pendingUploadList(page: import("@playwright/test").Page) {
  return page.getByRole("list", { name: "待上傳檔案" });
}

async function openKnowledgeDetail(page: import("@playwright/test").Page, name: string) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
  await page.getByRole("link", { name }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
}

test("E05-S010: a knowledge base with documents shows its count on the detail page and lists them all", async ({ page }) => {
  await openKnowledgeDetail(page, "產品保固政策");

  await expect(page.getByText("文件:", { exact: false })).toContainText("3 份文件");

  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await expect(page.getByText("產品保固條款.pdf")).toBeVisible();
  await expect(page.getByText("理賠申請流程.docx")).toBeVisible();
  await expect(page.getByText("常見保固問題 FAQ.pdf")).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("3 份文件");
});

test("E05-S010: a knowledge base with a single document shows singular-count-consistent 1 份文件", async ({ page }) => {
  await openKnowledgeDetail(page, "設備維修標準作業程序");

  await expect(page.getByText("文件:", { exact: false })).toContainText("1 份文件");

  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await expect(page.getByText("設備故障排除手冊.pdf")).toBeVisible();
});

test("E05-S010: a knowledge base with no documents shows 尚無文件 and a distinct empty state on the document list page", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");

  await expect(page.getByText("文件:", { exact: false })).toContainText("尚無文件");

  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await expect(page.getByText("這個知識庫尚無文件。")).toBeVisible();
});

test("E05-S011: uploading a file adds it to the list immediately and updates the detail page's document count", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));
  await expect(page.getByText("這個知識庫尚無文件。")).toBeVisible();

  await page.getByLabel("上傳文件").setInputFiles({
    name: "新版請假規範.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("mock file content for E05-S011 upload test"),
  });
  await expect(pendingUploadList(page).getByRole("listitem")).toContainText("新版請假規範.pdf");

  await page.getByRole("button", { name: "上傳", exact: true }).click();

  await expect(page.getByText("新版請假規範.pdf")).toBeVisible();
  await expect(page.getByText("這個知識庫尚無文件。")).not.toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("1 份文件");
});

test("E05-S011: uploading a second file appends to an already-populated list without losing the existing ones", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "產品保固政策");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));
  await expect(page.getByText("產品保固條款.pdf")).toBeVisible();

  await page.getByLabel("上傳文件").setInputFiles({
    name: "補充條款.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("mock file content"),
  });
  await page.getByRole("button", { name: "上傳", exact: true }).click();

  await expect(page.getByText("補充條款.pdf")).toBeVisible();
  await expect(page.getByText("產品保固條款.pdf")).toBeVisible();
  await expect(page.getByText("理賠申請流程.docx")).toBeVisible();
  await expect(page.getByText("常見保固問題 FAQ.pdf")).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("4 份文件");
});

test("E05-S012: selecting multiple files at once previews all of them, allows removing one before committing, and uploads the rest as a batch", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));
  await expect(page.getByText("這個知識庫尚無文件。")).toBeVisible();

  await page.getByLabel("上傳文件").setInputFiles([
    { name: "第一份.pdf", mimeType: "application/pdf", buffer: Buffer.from("file one") },
    { name: "第二份.pdf", mimeType: "application/pdf", buffer: Buffer.from("file two") },
    { name: "第三份.pdf", mimeType: "application/pdf", buffer: Buffer.from("file three") },
  ]);
  await expect(pendingUploadList(page).getByRole("listitem")).toHaveCount(3);

  await page.getByRole("button", { name: "移除 第二份.pdf" }).click();
  await expect(pendingUploadList(page).getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "上傳", exact: true }).click();

  // E05-S017: wait for the pending-preview list to empty out first —
  // see the identical comment on the S013 test below for why a bare
  // getByText(name) right after clicking 上傳 is ambiguous once the
  // upload widget's per-file step takes real, visible time.
  await expect(pendingUploadList(page).getByRole("listitem")).toHaveCount(0);
  await expect(page.getByText("第一份.pdf")).toBeVisible();
  await expect(page.getByText("第三份.pdf")).toBeVisible();
  await expect(page.getByText("第二份.pdf")).not.toBeVisible();
  await expect(page.getByText("這個知識庫尚無文件。")).not.toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("2 份文件");
});

test("E05-S013: selecting a real folder preserves each file's relative path, including one nested in a subfolder", async ({
  page,
}) => {
  // Discovered mid-development: Playwright's setInputFiles refuses
  // buffer-based File-like objects for a webkitdirectory input
  // ("[webkitdirectory] input requires passing a path to a
  // directory") — unlike a plain file input, it insists on a real
  // directory path and reads it itself, which is actually MORE
  // useful here: it drives a genuine folder selection in a real
  // browser and produces genuine, non-empty webkitRelativePath
  // values — something no unit test (jsdom can't do real filesystem
  // traversal) or a buffer-based E2E approach could ever verify.
  const dir = mkdtempSync(join(tmpdir(), "e05-s013-"));
  const subDir = join(dir, "子資料夾");
  try {
    mkdirSync(subDir);
    writeFileSync(join(dir, "根目錄檔案.pdf"), "root file content");
    writeFileSync(join(subDir, "子檔案.pdf"), "nested file content");

    await openKnowledgeDetail(page, "設備維修標準作業程序");
    await page.getByRole("link", { name: "文件列表" }).click();
    await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

    const folderInput = page.getByLabel("上傳資料夾");
    await expect(folderInput).toHaveJSProperty("webkitdirectory", true);
    await expect(page.getByLabel("上傳文件")).not.toHaveJSProperty("webkitdirectory", true);

    await folderInput.setInputFiles(dir);
    await expect(pendingUploadList(page).getByRole("listitem")).toHaveCount(2);
    // Relative paths are prefixed with the selected folder's own name
    // (Chromium behavior) — asserting via substring, not exact
    // equality, since mkdtempSync appends a random suffix to `dir`.
    await expect(pendingUploadList(page)).toContainText("根目錄檔案.pdf");
    await expect(pendingUploadList(page)).toContainText("子資料夾/子檔案.pdf");

    await page.getByRole("button", { name: "上傳", exact: true }).click();

    // E05-S017: the upload widget now takes real, visible time per
    // file (see lib/upload-progress.ts) and keeps BOTH files' names
    // showing in the still-mounted pending-preview list for that whole
    // window — a bare getByText(name) would ambiguously match either
    // that pending item or the eventual real document-list entry.
    // Waiting for the pending list to empty out first (the same signal
    // the "上傳中…" status going away represents) disambiguates: only
    // the real, post-upload document list can satisfy these checks
    // afterward.
    await expect(pendingUploadList(page).getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText("根目錄檔案.pdf", { exact: false })).toBeVisible();
    await expect(page.getByText("子資料夾/子檔案.pdf", { exact: false })).toBeVisible();

    await page.getByRole("link", { name: "返回知識庫詳情" }).click();
    await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
    await expect(page.getByText("文件:", { exact: false })).toContainText("3 份文件");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("E05-S014: importing a URL adds it to the list without a size, and rejects an invalid URL with a specific message", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));
  await expect(page.getByText("這個知識庫尚無文件。")).toBeVisible();

  await page.getByLabel("從網址匯入").fill("not a url");
  await page.getByRole("button", { name: "匯入" }).click();
  // Scoped to <main> — an unscoped getByRole("alert") also matches
  // Next.js's own hidden route-announcer div (id
  // "__next-route-announcer__"), same collision knowledge-create.spec.ts
  // (E05-S003) first documented.
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("請輸入有效的網址。");
  await expect(page.getByText("這個知識庫尚無文件。")).toBeVisible();

  await page.getByLabel("從網址匯入").fill("https://example.com/policy.pdf");
  await page.getByRole("button", { name: "匯入" }).click();

  await expect(page.getByText("https://example.com/policy.pdf")).toBeVisible();
  await expect(page.getByLabel("從網址匯入")).toHaveValue("");

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("1 份文件");
});

test("E05-S015: typing a title and content adds a text knowledge document with a real computed size", async ({ page }) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));
  await expect(page.getByText("這個知識庫尚無文件。")).toBeVisible();
  await expect(page.getByRole("button", { name: "新增" })).toBeDisabled();

  await page.getByLabel("標題").fill("特休假規則");
  await page.getByLabel("內容").fill("到職滿一年可享 7 天特休。");
  await page.getByRole("button", { name: "新增" }).click();

  await expect(page.getByText("特休假規則")).toBeVisible();
  await expect(page.getByLabel("標題")).toHaveValue("");
  await expect(page.getByLabel("內容")).toHaveValue("");
  await expect(page.getByText("這個知識庫尚無文件。")).not.toBeVisible();
  // Unlike a URL import, typed content has a real, non-zero computed size.
  await expect(page.getByText(/^\d+(\.\d+)? (B|KB|MB)$/)).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("1 份文件");
});

test("E05-S017: uploading multiple files shows a per-file progress count that advances as each one completes", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await page.getByLabel("上傳文件").setInputFiles([
    { name: "第一份.pdf", mimeType: "application/pdf", buffer: Buffer.from("file one") },
    { name: "第二份.pdf", mimeType: "application/pdf", buffer: Buffer.from("file two") },
  ]);
  await page.getByRole("button", { name: "上傳", exact: true }).click();

  await expect(page.getByText(/上傳中.*第 1 \/ 2 筆/)).toBeVisible();
  await expect(page.getByText(/上傳中.*第 2 \/ 2 筆/)).toBeVisible();

  // Wait for 上傳中 to fully disappear BEFORE checking the file names —
  // both names are also visible in the still-mounted pending-preview
  // list for the whole in-flight window, so checking them first would
  // ambiguously (and prematurely) match that instead of the real,
  // post-upload document list. Same reasoning as the fix this story
  // applied to the pre-existing S012/S013 tests above.
  await expect(page.getByText(/上傳中/)).not.toBeVisible();
  await expect(page.getByText("第一份.pdf")).toBeVisible();
  await expect(page.getByText("第二份.pdf")).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("2 份文件");
});

test("E05-S018: uploading a file shows a 解析中 phase after 上傳中, before the document appears", async ({ page }) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await page.getByLabel("上傳文件").setInputFiles({
    name: "新規範.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("file content"),
  });
  await page.getByRole("button", { name: "上傳", exact: true }).click();

  await expect(page.getByText(/上傳中.*第 1 \/ 1 筆/)).toBeVisible();
  await expect(page.getByText(/解析中.*第 1 \/ 1 筆/)).toBeVisible();

  await expect(page.getByText(/上傳中|解析中/)).not.toBeVisible();
  await expect(page.getByText("新規範.pdf")).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("1 份文件");
});
