/**
 * 03-conversation phase-1 步驟(回填)。
 *
 * 每一步走的入口都是 services/conversation 自己的 vitest 測試在走的那個:
 * `buildTestApp()`(routes/conversations.test.ts、routes/messages.test.ts 的
 * harness,真實 migration、真實 conversationPlugin、真實路由)、
 * 真的 `listen()` + `http.request` 的 SSE 串流(routes/change-events.test.ts)、
 * `appendChangeEvent`／`listChangeEventsAfter`(repository/change-events.repository.test.ts)、
 * `createConversation` + 會炸的交易(events/emit-after-commit.test.ts)。
 * 這裡不 mock 任何接縫,也不改實作。
 */
import { After, Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from "fastify";
import type { KmWorld } from "./_world.js";

import { conversationPlugin } from "../../services/conversation/src/plugin.js";
import {
  appendChangeEvent,
  listChangeEventsAfter,
  type ChangeEventType,
} from "../../services/conversation/src/repository/change-events.repository.js";
import { createConversation } from "../../services/conversation/src/repository/conversations.repository.js";
import { toOwnerKey } from "../../services/conversation/src/repository/owner-scope.js";
import type { ChangeEventBus } from "../../services/conversation/src/events/change-event-bus.js";

// phase-2 專用的額外 import(見檔尾「phase-2」那一段的檔頭註解)。這裡不 import
// 任何新的實作符號——`extractPdfText`/`chunkDocument`/`toRetrievalScope` 都是
// 05-ingestion/06-retrieval 自己既有測試已經在用的產品碼,不是為了這次新寫的。
import { SESSION_COOKIE_NAME } from "../../services/identity/src/require-session.js";
import { extractPdfText } from "../../services/ingestion/src/extraction/pdf-extract.js";
import { chunkDocument } from "../../services/ingestion/src/chunking/chunk.js";
import { toRetrievalScope, type RetrievalScope } from "../../services/retrieval/src/authorization/scope.js";

/**
 * `services/conversation/src/testing/build-test-app.ts` 是這個能力的 vitest
 * harness,也是這裡要走的同一個入口——但它**不能用字面路徑 import**。
 *
 * 原因(2026-09-04 實跑 `pnpm typecheck` 確認,不是從原始碼推的):`_world.ts`
 * 會 `await import("../../apps/api/src/server.js")`,所以 apps/api 的
 * `declare module "fastify"`(`contracts: ContractRegistry`、`requireSession`)
 * 已經在 features 這個型別程式裡。build-test-app 用 `app.decorate("contracts", …)`
 * 裝的是一個只有 `getSchema` 的窄物件——在它自己的 package 裡沒有那份 augmentation,
 * 完全合法;一旦被拉進 features 的程式就變成
 * `Type '{ getSchema… }' is missing … specNames, getResponseSchema, validateResponse`。
 * 那是 `plugin-types.ts` 開頭那段註解預告過的跨 package 衝突,不是這次回填造成的,
 * 而修它要動 `services/conversation`(本工單不得修改的實作區)。
 *
 * 所以這裡用「變數當 specifier」的動態 import:執行期照樣載入同一個檔、走同一個入口,
 * 型別上則不把它拉進 features 的程式(它由 services/conversation 自己的 tsc 檢查)。
 * 下面的 `HarnessModule` 是本檔對它的最小型別假設;形狀若漂移,場景會當場紅。
 * 見 FEATURE.md「待協調」。
 */
const HARNESS_MODULE = "../../services/conversation/src/testing/build-test-app.js";

/** 從 repository 的參數位置取回 better-sqlite3 的 `Database`,免得在 features 這一側直接 import 它。 */
type SqliteDb = Parameters<typeof listChangeEventsAfter>[0];

interface ConversationHarness {
  readonly app: FastifyInstance;
  readonly db: SqliteDb;
  readonly changeEventBus: ChangeEventBus;
}

interface HarnessModule {
  buildTestApp(options?: { heartbeatIntervalMs?: number }): Promise<ConversationHarness>;
  readonly TEST_USER_HEADER: string;
}

async function loadHarness(): Promise<HarnessModule> {
  return (await import(HARNESS_MODULE)) as HarnessModule;
}

/** SSE 心跳:場景不驗心跳,設大一點免得心跳字元混進要比對的緩衝區(vitest 測試同樣做法)。 */
const QUIET_HEARTBEAT_MS = 5_000;
const AT = "2026-09-04T00:00:00.000Z";

interface SseWindow {
  readonly statusCode: number;
  buffer(): string;
  close(): void;
}

interface ChangeFrame {
  readonly seq: number;
  readonly type: string;
  readonly data: Record<string, unknown>;
}

interface ConversationState {
  app: FastifyInstance;
  db: SqliteDb;
  bus: ChangeEventBus;
  /** harness 用來冒充登入者的標頭名(TEST_USER_HEADER),不在這裡另外寫死一份 */
  userHeader: string;
  port?: number;
  /** 最近一次被建立(或被回捲)的對話 id */
  conversationId?: string;
  /** 最近一次被建立的訊息 id */
  messageId?: string;
  /** 最近一次建立／修訂訊息的回應內容 */
  messageBody?: Record<string, unknown>;
  /** 目前開著的 SSE 視窗 */
  window?: SseWindow;
  sockets: { destroy(): void }[];
}

function state(world: KmWorld): ConversationState {
  const s = world.bag["conversation"] as ConversationState | undefined;
  assert.ok(s, "Background 尚未建立 conversation workspace");
  return s;
}

function headersFor(world: KmWorld, person: string): Record<string, string> {
  return { [state(world).userHeader]: person };
}

async function listen(s: ConversationState): Promise<number> {
  if (s.port !== undefined) return s.port;
  await s.app.listen({ port: 0, host: "127.0.0.1" });
  s.port = (s.app.server.address() as AddressInfo).port;
  return s.port;
}

async function waitUntil(predicate: () => boolean, what: string, timeoutMs = 4_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`等 ${what} 超過 ${timeoutMs}ms 仍未出現`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** 開一條真的 SSE 連線(與 routes/change-events.test.ts 的 connectSSE 同樣的走法)。 */
function connect(s: ConversationState, port: number, headers: Record<string, string>): Promise<SseWindow> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, path: "/v1/conversations/events", headers });
    s.sockets.push(request);
    request.on("error", reject);
    request.on("response", (response) => {
      s.sockets.push(response);
      let text = "";
      response.on("data", (chunk: Buffer) => {
        text += chunk.toString("utf8");
      });
      resolve({
        statusCode: response.statusCode ?? 0,
        buffer: () => text,
        close: () => {
          response.destroy();
          request.destroy();
        },
      });
    });
    request.end();
  });
}

