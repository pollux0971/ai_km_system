/**
 * ADR 0008 守門 — 跨資料夾**步驟句子撞名**檢查。
 *
 * 這是 `check-gherkin-dup.ts` 的姊妹檢查,但抓的是不同的病:
 *
 * | | check-gherkin-dup | check-step-dup(本檔) |
 * |---|---|---|
 * | 抓什麼 | 兩個 feature 檔裡**整個場景本體**逐字相同(模板化) | 兩個**能力資料夾**各自定義了**同一句** Given/When/Then |
 * | 為什麼要抓 | 複製貼上的規格等於沒寫規格 | cucumber 對重複的步驟定義會直接報錯,或者更糟——
 *   綁到別人以為的另一個定義 |
 * | 正常情況 | 同一檔內的重複本來就不該有 | **同一個資料夾內**重複沒關係(複用);
 *   出現在**兩個以上**資料夾才算撞名 |
 *
 * 背景:11 個 phase-1 回填即將平行開工,每個 worker 只看得到自己的能力資料夾,
 * 看不到別人正在寫什麼句子。這個撞名必須在合併點(這裡)機械抓到,不能靠 worker
 * 猜。真正共用的句子只准活在 `steps/common.steps.ts`——那是唯一一個「兩個資料夾
 * 都在用,但也定義好了」的安全狀態。
 *
 * ## 正規化規則
 *
 * 把 Gherkin 步驟裡的參數位置換成 `{}`,這樣「Given a user named "alice"」與
 * 「Given a user named "bob"」被視為同一句(cucumber expression 的 `{string}`
 * 兩者都吃得下):
 * - 雙引號字串(含空字串 `""`)→ `{}`
 * - 獨立的數字(含小數)→ `{}`
 * 步驟關鍵字(Given/When/Then/And/But)本身不列入比較——cucumber 也不看關鍵字,
 * `And` 沿用前一步驟的類型,同一句文字换关键字仍是同一個定義。
 *
 * `common.steps.ts` 裡的步驟定義用的是 cucumber expression(`{string}`、`{int}`…),
 * 用同一套 `{}` 正規化比較——這樣「已經在 common 裡定義過」的判斷才會準。
 *
 * ## 分組:什麼算「一個能力資料夾」
 *
 * - `features/<NN-name>/**` → 該 `<NN-name>`(例如 `features/06-retrieval`)
 * - `docs/integration/**` → 整個 `docs/integration`(整合點不是能力,但同樣是
 *   一個獨立的作者群,i1/i2 之間互相複用不算撞名)
 *
 * ## 判定
 *
 * 一句正規化後的句子如果出現在兩個以上分組裡,看它在 `features/steps/*.steps.ts`
 * 底下**被定義了幾次**:
 * - **恰好 1 次** → 合法共用。cucumber 綁定一次、綁得明確,無論那個定義住在
 *   `common.steps.ts` 還是某個能力自己的 steps 檔。
 * - **2 次以上** → **exit 1**。這才是這個檔要抓的病:cucumber 對重複定義直接報錯,
 *   或更糟——綁到別人以為的另一個定義。
 * - **0 次** → 不是這個守門的事。`cucumber-js --strict` 會把 undefined 步驟判紅。
 *
 * ## 2026-09-04:規則從「在不在 common.steps.ts」改成「被定義了幾次」
 *
 * 舊規則用「有沒有寫在 common.steps.ts」當代理指標,它在**兩個方向**都不準:
 *
 * - **假紅**:能力層級的句子本來就該住在該能力的 steps 檔,整合檔(`docs/integration`)
 *   重用它——方向是 integration → capability。這是健康狀態,舊規則卻要求把它搬進
 *   `common.steps.ts`,等於逼所有被整合點用到的能力句子都堆進協調者的檔。
 * - **假綠(舊規則漏掉的洞)**:一句話同時定義在 `common.steps.ts` **和**兩個能力的
 *   steps 檔時,舊規則只看到「它在 common 裡」就判 OK——而那是三個定義,cucumber 會炸。
 *
 * 新規則直接數定義次數,所以它同時修掉這兩個方向。它**不是放寬**:上面第二點是舊規則
 * 過得去、新規則過不去的案例。(PITFALLS 坑 1:守門的斷言要對著不變量,不要對著代理指標。)
 *
 * 用法:`pnpm --filter @ai-km/features steps:dup`(exit 0 = 沒有未收斂的跨資料夾撞名)。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const FEATURES_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(FEATURES_ROOT, "..");
const INTEGRATION_ROOT = resolve(REPO_ROOT, "docs/integration");
const STEPS_DIR = resolve(FEATURES_ROOT, "steps");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (name === "node_modules" || name === "_template" || name === "steps" || name === "scripts") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".feature")) out.push(full);
  }
  return out;
}

/** 一個 feature 檔屬於哪個「作者分組」(能力資料夾,或 docs/integration 整體) */
function groupOf(file: string): string {
  const rel = relative(REPO_ROOT, file).split(/[\\/]/);
  if (rel[0] === "features" && rel[1]) return `features/${rel[1]}`;
  if (rel[0] === "docs" && rel[1] === "integration") return "docs/integration";
  return relative(REPO_ROOT, file);
}

