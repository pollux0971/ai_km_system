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
 *
 * E05-S019 adds the third and final real-timer phase — 索引中
 * following 解析中 — completing the upload → parse → index sequence
 * this same single-file test now confirms end to end.
 *
 * E05-S020 adds a deterministic mock trigger
 * (MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER, embedded in the file
 * name) that marks the created document status:"failed" — this test
 * confirms the upload itself still succeeds (all three real-timer
 * phases still play out, same as any other file) and the document
 * still lands in the list, but with a distinct 處理失敗 indicator
 * instead of the generic upload-failure alert S011 already covers.
 *
 * E05-S021 adds a 重試 button next to that same indicator — this test
 * confirms clicking it (real timing again, reusing the same 解析中/
 * 索引中 delay primitives) genuinely clears the failed state: the
 * document keeps its name/size, but 處理失敗 and 重試 both disappear.
 *
 * E05-S022 adds a 預覽 toggle to every document — no real fetch, purely
 * a client-side reveal of the KnowledgeBaseDocument's own already-
 * loaded `content`. This test types real text via KnowledgeDocumentTextInput
 * (S015) and confirms its exact content shows on preview, then confirms
 * a file-sourced seed document (no stored content) honestly shows
 * 此文件目前無法預覽 instead of fabricated text.
 *
 * E05-S023 adds a 重新命名 control (mirroring E03-S024's
 * RenameConversation shape) to every document — this test renames a
 * seed document and confirms the new name persists across a page
 * reload (proving it's a real store write, not just local component
 * state).
 *
 * E05-S025 adds a 作用中文件/已封存文件 view switch (mirroring E03-S026's
 * ConversationList split) plus a per-document 封存文件/取消封存 toggle —
 * this test archives a pre-seeded document, confirms it vanishes from
 * the active view while its siblings stay put, confirms it reappears
 * under 已封存文件 (and the siblings don't), then unarchives it and
 * confirms it returns to 作用中文件 — a real round trip through the
 * mock store, not just a one-way check.
 *
 * E05-S026 adds a 刪除文件 control (mirroring E03-S025's
 * DeleteConversation role="alertdialog" confirm/cancel shape) to every
 * document — this test confirms 取消 leaves a document untouched, then
 * confirms deleting one for real removes it from the list AND drops the
 * detail page's own count, without disturbing the remaining documents.
 *
 * E05-S027 adds a 文件權限 inline expandable role-checkbox editor
 * (combining E05-S006's KB-level role-checkbox content with E05-S022's
 * inline expand/collapse structure) to every document — this test
 * expands one document's editor, checks a role, reloads via in-app
 * navigation (away and back), and confirms the checked role survived —
 * proving it's a real store write, not just local component state — all
 * without disturbing a sibling document's own (separately empty)
 * permission editor.
 *
 * E05-S029 adds role="alert" to the existing 處理失敗 indicator and a
 * new role="status" 已封存 badge — this test specifically verifies both
 * resolve as expected roles through Playwright's real Chromium
 * accessibility tree, not just jsdom's simulation (see message-
 * content.tsx's own doc comment for a documented case where the two
 * genuinely disagree on a DPUB-ARIA role, which is exactly the kind of
 * gap a real-browser E2E check like this one exists to catch).
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

test("E05-S019: uploading a file shows all three progress phases in order — 上傳中, 解析中, then 索引中", async ({ page }) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await page.getByLabel("上傳文件").setInputFiles({
    name: "索引測試.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("file content"),
  });
  await page.getByRole("button", { name: "上傳", exact: true }).click();

  await expect(page.getByText(/上傳中.*第 1 \/ 1 筆/)).toBeVisible();
  await expect(page.getByText(/解析中.*第 1 \/ 1 筆/)).toBeVisible();
  await expect(page.getByText(/索引中.*第 1 \/ 1 筆/)).toBeVisible();

  await expect(page.getByText(/上傳中|解析中|索引中/)).not.toBeVisible();
  await expect(page.getByText("索引測試.pdf")).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("1 份文件");
});

