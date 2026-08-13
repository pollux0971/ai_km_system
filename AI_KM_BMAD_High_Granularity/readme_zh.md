# AI KM Enterprise Platform

企業級 AI Knowledge Management & Work Assistant Platform 的完整 BMAD 開發基線與高細粒度 Story Pack。

本專案採用 **Monorepo + Two-Team Collaboration + Contract-First** 開發模式。第一代 MVP 不刪除核心功能，而是讓所有主要功能先完成可運作的 Thin Slice，再逐步強化至 Production Ready 與 Enterprise Grade。

## 專案目標

平台整合企業文件、知識庫、ERP、MES、HR、CRM、SCM、PLM、IoT、維修資料與其他結構化／非結構化資料，提供：

- AI Chat 與多輪對話
- RAG 與來源引用
- Knowledge Base 與文件生命週期
- 文件上傳、解析、OCR、Embedding 與索引
- 維修診斷與 SOP 輔助
- ERP 自然語言查詢、報表與 Excel 匯出
- Model / Prompt Management
- Admin Console
- Feedback / Analytics
- Authentication、RBAC、ACL、Retrieval Authorization
- Audit、Security、Observability
- Enterprise Connector Framework

## 開發原則

1. **所有核心功能都必須進入 MVP。** MVP 可以簡化深度，但不能讓功能完全消失。
2. **Authorization Before Retrieval。** 未授權資料不得進入 Retrieval、LLM Context、Citation、Export、Log 或 Analytics。
3. **Deny Wins。** 權限衝突時拒絕優先。
4. **Contract First。** 跨 Team、跨 Domain 開發先確定 Contract，再平行實作。
5. **Frontend 不直接存取 Database / Vector DB。**
6. **RAG 是獨立 Domain。**
7. **Domain Ownership 優先於 Team Folder Ownership。**
8. **敏感操作必須 Audit。**
9. **Story 必須有自動化驗證證據才能 Done。**
10. **AI 開發代理不得自行發明不存在的 API、Table、Queue、Provider 或 Service。**

# 團隊分工

專案分為 Team A 與 Team B。Repository **不按照 Team 分資料夾**，而按照 Application、Package、Service、Contract、Database、Infrastructure 等 Domain 組織。

## Team A — Experience & Application

Team A 主要負責使用者直接接觸的產品體驗、Application Layer 與前端整合。

### 負責 Epic

| Epic | 名稱 |
|---|---|
| E01 | Application Shell & User Workspace |
| E03 | AI Conversation Experience |
| E05 | Knowledge Management Experience |
| E07 | Maintenance Assistant Experience |
| E09 | AI ERP & Reporting Experience |
| E11 | Admin Console |
| E13 | Feedback & Analytics |

### 主要責任

- Web Application
- Admin UI
- UX / Interaction
- Frontend Architecture
- Shared UI Components
- Application State
- BFF（需要時）
- AI Chat Experience
- Citation Experience
- Knowledge Management UI
- Maintenance Assistant UI
- ERP / Reporting UI
- Feedback / Analytics UI
- Application-level E2E
- Error / Loading / Empty / Permission UX

Team A 可以建立 Mock Server、Contract-compatible Mock 或 BFF 來避免等待 Team B，但 **不得繞過 Domain Service、Authorization 或正式 Contract**。

---

## Team B — Data & Intelligence Platform

Team B 主要負責企業資料、Backend Core、AI Intelligence、RAG、Security 與平台基礎能力。

### 負責 Epic

| Epic | 名稱 |
|---|---|
| E02 | Identity, RBAC & Authorization |
| E04 | RAG & Conversation Intelligence |
| E06 | Knowledge Ingestion & Indexing |
| E08 | Maintenance Intelligence Backend |
| E10 | Enterprise Data Integration |
| E12 | Model & Prompt Platform |
| E14 | Audit, Security & Observability |

### 主要責任

- Database
- Backend Core
- Authentication
- RBAC / Resource ACL
- Authorization Engine
- Retrieval Authorization
- RAG Pipeline
- Vector Database
- Embedding / Reranking
- Citation Mapping
- Ingestion / Parsing / OCR
- Worker / Queue
- Model Gateway
- Prompt Platform
- Enterprise Connectors
- ERP Semantic Query
- SQL Guard
- Maintenance Intelligence
- Audit Core
- Security
- Observability

# 兩組如何平行開發

兩組不應採用「Team B 做完 Backend → Team A 才開始 Frontend」的瀑布流程。

標準流程：

```text
需求 / Story
    ↓
Contract 定義
    ↓
Schema + Error Model + Permission Model
    ↓
Contract Freeze
    ↓
┌───────────────────┬────────────────────┐
│ Team A            │ Team B             │
│ UI / Application  │ Backend / Domain   │
│ Mock / Typed API  │ DB / Service / RAG │
└───────────────────┴────────────────────┘
    ↓
Integration
    ↓
E2E / Security / RAG Evaluation
    ↓
Story Done
```

每一個跨組功能應遵守：

