@i2 @app-shell @phase-3
# 測試 agent 產出,今天預期紅(GHERKIN_WORKFLOW §6:測試 agent 先寫紅,開發 agent
# 才寫綠)。規格來源見 features/11-app-shell/FEATURE.md 的 phase-3 意圖句與範圍
# (顧問裁決,2026-09-05)、NEXT.md 的 phase-3 gate、docs/adr/0017-*.md(第二步的
# 落點與本 phase 的界線)、docs/PITFALLS.md 坑 19(這個 phase 要補的正是坑 19
# 第三次擋住使用者的那一層)。
#
# ── 這個資料夾的 runner 沒有 jsdom(見 phase-1.feature 檔頭)──────────────────
# 這個 phase 要守的東西——助理氣泡實際渲染出來的文字、引用面板實際渲染出來的
# 列數、相關內容面板實際渲染出來的附件列——非過一次 DOM 不可,純函式層的探測
# (phase-2 A/B 段的手法)量不到「畫面上真的顯示什麼」。FEATURE.md/NEXT.md 已把
# 這個 phase 的 gate 訂成「用 jsdom 為必做」;apps/web 自己已經有 126 個 jsdom
# vitest 檔,所以這裡選的機制是每個場景的 When 步驟把
# `pnpm --filter @ai-km/web exec vitest run <file> -t "<名稱>"` 當一個外部指令跑
# (common.steps.ts 的 `runCommand`,跟 standalone 指令走的是同一套機制),決定性
# 的斷言全部寫在
# apps/web/src/app/(app)/conversations/[id]/_components/message-thread.server-answer.test.tsx
# 這個新的 vitest 檔裡——那裡才有真的 DOM 可以量。
#
# ── 根因(顧問裁決摘要)────────────────────────────────────────────────────
# message-thread.tsx 在 sendMessage() 成功之後,不管 03-conversation/phase-2
# 的伺服器是否已經自動產生了一則帶真引用的助理回覆,無條件呼叫
# startStream(classifyAnswerState(content), …)——本地跑一段固定文字的
# MOCK_REPLY,把伺服器那則回覆整個蓋掉。旁邊的 ConversationRelatedPanel
# (附件、引用來源面板)則是另一個獨立的舊洞:它只在 conversationId 變動時抓一次
# 訊息,不會因為這個分頁自己送出的新訊息而重新抓——即使 message-thread 那半
# 修好了,面板仍然可能停在「尚無附件。」/「尚無引用來源。」。
#
# 場景 1、3 的決定性斷言分別是「氣泡文字逐字等於伺服器那則訊息的 content」與
# 「面板列數等於伺服器那則訊息 citations 陣列的長度」——不是「有沒有出現任何
# 回覆」或「有沒有引用」,自問自答見 vitest 檔頭註解。場景 2 是防呆:即使將來
# 巧合地讓場景 1 變綠,也要獨立擋住「MOCK_REPLY / classifyAnswerState 那條路
# 被加回來」這件事本身。場景 4 是 #40 的落地版:附件面板的資料要跟氣泡同步,
# 不必等重新整理。
#
# ── 不在這個 phase(留給 NEXT.md 的 gate)──────────────────────────────────
# 真瀏覽器(Playwright)那一層:CI 的 e2e job 自 2026-08-28 就是紅的
# (API 沒在跑),歷史原因與這個 phase 要修的坑 19 是同一件事,但修法不同層——
# 這裡不做,寫進 NEXT.md 的 gate,不能被這裡的 jsdom 綠燈代替。
Feature: A person who asks a question in the browser sees the answer and citations the server actually produced, not a canned local reply

  Once 03-conversation/phase-2 lets the server generate a grounded, cited reply the
  moment a question is sent, this shell must show exactly that reply — not silently
  discard it in favour of a fixed local placeholder the way it does today. The
  citations that reply carries, and any attachment sent alongside a question, must
  show up in this shell's own citation/attachment panel without a reload, since a
  person reading their own conversation has no way to tell "the panel is stale" from
  "there really is nothing here".

  Scenario: The assistant bubble shows the exact reply the server generated, not a fixed local placeholder
    Given a person has already asked a question in a conversation whose reply the server will generate itself, with real citations
    When the vitest check for "shows the assistant's real server-generated reply, not a local mock stream" is run
    Then it exits with status 0

  Scenario: Sending a question never falls back to a local mock stream or a client-guessed answer state
    Given a person has already sent a message and the server has finished handling it
    When the vitest check for "never calls the local mock stream or classifies an answer state itself once a message actually sends" is run
    Then it exits with status 0

  Scenario: The citation panel next to the conversation shows exactly as many rows as the server's reply carries citations
    Given a server-generated reply carries two citations
    When the vitest check for "shows exactly as many citation rows in the related panel as the server message's citations carry" is run
    Then it exits with status 0

  Scenario: An attachment sent in this tab shows up in the related panel right away, not only after a reload
    Given a person sends a message with one attachment in this browser tab
    When the vitest check for "shows an attachment sent in this tab in the related panel right away, not only after a reload" is run
    Then it exits with status 0
