import { test, expect } from "@playwright/test";

/**
 * E11-S025 — the final story of E11 (Admin Console). SOURCE_BASELINE/
 * epic 檔對這個 story 沒有任何專屬內容,只有通用樣板文字 + 標題,同
 * `E03-S033`/`E05-S031`/`E07-S025`/`E09-S024` 這四個既有前例——每個 epic
 * 收尾的 E2E story 都是純測試、零原始碼變更,稽核既有 spec 找出「單獨
 * 驗證過,但從未一起組合驗證過」的落差,而不是重測已經驗證過的東西。
 *
 * 稽核全部 16 個既有 admin-*.spec.ts(橫跨 S001–S024,25 個測試)後找到
 * 的具體落差:
 *
 * 1. 每個既有測試都只造訪「一個」admin 領域,從未在同一個 session 裡
 *    連續造訪多個領域——無法證明 apps/admin 首頁(page.tsx)自己完整的
 *    15 個入口連結真的全部共存、彼此不干擾(這是一個真實的回歸風險:
 *    S002 到 S022 每個 story 都各自編輯過同一個 page.tsx,加入自己的
 *    連結;個別 story 自己的測試只驗證自己那一條連結存在,從未驗證過
 *    「加入第 N 條連結後,前面 N-1 條連結依然都在」)。
 * 2. 每個既有測試各自的 `page.reload()`(部門/群組/模型/連接器/設定)
 *    都只重整「剛剛自己改過的那一個」領域,從未在同一個 session 裡
 *    改動多個彼此獨立的領域後才重整——無法證明 Model/Connector/
 *    Department 三個各自獨立的 sessionStorage key(`ai-km:mock-admin-
 *    models`/`ai-km:mock-admin-connectors`/`ai-km:mock-admin-
 *    departments`,原始碼逐一查證屬實)真的互不污染,也無法證明重整後
 *    三者「同時」正確持久化,而不是巧合地個別測試各自都對。
 * 3. 沒有任何既有測試證明「造訪過 A 領域並修改它」之後,完全沒碰過的
 *    B 領域(例如 Groups)依然維持它自己原始的種子狀態,不受污染。
 *
 * 兩個測試,同 `erp-e2e.spec.ts`(E09-S024)的既有形狀:「多個獨立領域
 * 在同一個 session 內各自變更,撐過真實重整,且彼此不污染」+「首頁
 * 全部 15 個入口連結在同一個連續 session 內逐一造訪,每一個都到達自己
 * 正確的頁面」。
 */

const ALL_ADMIN_ENTRIES: { link: string; pathname: string; heading: string }[] = [
  { link: "使用者管理", pathname: "/users", heading: "使用者管理" },
  { link: "角色管理", pathname: "/roles", heading: "角色管理" },
  { link: "權限矩陣", pathname: "/permissions", heading: "權限矩陣" },
  { link: "部門管理", pathname: "/departments", heading: "部門管理" },
  { link: "群組管理", pathname: "/groups", heading: "群組管理" },
  { link: "知識庫管理", pathname: "/knowledge", heading: "知識庫管理" },
  { link: "提示詞管理", pathname: "/prompts", heading: "提示詞管理" },
  { link: "模型管理", pathname: "/models", heading: "模型管理" },
  { link: "連接器管理", pathname: "/connectors", heading: "連接器管理" },
  { link: "稽核紀錄", pathname: "/audit", heading: "稽核紀錄" },
  { link: "回饋佇列", pathname: "/feedback", heading: "回饋佇列" },
  { link: "文件失敗佇列", pathname: "/document-failures", heading: "文件失敗佇列" },
  { link: "系統設定", pathname: "/settings", heading: "系統設定" },
  { link: "使用量儀表板", pathname: "/usage", heading: "使用量儀表板" },
  { link: "系統健康儀表板", pathname: "/health", heading: "系統健康儀表板" },
];

test("E11-S025: navigating through every admin home entry link in one continuous session reaches its own real page", async ({
  page,
}) => {
  for (const entry of ALL_ADMIN_ENTRIES) {
    await page.goto("/");
    await page.getByRole("link", { name: entry.link }).click();
    await page.waitForURL((url) => url.pathname === entry.pathname);
    await expect(page.getByRole("heading", { name: entry.heading, level: 1, exact: true })).toBeVisible();
  }
});

test("E11-S025: enabling a model, enabling a connector, and creating a department in one session all persist independently across a reload, without disturbing an untouched domain (groups)", async ({
  page,
}) => {
  // 1. Enable the cloud model.
  await page.goto("/models");
  const cloudRow = page.getByRole("listitem").filter({ hasText: "雲端模型" });
  await expect(cloudRow.getByText("已停用", { exact: true })).toBeVisible();
  await cloudRow.getByRole("button", { name: "啟用" }).click();
  await expect(cloudRow.getByText("啟用中", { exact: true })).toBeVisible();

  // 2. Enable the ERP connector — a completely independent domain.
  await page.goto("/connectors");
  const erpRow = page.getByRole("listitem").filter({ hasText: "ERP 連接器" });
  await expect(erpRow.getByText("已停用", { exact: true })).toBeVisible();
  await erpRow.getByRole("button", { name: "啟用" }).click();
  await expect(erpRow.getByText("啟用中", { exact: true })).toBeVisible();

  // 3. Create a new department — yet another independent domain.
  await page.goto("/departments");
  await page.getByLabel("部門名稱").fill("行銷部");
  await page.getByRole("button", { name: "新增部門" }).click();
  await expect(page.getByText("行銷部", { exact: true })).toBeVisible();

  // 4. Visit groups without changing anything — the untouched control domain.
  await page.goto("/groups");
  await expect(page.getByText("一般使用者群組", { exact: true })).toBeVisible();
  await expect(page.getByText("維修工程師群組", { exact: true })).toBeVisible();
  await expect(page.getByText("業務群組", { exact: true })).toBeVisible();

  // 5. A single reload — every domain re-fetches from its own sessionStorage independently.
  await page.reload();
  await expect(page.getByText("一般使用者群組", { exact: true })).toBeVisible();
  await expect(page.getByText("維修工程師群組", { exact: true })).toBeVisible();
  await expect(page.getByText("業務群組", { exact: true })).toBeVisible();
  // Groups was never touched — it must show exactly its 3 seeded entries, nothing more.
  await expect(page.getByRole("listitem")).toHaveCount(3);

  await page.goto("/models");
  const cloudRowAfterReload = page.getByRole("listitem").filter({ hasText: "雲端模型" });
  await expect(cloudRowAfterReload.getByText("啟用中", { exact: true })).toBeVisible();

  await page.goto("/connectors");
  const erpRowAfterReload = page.getByRole("listitem").filter({ hasText: "ERP 連接器" });
  await expect(erpRowAfterReload.getByText("啟用中", { exact: true })).toBeVisible();

  await page.goto("/departments");
  await expect(page.getByText("行銷部", { exact: true })).toBeVisible();
  await expect(page.getByText("資訊部", { exact: true })).toBeVisible();
});
