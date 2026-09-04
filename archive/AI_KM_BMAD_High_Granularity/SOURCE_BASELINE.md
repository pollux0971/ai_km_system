AI KM Enterprise Platform — Project Master Baseline

«文件名稱：AI_KM_Project_Master_Baseline.md
文件版本：v0.2
文件狀態：Planning Baseline / PRD & Architecture Pre-Handoff
專案類型：企業正式系統
開發模式：Monorepo / Two-Team Collaboration
方法：BMAD-inspired Product → Architecture → Epic → Story → Development → QA
MVP 原則：所有提案功能皆納入第一代，但允許以 Thin Slice 方式實作
最終目標：Enterprise Grade / Production Ready / High Availability / Security & Governance Ready»

---

目錄

1. 專案摘要
2. 產品定位
3. MVP 與最終 GA 策略
4. 產品功能基線
5. 暫定產品決策
6. 問題重要性與訪談順序
7. 使用者與角色
8. 系統核心體驗
9. Monorepo 架構
10. 架構原則
11. Team A / Team B 分工
12. Epic Map
13. Epic Dependency Map
14. E01 Application Shell
15. E02 Identity & RBAC
16. E03 AI Conversation Experience
17. E04 RAG Intelligence
18. E05 Knowledge Management Experience
19. E06 Knowledge Ingestion & Indexing
20. E07 Maintenance Assistant Experience
21. E08 Maintenance Intelligence Backend
22. E09 AI ERP & Reporting Experience
23. E10 Enterprise Data Integration
24. E11 Admin Console
25. E12 Model & Prompt Platform
26. E13 Feedback & Analytics
27. E14 Audit, Security & Observability
28. Story 標準
29. Development Policy
30. Git / PR Policy
31. API Contract Policy
32. Database Policy
33. Feature Flag Policy
34. Testing Policy
35. RAG Evaluation Policy
36. Definition of Ready
37. Definition of Done
38. AI Definition of Done
39. Sprint Roadmap
40. Release Maturity
41. Architecture Decision Records
42. Risk Register
43. MVP 驗收指標
44. GA 目標
45. BMAD Handoff

---

1. 專案摘要

本專案目標為建立一套企業正式使用的 AI Knowledge Management & Work Assistant Platform。

系統整合：

- 企業文件
- SOP
- 規章
- FAQ
- ERP
- MES
- HR
- CRM
- SCM
- PLM
- IoT
- 維修資料
- Email
- 結構化資料
- 非結構化資料
- 地端 LLM
- RAG
- Vector Database

使用者可以透過自然語言：

- 查詢企業知識
- 分析文件
- 查詢 ERP
- 取得資料報表
- 執行設備故障排除
- 追蹤知識來源
- 使用 AI 協助完成工作流程

系統必須具備：

- Enterprise Authentication
- RBAC
- Resource ACL
- Retrieval Authorization
- Audit
- Citation
- Prompt Governance
- Model Governance
- Data Governance
- API Integration
- Observability

---

2. 產品定位

暫定產品定位：

«Enterprise AI Knowledge & Work Assistant Platform»

完整描述：

«一套部署於企業內部，整合企業文件、知識庫、ERP、MES、CRM、維修紀錄與其他結構化資料的企業 AI 工作平台。透過 RAG、RBAC、資料來源引用、模型治理與完整稽核機制，讓企業員工可以安全且可信地取得資訊、分析資料、處理設備問題及執行日常工作。»

---

3. MVP 與最終 GA 策略

本專案不採用：

«MVP = 刪除大量功能»

而採用：

«MVP = 所有核心功能皆存在，但每個功能先完成最小可用 Thin Slice。»

因此：

MVP

要求：

- 所有簡報中的核心功能都有入口
- 所有核心流程可以走通
- 可以進行完整 Demo
- 真實企業情境可進行基本操作
- 核心權限不可省略
- 核心 Audit 不可省略
- 核心 RAG Citation 不可省略

