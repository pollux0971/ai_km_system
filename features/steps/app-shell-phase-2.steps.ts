/**
 * 11-app-shell phase-2 步驟。見 features/11-app-shell/phase-2.feature 檔頭
 * 三段設計判斷(A/B/C)——這裡只重述每段用到的具體技巧。
 *
 * A、B 兩段都探測今天還不存在的符號(citations.ts 的 resolveCitationPassage、
 * answer-state.ts 的 resolveAnswerStateDisplay)。手法跟 07-generation/phase-2
 * 對 app.rag 的探測一樣:把 import 進來的 module namespace 轉型成一個「這個
 * 符號是 optional 的」形狀,再用 optional chaining 呼叫——這樣符號不存在時,
 * `pnpm typecheck` 不會紅(型別上允許 undefined),只有場景執行到 Then 斷言
 * 時才會紅,而且紅在「值不對」,不是「呼叫到一個不存在的東西所以拋錯」。
 *
 * C 段直接呼叫今天已經正確實作的 createConversationEventSource()
 * (apps/web/src/lib/conversation-events.ts),用它自己 vitest 測試
 * (conversation-events.test.ts)同一個假 EventSourceFactory 注入點——見那個
 * 檔案的 makeFakeEventSource/makeFactory,這裡的兩個同名 helper 是同一個形狀
 * 的獨立複製(測試碼互相複製一份是可以接受的,不算共用實作)。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import type { KmWorld } from "./_world.js";

import * as citationsModule from "../../apps/web/src/lib/citations.js";
import * as answerStateModule from "../../apps/web/src/lib/answer-state.js";
import {
  createConversationEventSource,
  type ConversationEvent,
  type ConnectionStatus,
  type EventSourceFactory,
  type EventSourceLike,
} from "../../apps/web/src/lib/conversation-events.js";

// ================================================================== A

interface CitationLookupResult {
  ok: boolean;
  value?: string;
  error?: { code: string; message?: string };
}

type CitationInput = { documentId: string; startOffset: number; endOffset: number };

/**
 * citations.ts 今天沒有這個函式(它今天只有 E03-S014 遺留的
 * getCitationSource(id: string),鍵是裸 id,回傳 file/page/snippet mock,
 * 完全不知道 documentId/offsets)。轉型成 optional 讓「還沒做」變成執行期
 * undefined,不是編譯期錯誤。
 */
function resolveCitationPassage(citation: CitationInput, documentTexts: Record<string, string>): CitationLookupResult | undefined {
  const withResolver = citationsModule as unknown as {
    resolveCitationPassage?: (c: CitationInput, texts: Record<string, string>) => CitationLookupResult;
  };
  return withResolver.resolveCitationPassage?.(citation, documentTexts);
}

interface CitationPhaseState {
  documentTexts: Record<string, string>;
  citation?: CitationInput;
  expectedPassage?: string;
  openResult?: CitationLookupResult | undefined;
}

function citationState(world: KmWorld): CitationPhaseState {
  if (!world.bag["appShellPhase2Citation"]) {
    world.bag["appShellPhase2Citation"] = { documentTexts: {} } satisfies CitationPhaseState;
  }
  return world.bag["appShellPhase2Citation"] as CitationPhaseState;
}

const FIXTURE_DOCUMENT_ID = "doc-shell-phase2-fixture";
const FIXTURE_DOCUMENT_TEXT =
  "知識管理系統設計文件第一段，僅供本場景切段落用。第二段說明本系統的檢索與生成如何協同運作，並保證每一則引用都能指回原文的確切位置。第三段是結尾。";
const FIXTURE_PASSAGE = "第二段說明本系統的檢索與生成如何協同運作";

Given("a document's real original text is available to this shell", function (this: KmWorld) {
  citationState(this).documentTexts[FIXTURE_DOCUMENT_ID] = FIXTURE_DOCUMENT_TEXT;
});

Given("a citation names that exact document and the offsets of one passage within it", function (this: KmWorld) {
  const state = citationState(this);
  const start = FIXTURE_DOCUMENT_TEXT.indexOf(FIXTURE_PASSAGE);
  assert.ok(start >= 0, `這個 step 檔自己的 fixture 文字裡找不到子字串「${FIXTURE_PASSAGE}」——fixture 寫錯,不是待測程式的問題`);
  state.citation = { documentId: FIXTURE_DOCUMENT_ID, startOffset: start, endOffset: start + FIXTURE_PASSAGE.length };
  state.expectedPassage = FIXTURE_PASSAGE;
});