interface StepOccurrence {
  group: string;
  file: string;
  raw: string;
}

/** 把 quoted string / 數字換成 {},關鍵字與空白正規化 */
function normalize(text: string): string {
  return text
    .replace(/"[^"]*"/g, "{}")
    .replace(/\b\d+(?:\.\d+)?\b/g, "{}")
    .replace(/\s+/g, " ")
    .trim();
}

/** 抽出一個 feature 檔裡所有 Given/When/Then/And/But 步驟句(去掉關鍵字) */
function stepsIn(file: string): { raw: string; text: string }[] {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const out: { raw: string; text: string }[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const m = /^(Given|When|Then|And|But)\s+(.*)$/.exec(trimmed);
    if (m) out.push({ raw: trimmed, text: m[2]! });
  }
  return out;
}

/** 一個 steps 檔裡所有 Given(...)/When(...)/Then(...) 的第一個字串參數(cucumber expression pattern) */
function stepPatternsIn(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const patterns: string[] = [];
  const re = /\b(?:Given|When|Then)\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) patterns.push(m[2]!);
  return patterns;
}

/** 正規化後的句子 → 定義它的 steps 檔清單(同一個檔定義兩次也各算一筆) */
function definitionsByPattern(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const name of readdirSync(STEPS_DIR)) {
    if (!name.endsWith(".steps.ts")) continue;
    const file = join(STEPS_DIR, name);
    for (const pattern of stepPatternsIn(file)) {
      const norm = normalizePattern(pattern);
      const list = out.get(norm) ?? [];
      list.push(file);
      out.set(norm, list);
    }
  }
  return out;
}

/** cucumber expression 的 {string}/{int}/{float}/{word}… 換成 {},其餘不動 */
function normalizePattern(pattern: string): string {
  return normalize(pattern.replace(/\{[a-zA-Z]+\}/g, "{}"));
}

const files = [...walk(FEATURES_ROOT), ...walk(INTEGRATION_ROOT)];

const bySentence = new Map<string, StepOccurrence[]>();
for (const file of files) {
  const group = groupOf(file);
  for (const step of stepsIn(file)) {
    const norm = normalize(step.text);
    const list = bySentence.get(norm) ?? [];
    list.push({ group, file, raw: step.raw });
    bySentence.set(norm, list);
  }
}

const definitions = definitionsByPattern();

const crossFolder = [...bySentence.entries()].filter(([, occ]) => new Set(occ.map((o) => o.group)).size > 1);

/** 恰好一個定義(或還沒有定義——那歸 cucumber --strict 管)= 合法共用 */
const covered = crossFolder.filter(([norm]) => (definitions.get(norm) ?? []).length <= 1);
/** 兩個以上的定義 = cucumber 會報錯或綁錯,這才是這個守門要抓的 */
const uncovered = crossFolder.filter(([norm]) => (definitions.get(norm) ?? []).length > 1);

const totalSteps = [...bySentence.values()].reduce((n, l) => n + l.length, 0);
console.log(`step-dup: ${files.length} feature file(s), ${totalSteps} step line(s), ${bySentence.size} distinct normalized sentence(s)`);

if (covered.length > 0) {
  console.log(`\nstep-dup: ${covered.length} sentence(s) shared across folders, each bound by exactly one definition (OK):`);
  for (const [norm, occ] of covered) {
    const groups = [...new Set(occ.map((o) => o.group))];
    const defs = definitions.get(norm) ?? [];
    const where = defs.length === 0 ? "no definition yet — cucumber --strict owns that" : relative(REPO_ROOT, defs[0]!);
    console.log(`  - "${norm}" — ${groups.join(", ")} → ${where}`);
  }
}

if (uncovered.length === 0) {
  console.log("\nstep-dup: PASS — every cross-folder step sentence has exactly one definition.");
  process.exit(0);
}

for (const [norm, occ] of uncovered) {
  const defs = definitions.get(norm) ?? [];
  console.log(`\nstep-dup: sentence used in more than one folder AND defined ${defs.length} times:`);
  console.log(`  sentence: "${norm}"`);
  console.log(`  defined in:`);
  for (const d of defs) console.log(`    - ${relative(REPO_ROOT, d)}`);
  console.log(`  used by:`);
  for (const o of occ) console.log(`    - ${o.group} :: ${relative(REPO_ROOT, o.file)} :: ${o.raw}`);
}
console.log(
  `\nstep-dup: FAIL — ${uncovered.length} step sentence(s) have more than one definition. ` +
    `cucumber will error, or bind to whichever one it saw first. Keep exactly ONE definition: ` +
    `a sentence about one capability lives in that capability's steps file (integration features reuse it); ` +
    `a sentence genuinely shared by several capabilities lives in features/steps/common.steps.ts (coordinator-owned).`,
);
process.exit(1);