test("E05-S020: a file whose processing is mock-triggered to fail still uploads successfully, but shows 處理失敗 in the list", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await page.getByLabel("上傳文件").setInputFiles({
    name: "損毀報告[模擬:KB_PROCESSING_FAILED].pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("file content"),
  });
  await page.getByRole("button", { name: "上傳", exact: true }).click();

  // Still a real upload — all three real-timer phases play out exactly
  // as for any other file, since addKnowledgeBaseDocument itself
  // succeeds (ok: true); only the resulting document's status differs.
  await expect(page.getByText(/上傳中/)).toBeVisible();
  await expect(page.getByText(/上傳中|解析中|索引中/)).not.toBeVisible();

  await expect(page.getByText("損毀報告", { exact: false })).toBeVisible();
  await expect(page.getByText("處理失敗")).toBeVisible();
  // Not the generic "N 個檔案上傳失敗" retry-affordance alert — that
  // path is only for a rejected addKnowledgeBaseDocument call. Checked
  // by its own specific text, not by role="alert" alone — E05-S029 gave
  // the 處理失敗 indicator itself role="alert" too (a real, legitimate
  // alert for this exact scenario), so an unscoped getByRole("alert")
  // would now always find that instead of ever proving the GENERIC
  // alert's absence.
  await expect(page.getByText(/個檔案上傳失敗/)).not.toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("1 份文件");
});

test("E05-S021: retrying a processing-failed document clears its 處理失敗 state and 重試 button", async ({ page }) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await page.getByLabel("上傳文件").setInputFiles({
    name: "待重試報告[模擬:KB_PROCESSING_FAILED].pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("file content"),
  });
  await page.getByRole("button", { name: "上傳", exact: true }).click();
  await expect(page.getByText(/上傳中|解析中|索引中/)).not.toBeVisible();
  await expect(page.getByText("處理失敗")).toBeVisible();

  await page.getByRole("button", { name: "重試" }).click();

  await expect(page.getByRole("button", { name: "重試中…" })).toBeVisible();
  await expect(page.getByText("處理失敗")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "重試" })).not.toBeVisible();
  // The document itself — name, still in the list — survives the retry.
  await expect(page.getByText("待重試報告", { exact: false })).toBeVisible();
});

test("E05-S022: previewing a text-sourced document shows its real content; a file-sourced one honestly shows it cannot be previewed", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "產品保固政策");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  // 產品保固條款.pdf is a pre-seeded, file-sourced document — never has
  // real content (see addKnowledgeBaseDocument's own doc comment).
  const fileDocItem = page.getByText("產品保固條款.pdf").locator("..");
  await fileDocItem.getByRole("button", { name: "預覽" }).click();
  await expect(fileDocItem.getByText("此文件目前無法預覽。")).toBeVisible();

  await page.getByLabel("標題").fill("保固延伸說明");
  await page.getByLabel("內容").fill("延長保固需於購買後 30 天內申請。");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("保固延伸說明")).toBeVisible();

  const textDocItem = page.getByText("保固延伸說明").locator("..");
  await textDocItem.getByRole("button", { name: "預覽" }).click();
  await expect(textDocItem.getByText("延長保固需於購買後 30 天內申請。")).toBeVisible();
});

test("E05-S023: renaming a document updates its displayed name and persists across leaving and returning to the list", async ({ page }) => {
  await openKnowledgeDetail(page, "產品保固政策");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  const docItem = page.getByText("產品保固條款.pdf").locator("..");
  await docItem.getByRole("button", { name: "重新命名" }).click();
  await page.getByLabel("文件名稱").fill("2026 年保固條款");
  await page.getByRole("button", { name: "儲存" }).click();

  await expect(page.getByText("2026 年保固條款")).toBeVisible();
  await expect(page.getByText("產品保固條款.pdf")).toHaveCount(0);
  // The other pre-seeded documents in the same list are untouched.
  await expect(page.getByText("理賠申請流程.docx")).toBeVisible();

  // In-app navigation away and back, never page.goto() — see this
  // file's own doc comment on why (the mock session lives only in
  // memory, a hard reload would wipe it).
  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await expect(page.getByText("2026 年保固條款")).toBeVisible();
});

