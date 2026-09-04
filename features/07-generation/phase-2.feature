@i2 @generation @phase-2
# 測試 agent 產出,今天預期全紅(GHERKIN_WORKFLOW §6:測試 agent 先寫紅,開發 agent
# 才寫綠)。這份 phase-2 交付把 services/generation 接進 apps/api composition root,
# 並且讓 `answer()` 真的從 `app.retrieval` 拿 hits——不是兩個 plugin 各自躺在同一個
# server 上互不相干。`apps/api/src/server.ts` 今天完全沒有 generationPlugin 的註冊
# (`grep generationPlugin apps/api/src/server.ts` 只命中註解,沒有 `app.register`)。
#
# 每一句步驟只呼叫今天已經存在的符號:`buildServer()`(經 `KmWorld.startServer()`)、
# `toRetrievalScope()`、`RetrievalServiceError`(services/retrieval,phase-1 已在用)。
# 沒有 import 任何新的實作符號,所以每個場景都紅在斷言,不紅在編譯——
# `pnpm typecheck` / `pnpm lint` 不受影響。
#
# ── 設計判斷 A:讀法 1 vs 讀法 2(測試 agent 自己選,寫在這裡不要默默決定)──────
#
# `generationPlugin` 今天只 decorate `app.generation`,`answer(question, context)` 收
# context、不去拿 context。要讓「`answer()` 從 `app.retrieval` 拿 hits」成立,composition
# root 需要一個組合過的 seam。技術顧問裁定搬遷 ADR 0014 固定 `dept:eng` 的落點是
# 「`answer()`——第一個真正呼叫 `retrieve()` 的生產路徑」(見 ADR 0014「這份 ADR 的一個
# 空保證」段、`NEXT.md` phase-2 gate 第三條)。
#
# 這裡選**讀法 1**:那個組合 seam 自己在 `apps/api` 裡帶 ADR 0014 的固定 `dept:eng`,
# 不對外收 scope 參數。理由:
#   1. `03-conversation/phase-2`(唯一可能提供「登入的人」scope 的 HTTP 呼叫點)今天狀態是
#      `todo`,而且卡在**使用者**要拍板的 `citations` 契約放寬(`03-conversation/NEXT.md`)—
#      這條 gate 與付費、`@e2e` 一樣是本 repo 唯一還留給使用者的兩類之一,沒有時間表。若採
#      讀法 2(固定值留到 `03-conversation/phase-2` 才落地),ADR 0014 說的「這份 ADR 的一個
#      空保證」會被讀法 2 附加卡在一個不相關的契約決策上,不會在本輪解除。
#   2. `07-generation/NEXT.md` 把「搬進 composition root」列為**本 phase**(不是下一個
#      依賴 `03-conversation` 的 phase)的 DoD,且不帶任何「等 03-conversation」的條件字句
#      ——與讀法 2 矛盾,與讀法 1 一致。
#   3. 「第一個真正呼叫 `retrieve()` 的生產路徑」這句話本身指向**呼叫點自己**帶著固定值,
#      不是呼叫點的呼叫者(那會是 03-conversation,不是這裡)。
#
# 讀法 2(seam 收一個 `scope` 參數、固定值留給 03-conversation)**不選**,原因同上三點；
# 它在契約上更乾淨(生成層對「誰在問」保持無知),但今天沒有任何生產路徑可以提供那個
# `scope` 參數,寫出來的 seam 會是一個沒人呼叫得到的死介面。
#
# 依讀法 1,本檔要求 composition root 提供一個新的 in-process 接縫:`app.rag.ask(question)`
# ——`ask()` 內部呼叫 `app.retrieval.retrieve()`(用 ADR 0014 的固定 `dept:eng` scope)
# 再呼叫 `app.generation.answer()`。**這個名字是測試 agent 的判斷,不是既有規格**:它跟隨
# `app.retrieval`/`app.generation`/`app.contracts` 既有的 decorate 命名慣例(ADR 0007
# §4/§5,sibling 可見),但開發 agent若有更好的形狀,以規格意圖(「有一個 composition
# root 自己的、bake 好固定 scope 的 in-process 呼叫點,answer() 真的從 app.retrieval 拿
# hits」)為準,不是以這個名字本身為準——名字不對不算做錯,行為不對才算。
#
# ── 設計判斷 B:seed 通道缺口(誠實記錄,不是含糊帶過)────────────────────────
#
# `06-retrieval/phase-2.feature` 開頭已經記過:`retrievalPlugin` 沒指定 service/store 時
# 用全新空記憶體 store,而 `apps/api` composition root 今天沒有任何測試用的 retrieval
# store 注入通道(不像 `dbPath`/`migrationsDir` 那樣有 `BuildServerOptions` 覆寫欄位)。
# 這個缺口在 07 phase-2 依然存在,而且更嚴重——它讓下面「兩個不同部門的人应該拿到相同
# 結果」那個場景（ADR 0014 固定值的移除條件）**即使正確接上生產碼之後也是弱斷言**:
# store 永遠是空的,所以不管 scope 是寫死的 `dept:eng` 還是真的從部門推導,兩個人的結果
# 都會是「零筆命中、空答案」,天生相同。這個場景仍然值得寫(它能抓到「兩個人在生產路徑上
# 拋出不同錯誤」這類明顯回歸,且滿足 NEXT.md 明列的 DoD——把固定值從 step 檔搬進生產碼），
# 但它不是一個完整的移除條件；等 `05-ingestion/phase-2` 或某個未來的測試用 seed 通道把
# 部門各異的資料灌進 `app.retrieval` 之後,才可能寫出真正決定性的版本。這件事記在下面
# 該場景的註解裡,也寫進回報,不寫進 FEATURE.md(不在測試 agent 的允許修改清單內）。
#
# 同一個理由使得「真 retrieve() 的 hits 餵進真 answer() 之後,最終引用不含未授權文件」
# 這件事在 apps/api 這一層今天只能被證到它最誠實的極限:**沒有索引任何東西時,seam 老實
# 回報零筆、答案不帶任何引用**——`rag-composition.test.ts` 已經在 vitest 層用真的兩個部門
# 資料證過完整版本；apps/api 這一層等 seed 通道存在後才補得出同等強度的版本。
Feature: The generation seam should compose with retrieval on apps/api's own real server, under I2's temporary fixed scope
  I2 is the first time this system is worth anything to a real person: sign in on the
  web, ask a question about an already-indexed document, read an answer, click a
  citation open to the original text. `06-retrieval/phase-2` already put `app.retrieval`
  on the real server; this phase is the other half — `services/generation` joins it, and
  something in `apps/api`'s composition root actually calls `retrieve()` before handing
  the hits to `answer()`, instead of the two capabilities merely sitting side by side.

  ADR 0014 says I2 does not wait for real department-derived authorization: the
  composition root hands every signed-in person the SAME fixed `dept:eng` scope. That
  fixed value moves, in this phase, from a test step file into the production call site
  that first really invokes `retrieve()` — see this file's header for why that call site
  is this phase's own composed seam, not a later phase's HTTP route.

  Scenario: The combined RAG seam has not been wired into the real API server yet
    Given a fresh server with fake providers
    When a signed-in demo person tries to get a grounded answer to "軸承過熱" through the real API server's own combined RAG seam
    Then the combined RAG seam should be visible from the real server's parent instance, but it is not yet

  Scenario: Once wired, the combined seam must refuse an empty question instead of silently answering
    Given a fresh server with fake providers
    When a signed-in demo person tries to get a grounded answer to "" through the real API server's own combined RAG seam
    Then the combined RAG seam should be visible from the real server's parent instance, but it is not yet
    And the empty question should be rejected by the combined seam with "RetrievalServiceError", not silently answered

  Scenario: Once wired, the combined seam must never invent a citation for data that has not been indexed yet
    Given a fresh server with fake providers
    When a signed-in demo person tries to get a grounded answer to "軸承過熱" through the real API server's own combined RAG seam
    Then the combined RAG seam should be visible from the real server's parent instance, but it is not yet
    And the answer should carry no citations, because nothing has been indexed yet

  # ADR 0014 固定值的搬遷落點(NEXT.md phase-2 DoD 第三條)。見本檔開頭「設計判斷 B」:
  # 這個「兩人結果相同」的比較在 apps/api 今天沒有 seed 通道的情況下是弱斷言(store 永遠是
  # 空的,所以不管 scope 是誰,結果都會相同)——它證明的是「固定值真的活在生產碼裡且沒有
  # 因人而異地壞掉」,不是「授權已經做完了」。等 seed 通道存在後應該加強成部門各異的資料。
  Scenario: I2's scope is fixed to dept:eng for every signed-in person, not derived from their real department — this scenario is the fixed value's production removal condition
    Given a fresh server with fake providers
    When two different demo people with different real departments each try to get a grounded answer to "軸承過熱" through the real API server's own combined RAG seam
    Then the combined RAG seam should be visible from the real server's parent instance, but it is not yet
    And both people should get the exact same outcome from the combined seam, because I2's scope is fixed for everyone alike, not derived from either person's real department