1. 先建立 API / Event / Data Contract。
2. 定義 Request、Response、Error、Permission 與 State。
3. Team A 使用 Typed Client / Mock 開發。
4. Team B 實作真正 Domain Service。
5. Contract Test 確認兩側一致。
6. Integration Test 換掉 Mock。
7. E2E 驗證真實流程。
8. Security Test 驗證未授權路徑。
9. 有 AI/RAG 的功能再執行 RAG Evaluation。
10. 保存完成證據後才能標記 Done。

# 建議第一條 Vertical Slice

優先把最短但完整的企業 AI 路徑跑通：

```text
E02 Authentication / Authorization
        ↓
E01 Login + Application Shell
        ↓
E06 Single PDF Ingestion
        ↓
E04 Authorized Retrieval
        ↓
E12 Local Model Gateway
        ↓
E04 Citation Mapping
        ↓
E03 Chat + Streaming + Citation UI
        ↓
E14 Audit + Observability
```

完成後應能做到：

```text
Login
→ Upload Document
→ Parse / Index
→ Ask Question
→ Authorization
→ Retrieve
→ Generate
→ Citation
→ Display Answer
→ Audit
```

這條路徑是後續所有 Knowledge、Maintenance、ERP 與 Admin 功能的共同基礎。

# Monorepo

```text
ai-km/
├── apps/
│   ├── web/
│   ├── admin/
│   ├── api/
│   ├── worker-ingestion/
│   ├── worker-rag/
│   └── worker-sync/
├── packages/
│   ├── ui/
│   ├── design-tokens/
│   ├── auth-client/
│   ├── api-client/
│   ├── types/
│   ├── config/
│   ├── logger/
│   ├── validation/
│   ├── permissions/
│   └── testing/
├── services/
│   ├── identity/
│   ├── conversation/
│   ├── knowledge/
│   ├── ingestion/
│   ├── retrieval/
│   ├── generation/
│   ├── model-gateway/
│   ├── connector/
│   ├── maintenance/
│   ├── reporting/
│   ├── feedback/
│   ├── audit/
│   └── notification/
├── db/
├── contracts/
├── infra/
├── docs/
└── tests/
```

# Atomic Story 與開發邊界

本專案以 **Atomic Story** 作為實際開發與 Agent 執行單位，而不是把 Feature Heading 直接當作可實作 Story。

每個 Atomic Story 都明確定義：

- In Scope / Out of Scope
- Domain Ownership Boundary
- API / Contract Boundary
- Database Boundary
- Security Boundary
- AI / RAG Boundary
- Frontend / BFF Boundary
- Worker / Async Boundary
- Audit / Observability Boundary
- Testing Boundary
- Failure / Fallback Boundary
- Completion Boundary
- Non-Goals

核心原則是：**Developer 或 AI Agent 不應需要靠猜測才能知道「可以改什麼、不能改什麼、何時必須停下來」。**

詳細共同規則見 `policies/ATOMIC_STORY_BOUNDARIES.md`。

# Story 執行方式

本開發包將工作拆成高細粒度 Atomic Stories。

建議一次只交給 Developer / Coding Agent **一個 Story**，同時提供：

- Story 本身
- 直接 Dependency
- API / Event Contract
- 相關 ADR
- 相關 Source Code
- Existing Tests
- Required Test Gates

不要把整個 Epic 一次交給單一 Coding Agent 自主實作。

Story 若符合以下任一條件，應再次拆分：

- 同時包含多個獨立使用者能力
- 同時修改多個無直接關係 Domain
- 有多個彼此獨立的成功條件
- 無法用一組清楚 Acceptance Tests 驗證
- 預估需要超過約 2 developer-days
- Agent 必須自行推測大量未提供的架構資訊才能完成

# Definition of Done

Story 至少必須通過：

```text
Typecheck
→ Lint
→ Unit Test
→ Contract Test
→ Integration Test
→ Security Negative Test
→ Critical E2E
→ Evidence Review
```

RAG Story 額外要求：

```text
Retrieval Evaluation
Citation Evaluation
Abstention Evaluation
Authorization Leak Evaluation
```

其中 Unauthorized / Forbidden Source Leak 必須為 **0**。

# 目錄說明

```text
AI_KM_BMAD_High_Granularity/
├── README.md
├── README_ZH.md
├── SOURCE_BASELINE.md
├── epics/
│   ├── E01_...
│   ├── E02_...
│   └── E14_...
├── planning/
│   ├── TEAM_PLAN.md
│   └── TRACEABILITY.md
├── policies/
│   ├── DEVELOPMENT_POLICY.md
│   └── TESTING_POLICY.md
└── prompts/
    └── STORY_EXECUTION_PROMPT.md
```

## 文件使用順序

建議 Product / Architect 先閱讀本 README 與 `planning/`，Developer 依序讀取指定 Story、Contract 與 ADR，QA 則依 Story Acceptance Criteria、Testing Policy 與 Security/RAG Gate 驗證。

本文件與 Story Pack 應視為專案的完整開發基線；任何 Scope、Contract、Security Boundary 或 Domain Ownership 的重大變更，都應先更新對應文件，再進入實作。