但可以簡化：

- UI
- 自動化程度
- 系統規模
- 高可用
- 多租戶
- 高級模型路由
- 複雜 Data Governance
- AI 自動優化
- 大規模運算調度

---

MVP Maturity

M0 — Walking Skeleton

完成：

Login
→ Chat
→ Retrieval
→ LLM
→ Citation

---

M1 — MVP

所有主要模組都有 Thin Slice：

- Authentication
- RBAC
- Chat
- RAG
- Citation
- File Upload
- Knowledge Base
- ERP Query
- Excel
- Maintenance
- Admin
- Feedback
- Audit
- Model Management
- Prompt Management

---

M2 — Production Ready

強化：

- Security
- Reliability
- Monitoring
- Data Governance
- Versioning
- Approval
- Error Handling
- Performance
- Backup
- Permission Granularity

---

M3 — Enterprise GA

目標：

- HA
- DR
- Large-scale deployment
- Advanced RAG
- Multi-tenant
- Enterprise compliance
- SIEM integration
- DLP
- Advanced ABAC
- Automated model routing
- Enterprise-grade data governance

---

4. 產品功能基線

第一代 MVP 必須包含以下功能。

AI

- AI Chat
- Multi-turn Conversation
- Streaming Response
- RAG
- Citation
- Model Selection
- Model Management
- Prompt Management

Knowledge

- Knowledge Base
- Company KB
- Department KB
- Project KB
- Private KB
- Q&A KB
- File Upload
- Folder Upload
- URL Import
- Text Input
- Folder Sync

File

支援：

- PDF
- DOCX
- PPTX
- XLSX
- CSV
- TXT
- Image
- Web
- Scan PDF

---

Enterprise Data

整合：

- ERP
- MES
- HR
- CRM
- SCM
- PLM
- IoT
- Maintenance

---

Security

- Login
- SSO
- AD
- RBAC
- ACL
- Permission
- Audit
- Sensitive Data Protection

---

Maintenance

- Equipment
- Error Code
- Troubleshooting
- Decision Tree
- SOP
- Maintenance History
- Case Summary

---

ERP AI

- Natural Language Query
- Structured Result
- Table
- KPI
- Chart
- Excel Export
- Prediction
- Data Freshness

---

Admin

- User
- Role
- Department
- Group
- KB
- Prompt
- Model
- Connector
- Audit
- Feedback
- Monitoring

---

5. 暫定產品決策

以下作為 PRD baseline。

若未來沒有被 Product Owner 推翻，皆視為有效。

1. 系統主要服務企業內部員工。
2. 提供一般模式與進階模式。
3. 支援 SSO。
4. 保留 Local Break-glass Account。
5. 使用 RBAC + Resource ACL。
6. Permission Conflict 預設 Deny Wins。
7. Retrieval 前必須完成 Authorization。
8. 無權限資料不得送入 LLM。
9. 無權限來源不得出現在 Citation。
10. 企業知識回答預設需要 Citation。
11. 無足夠資料時 AI 必須 Abstain。
12. 同 Conversation 支援 Multi-turn Memory。
13. MVP 不做跨 Conversation 永久 AI Memory。
14. 文件必須有 Version。
15. 文件更新需 Reindex。
16. 文件刪除需同步刪除 Vector Index。
17. MVP 支援主要企業文件格式。
18. OCR 支援中文與英文。
19. ERP MVP 預設 Read-only。
20. AI SQL 僅允許 SELECT。
21. SQL 僅允許 Whitelist View。
22. SQL 執行需 Audit。
23. 高風險維修操作必須顯示 Warning。
24. 高風險維修操作必須提供 SOP Citation。
25. 維修結果不得直接變正式 Knowledge。
26. Knowledge Feedback 需 Human Approval。
27. Prompt 必須 Versioned。
28. Model 呼叫必須經過 Model Gateway。
29. 外部 Cloud LLM 預設關閉。
30. 第一優先部署策略為地端或 Private Environment。
31. 所有敏感操作必須 Audit。
32. Feature 可以 MVP 簡化，但不能完全消失。
33. 最終 GA 以 Enterprise Highest-grade 作為方向。
34. Backend 與 RAG 核心主要由 Team B 負責。
35. Team A 不等待 Backend 完成才開始。
36. API 採 Contract-first。
37. Team A 可建立 BFF，但不能繞過 Domain Service。
38. Monorepo 不依 Team 分資料夾。
39. Domain Ownership 優先於 Team Folder Ownership。
40. 所有跨 Domain 決策需 ADR。

