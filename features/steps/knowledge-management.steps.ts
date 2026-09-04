/**
 * 08-knowledge-management phase-1 步驟(回填)。
 *
 * 每一步呼叫的入口,都是 apps/web 自己的 vitest 測試在呼叫的那個:
 * `listKnowledgeBases()`(knowledge-bases.test.ts E05-S001/S002)、
 * `listKnowledgeBaseDocuments()` / `addKnowledgeBaseDocument()` /
 * `addKnowledgeBaseDocumentFromUrl()` / `addKnowledgeBaseDocumentFromText()` /
 * `renameKnowledgeBaseDocument()` / `retryDocumentProcessing()`
 * (knowledge-documents.test.ts E05-S010～S027、E03-S045)。
 *
 * **這一層全部是 apps/web 的瀏覽器端 mock**(session storage 後端),不是整合證據:
 * contracts/openapi 沒有任何 knowledge 路徑,真正的 Document 實體屬於 E06(Team B,未建)。
 * 詳見 features/08-knowledge-management/FEATURE.md。
 *
 * ## 為什麼這個檔要自己裝一個 session storage
 *
 * `knowledge-bases.ts` / `knowledge-documents.ts` 的 `readStore()`/`writeStore()` 以
 * `typeof window === "undefined"` 判斷有沒有瀏覽器:沒有時讀固定樣本、寫入靜默 no-op。
 * apps/web 的 vitest 跑在 jsdom 底下,拿到的是 jsdom 的 `window.sessionStorage`;
 * features 的 runner 是 node + tsx,沒有 jsdom(也不准自己加依賴)。所以這裡在
 * **scenario 期間**掛一個 Map 後端的 `window.sessionStorage`,讓那兩個模組走的是與
 * vitest 完全相同的那條真實程式路徑,而不是「沒有瀏覽器」的退化分支。
 *
 * 這不是把接縫 mock 掉——被驗的邏輯(過濾、跨知識庫守門、驗證、旗標)一行都沒有被替換,
 * 換掉的只是瀏覽器提供的儲存體本身。After hook 只在自己裝過時拆掉,不影響別的能力資料夾。
 */