test("E05-S025: archiving a document removes it from the active view and the detail page's count, shows it under 已封存文件, and unarchiving restores both", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "產品保固政策");
  await expect(page.getByText("文件:", { exact: false })).toContainText("3 份文件");

  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  const activeDocItem = page.getByText("產品保固條款.pdf").locator("..");
  await activeDocItem.getByRole("button", { name: "封存文件" }).click();

  await expect(page.getByText("產品保固條款.pdf")).toHaveCount(0);
  // The other pre-seeded documents in the active view are untouched.
  await expect(page.getByText("理賠申請流程.docx")).toBeVisible();
  await expect(page.getByText("常見保固問題 FAQ.pdf")).toBeVisible();

  // The detail page's own "N 份文件" headline is a SEPARATE fetch
  // (knowledge-detail.tsx's own listKnowledgeBaseDocuments(id) call, no
  // code change of its own this story) — this hop proves archiving
  // genuinely ripples into it via the new default `archived = false`
  // parameter, not just within the documents list page itself.
  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("2 份文件");

  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await page.getByRole("button", { name: "已封存文件" }).click();
  await expect(page.getByText("產品保固條款.pdf")).toBeVisible();
  await expect(page.getByText("理賠申請流程.docx")).not.toBeVisible();

  const archivedDocItem = page.getByText("產品保固條款.pdf").locator("..");
  await archivedDocItem.getByRole("button", { name: "取消封存" }).click();
  await expect(page.getByText("產品保固條款.pdf")).toHaveCount(0);

  await page.getByRole("button", { name: "作用中文件" }).click();
  await expect(page.getByText("產品保固條款.pdf")).toBeVisible();
  await expect(page.getByText("理賠申請流程.docx")).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("3 份文件");
});

test("E05-S026: 取消 leaves a document untouched; confirming a delete removes it from the list and the detail page's count", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "產品保固政策");
  await expect(page.getByText("文件:", { exact: false })).toContainText("3 份文件");

  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  const targetItem = page.getByText("產品保固條款.pdf").locator("..");
  await targetItem.getByRole("button", { name: "刪除文件" }).click();
  await expect(page.getByRole("alertdialog", { name: "確認刪除文件：產品保固條款.pdf" })).toBeVisible();

  await targetItem.getByRole("button", { name: "取消" }).click();
  await expect(page.getByText("產品保固條款.pdf")).toBeVisible();

  await targetItem.getByRole("button", { name: "刪除文件" }).click();
  await targetItem.getByRole("button", { name: "確認刪除" }).click();

  await expect(page.getByText("產品保固條款.pdf")).toHaveCount(0);
  await expect(page.getByText("理賠申請流程.docx")).toBeVisible();
  await expect(page.getByText("常見保固問題 FAQ.pdf")).toBeVisible();

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("文件:", { exact: false })).toContainText("2 份文件");
});

test("E05-S027: checking a role on a document's permission editor saves it, persists across a reload, and leaves a sibling document's own editor untouched", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "產品保固政策");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  const targetItem = page.getByText("產品保固條款.pdf").locator("..");
  await targetItem.getByRole("button", { name: "文件權限" }).click();
  await expect(targetItem.getByRole("checkbox", { name: "稽核人員" })).not.toBeChecked();
  await targetItem.getByRole("checkbox", { name: "稽核人員" }).check();
  await expect(targetItem.getByRole("checkbox", { name: "稽核人員" })).toBeChecked();

  // In-app navigation away and back, never page.goto() — see this file's
  // own doc comment on why (the mock session lives only in memory, a
  // hard reload would wipe it).
  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  const reloadedTargetItem = page.getByText("產品保固條款.pdf").locator("..");
  await reloadedTargetItem.getByRole("button", { name: "文件權限" }).click();
  await expect(reloadedTargetItem.getByRole("checkbox", { name: "稽核人員" })).toBeChecked();

  const siblingItem = page.getByText("理賠申請流程.docx").locator("..");
  await siblingItem.getByRole("button", { name: "文件權限" }).click();
  await expect(siblingItem.getByRole("checkbox", { name: "稽核人員" })).not.toBeChecked();
});

test("E05-S029: 處理失敗 resolves as a real role=alert badge and 已封存 resolves as a real role=status badge in Chromium's own accessibility tree", async ({
  page,
}) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await page.getByLabel("上傳文件").setInputFiles({
    name: "損毀報告[模擬:KB_PROCESSING_FAILED].pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("file content"),
  });
  await page.getByRole("button", { name: "上傳", exact: true }).click();
  await expect(page.getByText(/上傳中|解析中|索引中/)).not.toBeVisible();

  const failedItem = page.getByText("損毀報告", { exact: false }).locator("..");
  await expect(failedItem.getByRole("alert")).toHaveText("處理失敗");
  await expect(failedItem.getByRole("status")).toHaveCount(0);

  await failedItem.getByRole("button", { name: "封存文件" }).click();

  await page.getByRole("button", { name: "已封存文件" }).click();
  const archivedItem = page.getByText("損毀報告", { exact: false }).locator("..");
  await expect(archivedItem.getByRole("alert")).toHaveText("處理失敗");
  await expect(archivedItem.getByRole("status")).toHaveText("已封存");
});
