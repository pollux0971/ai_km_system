# tests/e2e

Playwright E2E for `apps/web` (:3000) and `apps/admin` (:3001), now running
against a real `apps/api` (:4100) instead of a client-side mock (E03-S038).

## Running locally

```bash
pnpm test:e2e
# or, from this directory:
pnpm test
```

`playwright.config.ts` starts all three servers itself (`webServer`) and
waits for each to report healthy before any test runs. Nothing needs to be
started manually.

## Ports

| Server | Port | Started by | `reuseExistingServer` |
|---|---|---|---|
| `apps/web` | 3000 | Playwright `webServer` | `!process.env.CI` (E01-S030) |
| `apps/admin` | 3001 | Playwright `webServer` | `!process.env.CI` (same) |
| `apps/api` | **4100** — deliberately NOT 4000 | Playwright `webServer` | **`false`** (always — see below) |

`apps/api` runs on 4100, not the "default" 4000, and always starts its own
fresh instance (`reuseExistingServer: false`). This is deliberate, not an
oversight: a shared, manually-run `apps/api` on :4000 is common during
development (other lanes' own manual verification) — if this webServer
entry also targeted :4000 with `reuseExistingServer: true`, Playwright would
silently reuse that shared instance instead of starting its own, quietly
defeating every isolation property this story exists to provide (own tmp
SQLite, own test-sandbox/fake-ASR env) — this actually happened once during
this story's own development, see `archive/stories/E03-S038.md`'s EVIDENCE. A
brand-new webServer entry doesn't need to wait on E01-S030's CI-conditional
fix to get this right: if port 4100 is ever unexpectedly occupied, this
config fails loudly instead of silently adopting whatever is there.

## Multi-lane development: the shared E2E lock (E04-S057)

Locally, `web`/`admin` default `reuseExistingServer: true` (see below) —
convenient for solo development, but dangerous when several developers/
lanes share one machine: an unguarded `playwright test` (directly, via
`--last-failed`, or via `pnpm test` at the repo root — turbo's `test`
pipeline runs `@ai-km/e2e:test` = plain `playwright test`) would silently
**adopt** another lane's already-running `:3000`/`:3001` dev servers
instead of failing to bind, corrupting both runs' results with no error at
all. This is exactly what happened to a real E2E rerun on 2026-08-29 (see
`archive/stories/E04-S057.md`).

**If you're on a shared machine with other lanes, always go through the
lock:**

```bash
../../e2e-locked.sh "<your-label>" -- pnpm exec playwright test [...args]
```

`e2e-locked.sh` (this directory, also deployed at the worktrees-root level
for direct fleet-wide use) does four things: acquires an `flock` on the
shared `.e2e.lock` (waiting up to 1h), writes a human-readable
`.e2e.owner` line for other lanes to eyeball, writes a per-acquisition
`.e2e.owner.token` + exports `AI_KM_E2E_LOCK_TOKEN` for the command it
wraps, and removes both files on exit (success, failure, or interrupt).

**Enforcement**: `playwright.config.ts` calls
`assertNotBlockingLockHolder()` (`helpers/lock-guard.ts`) at module-eval
time — before `defineConfig()` is even built — so **every** entry point is
covered by one check. Behavior:

| Condition | Result |
|---|---|
| `AI_KM_E2E_LOCK_TOKEN` matches `.e2e.owner.token` | Proceeds — this process IS the lock holder (running via `e2e-locked.sh`) |
| No matching token, and `flock -n` on `.e2e.lock` succeeds | Proceeds — the real mutex confirms nobody else holds it |
| No matching token, and `flock -n` on `.e2e.lock` fails | **Throws**, naming the current holder if `.e2e.owner` has a readable label, otherwise a generic message |

**The authority is `flock` itself, not `.e2e.owner`.** An earlier version
of this guard decided block/proceed from the owner file's own presence
and its recorded PID's liveness. Found wrong live on 2026-08-29
(`ai-km-83`): they saw `.e2e.owner` absent and concluded the lock was
free, but the lock was genuinely held — the wrapper writes that file
*after* acquiring the lock, so there's a window (and any acquisition path
that skips writing it produces the same state) where the file is absent
but the lock is not. `.e2e.owner` is unreliable in both directions —
absent-but-held (the race above) and present-but-stale (a crashed run's
leftover claim, which resolves itself for free once contention is
checked directly: a dead process cannot still hold a `flock`, since the
OS releases it when the process's file descriptor closes on exit). The
file is now used only to name a holder in the thrown error — never to
decide whether to throw.

The token check runs *first*, before any `flock` probe, and deliberately
never calls `flock` itself to answer "am I the holder" — a fresh
`flock -n` attempt opens its own independent file description, and
Linux's flock() exclusivity is per-open-file-description, not
per-process: even a child of the process that legitimately holds the
lock (via the wrapper's own long-lived fd) would see a brand-new probe as
"contended." Checking identity via the per-acquisition token first avoids
that trap — the real holder always exits early, before ever reaching a
probe that would otherwise misreport its own hold as someone else's.

If you're aborting a locked run early, kill the wrapper's **process
group** (`kill -TERM -<pgid>`), not just its own PID — Playwright's
webServers run in a different process group from the flock's fd-holding
group, so killing only that group can release the lock while leaving
`:3000`/`:3001`/`:4100` still occupied. Verify with `ss -ltnp` showing the
ports free, not `fuser` on the lock file (which only proves the flock
itself released).

## Local vs CI: `reuseExistingServer` (E01-S030)

`web`/`admin` use `reuseExistingServer: !process.env.CI` — local dev keeps
the old `true` (convenient: skip the ~10-20s dev-server boot on every run
if one's already up), but any run with `CI` set always starts a fresh
server and treats an occupied port as a hard failure, never a silent reuse.

**Why this matters more here than in most repos**: this suite now runs
against a real backend with real persisted state (E03-S038) instead of a
stateless client-side mock. A CI run that silently reused a leftover
`apps/web`/`apps/admin` process from an interrupted previous run wouldn't
just be wasteful — it would test **old code** and report a false green,
with a real (if throwaway) database making the failure mode more
convincing, not less.

On top of Playwright's own default behaviour (which would eventually fail
with a possibly-cryptic `EADDRINUSE` from the underlying `next dev`
process), `playwright.config.ts` calls `helpers/port-check.ts`'s
`assertPortsFreeForCI([3000, 3001])` synchronously at module load time —
before Playwright even attempts to start any webServer — so a CI run with
a leftover process fails immediately with the port number AND the
occupying process (via `ss -ltnp`, the same tool this fleet's own
`.e2e.lock` scripts use). No-op outside CI. `apps/api` doesn't need this
same check: it's already `reuseExistingServer: false` unconditionally (see
above), so an occupied :4100 already fails loudly via the underlying
dev-server's own bind failure.

`helpers/port-check.ts`'s own unit tests (`specs/port-check.spec.ts`)
exercise this logic directly — a real (if ephemeral, throwaway) `net`
listener standing in for "something left the port occupied" — deliberately
without needing a real CI run or a real leftover process to reproduce.

## `apps/api`'s E2E environment

Set via `playwright.config.ts`'s `webServer[2].env` (all already-existing
`apps/api` config flags — see `apps/api/src/config.ts` — no new env var was
invented for this story):