async function openWindow(
  world: KmWorld,
  person: string,
  extraHeaders: Record<string, string> = {},
): Promise<SseWindow> {
  const s = state(world);
  const port = await listen(s);
  const w = await connect(s, port, { ...headersFor(world, person), ...extraHeaders });
  assert.equal(w.statusCode, 200, `SSE 連線應為 200,實際 ${w.statusCode}`);
  await waitUntil(() => w.buffer().includes(": connected"), "SSE 連線建立訊息");
  s.window = w;
  return w;
}

function windowOf(world: KmWorld): SseWindow {
  const w = state(world).window;
  assert.ok(w, "還沒有任何視窗在看變更(Given 要先開一個)");
  return w;
}

/** SSE 緩衝區裡每一個帶編號的變更框(id / event / data 三行一組)。 */
function framesOf(buffer: string): ChangeFrame[] {
  const frames: ChangeFrame[] = [];
  for (const block of buffer.split("\n\n")) {
    const seq = /^id: (\d+)$/m.exec(block);
    const type = /^event: (\S+)$/m.exec(block);
    const data = /^data: (\{.*\})$/m.exec(block);
    if (!seq || !type || !data) continue;
    frames.push({
      seq: Number(seq[1]),
      type: type[1] as string,
      data: JSON.parse(data[1] as string) as Record<string, unknown>,
    });
  }
  return frames;
}

function changeLogOf(world: KmWorld, person: string): string {
  const s = state(world);
  return listChangeEventsAfter(s.db, toOwnerKey(person), 0, 1000)
    .map((e) => `${e.type}#${e.seq}`)
    .join(", ");
}

async function createConversationFor(world: KmWorld, person: string): Promise<string> {
  const s = state(world);
  const res = await s.app.inject({
    method: "POST",
    url: "/v1/conversations",
    headers: headersFor(world, person),
  });
  assert.equal(res.statusCode, 201, `建立對話應為 201,實際 ${res.statusCode}:${res.body}`);
  world.lastResponse = res;
  const body = res.json() as { id: string };
  s.conversationId = body.id;
  return body.id;
}

async function postMessage(
  world: KmWorld,
  person: string,
  payload: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  const s = state(world);
  assert.ok(s.conversationId, "還沒有任何對話");
  const res = await s.app.inject({
    method: "POST",
    url: `/v1/conversations/${s.conversationId}/messages`,
    headers: headersFor(world, person),
    payload,
  });
  assert.equal(res.statusCode, 201, `送出訊息應為 201,實際 ${res.statusCode}:${res.body}`);
  world.lastResponse = res;
  const body = res.json() as Record<string, unknown>;
  s.messageId = body["id"] as string;
  s.messageBody = body;
  return res;
}

async function reviseMessage(world: KmWorld, person: string, payload: Record<string, unknown>): Promise<void> {
  const s = state(world);
  assert.ok(s.conversationId && s.messageId, "還沒有可以修訂的訊息");
  const res = await s.app.inject({
    method: "POST",
    url: `/v1/conversations/${s.conversationId}/messages/${s.messageId}/revisions`,
    headers: headersFor(world, person),
    payload,
  });
  assert.equal(res.statusCode, 200, `修訂應為 200,實際 ${res.statusCode}:${res.body}`);
  world.lastResponse = res;
  s.messageBody = res.json() as Record<string, unknown>;
}

// ---------------------------------------------------------------- Given

Given("a conversation workspace with an empty change log", { timeout: 60_000 }, async function (this: KmWorld) {
  const { buildTestApp, TEST_USER_HEADER } = await loadHarness();
  const built = await buildTestApp({ heartbeatIntervalMs: QUIET_HEARTBEAT_MS });
  // World 的 After 會 close 這個 app;db 與 socket 由本檔自己的 After 收(見檔尾)。
  this.app = built.app;
  this.bag["conversation"] = {
    app: built.app,
    db: built.db,
    bus: built.changeEventBus,
    userHeader: TEST_USER_HEADER,
    sockets: [],
  } satisfies ConversationState;
});

Given("{string} has started a conversation", async function (this: KmWorld, person: string) {
  await createConversationFor(this, person);
});

Given("the assistant has answered {string} in that conversation", async function (this: KmWorld, content: string) {
  await postMessage(this, "alice", { role: "assistant", content });
});

