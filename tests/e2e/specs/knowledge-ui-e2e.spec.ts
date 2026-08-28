import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S031 "Knowledge UI E2E" — the closing story for E05, same role
 * E03-S033 played for E03: a pure test-only story (zero source changes)
 * that audits the existing 11 knowledge-*.spec.ts files (46 tests) for
 * genuine COMBINATION-level gaps, not a re-test of anything already
 * covered in isolation. Every one of those 46 existing tests operates
 * on ONE feature area at a time, on either a fresh or a single seeded
 * KB — permissions/members/prompt/model/folder-sync each have their
 * own dedicated spec file and never appear together with each other or
 * with documents in the same test; knowledge-create.spec.ts never
 * opens the KB it just created; documents are never combined with any
 * KB-level setting. Confirmed by direct audit, not assumption.
 *
 * Two tests, mirroring E03-S033's own "everything succeeds together" /
 * "a rejection on one axis doesn't corrupt another" shape:
 *
 * 1. Create a KB, configure all 5 settings (permissions/members/
 *    prompt/model/folder-sync) through their real routes, add
 *    documents via 3 different creation methods, perform several
 *    document-level actions (rename/permission/bulk-archive/delete),
 *    then assert the detail page's full set of summary fields —
 *    settings AND document counts — are all simultaneously correct
 *    together, surviving a real in-app reload.
 * 2. A validation-rejected save, a cancelled delete, and a disabled
 *    dropdown option never disturb unrelated fields already correctly
 *    saved earlier in the same session — something no unit test can
 *    prove, since it requires real navigation between routes.
 *
 * `getByText("<label>:", { exact: false })` scoping is used throughout
 * for every settings summary — as of E05-S016, THREE fields
 * (可存取角色/綁定提示詞/資料夾同步) all share the identical
 * unconfigured-state text "尚未設定"; a bare match would be ambiguous
 * the moment more than one field is left unset in the same test.
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

async function openKnowledgeList(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
}

async function backToDetail(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
}