| Var | Value | Why |
|---|---|---|
| `AI_KM_DB_PATH` | `<os.tmpdir()>/ai-km-e2e-<run-id>.sqlite` | A throwaway SQLite file per Playwright invocation — never checked into git, never shared across runs. |
| `AI_KM_TEST_SANDBOX` | `true` | Every login gets its own fresh, isolated owner (`services/identity`'s `runSandboxSeeders`) — see `specs/api-sandbox.spec.ts` for the test proving this. |
| `AI_KM_DEV_TRIGGERS` | `true` | Enables dev/test-only trigger paths some specs rely on. |
| `AI_KM_SEED_DEMO_USERS` | `true` | Seeds the demo accounts (`demo-user`, `demo-maintenance`, ... — `services/identity/src/repository.ts`) so `loginAs()`/existing specs' inline `login()` can authenticate against the real backend. |
| `AI_KM_ASR_PROVIDER` | `fake` | No real whisper-server sidecar dependency for E2E (see `services/model-gateway`'s fake provider). |
| `AI_KM_LOG_LEVEL` | `warn` | Keeps `apps/api`'s own stdout from drowning out Playwright's output during a full run. |

## Sandbox semantics

With `AI_KM_TEST_SANDBOX=true`, every successful login is assigned a fresh,
isolated "owner" — two different browser contexts logging in as the exact
same demo account (e.g. both as `demo-user`) get two independent sandboxes
that cannot see each other's conversations/messages. A second **page**
within the **same** browser context (same session cookie, no second login)
shares the same sandbox as the first page. This replaces the old model,
where isolation came from each browser tab's own `sessionStorage`-backed
client-side mock — see `specs/api-sandbox.spec.ts` for the test proving both
halves of this claim.

Per-owner starting data (seeded sample conversations/messages) is
**not yet wired in** as of this story — that is E04-S052 (owned by another
lane), tracked separately. Specs that depend on seeded conversations being
present are the ones listed as deferred in this story's own EVIDENCE
(`archive/stories/E03-S038.md`).

## Fake microphone

`playwright.config.ts`'s `web` project passes Chromium
`--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream` +
`--use-file-for-fake-audio-capture=<generated wav>%noloop`, and grants the
`microphone` permission up front. The WAV itself (1.5s 440Hz tone + 0.5s
silence) is generated fresh into `os.tmpdir()` on every run by
`helpers/fake-microphone.ts` — never checked into git — and is generated
synchronously at `playwright.config.ts`'s module top level (not via
Playwright's `globalSetup` hook, which runs too late to reach
`launchOptions.args` — see that helper's own doc comment for why). Any spec
can call `navigator.mediaDevices.getUserMedia({audio:true})` and get a real,
live audio track without a browser permission prompt ever appearing — see
`specs/api-sandbox.spec.ts`'s dedicated test.

## Flaky 分類與處理（E01-S027）

一次 `pnpm exec playwright test --repeat-each=3` 全量（813 test instances）
的失敗可分三類，處理方式各不相同 — 看到紅燈先判斷屬於哪一類，不要照樣重跑
了事：

### 1. webServer 未就緒 / dev server 首次編譯逾時（已解決）

**症狀**：webServer 啟動後第一批打到的 spec 逾時，之後的 spec 正常。
**根因**：Next.js dev-mode 是 on-demand 編譯，`webServer.url` 回 200 只代表
process 活著，不代表該路由已編譯完成；第一個真正打進 `/login` 等路由的
request 要素等編譯，可能超過 `expect.timeout`。
**解法（已落地）**：`globalSetup.ts` 在 webServer 就緒後、任何 spec 開始前，
先各打一次 `/login`（web + admin）把 on-demand 編譯的成本移到 setup 階段，
兩者都用一次 90s 的截止時間。落地後 `admin-e2e.spec.ts`/
`admin-analytics-e2e.spec.ts`（過去已知最容易撞這個症狀的兩支）在多輪全量
中穩定通過。

### 2. 既有 spec 依賴已過時的 mock 行為（已 root-cause，非本 story 範圍）

**症狀**：固定 12 支 spec、每輪必定 3/3 皆敗（不隨 worker 數 / timeout 調整
變化）。
**根因**：這 12 支測試的斷言明文假設舊版 client-side mock `AuthClient`
（session 只存在 `sessionStorage`，硬重整即遺失）；E03-S035 換成真實
session cookie 後，行為變成硬重整仍保留登入狀態 —— 新行為才是對的，是舊測試
前提過時，不是回歸。逐支列表與每支的 doc-comment 引用見
`archive/stories/E03-S038.md`（AC1 小節）；是否要為這 12 支開一個「更新舊測試
前提」的新 story，待使用者/coordinator 裁示，不在 E01-S027 允許修改清單內
（本 story 禁止修改 spec 斷言）。

### 3. CPU 飽和逾時（本 story 主要處理對象）

**症狀**：`page.waitForURL` 或 `page.goto` 逾時，不固定發生在哪支 spec，
且逾時前該操作本身邏輯正確（單獨重跑會過）。
**根因量測**（`archive/stories/E01-S027.md` EVIDENCE 有完整 3 輪原始數據）：
- **Round 1**（`workers: process.env.CI ? 2 : cpus/2` = 本機 4）：39 failed
  / 18.7m。扣掉上述 12 支結構性失敗（36 個 instance），剩 `knowledge-ui-e2e.
  spec.ts:62:5`（`page.waitForURL` 逾時）與 `smoke.spec.ts:50:5`
  （見下方「延伸發現」）。
- **Round 2**（`workers: cpus/4` = 本機 2）：36 failed / 29.0m —— 剩餘 flaky
  全部消失（0/3），證實 CPU 飽和診斷正確，但單輪時間變成 1.49 倍，超出
  AC4 的 ≤1.3 倍上限（此量測本身是否受競爭污染，待安靜環境複測，見下）。
- **Round 3**（`workers` 改回 cpus/2，改對 `knowledge-ui-e2e.spec.ts:62:5`
  與 `admin-analytics-e2e.spec.ts:44:5` 兩支個別加 `test.slow()`）：跑出
  55 failed / 26.1m，遠差於 Round 1；但失敗模式完全不同 —— 分散在十幾支
  「前兩輪從未失敗過」的 spec（含 `login.spec.ts` 自己），全部是單純
  `page.goto: Test timeout of 30000ms exceeded`。跑完當下 `uptime` 顯示
  load average 25+（機器僅 8 核）。**歸因（經 ai-km-e4 用 process cwd 核實
  修正）**：主要 CPU 消耗並非本 fleet 其他 lane，而是**另一個完全不相關的
  專案**（`na-wt/*`，nightmare-assault）同時平行跑多個 worktree 各自的
  pytest 套件 —— `.e2e.lock` 只互斥本 repo 的 3000/3001/4100 三個 port，
  不互斥 CPU，也管不到其他專案的行程。

**落地設定**：`workers: process.env.CI ? 2 : Math.max(1, cpus/2)`（維持
Round 1 的時間量級），對已知受害的 2 支測試個別加 `test.slow()`（三倍
timeout 預算，只影響這 2 支，不拖慢其餘 811 個 instance）。

**量測條件裁示（ai-km-e4，2026-08-29）**：AC1「N→0」與 AC4「≤1.3x」都必須
在機器安靜（無其他專案／lane 的重負載行程）的條件下量測，並在 EVIDENCE
記錄當時的 `uptime` load average —— 這不是放寬標準，是定義量測條件：flaky
的性質是「測試本身不穩定」，在 3x 超載下量到的是「CPU 飢餓造成的逾時」，
是另一個變數，任何 CI 也都在專用 runner 上量。已寫入
`archive/ROADMAP_TEMP.md`（commit b9cc02c）兩條新規則：(1) 持有 `.e2e.lock` 期間，
本 fleet 其他 lane 暫停 build/`pnpm test`/全量 typecheck；(2)
任何 flaky/效能相關 AC 的量測都要記錄 load average，只有安靜時的數字算數。
**Round 4（安靜環境乾淨確認，2026-08-29）**：取鎖時 load average 24.11 →
釋鎖前 12.49（8 核機器，1-min 仍有殘留波動，5-min/15-min 已恢復正常）。
settled 設定下，本 story 鎖定的 2 支測試（`knowledge-ui-e2e.spec.ts:62:5`、
`admin-analytics-e2e.spec.ts:44:5`）**全部 0/3**，時間 24.2m（1.24x
baseline，在 AC4 的 ≤1.3x 內）。殘留 4 個失敗（`smoke.spec.ts:50:5` ×2 已知
locator bug、`knowledge-ui-e2e.spec.ts:267:5` ×1 與
`maintenance-history.spec.ts:68:5` ×1，後兩者精準落在同一個 `repeat2`，對應
取鎖初期尚未完全降溫的窗口）詳見 `archive/stories/E01-S027.md`「AC1 最終
解讀」。

### 延伸發現：`smoke.spec.ts:50:5` 的潛在 locator bug（未修，非本 story 範圍）

Round 1 於 3 輪中的 2 輪出現 strict-mode violation：
`getByText("AI KM", { exact: true })` 同時命中 `.app-header-brand` 與
Next.js 自動注入的 route announcer（`#__next-route-announcer__`，其
`aria-live` 內容恰好也是 "AI KM"）。這不是逾時、也不是 CPU 競爭症狀，是
`smoke.spec.ts:67` 這個 locator 本身不夠精確、在 route announcer 恰好還
留著上一頁文字時才會撞到的既有 race。修正需要改動 spec 斷言（例如把
locator 限定在 header 內），屬於「禁止修改 spec 斷言」的本 story 範圍外
——記錄於此，留給日後處理 `smoke.spec.ts` 的 story 參考。