import { After, Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { KmWorld } from "./_world.js";

import { listKnowledgeBases } from "../../apps/web/src/lib/knowledge-bases.js";
import {
  addKnowledgeBaseDocument,
  addKnowledgeBaseDocumentFromText,
  addKnowledgeBaseDocumentFromUrl,
  listKnowledgeBaseDocuments,
  renameKnowledgeBaseDocument,
  retryDocumentProcessing,
  type KnowledgeBaseDocument,
} from "../../apps/web/src/lib/knowledge-documents.js";

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

declare global {
  /** node 沒有 window;這個宣告讓 apps/web 的 mock 層在 features 的 tsconfig(lib 只有 ES2022)底下也能型別檢查。 */
  // eslint-disable-next-line no-var
  var window: { sessionStorage: SessionStorageLike } | undefined;
}

/** 標記本檔裝上去的 window,拆的時候只拆自己裝的那個 */
const INSTALLED_BY_THIS_FILE = "__aiKmKnowledgeManagementSteps";

const MOCK_TRIGGER_ENV = "NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS";
let savedMockTriggerEnv: { present: boolean; value?: string | undefined } | undefined;

function installBrowserSession(): void {
  const cells = new Map<string, string>();
  const sessionStorage: SessionStorageLike = {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
    clear: () => {
      cells.clear();
    },
  };
  (globalThis as unknown as Record<string, unknown>)["window"] = { sessionStorage, [INSTALLED_BY_THIS_FILE]: true };
}

function uninstallBrowserSession(): void {
  const current = (globalThis as unknown as Record<string, unknown>)["window"] as Record<string, unknown> | undefined;
  if (current && current[INSTALLED_BY_THIS_FILE] === true) {
    delete (globalThis as unknown as Record<string, unknown>)["window"];
  }
}

/** "a, b, c" → ["a","b","c"];"" → [] */
function names(list: string): string[] {
  return list
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

interface Refusal {
  code: string;
  message: string;
}

/** 最近一次動作的產出:成功的文件、或被拒絕的原因 */
interface KnowledgeState {
  knowledgeBaseNames?: string[];
  refusal?: Refusal;
}

function state(world: KmWorld): KnowledgeState {
  let existing = world.bag["knowledgeManagement"] as KnowledgeState | undefined;
  if (!existing) {
    existing = {};
    world.bag["knowledgeManagement"] = existing;
  }
  return existing;
}

/** 把 Result 收斂成「成功就丟掉、失敗就記下拒絕原因」 */
function record<T>(world: KmWorld, result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): void {
  state(world).refusal = result.ok ? undefined : { code: result.error.code, message: result.error.message };
}

async function documentsOf(knowledgeBaseId: string): Promise<KnowledgeBaseDocument[]> {
  const listed = await listKnowledgeBaseDocuments(knowledgeBaseId);
  assert.ok(listed.ok, `列出知識庫 ${knowledgeBaseId} 的文件不該失敗`);
  return [...listed.value];
}

async function documentNamed(knowledgeBaseId: string, name: string): Promise<KnowledgeBaseDocument> {
  const documents = await documentsOf(knowledgeBaseId);
  const found = documents.find((document) => document.name === name);
  assert.ok(found, `知識庫 ${knowledgeBaseId} 裡找不到名為「${name}」的文件,現有的是:${documents.map((d) => d.name).join(" / ") || "(空)"}`);
  return found;
}

// ---------------------------------------------------------------- Given

Given("an empty browser session holding the sample knowledge bases", function (this: KmWorld) {
  installBrowserSession();
});

Given("the knowledge library's mock-trigger flag is {string}", function (this: KmWorld, onOrOff: string) {
  assert.ok(onOrOff === "on" || onOrOff === "off", `旗標只能是 on 或 off,收到「${onOrOff}」`);
  if (!savedMockTriggerEnv) {
    savedMockTriggerEnv = { present: MOCK_TRIGGER_ENV in process.env, value: process.env[MOCK_TRIGGER_ENV] };
  }
  process.env[MOCK_TRIGGER_ENV] = onOrOff === "on" ? "true" : "false";
});

// ---------------------------------------------------------------- When

When("the knowledge library is opened with no search term", async function (this: KmWorld) {
  const listed = await listKnowledgeBases();
  assert.ok(listed.ok, "列出知識庫不該失敗");
  state(this).knowledgeBaseNames = listed.value.map((knowledgeBase) => knowledgeBase.name);
});

When("the knowledge library is searched for {string}", async function (this: KmWorld, query: string) {
  const listed = await listKnowledgeBases(query);
  assert.ok(listed.ok, "搜尋知識庫不該失敗");
  state(this).knowledgeBaseNames = listed.value.map((knowledgeBase) => knowledgeBase.name);
});

When(
  "a file named {string} of {int} bytes is uploaded to knowledge base {string}",
  async function (this: KmWorld, fileName: string, sizeBytes: number, knowledgeBaseId: string) {
    record(this, await addKnowledgeBaseDocument(knowledgeBaseId, fileName, sizeBytes));
  },
);

When("the address {string} is imported into knowledge base {string}", async function (this: KmWorld, address: string, knowledgeBaseId: string) {
  record(this, await addKnowledgeBaseDocumentFromUrl(knowledgeBaseId, address));
});

When(
  "the text knowledge {string} containing {string} is added to knowledge base {string}",
  async function (this: KmWorld, title: string, content: string, knowledgeBaseId: string) {
    record(this, await addKnowledgeBaseDocumentFromText(knowledgeBaseId, title, content));
  },
);

When(
  "document {string} is renamed to {string} through knowledge base {string}",
  async function (this: KmWorld, documentId: string, newName: string, knowledgeBaseId: string) {
    record(this, await renameKnowledgeBaseDocument(knowledgeBaseId, documentId, newName));
  },
);

When("document {string} is retried through knowledge base {string}", async function (this: KmWorld, documentId: string, knowledgeBaseId: string) {
  record(this, await retryDocumentProcessing(knowledgeBaseId, documentId));
});

// ---------------------------------------------------------------- Then

Then("the knowledge library shows exactly the knowledge bases {string}", async function (this: KmWorld, expected: string) {
  let actual = state(this).knowledgeBaseNames;
  if (!actual) {
    const listed = await listKnowledgeBases();
    assert.ok(listed.ok, "列出知識庫不該失敗");
    actual = listed.value.map((knowledgeBase) => knowledgeBase.name);
  }
  assert.deepEqual(actual, names(expected), `知識庫清單應為 [${names(expected).join(" | ")}],實際是 [${actual.join(" | ")}]`);
});

Then("knowledge base {string} shows exactly the documents {string}", async function (this: KmWorld, knowledgeBaseId: string, expected: string) {
  const actual = (await documentsOf(knowledgeBaseId)).map((document) => document.name);
  assert.deepEqual(
    actual,
    names(expected),
    `知識庫 ${knowledgeBaseId} 的文件應為 [${names(expected).join(" | ")}],實際是 [${actual.join(" | ")}]`,
  );
});

Then(
  "knowledge base {string} records the document {string} with a size of {int} bytes",
  async function (this: KmWorld, knowledgeBaseId: string, name: string, expected: number) {
    const document = await documentNamed(knowledgeBaseId, name);
    assert.equal(document.sizeBytes, expected, `文件「${name}」的大小應為 ${expected} bytes,實際是 ${String(document.sizeBytes)}`);
  },
);

Then(
  "knowledge base {string} records the document {string} with no size at all",
  async function (this: KmWorld, knowledgeBaseId: string, name: string) {
    const document = await documentNamed(knowledgeBaseId, name);
    assert.equal(document.sizeBytes, undefined, `文件「${name}」不該有大小(沒有真的抓取過任何位元組),實際是 ${String(document.sizeBytes)}`);
  },
);

Then(
  "knowledge base {string} records the document {string} with processing status {string}",
  async function (this: KmWorld, knowledgeBaseId: string, name: string, expected: string) {
    const document = await documentNamed(knowledgeBaseId, name);
    // 「ready」在這個 mock 裡就是「沒有 status 欄位」——見 knowledge-documents.ts 的 DocumentProcessingStatus 註解。
    const actual = document.status ?? "ready";
    assert.equal(actual, expected, `文件「${name}」的處理狀態應為 ${expected},實際是 ${actual}`);
  },
);

Then("the knowledge library refuses it with {string}", function (this: KmWorld, code: string) {
  const refusal = state(this).refusal;
  assert.ok(refusal, `預期知識庫以 ${code} 拒絕這個操作,但它成功了`);
  assert.equal(refusal.code, code, `拒絕代碼應為 ${code},實際是 ${refusal.code}:${refusal.message}`);
});

Then("the knowledge library's refusal message is {string}", function (this: KmWorld, message: string) {
  const refusal = state(this).refusal;
  assert.ok(refusal, "預期知識庫拒絕這個操作,但它成功了");
  assert.equal(refusal.message, message, `拒絕訊息應為「${message}」,實際是「${refusal.message}」`);
});

// ---------------------------------------------------------------- 收尾

After(function () {
  uninstallBrowserSession();
  if (savedMockTriggerEnv) {
    if (savedMockTriggerEnv.present && savedMockTriggerEnv.value !== undefined) {
      process.env[MOCK_TRIGGER_ENV] = savedMockTriggerEnv.value;
    } else {
      delete process.env[MOCK_TRIGGER_ENV];
    }
    savedMockTriggerEnv = undefined;
  }
});