Given("that answer has already been revised to {string}", async function (this: KmWorld, content: string) {
  await reviseMessage(this, "alice", { content });
});

Given(
  "a second window is watching {string}'s conversation changes",
  { timeout: 30_000 },
  async function (this: KmWorld, person: string) {
    await openWindow(this, person);
  },
);

Given(
  "the change log already holds {int} earlier changes for {string}",
  function (this: KmWorld, count: number, person: string) {
    const s = state(this);
    const owner = toOwnerKey(person);
    for (let i = 1; i <= count; i += 1) {
      appendChangeEvent(s.db, owner, {
        type: "conversation.created",
        conversationId: `c${i}`,
        occurredAt: AT,
      });
    }
  },
);

// ---------------------------------------------------------------- When

/**
 * 本來要用 common.steps.ts 的通用句子
 * `the {string} plugin is registered on a bare server and the server becomes ready`,
 * 但那個定義的 cucumber expression 有一個 `{string}`、回呼卻宣告 0 個參數,cucumber
 * 直接判 `function has 0 arguments, should have 1`——目前沒有任何資料夾用得起來
 * (2026-09-04 實跑確認,不是從原始碼推的)。共用檔只有協調者能改,所以這裡自己寫
 * 一句帶本能力名詞的 When,做的事完全一樣:在一個乾淨的父實例上真的
 * register() → ready(),並把該實例留在 `this.bag["registeredApp"]`,讓通用的 Then
 * (`the {string} plugin is visible on the parent server instance`)照樣讀得到。
 * 修好之後可以換回通用句子——見 FEATURE.md「待協調」。
 */
When(
  "the conversation domain is mounted on a bare server and that server becomes ready",
  { timeout: 30_000 },
  async function (this: KmWorld) {
    const s = state(this);
    // 借用 harness 已經裝好的 host 介面(db / requireSession / contracts / 驗證器),
    // 這樣這一步驗的是 plugin 自己的封裝行為(ADR 0007 §5),不是又蓋一份 harness。
    // `decorate` 走窄型別轉接,理由與 services/conversation/src/plugin-types.ts 同一個:
    // apps/api 的 ambient augmentation 與 harness 裝的窄物件在同一個程式裡對不起來。
    const host = s.app as unknown as Record<string, unknown>;
    const bare = Fastify({ logger: false });
    const mount = bare as unknown as {
      decorate(name: string, value: unknown): void;
      setValidatorCompiler(compiler: unknown): void;
    };
    mount.setValidatorCompiler(s.app.validatorCompiler);
    mount.decorate("db", host["db"]);
    mount.decorate("requireSession", host["requireSession"]);
    mount.decorate("contracts", host["contracts"]);
    await bare.register(conversationPlugin);
    await bare.ready();
    this.bag["registeredApp"] = bare;
  },
);

When("{string} starts a new conversation", async function (this: KmWorld, person: string) {
  await createConversationFor(this, person);
});

When(
  "{string} sends the message {string} into that conversation",
  async function (this: KmWorld, person: string, content: string) {
    await postMessage(this, person, { role: "user", content });
  },
);

When(
  "{string} revises that answer to {string} marking it {string}",
  async function (this: KmWorld, person: string, content: string, answerState: string) {
    await reviseMessage(this, person, { content, state: answerState });
  },
);

When("{string} opens the conversation {string} started", async function (this: KmWorld, reader: string, owner: string) {
  const s = state(this);
  assert.ok(s.conversationId, `${owner} 還沒有任何對話`);
  this.lastResponse = await s.app.inject({
    method: "GET",
    url: `/v1/conversations/${s.conversationId}`,
    headers: headersFor(this, reader),
  });
});

When(
  "a window reconnects to {string}'s conversation changes from checkpoint {int}",
  { timeout: 30_000 },
  async function (this: KmWorld, person: string, checkpoint: number) {
    const w = await openWindow(this, person, { "Last-Event-ID": String(checkpoint) });
    // 重播與 resync 都是連上之後立刻寫出的;等到其中一種出現再斷言,否則就是真的沒送。
    await waitUntil(
      () => framesOf(w.buffer()).length > 0 || w.buffer().includes("event: resync"),
      "重播的變更或 resync 指示",
    );
  },
);

When("starting a conversation for {string} fails midway and is rolled back", function (this: KmWorld, person: string) {
  const s = state(this);
  const owner = toOwnerKey(person);
  s.conversationId = "c-rolled-back";
  // 與 events/emit-after-commit.test.ts 同一種故障注入:交易裡的第二個寫入用一個
  // 契約沒有定義的事件型別,讓 appendChangeEvent 自己的執行期驗證炸掉整筆交易。
  assert.throws(() => {
    const event = s.db.transaction(() => {
      const row = createConversation(s.db, owner, { id: "c-rolled-back", mode: "normal", now: AT });
      return appendChangeEvent(s.db, owner, {
        type: "conversation.exploded" as unknown as ChangeEventType,
        conversationId: row.id,
        occurredAt: AT,
      });
    })();
    s.bus.publish(owner, event);
  }, "這一步的前提就是寫入會失敗,但交易沒有拋出任何錯誤");
});

// ---------------------------------------------------------------- Then

Then(
  "asking that instance for the conversation list without a session is challenged rather than answered as a missing route",
  async function (this: KmWorld) {
    const app = this.bag["registeredApp"] as FastifyInstance | undefined;
    assert.ok(app, "還沒有掛載過 conversation domain");
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    assert.equal(
      res.statusCode,
      401,
      `掛載後的實例應該用 401 要求登入,實際 ${res.statusCode}` +
        `(404 代表路由根本沒被註冊,200 代表守門沒接上):${res.body}`,
    );
  },
);