Given("a citation names a document this shell has never been given the original text for", function (this: KmWorld) {
  citationState(this).citation = { documentId: "doc-shell-phase2-never-supplied", startOffset: 0, endOffset: 5 };
});

When("this shell is asked to open that citation", function (this: KmWorld) {
  const state = citationState(this);
  assert.ok(state.citation, "前一步應該已經準備好一個引用,場景本身寫錯了");
  state.openResult = resolveCitationPassage(state.citation, state.documentTexts);
});

Then("it should show the exact passage those offsets name, sliced character-for-character from the original text", function (this: KmWorld) {
  const state = citationState(this);
  const actual = state.openResult?.ok ? state.openResult.value : undefined;
  assert.equal(
    actual,
    state.expectedPassage,
    `引用切回原文的段落應逐字等於「${state.expectedPassage}」,實際取得 ${JSON.stringify(actual)}` +
      `(完整結果:${JSON.stringify(state.openResult)})—— apps/web/src/lib/citations.ts 今天還沒有 ` +
      `resolveCitationPassage 這個函式(ADR 0016 形狀的引用解析);既有的 getCitationSource() 仍是 ` +
      `E03-S014 遺留、鍵為裸 id 的 file/page/snippet mock,完全不認得 documentId/offsets。`,
  );
});

Then("it should refuse to show any passage, with a {string} outcome, rather than inventing one", function (this: KmWorld, expectedCode: string) {
  const state = citationState(this);
  const actualCode = state.openResult && !state.openResult.ok ? state.openResult.error?.code : undefined;
  assert.equal(
    actualCode,
    expectedCode,
    `未知 documentId 的引用應該 fail closed 回「${expectedCode}」,不得無中生有出一段文字;實際 ${JSON.stringify(actualCode)}` +
      `(完整結果:${JSON.stringify(state.openResult)})——resolveCitationPassage 今天還不存在,所以這裡量到的是「沒有任何結果」。`,
  );
});

// ================================================================== B

/**
 * answer-state.ts 今天沒有這個函式。message-thread.tsx:1164 的
 * `entry.message.state ?? "ANSWERED"` 就是這個函式該取代、但今天還沒被抽出來
 * 的那段內聯邏輯——ADR 0018 條件 2 明講「缺席必須渲染為中性,不得當 ANSWERED」,
 * 而那一行今天正好做反了。
 */
function resolveAnswerStateDisplay(state: string | undefined): string | undefined {
  const withResolver = answerStateModule as unknown as {
    resolveAnswerStateDisplay?: (s: string | undefined) => string;
  };
  return withResolver.resolveAnswerStateDisplay?.(state);
}

interface AnswerStatePhaseState {
  messageState?: string | undefined;
  displayState?: string | undefined;
}

function answerStatePhaseState(world: KmWorld): AnswerStatePhaseState {
  if (!world.bag["appShellPhase2AnswerState"]) {
    world.bag["appShellPhase2AnswerState"] = {} satisfies AnswerStatePhaseState;
  }
  return world.bag["appShellPhase2AnswerState"] as AnswerStatePhaseState;
}

Given("an assistant's reply that carries no answer state field at all", function (this: KmWorld) {
  answerStatePhaseState(this).messageState = undefined;
});

Given("an assistant's reply that explicitly carries the answer state {string}", function (this: KmWorld, state: string) {
  answerStatePhaseState(this).messageState = state;
});

When("this shell decides what state that reply should display as", function (this: KmWorld) {
  const state = answerStatePhaseState(this);
  state.displayState = resolveAnswerStateDisplay(state.messageState);
});

Then("it should decide {string}, not {string}", function (this: KmWorld, expected: string, wrongDefault: string) {
  const state = answerStatePhaseState(this);
  assert.equal(
    state.displayState,
    expected,
    `這則沒有 state 欄位的回答,顯示狀態應該算成「${expected}」,實際算成 ${JSON.stringify(state.displayState)}——` +
      `如果 answer-state.ts 的 resolveAnswerStateDisplay 把缺席的 state 當成「${wrongDefault}」渲染` +
      `(message-thread.tsx:1164 今天就是這樣做的:entry.message.state ?? "ANSWERED"),這裡就會紅。` +
      `今天 resolveAnswerStateDisplay 這個函式本身還不存在,所以量到的是 undefined。`,
  );
});

Then("it should decide {string}", function (this: KmWorld, expected: string) {
  const state = answerStatePhaseState(this);
  assert.equal(
    state.displayState,
    expected,
    `這則明確帶著 state 的回答,顯示狀態應該算成「${expected}」,實際算成 ${JSON.stringify(state.displayState)}——` +
      `resolveAnswerStateDisplay 不能為了讓「缺席場景」變綠,就把每一個輸入都改判成同一個中性值。` +
      `今天這個函式本身還不存在,所以量到的是 undefined。`,
  );
});