---

6. 問題重要性與訪談順序

Priority

P0

若未決定，可能：

- 架構重做
- 資料外洩
- 開發阻塞
- UAT 失敗
- 無法上線

---

P1

重要 UX、營運或管理決策。

---

P2

優化型決策。

---

建議回答順序

1. Product Goal
2. User / Role
3. Authentication / Permission
4. AI Chat
5. RAG
6. Knowledge Lifecycle
7. Maintenance
8. ERP
9. Admin
10. Security
11. Infrastructure
12. UAT
13. GA

---

7. 使用者與角色

初步角色：

General User

一般企業員工。

---

Department Manager

管理：

- 部門 KB
- 部門使用者
- 部門 Knowledge

---

Knowledge Manager

管理：

- Knowledge
- Document
- FAQ
- Feedback
- Knowledge Quality

---

Maintenance Engineer

使用：

- Maintenance Assistant
- SOP
- Error Code
- Troubleshooting

---

Sales / Purchasing

使用：

- ERP Assistant
- Data Query
- Excel

---

IT Administrator

管理：

- Account
- SSO
- Connector
- System

---

AI Administrator

管理：

- Model
- Prompt
- Evaluation
- RAG

---

Auditor

查看：

- Audit
- Security Event

---

Super Administrator

最高系統權限。

---

8. 系統核心體驗

核心 Experience：

User Login
→ Home
→ Select Task
→ Ask Question
→ Select / Auto-select Knowledge
→ Retrieve Authorized Data
→ Generate Answer
→ Show Citation
→ User Verify
→ OK / NG
→ Feedback Loop

---

9. Monorepo Architecture

建議：

ai-km/
│
├── apps/
│   ├── web/
│   ├── admin/
│   ├── api/
│   ├── worker-ingestion/
│   ├── worker-rag/
│   └── worker-sync/
│
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
│
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
│
├── db/
│   ├── migrations/
│   ├── seeds/
│   ├── schemas/
│   └── views/
│
├── contracts/
│   ├── openapi/
│   ├── events/
│   ├── permissions/
│   └── data-contracts/
│
├── infra/
│   ├── docker/
│   ├── kubernetes/
│   ├── observability/
│   └── scripts/
│
├── docs/
│   ├── adr/
│   ├── architecture/
│   ├── api/
│   ├── product/
│   ├── runbooks/
│   └── security/
│
└── tests/
    ├── e2e/
    ├── integration/
    ├── performance/
    ├── security/
    └── rag-evaluation/

---

10. Architecture Principles

Principle 1 — Frontend 不直接依賴 Database

Frontend 只依賴：

- API
- API Contract
- Shared Type

不能依賴：

- DB Table
- Vector Schema
- Embedding internals

---

Principle 2 — RAG 是獨立 Domain

禁止：

/chat
→ vector db
→ llm

標準：

Conversation
↓
Query Understanding
↓
Authorization
↓
Retrieval
↓
Reranking
↓
Context Builder
↓
Model Gateway
↓
Citation Builder
↓
Response

---

Principle 3 — Authorization Before Retrieval

禁止：

Retrieve everything
→ Generate
→ Hide citation

必須：

User
↓
Permission Scope
↓
Allowed Knowledge
↓
Retrieval
↓
LLM

---

Principle 4 — Contract First

