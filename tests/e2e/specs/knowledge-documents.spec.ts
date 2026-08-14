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

    await expect(page.getByText("根目錄檔案.pdf", { exact: false })).toBeVisible();
    await expect(page.getByText("子資料夾/子檔案.pdf", { exact: false })).toBeVisible();

    await page.getByRole("link", { name: "返回知識庫詳情" }).click();
    await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
    await expect(page.getByText("文件:", { exact: false })).toContainText("3 份文件");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