// ================================================================== C

/**
 * conversation-events.test.ts 自己的假 EventSource——這裡是同一個形狀的獨立
 * 複製,不是 import 那個測試檔(測試碼之間互相抄一份是可以接受的重複,不構成
 * production 共用)。
 */
function makeFakeEventSource() {
  const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  const fake: EventSourceLike & { emit(type: string, data: unknown): void } = {
    readyState: 0,
    onopen: null,
    onerror: null,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    close() {
      fake.readyState = 2;
    },
    emit(type, data) {
      for (const listener of listeners.get(type) ?? []) {
        listener({ data: JSON.stringify(data) } as MessageEvent);
      }
    },
  };
  return fake;
}

function makeFactory() {
  const instances: ReturnType<typeof makeFakeEventSource>[] = [];
  const factory: EventSourceFactory = (url, init) => {
    const instance = makeFakeEventSource();
    instances.push(Object.assign(instance, { url, init }));
    return instance;
  };
  return { factory, instances };
}

interface CrossWindowSyncState {
  instances: ReturnType<typeof makeFakeEventSource>[];
  receivedEvents: ConversationEvent[];
  statuses: ConnectionStatus[];
}

function crossWindowSyncState(world: KmWorld): CrossWindowSyncState {
  if (!world.bag["appShellPhase2Sync"]) {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/v1/conversations/events", eventSourceFactory: factory });
    const state: CrossWindowSyncState = { instances, receivedEvents: [], statuses: [] };
    source.subscribe((event) => state.receivedEvents.push(event));
    source.onStatusChange((status) => state.statuses.push(status));
    world.bag["appShellPhase2Sync"] = state;
  }
  return world.bag["appShellPhase2Sync"] as CrossWindowSyncState;
}

Given("this window holds its own open subscription to the shared conversation change stream", function (this: KmWorld) {
  crossWindowSyncState(this);
});

When("another window's new conversation arrives on that shared stream", function (this: KmWorld) {
  const sync = crossWindowSyncState(this);
  const native = sync.instances[0]!;
  native.onopen?.(new Event("open"));
  native.emit("conversation.created", {
    id: 101,
    type: "conversation.created",
    conversationId: "conv-from-other-window",
    occurredAt: new Date().toISOString(),
  });
});

Then("this window's subscription should receive that same conversation's creation", function (this: KmWorld) {
  const sync = crossWindowSyncState(this);
  const received = sync.receivedEvents.map((event) => {
    const e = event as { type: string; conversationId?: string };
    return `${e.type}:${e.conversationId}`;
  });
  assert.deepEqual(
    received,
    ["conversation.created:conv-from-other-window"],
    `這個視窗的訂閱應該收到另一個視窗建立的那個對話,實際收到 ${JSON.stringify(received)}`,
  );
});

When("a conversation change with a given id arrives twice on that shared stream, as a reconnect replay would", function (this: KmWorld) {
  const sync = crossWindowSyncState(this);
  const native = sync.instances[0]!;
  native.onopen?.(new Event("open"));
  const frame = { id: 202, type: "message.created", conversationId: "conv-replayed", messageId: "msg-replayed", occurredAt: new Date().toISOString() };
  native.emit("message.created", frame);
  native.emit("message.created", frame);
});

Then("this window's subscription should receive that change exactly once", function (this: KmWorld) {
  const sync = crossWindowSyncState(this);
  const matching = sync.receivedEvents.filter((event) => (event as { messageId?: string }).messageId === "msg-replayed");
  assert.equal(
    matching.length,
    1,
    `重連重播的同一個 id 應該只被套用一次,實際套用了 ${matching.length} 次(收到的全部事件:${JSON.stringify(sync.receivedEvents)})`,
  );
});

When("that shared stream opens, then drops, and then reconnects", function (this: KmWorld) {
  const sync = crossWindowSyncState(this);
  const native = sync.instances[0]!;
  native.onopen?.(new Event("open"));
  native.onerror?.(new Event("error"));
  native.onopen?.(new Event("open"));
});

Then("this window should see the connection status pass through {string}, {string}, {string} in that order", function (this: KmWorld, first: string, second: string, third: string) {
  const sync = crossWindowSyncState(this);
  assert.deepEqual(
    sync.statuses,
    [first, second, third],
    `連線狀態序列應為 ${JSON.stringify([first, second, third])},實際為 ${JSON.stringify(sync.statuses)}`,
  );
});
