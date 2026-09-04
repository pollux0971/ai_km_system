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
