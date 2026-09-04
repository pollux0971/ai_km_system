@i2 @app-shell @phase-2
# 測試 agent 產出,今天預期紅(GHERKIN_WORKFLOW §6:測試 agent 先寫紅,開發 agent
# 才寫綠)。規格來源見 features/11-app-shell/FEATURE.md 的 phase-2 意圖句、NEXT.md
# 的 phase-2 gate、docs/adr/0018-*.md(Decision 2 已核准附三個條件,條件 2 是本檔
# 硬要求)、docs/adr/0016-*.md(citations[] 的順序語意與「缺席 ≠ 空陣列」)。
#
# ── 這個資料夾的 runner 沒有 jsdom(見 phase-1.feature 檔頭)──────────────────
# 「點一下引用」與「畫面呈現中性徽章」本身要 DOM 才能完整驗。這裡把兩件事都拆成
# DOM 之前那一半:UI 拿到引用/訊息之後「該算出什麼」這個純函式層——這一層今天
# 還沒做對(或還沒做),紅在這裡。真的「畫面上看得到」那一半留給檔尾 @manual;
# 那條界線就畫在「純函式回傳的值」與「畫面實際渲染的像素/DOM 節點」之間。
#
# ── A(場景 1、2):citations.ts 今天是 E03-S014 遺留的 mock,鍵是裸 id
# ("1"/"2"/"3"),回傳 file/page/snippet,完全沒有 ADR 0016 的
# documentId + startOffset/endOffset 形狀。apps/web 也沒有任何「拿 documentId
# 換原文全文」的 contract endpoint——這是一個誠實的開放問題(見 FEATURE.md 開放
# 問題),不是這個 phase 能解的契約缺口。這兩個場景因此把範圍縮到「UI 已經有
# 原文全文時,能不能正確把一個 ADR 0016 形狀的引用切回原文那一段,且無中生有
# 時拒絕」——這是不等契約也做得到、而且必須做對的那一半。用型別安全的動態
# optional 存取探測 citations.ts 今天還沒有的 resolveCitationPassage(仿
# 07-generation/phase-2 對 app.rag 的探測手法:把 module 轉型成
# `{ resolveCitationPassage?: ... }` 再呼叫)——這樣「符號還不存在」本身紅在
# 斷言(探測到 undefined),不紅在編譯。這個函式名字是測試 agent 的判斷,不是
# 既有規格;開發 agent 若有更好的形狀,以場景描述的行為為準,不是以名字本身
# 為準(行為不對才算做錯)。
#
# ── B(場景 3、4):apps/web/src/app/(app)/conversations/[id]/_components/
# message-thread.tsx 第 1164 行今天就是 ADR 0018 條件 2 想擋的那個錯:
#   const answerState: AnswerState = entry.kind === "sent" ? (entry.message.state ?? "ANSWERED") : "ANSWERED";
# 缺席被當場改寫成 ANSWERED 字面值。這行在一個大型 React 元件內部,沒有 DOM
# 跑不動,也沒有拆成獨立可測的函式。這兩個場景要求 answer-state.ts 長出一個
# 獨立、在 node 裡就測得到的 resolveAnswerStateDisplay(state),把「缺席」映成
# 一個與 ANSWERED 不同的值(這裡選名 "UNSET"——UNSET 要不要畫成一個看得見的
# 徽章是顯示層的事,需要 DOM,留給 @manual/phase-3;這裡只守「缺席不是
# ANSWERED」這個決定性事實本身,那正是條件 2 的文字)。同一手法:動態 optional
# 存取,今天不存在時斷言直接看到 undefined ≠ "UNSET"。場景 4 是防呆:確保
# 「缺席映成別的值」不是靠「什麼都映成別的值」這種作弊法做到的。
#
# ── C(場景 5、6、7):跨視窗同步的三個行為,NEXT.md「可以先做、不需要任何
# gate」清單裡列的那三個,把 phase-1.feature 檔尾那條 @e2e @manual 場景在能
# 自動化的範圍內搬進來。createConversationEventSource()
# (apps/web/src/lib/conversation-events.ts)本身已經是正確實作——phase-1 回填
# 對照表列的三份 vitest(conversation-events.test.ts 等)早就綠;這三個場景只是
# 把同一個能力從 vitest 搬進 Gherkin,用它自己既有測試同一個注入點(假
# EventSourceFactory),不是新 mock。這三個場景預期今天就是綠的——這是移植既有
# 正確行為,不是新能力;整份 phase-2 之所以整體紅,是被 A、B 拖紅的。多視窗本身
# (真的開兩個瀏覽器分頁)仍然留給 phase-1.feature 檔尾那條 @e2e @manual,這裡
# 不重複也不取代它。
Feature: Opening a citation shows the original passage it names, an absent answer state never masquerades as answered, and a change made in another window reaches this one
  I2's last piece for this shell: once a grounded reply with citations exists (03/06/07's
  phase-2, all done), a person should be able to open one of those citations and read the
  exact passage of the original document it names — not a placeholder, and never an
  invented passage for a document nobody actually supplied text for. Separately, ADR 0018
  fixed `03-conversation/phase-2` so a RAG-produced reply simply omits `state` rather than
  guessing it, on the understanding that this shell's own rendering would never quietly
  turn that honest absence back into a claimed "ANSWERED" — that promise is this file's
  job to keep, and it's a hard requirement (ADR 0018 Decision 2, condition 2), not a nice-to-have.
  Last, the cross-window sync this shell's phase-1 left as a hand-confirmed browser check
  gets its automatable half moved into scenarios here.

  Scenario: A citation's document id and offsets resolve to the exact original passage, not a placeholder
    Given a document's real original text is available to this shell
    And a citation names that exact document and the offsets of one passage within it
    When this shell is asked to open that citation
    Then it should show the exact passage those offsets name, sliced character-for-character from the original text

  Scenario: A citation naming a document nobody has supplied the original text for is refused, not invented
    Given a citation names a document this shell has never been given the original text for
    When this shell is asked to open that citation
    Then it should refuse to show any passage, with a "NOT_FOUND" outcome, rather than inventing one

  Scenario: An assistant reply that carries no answer state field at all is treated as neutral, not as answered
    Given an assistant's reply that carries no answer state field at all
    When this shell decides what state that reply should display as
    Then it should decide "UNSET", not "ANSWERED"

  Scenario: An assistant reply that explicitly carries the answered state is still treated as genuinely answered
    Given an assistant's reply that explicitly carries the answer state "ANSWERED"
    When this shell decides what state that reply should display as
    Then it should decide "ANSWERED"

  Scenario: A conversation created in another browser window reaches this window's own subscription
    Given this window holds its own open subscription to the shared conversation change stream
    When another window's new conversation arrives on that shared stream
    Then this window's subscription should receive that same conversation's creation

  Scenario: The same change replayed after a reconnect is only ever delivered once
    Given this window holds its own open subscription to the shared conversation change stream
    When a conversation change with a given id arrives twice on that shared stream, as a reconnect replay would
    Then this window's subscription should receive that change exactly once

  Scenario: The connection status goes from open to reconnecting and back to open, not straight to closed, when the shared stream drops and comes back
    Given this window holds its own open subscription to the shared conversation change stream
    When that shared stream opens, then drops, and then reconnects
    Then this window should see the connection status pass through "open", "reconnecting", "open" in that order
