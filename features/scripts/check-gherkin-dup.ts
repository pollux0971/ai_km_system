/**
 * ADR 0008 守門 #2:跨資料夾偵測「逐字相同的場景本體」。
 *
 * 舊規格庫的病:E04 46 條 story 只有 12 種內文(36 條完全相同)、E06 40 條只有 2 種。
 * 模板複製貼上看起來像規格,實際上什麼都沒說。這個腳本把同一件事在 Gherkin 上
 * 變成 CI 紅:兩個不同 feature 檔裡出現步驟序列完全相同的場景(忽略場景名與空白)
 * 就 exit 1 並列出來。
 *
 * 允許:同一個檔裡的重複(那是 Scenario Outline 該做的事,但不擋);
 *       `_template/` 的檔案(不掃)。
 *
 * 用法:`pnpm --filter @ai-km/features gherkin:dup`(exit 0 = 無跨檔重複)。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const FEATURES_ROOT = resolve(import.meta.dirname, "..");
const INTEGRATION_ROOT = resolve(FEATURES_ROOT, "../docs/integration");

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

interface ScenarioBody {
  file: string;
  name: string;
  body: string;
}

/** 把一個 feature 檔切成場景,場景本體 = 步驟行(Given/When/Then/And/But + 表格)正規化後串接 */
function scenarios(file: string): ScenarioBody[] {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const result: ScenarioBody[] = [];
  let current: { name: string; steps: string[] } | undefined;
  const flush = () => {
    if (current && current.steps.length > 0) {
      result.push({ file, name: current.name, body: current.steps.join("\n") });
    }
    current = undefined;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const m = /^(Scenario|Scenario Outline|Example):\s*(.*)$/.exec(line);
    if (m) {
      flush();
      current = { name: m[2] ?? "", steps: [] };
      continue;
    }
    if (/^(Feature|Background|Rule):/.test(line)) {
      flush();
      continue;
    }
    if (!current) continue;
    if (/^(Given|When|Then|And|But)\b/.test(line) || line.startsWith("|")) {
      current.steps.push(line.replace(/\s+/g, " "));
    }
  }
  flush();
  return result;
}

const files = [...walk(FEATURES_ROOT), ...walk(INTEGRATION_ROOT)];
const byBody = new Map<string, ScenarioBody[]>();
for (const file of files) {
  for (const s of scenarios(file)) {
    const list = byBody.get(s.body) ?? [];
    list.push(s);
    byBody.set(s.body, list);
  }
}

const crossFileDuplicates = [...byBody.values()].filter((list) => new Set(list.map((s) => s.file)).size > 1);

const repoRoot = resolve(FEATURES_ROOT, "..");
console.log(`gherkin-dup: ${files.length} feature file(s), ${[...byBody.values()].reduce((n, l) => n + l.length, 0)} scenario(s)`);

if (crossFileDuplicates.length === 0) {
  console.log("gherkin-dup: PASS — no scenario body is repeated across feature files.");
  process.exit(0);
}

for (const group of crossFileDuplicates) {
  console.log("\ngherkin-dup: identical scenario body in more than one file:");
  for (const s of group) console.log(`  - ${relative(repoRoot, s.file)} :: ${s.name}`);
  console.log("  body:");
  for (const line of group[0]!.body.split("\n")) console.log(`    ${line}`);
}
console.log(`\ngherkin-dup: FAIL — ${crossFileDuplicates.length} duplicated scenario bod${crossFileDuplicates.length === 1 ? "y" : "ies"} across files. A scenario copied between capabilities is a template, not a spec.`);
process.exit(1);