跨組功能：

Contract
→ Mock
→ Frontend / Backend parallel development

---

Principle 5 — Domain Ownership

Repo 不依 Team 分區。

服務依 Domain 分區。

---

11. Team 分工

Team A — Experience & Application

主要負責：

- Web
- Admin UI
- UX
- Frontend
- BFF
- Vertical Application
- E2E
- Maintenance UX
- ERP UX

Epic：

- E01
- E03
- E05
- E07
- E09
- E11
- E13

---

Team B — Data & Intelligence Platform

主要負責：

- Database
- Backend Core
- RAG
- Vector DB
- Ingestion
- Authorization Engine
- Model Gateway
- Connector
- Audit Core

Epic：

- E02
- E04
- E06
- E08
- E10
- E12
- E14

---

12. Epic Map

Epic| 名稱| Owner
E01| Application Shell & Workspace| Team A
E02| Identity, RBAC & Authorization| Team B
E03| AI Conversation Experience| Team A
E04| RAG & Conversation Intelligence| Team B
E05| Knowledge Management Experience| Team A
E06| Knowledge Ingestion & Indexing| Team B
E07| Maintenance Assistant Experience| Team A
E08| Maintenance Intelligence Backend| Team B
E09| AI ERP & Reporting Experience| Team A
E10| Enterprise Data Integration| Team B
E11| Admin Console| Team A
E12| Model & Prompt Platform| Team B
E13| Feedback & Analytics| Team A
E14| Audit, Security & Observability| Team B

---

13. Dependency Map

E01
└─ E02

E03
├─ E02
└─ E04
   ├─ E02
   ├─ E06
   └─ E12

E05
└─ E06

E07
└─ E08
   └─ E04

E09
└─ E10
   └─ E02

E11
├─ E02
├─ E10
├─ E12
└─ E14

E13
├─ E03
└─ E04

E14
← all epics

---

14. E01 — Application Shell & User Workspace

Owner：Team A

E01-S01 Login Page

建立登入 UI。

Acceptance：

- Local Login
- SSO button
- Loading
- Invalid Credential
- Disabled Account
- Service Error

---

E01-S02 Redirect After Login

登入後回原頁。

---

E01-S03 Application Layout

包含：

- Sidebar
- Header
- Main Content
- User Menu

---

E01-S04 Permission-aware Navigation

依權限顯示 Menu。

---

E01-S05 Home Dashboard

顯示：

- Recent Chat
- Knowledge
- Maintenance
- ERP
- Favorites

---

E01-S06 User Profile

顯示：

- Name
- Email
- Department
- Role
- Group

---

E01-S07 Loading Pattern

統一 Loading UX。

---

E01-S08 Error Pattern

統一：

401 / 403 / 404 / 409 / 422 / 429 / 500

---

E01-S09 Empty State

定義所有 Empty State。

---

E01-S10 Notification Center

系統通知中心。

---

E01-S11 Feature Flag UI

未啟用 Feature 不顯示。

---

E01-S12 Responsive Layout

支援主要 Desktop Resolution。

GA：

Tablet / Mobile optimization。

---

15. E02 — Identity, RBAC & Authorization

Owner：Team B

E02-S01 User Entity

User

---

E02-S02 Organization Entity

---

E02-S03 Department Entity

---

E02-S04 Group Entity

---

E02-S05 Role Entity

---

E02-S06 Permission Entity

格式：

resource:action

---

E02-S07 Membership

使用者可屬於：

- Department
- Group
- Project

---

E02-S08 Local Authentication

---

E02-S09 Password Hashing

---

E02-S10 Password Reset

---

E02-S11 Account Disable

---

E02-S12 SSO Abstraction

IdentityProvider

---

E02-S13 OIDC Support

---

E02-S14 AD / LDAP Adapter

---

E02-S15 RBAC Engine

---

E02-S16 Resource ACL

Scope：

