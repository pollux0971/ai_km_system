# 00 · 設計背景(蒸餾自 SOURCE_BASELINE §1–§13,2026-09-04 凍結)

> **原始版本,保留作為決策起點,凍結後不改。** 修正與差異記錄在 `02-decision-map.md`(「已知不同之處」表);
> 待決在 `DECISIONS_NEEDED.md`;會變的東西(契約、範圍、phase、技術棧)分別在 `contracts/`、各 `FEATURE.md`、
> `01-roadmap.md`。這份不用每次讀;遇到「為什麼這樣設計」來查。
> 功能清單、epic、story 模板**刻意不放**——在 `archive/AI_KM_BMAD_High_Granularity/`(tag `baseline-bmad`)。

## 1. 這是什麼產品

企業內部部署的 **AI Knowledge & Work Assistant Platform**:整合企業文件、SOP、規章、FAQ、ERP／MES／HR／CRM／
SCM／PLM／IoT、維修資料與 email,讓員工用自然語言查企業知識、分析文件、查 ERP、取得報表、做設備故障排除、
追蹤知識來源。賣點是 **on-prem、RAG、RBAC、稽核**。

系統必備:Enterprise Authentication、RBAC、Resource ACL、Retrieval Authorization、Audit、Citation、
Prompt／Model／Data Governance、API Integration、Observability。

## 2. MVP 的定義(這條決定了怎麼切工作)

**不是**「刪掉大量功能」,**是**「所有核心功能都存在,但每個先完成最小可用薄切片」。

| 成熟度 | 意思 |
|---|---|
| **M0 Walking Skeleton** | Login → Chat → Retrieval → LLM → Citation 一條走通 |
| M1 MVP | 每個主要模組都有薄切片(Auth、RBAC、Chat、RAG、Citation、Upload、KB、ERP Query、Excel、Maintenance、Admin、Feedback、Audit、Model／Prompt Mgmt) |
| M2 Production Ready | Security、Reliability、Monitoring、Governance、Versioning、Approval、Backup、Permission granularity |
| M3 Enterprise GA | HA、DR、大規模、Advanced RAG、多租戶、SIEM、DLP、ABAC、自動模型路由 |

MVP 可簡化 UI、自動化程度、規模、HA、多租戶、模型路由、Data Governance 深度;**不可省略核心權限、
核心稽核、核心 RAG Citation**。

## 3. v1 做 / 不做(產品層級,不是功能清單)

| 做 | 不做(v1) |
|---|---|
| 企業文件 RAG 問答,引用可回原文 | 跨 Conversation 永久 AI memory |
| 部門／群組層級的可見性(RBAC + Deny-Wins) | 多租戶、ABAC |
| 文件上傳、版本、重新索引 | 大規模運算調度、自動模型路由 |
| ERP 唯讀自然語言查詢(SELECT、白名單 view、稽核) | ERP 寫入 |
| 維修助理(SOP、錯誤碼、故障排除,含高風險警告) | 維修結果自動成為正式知識 |
| 回饋(OK/NG)與 admin 指標、稽核可查可匯出 | SIEM、DLP |
| on-prem 部署;外部雲端 LLM 預設關閉 | HA／DR |

## 4. 核心體驗(每個整合點的 `@e2e` 場景都是它的一段)

```
User Login → Home → Select Task → Ask Question → Select / Auto-select Knowledge
→ Retrieve Authorized Data → Generate Answer → Show Citation → User Verify → OK / NG → Feedback Loop
```

## 5. 角色

| 角色 | 做什麼 |
|---|---|
| General User | 一般員工,問問題 |
| Department Manager | 管部門 KB、部門使用者、部門知識 |
| Knowledge Manager | 管知識、文件、FAQ、回饋、知識品質 |
| Maintenance Engineer | 用維修助理、SOP、錯誤碼、故障排除 |
| Sales / Purchasing | 用 ERP 助理、資料查詢、Excel |
| IT Administrator | 管帳號、SSO、connector、系統 |
| AI Administrator | 管模型、prompt、評估、RAG |
| Auditor | 看稽核與安全事件 |
| Super Administrator | 最高權限 |

## 6. 暫定產品決策 PD-01～PD-40(唯讀索引)

原始規格的「暫定產品決策」,編號保留。**這張表只在凍結時填一次**;之後的狀態變化都在 ADR:
- `/feature` 分流 C 類「與既有決策衝突」以本表 + `02-decision-map.md` 為比對基準;命中 PD-nn 的處置與命中 ADR 相同——問要不要推翻。
- **升級規則**:某個 phase 的 `FEATURE.md` 引用到 PD-nn、或 `/feature` 要拿它擋需求時,那條就轉成 ADR(Context 寫「原 PD-nn」);被推翻的發 superseding ADR。轉了之後在 `02-decision-map.md` 的對照表登記,本表不改。