Then(
  "the new conversation is titled {string} in mode {string} previewing {string}",
  function (this: KmWorld, title: string, mode: string, preview: string) {
    assert.ok(this.lastResponse, "還沒有建立過對話");
    const body = this.lastResponse.json() as Record<string, unknown>;
    assert.deepEqual(
      { title: body["title"], mode: body["mode"], lastMessagePreview: body["lastMessagePreview"] },
      { title, mode, lastMessagePreview: preview },
      `新對話的預設值不符:${JSON.stringify(body)}`,
    );
  },
);

Then("the change log for {string} reads {string}", function (this: KmWorld, person: string, expected: string) {
  const actual = changeLogOf(this, person);
  assert.equal(actual, expected, `${person} 的變更紀錄應為「${expected}」,實際「${actual}」`);
});

Then("that conversation now previews {string}", async function (this: KmWorld, preview: string) {
  const s = state(this);
  const res = await s.app.inject({
    method: "GET",
    url: `/v1/conversations/${s.conversationId}`,
    headers: headersFor(this, "alice"),
  });
  assert.equal(res.statusCode, 200, `讀回對話應為 200,實際 ${res.statusCode}:${res.body}`);
  const body = res.json() as Record<string, unknown>;
  assert.equal(
    body["lastMessagePreview"],
    preview,
    `對話摘要應為「${preview}」,實際「${String(body["lastMessagePreview"])}」`,
  );
});

Then(
  "that answer now reads {string} in state {string}",
  function (this: KmWorld, content: string, answerState: string) {
    const body = state(this).messageBody;
    assert.ok(body, "還沒有任何訊息");
    assert.deepEqual(
      { content: body["content"], state: body["state"] },
      { content, state: answerState },
      `修訂後的答案不符:${JSON.stringify(body)}`,
    );
  },
);

Then("the wordings it replaced are kept oldest first as {string}", function (this: KmWorld, expected: string) {
  const body = state(this).messageBody;
  assert.ok(body, "還沒有任何訊息");
  const actual = ((body["revisions"] as string[] | undefined) ?? []).join(" | ");
  assert.equal(actual, expected, `被取代的歷次內容(由舊到新)應為「${expected}」,實際「${actual}」`);
});

Then("the refusal discloses neither the conversation's id nor its title", function (this: KmWorld) {
  const s = state(this);
  assert.ok(this.lastResponse, "還沒有送出任何請求");
  const body = this.lastResponse.body;
  assert.ok(!body.includes(s.conversationId ?? " "), `拒絕的回應裡出現了對話 id:${body}`);
  assert.ok(!body.includes("新對話"), `拒絕的回應裡出現了對話標題:${body}`);
});

Then(
  "the watching window is told {string} naming that conversation",
  { timeout: 30_000 },
  async function (this: KmWorld, marker: string) {
    const s = state(this);
    const w = windowOf(this);
    const seq = marker.split("#")[1] as string;
    await waitUntil(() => framesOf(w.buffer()).length > 0, `串流上的 ${marker} 變更`);
    const frames = framesOf(w.buffer());
    const seen = frames.map((f) => `${f.type}#${f.seq}`);
    assert.deepEqual(seen, [marker], `串流上應只有「${marker}」,實際「${seen.join(", ")}」`);
    const first = frames[0] as ChangeFrame;
    assert.equal(
      first.data["conversationId"],
      s.conversationId,
      `事件指向的對話應是 ${String(s.conversationId)},實際 ${String(first.data["conversationId"])}`,
    );
    assert.equal(
      first.data["id"],
      Number(seq),
      `事件內文的 id 應等於變更編號 ${seq},實際 ${String(first.data["id"])}`,
    );
  },
);

Then("the watching window is never told about that conversation", { timeout: 30_000 }, async function (this: KmWorld) {
  const s = state(this);
  const w = windowOf(this);
  // 沒送出的東西沒有可以等的訊號,只能給它一段真的足夠送達的時間再看。
  await new Promise((resolve) => setTimeout(resolve, 200));
  const leaked = framesOf(w.buffer()).map((f) => `${f.type}#${f.seq} → ${String(f.data["conversationId"])}`);
  assert.deepEqual(leaked, [], `這個視窗不該收到任何變更,卻收到:${leaked.join(", ")}`);
  assert.ok(
    !w.buffer().includes(s.conversationId ?? " "),
    `串流裡出現了不該看到的對話 id ${String(s.conversationId)}:${w.buffer()}`,
  );
});

Then("the reconnecting window is replayed the changes numbered {string}", function (this: KmWorld, expected: string) {
  const w = windowOf(this);
  const actual = framesOf(w.buffer())
    .map((f) => f.seq)
    .join(", ");
  assert.equal(actual, expected, `重播的變更編號應為「${expected}」,實際「${actual}」`);
});

Then(
  "the reconnecting window is asked to re-fetch everything because {string}",
  function (this: KmWorld, reason: string) {
    const w = windowOf(this);
    const buffer = w.buffer();
    const match = /^event: resync\ndata: (\{.*\})$/m.exec(buffer);
    assert.ok(match, `串流上沒有 resync 指示:${buffer}`);
    const payload = JSON.parse(match[1] as string) as { reason?: string };
    assert.equal(payload.reason, reason, `resync 的理由應為 ${reason},實際 ${String(payload.reason)}`);
    const replayed = framesOf(buffer).map((f) => f.seq);
    assert.deepEqual(replayed, [], `要求全部重抓時不該同時重播片段,卻重播了 ${replayed.join(", ")}`);
  },
);