PUBLIC
ORGANIZATION
DEPARTMENT
GROUP
PROJECT
USER
PRIVATE

---

E02-S17 Deny Wins

Permission Conflict：

Deny > Allow

---

E02-S18 Authorization API

標準：

can(user, action, resource)

---

E02-S19 Knowledge Authorization

---

E02-S20 Document Authorization

---

E02-S21 ERP Authorization

---

E02-S22 Retrieval Authorization

Metadata：

tenant_id
knowledge_id
document_id
department_id
acl_groups[]
visibility
version
status

---

E02-S23 Permission Cache

需避免 stale permission。

---

E02-S24 Permission Audit

---

E02-S25 Permission Test Matrix

至少測試：

- role
- department
- group
- individual
- deny
- revoked

---

16. E03 — AI Conversation Experience

Owner：Team A

E03-S01 New Conversation

---

E03-S02 Conversation Mode

支援：

- Normal
- Advanced

---

E03-S03 Knowledge Selector

---

E03-S04 Multi Knowledge Selection

---

E03-S05 Model Selector

Advanced mode。

---

E03-S06 Message Composer

---

E03-S07 Multi-line Input

---

E03-S08 File Attachment

---

E03-S09 Send Message

---

E03-S10 Streaming Response

---

E03-S11 Generation Status

顯示：

- Searching
- Reading
- Generating

---

E03-S12 Stop Generation

---

E03-S13 Citation Badge

例如：

[1]

---

E03-S14 Citation Preview

顯示：

- File
- Page
- Snippet

---

E03-S15 Citation Open Source

---

E03-S16 Citation Permission Error

---

E03-S17 Multi-turn Conversation

---

E03-S18 Conversation Context

---

E03-S19 Regenerate Answer

---

E03-S20 Answer Revision

需留下 Revision。

---

E03-S21 Answer State

ANSWERED
PARTIAL
NO_EVIDENCE
ERROR
PERMISSION_DENIED
SOURCE_UNAVAILABLE

---

E03-S22 Conversation History

---

E03-S23 Conversation Search

---

E03-S24 Rename Conversation

---

E03-S25 Delete Conversation

---

E03-S26 Archive Conversation

---

E03-S27 Copy Answer

---

E03-S28 File Chat

---

E03-S29 File Processing Status

---

E03-S30 No Evidence UX

顯示：

«找不到足夠企業資料支持此答案。»

---

17. E04 — RAG & Conversation Intelligence

Owner：Team B

E04-S01 Conversation Entity

---

E04-S02 Message Entity

---

E04-S03 Generation Entity

---

E04-S04 Citation Entity

---

E04-S05 Query Normalization

---

E04-S06 Query Intent

解析：

- knowledge
- ERP
- maintenance
- file
- general

---

E04-S07 Entity Extraction

---

E04-S08 Time Range Extraction

---

E04-S09 Authorization Scope Builder

---

E04-S10 Query Embedding

---

E04-S11 Vector Retrieval

---

E04-S12 Keyword Retrieval

---

E04-S13 Hybrid Retrieval

---

E04-S14 Retrieval Merge

---

E04-S15 Deduplication

---

E04-S16 Reranking

MVP：

Basic。

GA：

Dedicated reranker。

---

E04-S17 Context Packing

控制：

- Token Budget
- Duplicate
- Source Diversity

---

E04-S18 Prompt Assembly

---

E04-S19 Model Gateway Request

---

E04-S20 Grounded Generation

---

E04-S21 Abstention

---

E04-S22 Citation Mapping

Answer Span
→ Chunk
→ Document
→ Page
→ Version

---

E04-S23 Source Validation

---

E04-S24 Conversation Memory

MVP：

Same Conversation only。

---

E04-S25 Retrieval Trace

---

E04-S26 RAG Error Handling

---

E04-S27 RAG Timeout

---

E04-S28 Evaluation Dataset

格式：