| # | 決策 | 凍結時狀態 | 對應 ADR(凍結時) |
|---|---|---|---|
| PD-01 | 系統主要服務企業內部員工 | 暫定 | |
| PD-02 | 提供一般模式與進階模式 | 暫定 | |
| PD-03 | 支援 SSO | 暫定(MVP 先 session cookie) | ADR 0005 |
| PD-04 | 保留 Local Break-glass Account | 暫定 | |
| PD-05 | 使用 RBAC + Resource ACL | 暫定(E02 主體未實作) | |
| PD-06 | Permission Conflict 預設 Deny Wins | **Wave 1 已驗證** | ADR 0010 |
| PD-07 | Retrieval 前必須完成 Authorization | **Wave 1 已驗證** | ADR 0010 |
| PD-08 | 無權限資料不得送入 LLM | **Wave 1 已驗證** | ADR 0010 |
| PD-09 | 無權限來源不得出現在 Citation | **Wave 1 已驗證** | ADR 0010 |
| PD-10 | 企業知識回答預設需要 Citation | **Wave 1 已驗證** | ADR 0010 |
| PD-11 | 無足夠資料時 AI 必須 Abstain | **Wave 1 已驗證** | ADR 0007、0010 |
| PD-12 | 同 Conversation 支援 Multi-turn Memory | 暫定 | |
| PD-13 | MVP 不做跨 Conversation 永久 AI Memory | 暫定 | |
| PD-14 | 文件必須有 Version | 暫定(embedding 版本已做,文件版本未做) | |
| PD-15 | 文件更新需 Reindex | **Wave 1 已驗證**(同 scope 重匯 = 原子替換) | ADR 0010 |
| PD-16 | 文件刪除需同步刪除 Vector Index | 暫定 | |
| PD-17 | MVP 支援主要企業文件格式 | 暫定(目前只有 PDF) | |
| PD-18 | OCR 支援中文與英文 | 暫定(掃描檔目前 fail closed) | |
| PD-19 | ERP MVP 預設 Read-only | 暫定 | |
| PD-20 | AI SQL 僅允許 SELECT | 暫定 | |
| PD-21 | SQL 僅允許 Whitelist View | 暫定 | |
| PD-22 | SQL 執行需 Audit | 暫定 | |
| PD-23 | 高風險維修操作必須顯示 Warning | 暫定 | |
| PD-24 | 高風險維修操作必須提供 SOP Citation | 暫定 | |
| PD-25 | 維修結果不得直接變正式 Knowledge | 暫定 | |
| PD-26 | Knowledge Feedback 需 Human Approval | 暫定 | |
| PD-27 | Prompt 必須 Versioned | 暫定 | |
| PD-28 | Model 呼叫必須經過 Model Gateway | **Wave 1 已驗證**(in-process 主路徑) | ADR 0007、0010 |
| PD-29 | 外部 Cloud LLM 預設關閉 | 細化 | ADR 0009 |
| PD-30 | 第一優先部署策略為地端或 Private Environment | 暫定 | |
| PD-31 | 所有敏感操作必須 Audit | 暫定(audit 0 行) | |
| PD-32 | Feature 可以 MVP 簡化,但不能完全消失 | 暫定 | |
| PD-33 | 最終 GA 以 Enterprise Highest-grade 為方向 | 暫定 | |
| PD-34 | Backend 與 RAG 核心主要由 Team B 負責 | **推翻** | ADR 0008 |
| PD-35 | Team A 不等待 Backend 完成才開始 | **推翻**(改為垂直切片) | ADR 0008 |
| PD-36 | API 採 Contract-first | **Wave 1 已驗證**(機械化:compat gate、L2-EQ、binding coverage) | ADR 0010 |
| PD-37 | Team A 可建立 BFF,但不能繞過 Domain Service | 暫定 | ADR 0001 |
| PD-38 | Monorepo 不依 Team 分資料夾 | 暫定 | |
| PD-39 | Domain Ownership 優先於 Team Folder Ownership | 落實為 FEATURE.md owner | ADR 0008 |
| PD-40 | 所有跨 Domain 決策需 ADR | 暫定(`/decide`) | |

## 7. 架構原則(五條,不變)

1. **Frontend 不直接依賴 Database**:只依賴 API、契約、shared type。
2. **RAG 是獨立 Domain**:Conversation → Query Understanding → Authorization → Retrieval → Reranking →
   Context Builder → Model Gateway → Citation Builder → Response。禁止 `/chat → vector db → llm`。
3. **Authorization Before Retrieval**:禁止「retrieve everything → generate → hide citation」。
4. **Contract First**:跨組功能 Contract → Mock → 平行開發。
5. **Domain Ownership**:repo 不依 team 分區,服務依 domain 分區。

## 8. Monorepo 佈局

`apps/{web,admin,api,worker-*}`、`packages/*`、`services/<domain>`(各匯出一個 Fastify plugin 註冊進
`apps/api` 單一 process,ADR 0003)、`db/`、`contracts/openapi`、`tests/{e2e,integration,...}`、`docs/`。
新範式加 `features/`(規格)、`tools/`(mutate、contract-equivalence、demo)、`archive/`。

## 9. 原始規格裡沒有的(不要假設它們存在)

- RAG Evaluation Policy(§35)、MVP 驗收指標(§43)——原檔在 §25 截斷。
- 真模型的選型——ADR 0009 逐批定。
- E02 RBAC 的實際資料模型——`02-authorization` 從零定義,走 `/feature`。