Then("{string} owns no conversation at all", async function (this: KmWorld, person: string) {
  const s = state(this);
  const res = await s.app.inject({
    method: "GET",
    url: "/v1/conversations",
    headers: headersFor(this, person),
  });
  assert.equal(res.statusCode, 200, `列出對話應為 200,實際 ${res.statusCode}:${res.body}`);
  const body = res.json() as { totalCount: number; items: { id: string }[] };
  assert.deepEqual(
    { totalCount: body.totalCount, ids: body.items.map((i) => i.id) },
    { totalCount: 0, ids: [] },
    `${person} 不該有任何對話,實際 ${JSON.stringify(body.items)}`,
  );
});

// ---------------------------------------------------------------- 收尾
//
// World 的 After 只關 this.app;這個檔另外開的 socket 與 SQLite 連線要自己收,
// 否則 cucumber 跑完不會結束。只掛在 @conversation 的場景上,不影響別的資料夾。

After({ tags: "@conversation" }, function (this: KmWorld) {
  const s = this.bag["conversation"] as ConversationState | undefined;
  if (!s) return;
  for (const socket of s.sockets.splice(0)) socket.destroy();
  s.db.close();
});

// ==================================================================
// phase-2(紅)—— 送出問題真的觸發 RAG、回答帶得回原文的引用、身分真的進到
// 檢索接縫(ADR 0014、ADR 0016、NEXT.md phase-2 gate/DoD)。完整推理見
// `features/03-conversation/phase-2.feature` 檔頭的「設計判斷 A–D」。
//
// 這一段走的是真實 `apps/api` composition root(`KmWorld.startServer()` →
// `buildServer()`),不是上面 phase-1 用的 `buildTestApp()` bare harness——
// 只有真實 server 上才有 `app.rag`/`app.retrieval`/`app.ingestion`
// (06-retrieval、07-generation、05-ingestion 的 phase-2 都接在那裡,不是
// `services/conversation` 自己的 harness)。因此這裡的登入走真的 session
// cookie(`SESSION_COOKIE_NAME`),不是 phase-1 的 `TEST_USER_HEADER` 假標頭。
//
// `loginDemoPerson()` 與其他能力資料夾(generation.steps.ts、
// retrieval.steps.ts、ingestion.steps.ts)裡同名的函式做的是同一件事——
// NEXT.md「Gate 未滿足時」與各檔自己的註解都講過「不要 import 別的能力資料夾的
// steps」,所以這裡照樣獨立一份,不是忘記共用。
// ==================================================================

const PHASE2_FIXTURE_PDF = "services/ingestion/src/extraction/fixtures/cjk-non-embedded.pdf";
const PHASE2_DEMO_PASSWORD = "demo-pass-123";

interface Phase2Person {
  readonly username: string;
  readonly cookie: string;
  conversationId?: string;
}

/** 一次被攔到的 `app.retrieval.retrieve()` 呼叫——場景 4 專用,見設計判斷 D。 */
interface CapturedRetrieveCall {
  readonly principalId: string;
  readonly allowedScopeKeys: readonly string[];
  readonly deniedScopeKeys: readonly string[];
}

interface Phase2State {
  app: FastifyInstance;
  people: Map<string, Phase2Person>;
  /** 場景 4 的 Given 裝上包裝之後才會存在;其餘場景恆為 undefined。 */
  capturedRetrieveCalls?: CapturedRetrieveCall[];
  /** 最近一次「送出問題」動作裡,使用者自己那則(role: user)訊息的原始回應本體。 */
  lastQuestionMessage?: Record<string, unknown>;
  /** 最近一次「送出問題」動作是哪個人做的,給後面的 Then 找回她的對話與訊息。 */
  lastUsername?: string;
}

function phase2State(world: KmWorld): Phase2State {
  const s = world.bag["phase2Conversation"] as Phase2State | undefined;
  assert.ok(s, "Background 尚未起一個真實 server(a fresh server with fake providers)");
  return s;
}

/** 惰性初始化,讀寫 `world.bag["phase2Conversation"]`。`world.startServer()` 在
 * Background 已經呼叫過一次時直接回傳快取的 `this.app`(`_world.ts` 自己的行
 * 為),所以這裡再呼叫一次不會建出第二個 server。 */
async function ensurePhase2State(world: KmWorld): Promise<Phase2State> {
  let s = world.bag["phase2Conversation"] as Phase2State | undefined;
  if (!s) {
    const app = await world.startServer();
    s = { app, people: new Map() };
    world.bag["phase2Conversation"] = s;
  }
  return s;
}

async function loginDemoPerson(app: FastifyInstance, username: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { username, password: PHASE2_DEMO_PASSWORD },
  });
  assert.equal(
    res.statusCode,
    200,
    `登入 ${username} 應成功(這一步只是確認 identity/session 沒壞,缺口專在訊息路由沒接 RAG):實際 ${res.statusCode} ${res.body}`,
  );
  const raw = res.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header);
  assert.ok(match?.[1], `登入 ${username} 的回應沒有帶 ${SESSION_COOKIE_NAME} cookie:${header || "(沒有 Set-Cookie)"}`);
  return match[1] as string;
}

async function personOf(world: KmWorld, username: string): Promise<Phase2Person> {
  const s = await ensurePhase2State(world);
  let person = s.people.get(username);
  if (!person) {
    const cookie = await loginDemoPerson(s.app, username);
    person = { username, cookie };
    s.people.set(username, person);
  }
  return person;
}