test("E05-S031: creating a KB and configuring every setting, adding documents via three sources, and several document actions all stay consistent together, surviving a reload", async ({
  page,
}) => {
  // E01-S027: measured flaky under full-suite CPU contention — a
  // `page.waitForURL` timeout on this test's own line 248, not a logic
  // bug (docs/stories/E01-S027.md's EVIDENCE has the repeat-each=3
  // breakdown). `test.slow()` triples this test's own timeout budget so
  // it survives contention without slowing the whole suite via a lower
  // global `workers` count.
  test.slow();
  await openKnowledgeList(page);

  // 1. Create, then open the just-created KB's own detail page — no
  // existing knowledge-create.spec.ts test ever does this.
  await page.getByRole("link", { name: "新增知識庫" }).click();
  await page.getByLabel("知識庫名稱").fill("供應商合作備忘錄");
  await page.getByLabel("說明").fill("供應商合作條款、保密協議與續約流程相關文件。");
  await page.getByRole("button", { name: "建立" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
  await page.getByRole("link", { name: "供應商合作備忘錄" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  // 2. Edit description. The edit form redirects to the KB list on
  // success (edit-knowledge-base.tsx has no detail-page route to return
  // to directly, same as /knowledge/new) — re-enter via the list's own
  // name link, same round trip step 1 already did after creating.
  await page.getByRole("link", { name: "編輯" }).click();
  await page.getByLabel("說明").fill("供應商合作條款、保密協議、續約流程與年度評鑑標準相關文件。");
  await page.getByRole("button", { name: "儲存" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
  await page.getByRole("link", { name: "供應商合作備忘錄" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  // 3. Permissions.
  await page.getByRole("link", { name: "權限設定" }).click();
  await page.getByRole("checkbox", { name: "業務/採購" }).check();
  await page.getByRole("checkbox", { name: "稽核人員" }).check();
  await backToDetail(page);

  // 4. Members.
  await page.getByRole("link", { name: "成員設定" }).click();
  await page.getByLabel("新增成員(使用者代號)").fill("demo-sales");
  await page.getByRole("button", { name: "新增" }).click();
  await page.getByLabel("新增成員(使用者代號)").fill("demo-maintenance");
  await page.getByRole("button", { name: "新增" }).click();
  await backToDetail(page);

  // 5. Prompt.
  await page.getByRole("link", { name: "提示詞設定" }).click();
  await page.getByLabel("綁定提示詞(選填)").fill("請以正式書面語氣回覆合作備忘錄相關問題，並優先引用最新版條款。");
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByRole("status")).toHaveText("已儲存。");
  await backToDetail(page);

  // 6. Model.
  await page.getByRole("link", { name: "模型設定" }).click();
  await page.getByLabel("綁定模型").selectOption("advanced-local");
  await backToDetail(page);

  // 7. Folder sync.
  await page.getByRole("link", { name: "資料夾同步設定" }).click();
  await page.getByLabel("資料夾路徑").fill("/mnt/shared/vendor-mou");
  await page.getByLabel("啟用資料夾同步").check();
  await page.getByRole("button", { name: "儲存" }).click();
  await backToDetail(page);

  // 8. All 5 settings correct together, on one render.
  await expect(page.getByText("可存取角色:", { exact: false })).toContainText("業務/採購");
  await expect(page.getByText("可存取角色:", { exact: false })).toContainText("稽核人員");
  await expect(page.getByText("成員:", { exact: false })).toContainText("demo-sales");
  await expect(page.getByText("成員:", { exact: false })).toContainText("demo-maintenance");
  await expect(page.getByText("綁定提示詞:", { exact: false })).toContainText("已設定");
  await expect(page.getByText("綁定模型:", { exact: false })).toContainText("進階模型（地端）");
  await expect(page.getByText("資料夾同步:", { exact: false })).toContainText("已啟用");

  // 9. Documents via 3 different sources, including one mock-triggered
  // failure, on this same freshly-configured KB.
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));

  await page.getByLabel("上傳文件").setInputFiles({
    name: "合作條款.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("mock file content"),
  });
  await page.getByRole("button", { name: "上傳", exact: true }).click();
  await expect(page.getByText(/上傳中|解析中|索引中/)).not.toBeVisible();

  await page.getByLabel("從網址匯入").fill("https://example.com/mou-template.pdf");
  await page.getByRole("button", { name: "匯入" }).click();

  await page.getByLabel("標題").fill("續約備忘");
  await page.getByLabel("內容").fill("雙方同意續約一年，續約條件與原條款相同。");
  await page.getByRole("button", { name: "新增" }).click();

  await page.getByLabel("上傳文件").setInputFiles({
    name: "異常合約[模擬:KB_PROCESSING_FAILED].pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("mock file content"),
  });
  await page.getByRole("button", { name: "上傳", exact: true }).click();
  await expect(page.getByText(/上傳中|解析中|索引中/)).not.toBeVisible();

  await expect(page.getByText("合作條款.pdf")).toBeVisible();
  await expect(page.getByText("https://example.com/mou-template.pdf")).toBeVisible();
  await expect(page.getByText("續約備忘")).toBeVisible();
  await expect(page.getByText("異常合約", { exact: false })).toBeVisible();

  // 10. Rename the uploaded file.
  const uploadedItem = page.getByText("合作條款.pdf").locator("..");
  await uploadedItem.getByRole("button", { name: "重新命名" }).click();
  await page.getByLabel("文件名稱").fill("合作條款（正式版）");
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByText("合作條款（正式版）")).toBeVisible();

  // 11. Set a document-level permission on the URL-imported document.
  const urlItem = page.getByText("https://example.com/mou-template.pdf").locator("..");
  await urlItem.getByRole("button", { name: "文件權限" }).click();
  await urlItem.getByRole("checkbox", { name: "維修工程師" }).check();

  // 12. Bulk-archive the renamed file and the text document, leaving
  // the URL-imported and the failed one in the active view. The
  // checkbox's own aria-label still reads the PRE-rename name here —
  // KnowledgeDocumentNameEditor's own local `name` state (see its doc
  // comment: "not a parent refetch") updates only the <strong> it owns,
  // never KnowledgeDocumentList's own `documents` state that the
  // checkbox's `選取 ${document.name}` label is actually built from, so
  // that label only catches up once something genuinely refetches the
  // list (the archive action two lines below does exactly that).
  await page.getByRole("checkbox", { name: "選取 合作條款.pdf" }).check();
  await page.getByRole("checkbox", { name: "選取 續約備忘" }).check();
  await expect(page.getByRole("group", { name: "批次操作" })).toContainText("已選擇 2 份文件");
  await page.getByRole("button", { name: "封存所選文件" }).click();

  await expect(page.getByText("合作條款（正式版）")).toHaveCount(0);
  await expect(page.getByText("續約備忘")).toHaveCount(0);
  await expect(page.getByText("https://example.com/mou-template.pdf")).toBeVisible();
  await expect(page.getByText("異常合約", { exact: false })).toBeVisible();

  // 13. In the archived view, permanently delete one of them.
  await page.getByRole("button", { name: "已封存文件" }).click();
  await expect(page.getByText("合作條款（正式版）")).toBeVisible();
  await expect(page.getByText("續約備忘")).toBeVisible();

  const archivedItem = page.getByText("合作條款（正式版）").locator("..");
  await archivedItem.getByRole("button", { name: "刪除文件" }).click();
  await expect(page.getByRole("alertdialog", { name: "確認刪除文件：合作條款（正式版）" })).toBeVisible();
  await page.getByRole("button", { name: "確認刪除" }).click();
  await expect(page.getByText("合作條款（正式版）")).toHaveCount(0);
  await expect(page.getByText("續約備忘")).toBeVisible();

  // 14. Back in the active view, confirm the surviving two documents
  // and that the permission set in step 11 survived the archive/bulk
  // round trip untouched.
  await page.getByRole("button", { name: "作用中文件" }).click();
  await expect(page.getByText("https://example.com/mou-template.pdf")).toBeVisible();
  await expect(page.getByText("異常合約", { exact: false })).toBeVisible();
  const reopenedUrlItem = page.getByText("https://example.com/mou-template.pdf").locator("..");
  await reopenedUrlItem.getByRole("button", { name: "文件權限" }).click();
  await expect(reopenedUrlItem.getByRole("checkbox", { name: "維修工程師" })).toBeChecked();

  // 15. Detail page: settings from steps 3-7 AND document counts all
  // correct together — 2 active (URL-imported + failed), 1 failed,
  // 1 archived.
  await backToDetail(page);
  await expect(page.getByRole("heading", { name: "供應商合作備忘錄", level: 1 })).toBeVisible();
  await expect(page.getByText("可存取角色:", { exact: false })).toContainText("業務/採購");
  await expect(page.getByText("成員:", { exact: false })).toContainText("demo-sales");
  await expect(page.getByText("綁定提示詞:", { exact: false })).toContainText("已設定");
  await expect(page.getByText("綁定模型:", { exact: false })).toContainText("進階模型（地端）");
  await expect(page.getByText("資料夾同步:", { exact: false })).toContainText("已啟用");
  await expect(page.getByText("文件:", { exact: false })).toContainText("2 份文件");
  await expect(page.getByText("處理失敗文件數:", { exact: false })).toContainText("1 份");
  await expect(page.getByText("已封存文件數:", { exact: false })).toContainText("1 份");

  // 16. Real reload via in-app navigation (never page.goto() — the
  // mock session lives only in memory) — confirm every field above
  // still holds after leaving and returning.
  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
  await page.getByRole("link", { name: "供應商合作備忘錄" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("可存取角色:", { exact: false })).toContainText("稽核人員");
  await expect(page.getByText("成員:", { exact: false })).toContainText("demo-maintenance");
  await expect(page.getByText("綁定模型:", { exact: false })).toContainText("進階模型（地端）");
  await expect(page.getByText("文件:", { exact: false })).toContainText("2 份文件");
  await expect(page.getByText("處理失敗文件數:", { exact: false })).toContainText("1 份");
  await expect(page.getByText("已封存文件數:", { exact: false })).toContainText("1 份");

  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));
  const finalUrlItem = page.getByText("https://example.com/mou-template.pdf").locator("..");
  await finalUrlItem.getByRole("button", { name: "文件權限" }).click();
  await expect(finalUrlItem.getByRole("checkbox", { name: "維修工程師" })).toBeChecked();
  await expect(page.getByText("異常合約", { exact: false })).toBeVisible();
  // Scoped via `main` — Next.js's own route announcer
  // (#__next-route-announcer__, freshly present right after step 16's
  // in-app navigation) is ALSO role="alert", so an unscoped query
  // ambiguously matches both.
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("處理失敗");
});

test("E05-S031: a validation-rejected save, a cancelled delete, and a disabled dropdown option never disturb other already-configured settings or documents on the same KB", async ({
  page,
}) => {
  await openKnowledgeList(page);
  await page.getByRole("link", { name: "人力資源與請假規範" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  // Baseline: this seed starts with no settings and no documents.
  await expect(page.getByText("文件:", { exact: false })).toContainText("尚無文件");

  await page.getByRole("link", { name: "權限設定" }).click();
  await page.getByRole("checkbox", { name: "部門主管" }).check();
  await backToDetail(page);

  await page.getByRole("link", { name: "模型設定" }).click();
  await page.getByLabel("綁定模型").selectOption("standard");
  await backToDetail(page);

  await page.getByRole("link", { name: "提示詞設定" }).click();
  await page.getByLabel("綁定提示詞(選填)").fill("請優先引用最新公告的請假規範版本。");
  await page.getByRole("button", { name: "儲存" }).click();
  await backToDetail(page);

  await expect(page.getByText("可存取角色:", { exact: false })).toContainText("部門主管");
  await expect(page.getByText("綁定模型:", { exact: false })).toContainText("標準模型（地端）");
  await expect(page.getByText("綁定提示詞:", { exact: false })).toContainText("已設定");

  // A rejected save (enabling folder sync with no path) must not
  // disturb any of the three fields just configured above.
  await page.getByRole("link", { name: "資料夾同步設定" }).click();
  await page.getByLabel("啟用資料夾同步").check();
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("啟用資料夾同步前，請先輸入資料夾路徑。");
  await backToDetail(page);

  await expect(page.getByText("資料夾同步:", { exact: false })).toContainText("尚未設定");
  await expect(page.getByText("可存取角色:", { exact: false })).toContainText("部門主管");
  await expect(page.getByText("綁定模型:", { exact: false })).toContainText("標準模型（地端）");
  await expect(page.getByText("綁定提示詞:", { exact: false })).toContainText("已設定");

  // A cancelled document delete must not disturb them either.
  await page.getByRole("link", { name: "文件列表" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/documents$/.test(url.pathname));
  await page.getByLabel("標題").fill("特別休假規則");
  await page.getByLabel("內容").fill("特別休假需提前三個工作天申請。");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(page.getByText("特別休假規則")).toBeVisible();

  await page.getByRole("button", { name: "刪除文件" }).click();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByText("特別休假規則")).toBeVisible();

  await backToDetail(page);
  await expect(page.getByText("文件:", { exact: false })).toContainText("1 份文件");
  await expect(page.getByText("可存取角色:", { exact: false })).toContainText("部門主管");
  await expect(page.getByText("綁定模型:", { exact: false })).toContainText("標準模型（地端）");
  await expect(page.getByText("綁定提示詞:", { exact: false })).toContainText("已設定");

  // The disabled cloud option never becomes the selected value. Scoped
  // via the select itself, same as knowledge-model.spec.ts's own
  // established pattern for this exact component (unlike
  // model-selector.spec.ts's sibling component, which queries the page
  // directly — either works, but this matches the more specific
  // precedent for KnowledgeModelEditor itself).
  await page.getByRole("link", { name: "模型設定" }).click();
  const modelSelect = page.getByLabel("綁定模型");
  await expect(modelSelect.getByRole("option", { name: "雲端模型（尚未啟用）" })).toBeDisabled();
  await expect(modelSelect).toHaveValue("standard");
  await backToDetail(page);

  // Final combined checkpoint: three independent rejected/cancelled
  // actions in a row never touched the three unrelated fields already
  // correctly saved earlier in the same session.
  await expect(page.getByText("可存取角色:", { exact: false })).toContainText("部門主管");
  await expect(page.getByText("綁定模型:", { exact: false })).toContainText("標準模型（地端）");
  await expect(page.getByText("綁定提示詞:", { exact: false })).toContainText("已設定");
  await expect(page.getByText("資料夾同步:", { exact: false })).toContainText("尚未設定");
  await expect(page.getByText("文件:", { exact: false })).toContainText("1 份文件");
});