{
  "question": "",
  "role": "",
  "expected_sources": [],
  "forbidden_sources": [],
  "expected_facts": [],
  "must_abstain": false
}

---

E04-S29 Retrieval Evaluation

---

E04-S30 Citation Evaluation

---

E04-S31 Authorization Leak Evaluation

要求：

Leak Rate = 0

---

18. E05 — Knowledge Management Experience

Owner：Team A

E05-S01 Knowledge List

E05-S02 Knowledge Search

E05-S03 Create KB

E05-S04 Edit KB

E05-S05 KB Detail

E05-S06 KB Permission

E05-S07 KB Members

E05-S08 KB Prompt

E05-S09 KB Model

E05-S10 KB Document List

E05-S11 Upload Single File

E05-S12 Upload Multiple Files

E05-S13 Upload Folder

E05-S14 URL Import

E05-S15 Text Knowledge

E05-S16 Folder Sync Setup

E05-S17 Upload Progress

E05-S18 Parse Progress

E05-S19 Index Progress

E05-S20 Processing Failure

E05-S21 Retry Processing

E05-S22 Document Preview

E05-S23 Document Metadata

E05-S24 Document Version

E05-S25 Archive Document

E05-S26 Delete Document

E05-S27 Document Permission

E05-S28 KB Usage Stats

Document State：

DRAFT
UPLOADING
PARSING
INDEXING
READY
FAILED
ARCHIVED

---

19. E06 — Knowledge Ingestion & Indexing

Owner：Team B

E06-S01 Upload API

E06-S02 Object Storage

E06-S03 MIME Validation

E06-S04 Size Validation

E06-S05 Checksum

E06-S06 Duplicate Detection

E06-S07 Antivirus Hook

E06-S08 PDF Parser

E06-S09 DOCX Parser

E06-S10 PPTX Parser

E06-S11 XLSX Parser

E06-S12 CSV Parser

E06-S13 TXT Parser

E06-S14 Image Parser

E06-S15 OCR

E06-S16 Chinese OCR

E06-S17 English OCR

E06-S18 URL Ingestion

E06-S19 HTML Extraction

E06-S20 Folder Sync

E06-S21 Parsing Pipeline

E06-S22 Chunking

E06-S23 Configurable Chunk Strategy

E06-S24 Chunk Metadata

E06-S25 Embedding

E06-S26 Embedding Version

E06-S27 Vector Write

E06-S28 Index Idempotency

E06-S29 Reindex

E06-S30 Document Version

E06-S31 Active Version

E06-S32 Archive Version

E06-S33 Delete Propagation

E06-S34 Failed Job Retry

E06-S35 Worker Queue

E06-S36 Processing Metrics

文件刪除流程：

DB
→ Object Storage
→ Vector DB
→ Search Index

---

20. E07 — Maintenance Assistant Experience

Owner：Team A

E07-S01 Maintenance Home

E07-S02 Select Equipment

E07-S03 Enter Serial Number

E07-S04 Error Code Search

E07-S05 Problem Description

E07-S06 Diagnostic Session

E07-S07 Current Step

E07-S08 Decision Options

E07-S09 Free-text Detail

E07-S10 Back

E07-S11 Restart

E07-S12 Skip Step

E07-S13 Upload Photo

E07-S14 AI Explain Step

E07-S15 SOP Citation

E07-S16 Safety Warning

E07-S17 Confirmation

E07-S18 Escalation

E07-S19 Completion Summary

E07-S20 Maintenance History

E07-S21 Case Detail

E07-S22 Maintenance Report

E07-S23 Knowledge Candidate

---

21. E08 — Maintenance Intelligence Backend

Owner：Team B

Entities：

Equipment
EquipmentModel
ErrorCode
DecisionTree
DecisionNode
DecisionEdge
DecisionSession
DecisionEvent
MaintenanceRecord

Stories：

E08-S01 Equipment Model

E08-S02 Equipment Instance

E08-S03 Error Code

E08-S04 Error Code Search

