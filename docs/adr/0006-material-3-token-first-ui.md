# ADR 0006: Material 3 以 token-first 方式落地，不引入元件庫；素材為純 SVG/CSS

Status: Proposed（使用者 2026-08-28 要求 UI 改為 Google Material 3 style、
善用 tiles 與 M3 pattern、並產生 ASR 聆聽動畫等素材；本 ADR 的視覺假設
列於 `docs/stories/PENDING_DECISIONS.md`，使用者可推翻）

## Context

apps/web 目前是「元素層級 CSS + 少量 layout class」的企業版式
（`apps/web/src/app/globals.css`，755 行；`packages/design-tokens` 為佔位
token）。1531 個單元測試與 264 個 E2E 大量以 `getByRole`／文案／DOM 結構
斷言；若整組換成第三方 M3 元件庫（`@material/web` 已於 2025 進入維護模式；
MUI 仍以 M2 為主），元件 DOM 會大改、測試會大片紅，且 on-prem 環境無法使用
Google Fonts／Material Symbols CDN。

## Decision

1. **Token-first**：以 M3 design token 重建 `globals.css`：color roles
   （`--md-sys-color-*`，light/dark 兩套 scheme）、type scale
   （`--md-sys-typescale-*`）、shape（`--md-sys-shape-corner-*`）、elevation、
   state-layer opacity、motion（easing/duration）。既有 `--primary`、`--bg`、
   `--surface`… 變數**映射到** M3 role（不刪除），讓所有既有元素層級樣式一次
   換膚，元件 DOM 不動。
2. **Scheme 生成**：以 `@material/material-color-utilities` 從種子色產生 tonal
   palette，**於 build/script 階段**輸出靜態 `m3-theme.css`（committed），
   runtime 零依賴。種子色暫定沿用既有品牌藍 `#1e56a0`（ASSUMPTION）。
3. **字型／圖示自託管**：Noto Sans TC（OFL）+ Roboto（Apache-2.0）以
   `next/font/local` 載入；Material Symbols **Outlined** variable font
   （Apache-2.0）自託管，`packages/ui` 提供 `<Icon name="mic" />`
   （ligature）。不使用任何外部 CDN。
4. **Pattern 對應**（本批 story 落地範圍）：
   - App shell：Navigation rail（≥1240px 展開為 drawer）、Top app bar、
     FAB「新對話」、M3 list item 歷史對話、M3 menu 使用者選單。
   - 首頁：快速入口為 **card tiles grid**（filled/elevated card，圖示＋標題
     ＋輔助說明），最近對話為 list tiles。
   - 對話頁：list-detail canonical layout、訊息卡片（user：primary-container
     右對齊；assistant：surface-container 左對齊含頭像）、composer 為 M3
     text field + icon buttons + 麥克風 FAB、知識庫選擇為 filter chips、模式
     切換為 segmented button、狀態提示為 banner/snackbar、引用預覽為
     side sheet。
   - 其餘頁面（knowledge/maintenance/erp/profile/login）以元素層級 token
     映射取得一致性，逐頁不重寫 DOM。
5. **素材**：全部為**原創純 SVG/CSS**（無 Lottie、無外部圖庫），放在
   `apps/web/public/illustrations/`、元件同層 `.css`；動畫尊重
   `prefers-reduced-motion`。ASR 聆聽動畫由 Web Audio 真實音量驅動
   （AnalyserNode RMS），非假動畫。
6. **不變式**：所有 UI story 不得改變既有 accessible name、role、`aria-*`
   與可見文案；jsdom 不套 CSS，單元測試結構上不受影響；E2E 以 role/文案
   定位，理論上不受影響——任何既有測試改動都必須在 EVIDENCE 逐筆記錄。

## Consequences

- apps/admin 不在本批範圍（沿用舊版式），列為後續 story。
- 字型檔（約 10MB woff2）進 git；若日後嫌大再評估 git-lfs。
- 深色模式沿用 `prefers-color-scheme`，不新增手動切換（維持現況範圍）。