/** 場景 1/2 用:把真的中文 fixture PDF 索引進真實 server 共用的那個 store
 * (ADR 0015——`app.ingestion`/`app.retrieval` 共用同一個 in-memory store)。 */
async function indexFixtureUnderDept(world: KmWorld, dept: string, documentId: string): Promise<void> {
  const s = await ensurePhase2State(world);
  const seam = (
    s.app as unknown as {
      ingestion?: {
        ingest(input: { documentId: string; scopeKey: string; pdfBytes: Uint8Array }): Promise<unknown>;
      };
    }
  ).ingestion;
  assert.ok(seam, "app.ingestion 在真實 buildServer() 上不存在(05-ingestion/phase-2 應該已經接上)");
  await seam.ingest({
    documentId,
    scopeKey: `dept:${dept}`,
    pdfBytes: world.readRepoBytes(PHASE2_FIXTURE_PDF),
  });
}

/** 場景 4 專用(設計判斷 D):在真實 server 的 `app.retrieval` 上包一層方法,
 * 把每次呼叫收到的 scope 記下來,再原封不動轉呼叫真正的 `retrieve()`。只mutate
 * 這個 process 裡、這個 scenario 專屬的 server 實例上的物件方法,不改任何一行
 * 生產碼,scenario 結束隨 server 一起關掉消失。 */
function installRetrieveSpy(s: Phase2State): void {
  if (s.capturedRetrieveCalls) return;
  const captured: CapturedRetrieveCall[] = [];
  s.capturedRetrieveCalls = captured;
  const retrieval = (
    s.app as unknown as {
      retrieval?: {
        retrieve(question: string, scope: RetrievalScope, topK?: number): Promise<readonly { chunkId: string }[]>;
      };
    }
  ).retrieval;
  assert.ok(retrieval, "app.retrieval 在真實 buildServer() 上不存在(06-retrieval/phase-2 應該已經接上)");
  const original = retrieval.retrieve.bind(retrieval);
  retrieval.retrieve = async (question, scope, topK) => {
    captured.push({
      principalId: scope.principalId,
      allowedScopeKeys: scope.allowedScopeKeys,
      deniedScopeKeys: scope.deniedScopeKeys,
    });
    return original(question, scope, topK);
  };
}

/** 場景 1/2/3/4 共用:登入(第一次)、開一個新對話、送出一句 `role: user` 的
 * 問題。回傳的是使用者自己那則訊息的回應本體——助理的回答(如果有)要另外用
 * `waitForAssistantReply` 去讀對話的訊息列表。 */
async function askAsPerson(world: KmWorld, username: string, question: string): Promise<Record<string, unknown>> {
  const s = await ensurePhase2State(world);
  const person = await personOf(world, username);

  const createRes = await s.app.inject({
    method: "POST",
    url: "/v1/conversations",
    headers: { "x-requested-with": "XMLHttpRequest" },
    cookies: { [SESSION_COOKIE_NAME]: person.cookie },
    payload: {},
  });
  assert.equal(createRes.statusCode, 201, `${username} 建立對話應為 201,實際 ${createRes.statusCode}:${createRes.body}`);
  person.conversationId = (createRes.json() as { id: string }).id;

  const messageRes = await s.app.inject({
    method: "POST",
    url: `/v1/conversations/${person.conversationId}/messages`,
    headers: { "x-requested-with": "XMLHttpRequest" },
    cookies: { [SESSION_COOKIE_NAME]: person.cookie },
    payload: { role: "user", content: question },
  });
  assert.equal(
    messageRes.statusCode,
    201,
    `${username} 送出問題應為 201,實際 ${messageRes.statusCode}:${messageRes.body}`,
  );
  const questionMessage = messageRes.json() as Record<string, unknown>;

  s.lastQuestionMessage = questionMessage;
  s.lastUsername = username;
  return questionMessage;
}

async function listMessagesFor(world: KmWorld, username: string): Promise<Record<string, unknown>[]> {
  const s = await ensurePhase2State(world);
  const person = s.people.get(username);
  assert.ok(person?.conversationId, `${username} 還沒有任何對話`);
  const res = await s.app.inject({
    method: "GET",
    url: `/v1/conversations/${person!.conversationId}/messages`,
    cookies: { [SESSION_COOKIE_NAME]: person!.cookie },
  });
  assert.equal(res.statusCode, 200, `讀取 ${username} 的訊息列表應為 200,實際 ${res.statusCode}:${res.body}`);
  return res.json() as Record<string, unknown>[];
}

/** 輪詢對話的訊息列表,直到出現一則 `role: assistant` 的訊息或逾時。設計判斷
 * A:自動生成助理回答是同步做完還是非同步做完,是開發 agent 的選擇,這裡兩種
 * 都接得住,不逾時就回傳最後一則 assistant 訊息;逾時回傳 `undefined`(今天的
 * 現況——訊息路由完全沒接 RAG,永遠不會有 assistant 訊息出現)。 */
