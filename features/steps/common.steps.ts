/**
 * 通用步驟:同一句話在兩個以上的能力資料夾出現,就只能在這裡定義一次
 * (cucumber 對重複定義直接報錯)。各能力的步驟檔負責把值填進 World,這裡只讀。
 *
 * 只有協調者改這個檔。worker 需要新的通用步驟,寫在自己 FEATURE.md 的「待協調」段。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import Fastify, { type FastifyInstance } from "fastify";
import type { KmWorld } from "./_world.js";

/**
 * 一個能力步驟檔要註冊「自己的」plugin 進通用的 register→ready 通用步驟時,
 * 把這個放進 `this.bag["pluginUnderTest"]`(見下面 `the "{string}" plugin is
 * registered on a bare server and the server becomes ready`)。
 */
interface PluginUnderTest {
  register: (app: FastifyInstance) => Promise<void> | void;
}

// ---------------------------------------------------------------- Given

Given("a fresh server with fake providers", { timeout: 60_000 }, async function (this: KmWorld) {
  await this.startServer();
});

Given("a temporary working directory", function (this: KmWorld) {
  this.useTempDir();
});

// ---------------------------------------------------------------- When

When("the standalone command for this capability is run", { timeout: 300_000 }, function (this: KmWorld) {
  this.runStandalone();
});

When(
  "the {string} plugin is registered on a bare server and the server becomes ready",
  { timeout: 30_000 },
  async function (this: KmWorld) {
    const under = this.bag["pluginUnderTest"] as PluginUnderTest | undefined;
    assert.ok(
      under,
      `能力步驟要先把要註冊的 plugin 放進 this.bag["pluginUnderTest"]({ register(app) { ... } }),這句通用步驟只負責 register()→ready()`,
    );
    const instance = Fastify({ logger: false });
    await under.register(instance);
    await instance.ready();
    this.bag["registeredApp"] = instance;
  },
);

When("a {string} request is sent to {string}", async function (this: KmWorld, method: string, path: string) {
  const app = await this.startServer();
  // fastify 匯出的 HTTPMethods 與 light-my-request 自己的 InjectOptions.method 型別不完全同源
  // (TRACE/QUERY 只在前者出現),這裡只轉大寫、原樣傳給 inject,型別交給呼叫端保證。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.lastResponse = await app.inject({ method: method.toUpperCase(), url: path } as any);
});

// ---------------------------------------------------------------- Then

Then("it exits with status {int}", function (this: KmWorld, code: number) {
  assert.ok(this.lastRun, "還沒有跑過任何指令(When 要呼叫 runStandalone / runCommand)");
  assert.equal(
    this.lastRun.status,
    code,
    `退出碼應為 ${code},實際 ${this.lastRun.status}\n${this.lastRun.output.trim().split("\n").slice(-15).join("\n")}`,
  );
});

Then("the output contains {string}", function (this: KmWorld, marker: string) {
  assert.ok(this.lastRun, "還沒有跑過任何指令");
  assert.ok(this.lastRun.output.includes(marker), `輸出應含「${marker}」,實際尾段:\n${this.lastRun.output.slice(-600)}`);
});

Then("the response status is {int}", function (this: KmWorld, status: number) {
  assert.ok(this.lastResponse, "還沒有送出任何請求(When 要呼叫 app.inject)");
  assert.equal(this.lastResponse.statusCode, status, `狀態碼應為 ${status},實際 ${this.lastResponse.statusCode}:\n${this.lastResponse.body}`);
});

Then("the response error code is {string}", function (this: KmWorld, code: string) {
  assert.ok(this.lastResponse, "還沒有送出任何請求");
  const body = this.lastResponse.json() as { code?: string; error?: { code?: string } };
  const actual = body.code ?? body.error?.code;
  assert.equal(actual, code, `錯誤碼應為 ${code},實際 ${actual}:\n${this.lastResponse.body}`);
});

Then("it is rejected with {string}", function (this: KmWorld, errorName: string) {
  assert.ok(this.lastError, "預期會被拒絕,但沒有任何錯誤被拋出");
  assert.equal(this.lastError.name, errorName, `錯誤類型應為 ${errorName},實際 ${this.lastError.name}: ${this.lastError.message}`);
});

Then("the {string} plugin is visible on the parent server instance", function (this: KmWorld, name: string) {
  const app = this.bag["registeredApp"] as Record<string, unknown> | undefined;
  assert.ok(app, "還沒有透過「the {string} plugin is registered…」註冊過任何 plugin");
  assert.ok(app[name], `app.${name} 在父實例上不可見——plugin 可能沒用 fp() 包裝(ADR 0007 §5)`);
});

Then("the {string} provider is never called", function (this: KmWorld, component: string) {
  const calls = this.providerCalls.filter((c) => c.component.startsWith(component));
  assert.deepEqual(calls, [], `${component} provider 不該被呼叫:${JSON.stringify(calls)}`);
});
