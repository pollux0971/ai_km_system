# VoiceVisualizer — 語音狀態視覺素材(E03-S042)

`apps/web/src/components/voice/voice-visualizer.tsx`(+ `.css`)。純
presentational 元件,依 ADR 0006:不引入 Lottie/第三方圖庫,動畫一律原創
純 SVG/CSS。同層另有 4 個靜態 SVG 圖示於
`apps/web/public/illustrations/voice/`(供文件/空狀態/未來 admin 使用,
與這個活動元件的 inline SVG 分開維護)。

## Props

```ts
type VoiceVisualizerState = "idle" | "listening" | "transcribing" | "error";

interface VoiceVisualizerProps {
  state: VoiceVisualizerState;
  level?: number; // 0–1 mic RMS,只在 state==="listening" 時使用,超界會 clamp
  size?: 40 | 56 | 72; // 預設 56
}
```

`aria-hidden="true"` 恆為真,無可聚焦子元素——語意由 E03-S041 的按鈕與
`aria-live` 區域提供,本元件純視覺。

## 四態 + reduced-motion(五張截圖)

| 狀態 | 截圖 | 說明 |
|---|---|---|
| `idle` | ![idle](voice-visualizer/cell-idle.png) | 圓形 tonal 底(`--md-sys-color-primary-container`,fallback `--primary-soft`)+ 麥克風圖示。 |
| `listening`(level=0.8) | ![listening](voice-visualizer/cell-listening.png) | 外圈 ripple(scale 隨 level 平滑,`transition` 80ms)+ 中央 5 根 equalizer bar(高度依指數平滑後的 level、各 bar 相位偏移)。 |
| `transcribing` | ![transcribing](voice-visualizer/cell-transcribing.png) | M3 風格 contained 旋轉弧(`@keyframes` 1.2s,`cubic-bezier(0.2,0,0,1)`)+ 中央淡化(`opacity:0.6`)麥克風。 |
| `error` | ![error](voice-visualizer/cell-error.png) | `--md-sys-color-error` 底(fallback `--danger`)、圖示變驚嘆徽章、進場一次 shake(200ms)。 |
| `listening` + `prefers-reduced-motion: reduce` | ![listening reduced motion](voice-visualizer/cell-listening-reduced.png) | ripple/5-bar equalizer 改為**單一靜態 bar**,寬度 = `20% + level*80%`(不再是動態 transition/keyframe)。`transcribing` 態同理改為靜態 75° 弧(`vv-arc--static`,見元件原始碼的 `transform: rotate(-45deg)` + 無 `animation`);`error` 的一次性 shake 也一併停用(spec 只明講 ripple/bar 與弧,但 reduced-motion 的一般原則是抑制所有非必要動態,shake 屬於這類,實作上一併套用,見 EVIDENCE 的 assumptions)。 |

截圖產生方式:Playwright 真實 Chromium,`browser.newContext({reducedMotion:
"reduce"})` 驅動 reduced-motion 情境(不是 CSS media query 模擬,是瀏覽器
原生的 `prefers-reduced-motion` 模擬),對一個暫時的(未進 repo)測試頁
逐格截圖;截圖前另外用 `page.$eval` 讀出 `data-reduced` 屬性確認真的是
`"true"`,而不只是碰巧長一樣。過程與存證細節見
`docs/stories/E03-S042.md`。

## Token 對照(fallback chain)

| 狀態 | 用途 | M3 token(E01-S021 後可用) | Fallback(現行 `globals.css`) |
|---|---|---|---|
| idle / transcribing 底色 | 圓形背景 | `--md-sys-color-primary-container` | `--primary-soft` |
| listening / transcribing 前景 | ripple、bar、弧 | `--md-sys-color-primary` | `--primary` |
| error 底色 | 圓形背景 | `--md-sys-color-error` | `--danger` |
| error 前景 | 圖示顏色 | `--md-sys-color-on-error` | `#ffffff`(硬編,spec 未定義對應現行 token,見 EVIDENCE assumptions) |

E01-S021 落地、`--md-sys-color-*` 一旦在 `:root` 定義,本元件不需要任何
修改即可自動改用 M3 色板(CSS `var(--a, var(--b))` fallback chain 的標準
用法)。

## Reduced-motion 行為總表

| 狀態 | 一般 | `prefers-reduced-motion: reduce` |
|---|---|---|
| `listening` | ripple(2 層,transition transform)+ 5-bar equalizer(transition height) | 單一靜態 bar,寬度反映 level,無 transition |
| `transcribing` | `.vv-arc` 持續旋轉(`@keyframes vv-spin` 1.2s) | `.vv-arc--static`,固定 `rotate(-45deg)`(視覺上等同一個 75% 弧的靜止切角),無 animation |
| `error` | 進場 shake 200ms | 無 shake |
| `idle` | 無動態,兩種偏好下 DOM/樣式相同 | 同左 |

判斷依據是 `window.matchMedia("(prefers-reduced-motion: reduce)")`(mount
時讀一次 + `change` 事件訂閱即時更新),不是純 CSS media query——這樣
`data-reduced` 屬性與實際渲染的 class 才能在 jsdom 單元測試中用 fake
`matchMedia` 直接斷言(見 `voice-visualizer.test.tsx` 的 AC4 測試群)。CSS
檔另外也有一份 `@media (prefers-reduced-motion: reduce)` 規則作為防禦性
的第二層(避免 hydrate 前有一瞬間動畫閃現)。

## SVG lint(AC6)

`apps/web/public/illustrations/voice/` 下 4 個檔案(`mic-idle.svg`、
`mic-listening.svg`、`mic-transcribing.svg`、`mic-error.svg`)皆已用
`pnpm dlx svgo --multipass` 處理過(提交的就是 svgo 輸出),逐一確認:
- 無 `<script>`、無外部 URL 參照(`grep -iE "<script|xlink:href=\"http|href=\"http"` 全部無結果)。
- 全部圖形色彩只用 `currentColor`,無硬編色碼。
- `viewBox="0 0 24 24"`,可縮放至 24/48(或任意 CSS `width`/`height`)兩種
  尺寸使用,不需要分開的 24px/48px 檔案。
- 原創幾何圖形(圓角矩形麥克風本體 + 弧形支架),未引用或改作任何既有
  品牌/產品圖示。

活動元件(`voice-visualizer.tsx`)內另外有兩個相同精神、但用 JSX inline
`<svg>` 撰寫的麥克風圖示(`MicIcon`、`MicErrorIcon`)——inline 是必要的,
`<img src="*.svg">` 參照外部檔案無法用 CSS `color` 驅動 `currentColor`
繼承,静态檔案（`public/illustrations/voice/`）與活動元件的 inline SVG
因此故意分開維護,兩者路徑一致但檔案不同。