E08-S05 Decision Tree

E08-S06 Decision Node

E08-S07 Decision Edge

E08-S08 Session Create

E08-S09 Session State

E08-S10 Node Transition

E08-S11 Previous Step

E08-S12 Restart

E08-S13 Validation Rule

E08-S14 Warning Rule

E08-S15 SOP Link

E08-S16 RAG Explanation

E08-S17 Maintenance Record

E08-S18 Completion

E08-S19 Escalation

E08-S20 Knowledge Candidate

E08-S21 Human Approval

E08-S22 Maintenance Writeback Adapter

Session State：

OPEN
IN_PROGRESS
RESOLVED
ESCALATED
CANCELLED

---

22. E09 — AI ERP & Reporting Experience

Owner：Team A

E09-S01 ERP Assistant Home

E09-S02 Natural Language Query

E09-S03 Query Scenario Selector

E09-S04 Clarification UI

E09-S05 Query Confirmation

E09-S06 Loading

E09-S07 Text Summary

E09-S08 Result Table

E09-S09 Pagination

E09-S10 KPI Card

E09-S11 Chart

E09-S12 Filter Display

E09-S13 Data Freshness

E09-S14 Source System

E09-S15 Query History

E09-S16 Excel Export

E09-S17 Export Progress

E09-S18 Prediction Scenario

E09-S19 Prediction Result

E09-S20 Prediction Disclaimer

E09-S21 ERP Error UX

---

23. E10 — Enterprise Data Integration

Owner：Team B

Connector Interface：

authenticate()
healthCheck()
query()
sync()

Stories：

E10-S01 Connector Framework

E10-S02 Connector Registry

E10-S03 Connector Credential

E10-S04 Health Check

E10-S05 ERP Connector

E10-S06 MES Connector

E10-S07 CRM Connector

E10-S08 HR Connector

E10-S09 SCM Connector

E10-S10 PLM Connector

E10-S11 IoT Connector

E10-S12 Generic REST Connector

E10-S13 Database View Connector

E10-S14 Query Authorization

E10-S15 Semantic Query Layer

E10-S16 Sales Query

E10-S17 Inventory Query

E10-S18 Customer Query

E10-S19 Maintenance Query

E10-S20 SQL Generator

E10-S21 SQL Guard

E10-S22 SELECT Only

E10-S23 Whitelist View

E10-S24 Row Limit

E10-S25 Query Timeout

E10-S26 SQL Audit

E10-S27 Dataset API

E10-S28 Excel Dataset

E10-S29 Sync Scheduler

E10-S30 Manual Sync

E10-S31 Retry

E10-S32 Connector State

E10-S33 Stale Data Warning

Connector State：

HEALTHY
DEGRADED
FAILED
DISABLED

---

24. E11 — Admin Console

Owner：Team A

E11-S01 Admin Dashboard

E11-S02 User List

E11-S03 User Detail

E11-S04 Create User

E11-S05 Disable User

E11-S06 Role List

E11-S07 Role Editor

E11-S08 Permission Matrix

E11-S09 Department

E11-S10 Group

E11-S11 Knowledge Admin

E11-S12 Prompt Admin

E11-S13 Model Admin

E11-S14 Connector Admin

E11-S15 Audit Viewer

E11-S16 Feedback Queue

E11-S17 Feedback Detail

E11-S18 Document Failure Queue

E11-S19 Retry Processing

E11-S20 Settings

E11-S21 Usage Dashboard

E11-S22 System Health

Dashboard：

DAU
questions
latency
OK/NG
failed ingestion
connector errors
GPU usage
model status

---

25. E12 — Model & Prompt Platform

Owner：Team B

E12-S01 Model Registry

E12-S02 Model Version

E12-S03 Provider

E12-S04 Capability

E12-S05 Model Status

E12-S06 Model Gateway

E12-S07 Text Generation

E12-S08 Vision Generation

E12-S09 Model Selection

E12-S10 Manual R