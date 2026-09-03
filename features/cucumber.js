// ADR 0008 — cucumber-js 11 設定。
//
// 頂層的 `export default` 本身就是 "default" profile 的內容,**不要再包一層
// `default: {...}`**——包了會讓 paths/import/tags 全部被忽略,cucumber 安靜退回
// 內建預設值,import 完全不發生,所有 step 變成 undefined,而 dry-run 看起來像
// 「正常的還沒實作」。範式來源專案(llm_learning-cards)踩過這個坑。
// 額外的 profile 用具名 export(例如 `export const ci = {...}`)。
//
// paths 刻意排除 `_template/`:模板的 feature 不是規格,掃到只會產生 undefined 噪音。
export default {
  paths: ['[0-9][0-9]-*/*.feature', '../docs/integration/**/*.feature'],
  import: ['steps/**/*.ts'],
  tags: 'not @manual',
  format: ['progress'],
  strict: true,
};
