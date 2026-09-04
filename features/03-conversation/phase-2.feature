@i2 @conversation @phase-2
# 測試 agent 產出,今天預期全紅(GHERKIN_WORKFLOW §6:測試 agent 先寫紅,開發 agent
# 才寫綠)。規格來源見 `features/03-conversation/FEATURE.md` 的 phase-2 那一列、
# `NEXT.md` 的 phase-2 gate/DoD、`docs/adr/0016-*.md`(citations 形狀,已落地的契約)、
# `docs/adr/0014-*.md`(I2 固定 dept:eng scope、「這份 ADR 的一個空保證」與
# 2026-09-05 更新)。
#
# 今天的現況(實跑確認,不是推的):`services/conversation/src/routes/messages.ts`
# 的 `POST /v1/conversations/{id}/messages` 完全沒有呼叫 `app.rag`——送一個
# `role: user` 的訊息只會建立那一則訊息本身,不會觸發任何檢索或生成。
# `apps/api/src/rag-plugin.ts` 的 `app.rag.ask(question)` 已經存在且已經接好
# `app.retrieval`/`app.generation`(06-retrieval、07-generation 的 phase-2 皆
# done),但簽名上**沒有 caller 參數**,也**沒有任何生產路徑呼叫它**——
# `03-conversation/phase-2` 是第一個手上真的有「登入的人」的 HTTP 呼叫點
# (NEXT.md phase-2 DoD),所以本檔每個場景都紅在斷言(訊息裡沒有引用、
# retrieve() 從沒被呼叫過……),不紅在編譯——本檔只呼叫今天已經存在的符號:
# `KmWorld.startServer()`(真實 `buildServer()`)、`app.ingestion.ingest()`
# (05-ingestion/phase-2 已 done)、`app.retrieval.retrieve()`、
# `toRetrievalScope()`、`extractPdfText()`、`chunkDocument()`。
#
# ── 設計判斷 A:自動產生助理回答的確切機制,不由測試 agent 指定 ─────────────
#
# contract(`conversations.yaml` `createMessage` 的 description)今天寫的仍是
# "TRANSITIONAL: role: assistant is accepted because generation still runs in
# the browser"——這句話還沒被改寫,但 FEATURE.md phase-2 的意圖很清楚:
# 送出一個 `role: user` 的問題之後,系統自己要生出一則帶引用的 `role: assistant`
# 回答。至於這件事是在同一個 POST 請求裡同步做完、還是非同步做完之後由
# SSE/後續 GET 才看得到,是開發 agent 的實作選擇,不是這份規格要釘死的——
# 下面的場景一律用「送出問題之後,讀那個對話的訊息列表」來觀察結果,並且輪詢
# 最多 1 秒(見 steps 的 `waitForAssistantReply`),兩種實作路徑都接得住。
#
# ── 設計判斷 B:今天的 canned 生成 provider 連 [N] marker 都不會印 ──────────
#
# 實際讀過 `services/model-gateway/src/generation/canned.provider.ts` 的預設
# `answerTemplate`:它只印 `[canned] 依據 N 段來源回答:問題`,完全沒有 `[1]`
# `[2]` 這種 marker。也就是說,場景 2(marker 順序)今天會在**兩個獨立的原因**
# 上紅:(a) 訊息路由根本沒接 RAG,(b) 就算接了,預設 canned provider 也不會印
# marker。(b) 不是這份 phase 發明的缺口——`CannedProviderOptions.answerTemplate`
# 這個掛勾已經存在,開發 agent 要做的是在 composition root 組裝生成服務時帶一個
# 會印 marker 的 template,不是改 canned provider 本身(那是共用 infra)。
#
# ── 設計判斷 C:引用順序怎麼驗,不用「兩份不同文件」也做得到 ─────────────────
#
# 唯一可用的真中文 fixture PDF(`services/ingestion/.../cjk-non-embedded.pdf`,
# 06-retrieval/05-ingestion 兩份 phase-2 都在用)實測只有 186 字,`chunkDocument`
# 預設參數下只切出**一個** chunk(見本檔 steps 的驗證腳本記錄,§5.3「機制要用量
# 的,不要用讀的」——這是實跑量出來的,不是猜的)。要在同一次提問裡拿到 ≥2 個
# 引用,場景 2 把同一份 fixture PDF **索引兩次、用兩個不同的 documentId**——
# 兩個 chunk 文字逐字相同,embedding 分數因此完全打平。這代表場景 2 **不**驗證
# 「哪個來源該排第一」(那是 06-retrieval 自己的 ranking 職責,不重複驗證),
# 它驗證的是一個更窄但仍然決定性的性質:**同一個 store、同一個 scope、同一個
# 問題,`retrieve()` 是確定性函式**——所以拿同樣的輸入再呼叫一次 `retrieve()`,
# 排出來的順序必須跟訊息裡 `citations` 的順序逐一相同。這正好是 ADR 0016 D2
# 指定的反向驗證手法(「把陣列反轉」)會打中的性質:如果有人在存進 `Message`
# 之前重排了 `citations`(不管是不是搭配打亂 marker 順序),這個「兩次呼叫應該
# 對得上」的比對就會斷。
#
# ── 設計判斷 D:「身分真的進到接縫」怎麼在不改任何生產碼的前提下觀察 ─────────
#
# `RagSeam.ask(question)` 今天沒有 caller 參數,`RetrievalScope` 的
# `principalId` 也不會出現在任何 HTTP 回應裡——沒有生產碼會把它印出來給場景讀。
# 場景 4 因此在 steps 裡對 `app.retrieval.retrieve`(一個 plain object 的方法,
# 不是 frozen)做一次**運行期方法包裝**:呼叫真正的 `retrieve()` 之前,先把
# 呼叫時收到的 `scope`(principalId/allowedScopeKeys/deniedScopeKeys)記下來。
# 這不改任何一行生產碼,包裝只活在這次 scenario 的 process 裡,scenario 結束
# 隨 `KmWorld.cleanup()` 關掉整個 server 一起消失。**故意不驗證**「兩個人拿到
# 不同答案」(NEXT.md 明講這是 I3 的事,ADR 0014 的固定值本身不該變)——只驗證
# `principalId`(反映「這是誰」)因人而異,而 `allowedScopeKeys`/
# `deniedScopeKeys`(反映「這個人被准許看什麼」)兩個人都還是同一份固定的
# `["dept:eng"]`/`[]`。
Feature: Sending a question in a conversation returns a grounded assistant reply, and the retrieval scope behind it carries the asker's own identity
  I2 is the first time this system is worth anything to a real person: sign in on the
  web, ask a question, read a grounded answer, and trust that the citations point back
  to the real text. `06-retrieval/phase-2`, `07-generation/phase-2` and
  `05-ingestion/phase-2` already wired `app.retrieval`, `app.generation` and
  `app.ingestion` onto the real API server, and `apps/api/src/rag-plugin.ts` already
  composes the first two into `app.rag.ask(question)` under ADR 0014's temporary fixed
  `dept:eng` scope. What is still missing is the one thing only this capability's own
  HTTP route can supply: a conversation that a signed-in person actually owns, and the
  wiring from "a question was posted" to "a grounded reply with citations exists" — plus,
  per this phase's own DoD, `ask()` finally receiving who is asking, instead of every
  signed-in person's question flowing through the exact same anonymous call.

  Background:
    Given a fresh server with fake providers

  Scenario: A grounded reply's citations point back to the exact original text
    Given the real Chinese fixture document has been indexed under department "eng"
    When "demo-user" asks "知識管理系統設計文件" in a fresh conversation of their own
    Then the asker should receive an assistant reply whose citations slice the original document back to the exact chunk that was indexed

  Scenario: Citation order matches the ascending numbered markers in the reply, and is not reshuffled afterwards
    Given the real Chinese fixture document has been indexed twice under department "eng", as two separate documents
    When "demo-user" asks "知識管理系統設計文件" in a fresh conversation of their own
    Then the reply's content should carry ascending numbered citation markers, one for each citation
    And citations should be listed in the same order the retrieval seam itself ranks them for that question, not reshuffled afterwards

  Scenario: A reply that found nothing to cite still carries an empty citations list, but the asker's own question never carries the field at all
    When "demo-user" asks "從沒被索引過的問題" in a fresh conversation of their own
    Then the assistant's reply should carry citations as an empty list, not a missing field, because nothing was found to cite
    And the asker's own question should carry no "citations" field at all

  Scenario: The retrieval scope handed to the seam carries each asker's own identity, even though I2's fixed permission itself has not changed
    Given the retrieval scope used for each request in this scenario is being recorded
    When "demo-user" asks "軸承過熱" in a fresh conversation of their own
    And "demo-maintenance" asks "軸承過熱" in a fresh conversation of their own
    Then the two recorded retrieval scopes should carry two different people's own identity
    But both should still carry the exact same fixed "dept:eng" permission, because I2 has not changed that yet
