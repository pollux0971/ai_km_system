@model-gateway @phase-3
# 測試 agent 先寫紅的規格(GHERKIN_WORKFLOW §6/§3)。這個 phase 是「真模型(PF3)」,
# 今天沒有真模型,所以這裡的場景**預期是紅的或未定義的**——那是「還沒做」不是「弄壞了」(§7.6)。
#
# 2026-09-05:第一個場景從 `docs/integration/i2-ask-in-web.feature` 搬過來,
# 措辭改了一個詞,而那個詞很重要:原文是 "rather than an **invented** one",
# 改成 "rather than an **unrelated** one"。
#
# 原因:generation 的捏造引用守門**是有效的**——被引用的 chunk 確實存在於 context 裡。
# 問題不是捏造,是**答非所問**:引用一份真實但與問題無關的文件,因為 `retrieve()`
# 沒有相似度門檻,top-K 永遠回 K 筆。一個描述錯問題的場景,即使紅了也指不出該修哪裡。
#
# 為什麼門檻不在 I2 就加(技術顧問 2026-09-05 裁決):今天的 embedding 是
# **feature hashing**(`deterministic.provider.ts` 檔頭自己寫的),**分數沒有語意**,
# 對它校準出來的門檻值是假調參,真模型一來就作廢。所以機制與值**一起**在這個 phase 落地:
# 機制是 retrieval 的 `minScore`(**未設 = 不過濾**,所以加機制本身不改變現況行為),
# 值從 `docs/01-roadmap.md` I2 段預言的那份紀錄校準——「使用者拿自己的一份真實文件問三個問題,
# 把答非所問的紀錄下來」。這同時是 E04-S022 那個掛了很久的未決門檻的落地點。
Feature: With a real model behind it, an off-topic question is answered without dragging in an unrelated document
  Until PF3 the embedding provider is feature hashing: two texts that share no
  meaning can still score close, so "is this chunk relevant" has no answer worth
  thresholding. With a real embedding model the score carries semantics, and a
  question the corpus cannot answer must come back WITHOUT citations rather than
  with a real-but-irrelevant one.

  @model
  Scenario: A question with no matching document is answered with no citation rather than an unrelated one
    Given a knowledge base holding only the ingestion-pipeline document
    When someone asks "這份文件裡沒有的主題"
    Then the answer carries no citation
    And the answer says it found nothing to cite