async function waitForAssistantReply(
  world: KmWorld,
  username: string,
  tries = 20,
  intervalMs = 50,
): Promise<Record<string, unknown> | undefined> {
  for (let i = 0; i < tries; i++) {
    const messages = await listMessagesFor(world, username);
    const assistant = messages.filter((m) => m["role"] === "assistant").at(-1);
    if (assistant) return assistant;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return undefined;
}

// ---------------------------------------------------------------- Given(phase-2)

Given(
  "the real Chinese fixture document has been indexed under department {string}",
  { timeout: 30_000 },
  async function (this: KmWorld, dept: string) {
    await indexFixtureUnderDept(this, dept, `conv-phase2-fixture-${dept}`);
  },
);

Given(
  "the real Chinese fixture document has been indexed twice under department {string}, as two separate documents",
  { timeout: 30_000 },
  async function (this: KmWorld, dept: string) {
    await indexFixtureUnderDept(this, dept, `conv-phase2-fixture-${dept}-a`);
    await indexFixtureUnderDept(this, dept, `conv-phase2-fixture-${dept}-b`);
  },
);

Given("the retrieval scope used for each request in this scenario is being recorded", async function (this: KmWorld) {
  const s = await ensurePhase2State(this);
  installRetrieveSpy(s);
});

// ---------------------------------------------------------------- When(phase-2)

When(
  "{string} asks {string} in a fresh conversation of their own",
  { timeout: 30_000 },
  async function (this: KmWorld, username: string, question: string) {
    await askAsPerson(this, username, question);
  },
);

// ---------------------------------------------------------------- Then(phase-2)

Then(
  "the asker should receive an assistant reply whose citations slice the original document back to the exact chunk that was indexed",
  { timeout: 10_000 },
  async function (this: KmWorld) {
    const s = phase2State(this);
    const username = s.lastUsername;
    assert.ok(username, "還沒有任何人送出過問題");
    const reply = await waitForAssistantReply(this, username!);
    assert.ok(
      reply,
      `${username} 應該收到一則帶引用的 assistant 回答,但這個對話裡完全沒有出現任何 assistant 訊息—— ` +
        `送出 role: user 的問題今天不會觸發任何 RAG 呼叫(routes/messages.ts 沒有呼叫 app.rag)。`,
    );
    const citations =
      (reply!["citations"] as { chunkId: string; documentId: string; startOffset: number; endOffset: number }[] | undefined) ?? [];
    assert.ok(
      citations.length > 0,
      `assistant 回答應該至少帶一個引用(已經索引過真的文件),實際 citations=${JSON.stringify(citations)}`,
    );

    const extraction = await extractPdfText(this.readRepoBytes(PHASE2_FIXTURE_PDF));
    for (const citation of citations) {
      const expectedChunks = chunkDocument(citation.documentId, extraction.text);
      const expected = expectedChunks.find(
        (c) => c.startOffset === citation.startOffset && c.endOffset === citation.endOffset,
      );
      assert.ok(
        expected,
        `引用 ${JSON.stringify(citation)} 的 offsets 對不上任何一個從原文重新切出來的 chunk 邊界 ` +
          `(文件 ${citation.documentId} 重新跑 chunkDocument() 之後的邊界:` +
          `${JSON.stringify(expectedChunks.map((c) => [c.startOffset, c.endOffset]))})`,
      );
      const sliced = extraction.text.slice(citation.startOffset, citation.endOffset);
      assert.equal(
        sliced,
        expected!.text,
        `offsets ${citation.startOffset}–${citation.endOffset} 切出的是「${sliced}」,` +
          `應該逐字等於原文那個 chunk 的「${expected!.text}」`,
      );
    }
  },
);

Then(
  "the reply's content should carry ascending numbered citation markers, one for each citation",
  { timeout: 10_000 },
  async function (this: KmWorld) {
    const s = phase2State(this);
    const username = s.lastUsername;
    assert.ok(username, "還沒有任何人送出過問題");
    const reply = await waitForAssistantReply(this, username!);
    assert.ok(
      reply,
      `${username} 應該收到一則 assistant 回答,但這個對話裡完全沒有出現任何 assistant 訊息—— ` +
        `送出 role: user 的問題今天不會觸發任何 RAG 呼叫。`,
    );
    const citations = (reply!["citations"] as unknown[] | undefined) ?? [];
    assert.ok(
      citations.length >= 2,
      `這個場景索引了兩份文件,應該至少有兩個引用可以驗證順序,實際 citations.length=${citations.length}`,
    );
    const content = String(reply!["content"] ?? "");
    const positions = citations.map((_, i) => content.indexOf(`[${i + 1}]`));
    assert.ok(
      positions.every((p) => p >= 0),
      `content 應該依序含有 [1]…[${citations.length}] 這幾個 marker(ADR 0016 D2),實際 content=「${content}」,` +
        `各 marker 找到的位置=${JSON.stringify(positions)}(-1 代表沒找到——canned generation provider 的預設 ` +
        `answerTemplate 今天完全不會印出 marker,composition root 需要帶一個會印 marker 的 template)`,
    );
    for (let i = 1; i < positions.length; i++) {
      assert.ok(
        (positions[i] as number) > (positions[i - 1] as number),
        `marker 應該依序出現在文字裡([${i}] 要早於 [${i + 1}]),實際各 marker 位置=${JSON.stringify(positions)},` +
          `content=「${content}」`,
      );
    }
  },
);

Then(
  "citations should be listed in the same order the retrieval seam itself ranks them for that question, not reshuffled afterwards",
  { timeout: 10_000 },
  async function (this: KmWorld) {
    const s = phase2State(this);
    const username = s.lastUsername;
    assert.ok(username, "還沒有任何人送出過問題");
    const reply = await waitForAssistantReply(this, username!);
    assert.ok(reply, `${username} 應該收到一則 assistant 回答,但這個對話裡完全沒有出現任何 assistant 訊息`);
    const citations = (reply!["citations"] as { chunkId: string }[] | undefined) ?? [];

    // 設計判斷 C:同一個 store、同一個 scope、同一個問題,retrieve() 是確定性
    // 函式——再呼叫一次應該排出跟訊息裡 citations 逐一相同的順序。這個
    // principalId 只是探針本身的標籤,不影響排序(排序只看 allowedScopeKeys/
    // deniedScopeKeys 篩出的候選與各自的相似度)。
    const probeScope = toRetrievalScope({
      principalId: "conv-phase2-order-probe",
      allowedScopeKeys: ["dept:eng"],
      deniedScopeKeys: [],
    });
    const retrieval = (
      s.app as unknown as {
        retrieval: {
          retrieve(question: string, scope: RetrievalScope, topK?: number): Promise<readonly { chunkId: string }[]>;
        };
      }
    ).retrieval;
    const repeated = await retrieval.retrieve("知識管理系統設計文件", probeScope, 4);

    assert.deepEqual(
      citations.map((c) => c.chunkId),
      repeated.map((h) => h.chunkId),
      `citations 的順序應該與 retrieve() 自己排出來的順序逐一相同(同一個 store/scope/問題應該是確定性的),` +
        `實際訊息裡 citations 依序=${JSON.stringify(citations.map((c) => c.chunkId))},` +
        `retrieve() 現在排出來的依序=${JSON.stringify(repeated.map((h) => h.chunkId))}——` +
        `如果有人在存進 Message 之前重排過 citations 陣列,這裡就會對不上`,
    );
  },
);

Then(
  "the assistant's reply should carry citations as an empty list, not a missing field, because nothing was found to cite",
  { timeout: 10_000 },
  async function (this: KmWorld) {
    const s = phase2State(this);
    const username = s.lastUsername;
    assert.ok(username, "還沒有任何人送出過問題");
    const reply = await waitForAssistantReply(this, username!);
    assert.ok(
      reply,
      `${username} 應該收到一則 assistant 回答(即使沒有引用,也應該是「找不到來源」的回答,不是完全沒有回答)—— ` +
        `送出 role: user 的問題今天不會觸發任何 RAG 呼叫。`,
    );
    assert.ok(
      "citations" in reply!,
      `assistant 訊息應該帶有 citations 欄位(即使是空陣列)——這則訊息確實走過 RAG 路徑,只是沒有可引用的 ` +
        `來源,跟「這則訊息根本沒有走 RAG 路徑」不是同一件事(ADR 0016 D3),實際訊息=${JSON.stringify(reply)}`,
    );
    assert.deepEqual(
      reply!["citations"],
      [],
      `沒有索引任何資料時,RAG 路徑應該老實回報「沒有引用」的空陣列,不是塞進不存在的引用,` +
        `實際 citations=${JSON.stringify(reply!["citations"])}`,
    );
  },
);

Then("the asker's own question should carry no {string} field at all", function (this: KmWorld, field: string) {
  const s = phase2State(this);
  assert.ok(s.lastQuestionMessage, "還沒有任何人送出過問題");
  assert.ok(
    !(field in s.lastQuestionMessage!),
    `使用者自己送出的問題不應該帶有「${field}」這個欄位(那是 RAG 產生的助理訊息才有的東西,ADR 0016 D3: ` +
      `缺席不是空陣列),實際訊息=${JSON.stringify(s.lastQuestionMessage)}`,
  );
});

Then(
  "the two recorded retrieval scopes should carry two different people's own identity",
  function (this: KmWorld) {
    const s = phase2State(this);
    const calls = s.capturedRetrieveCalls ?? [];
    assert.ok(
      calls.length >= 2,
      `應該至少攔到兩次 retrieve() 呼叫(demo-user 問一次、demo-maintenance 問一次),實際攔到 ${calls.length} 次—— ` +
        `送出 role: user 的問題今天不會觸發任何 app.rag.ask() 呼叫,身分根本沒有機會進到檢索接縫`,
    );
    const first = calls[0]!;
    const second = calls[1]!;
    assert.notEqual(
      first.principalId,
      second.principalId,
      `兩個不同的人問問題,檢索接縫收到的 scope principalId 應該不一樣(反映各自真正的身分),` +
        `實際兩次都是「${first.principalId}」——身分被丟在半路,接縫拿到的是同一個固定值,不是這個人自己的身分。` +
        `demo-user 的 scope key(principalId)=「${first.principalId}」,` +
        `demo-maintenance 的 scope key(principalId)=「${second.principalId}」`,
    );
  },
);

Then(
  "both should still carry the exact same fixed {string} permission, because I2 has not changed that yet",
  function (this: KmWorld, scopeKey: string) {
    const s = phase2State(this);
    const calls = s.capturedRetrieveCalls ?? [];
    assert.ok(calls.length >= 2, "應該已經有兩次攔到的 retrieve() 呼叫可以比較");
    for (const call of calls) {
      assert.deepEqual(
        [...call.allowedScopeKeys],
        [scopeKey],
        `ADR 0014 的固定值在 I2 期間不應該變——allowedScopeKeys 應該仍然是 ["${scopeKey}"],` +
          `實際 ${JSON.stringify(call.allowedScopeKeys)}(這次呼叫的 principalId=「${call.principalId}」)`,
      );
      assert.deepEqual(
        [...call.deniedScopeKeys],
        [],
        `deniedScopeKeys 在 I2 期間應該仍是空陣列,實際 ${JSON.stringify(call.deniedScopeKeys)}` +
          `(這次呼叫的 principalId=「${call.principalId}」)`,
      );
    }
  },
);
