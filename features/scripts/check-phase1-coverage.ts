/**
 * ADR 0008 守門 — **回填覆蓋**檢查:每個存在的能力資料夾都要真的貢獻場景。
 *
 * 為什麼需要這個檔:`cucumber-js --tags '@phase-1'` 在**一個場景都沒選到**的時候
 * 退出碼是 0,輸出是 `0 scenarios`,從外面看跟「全部通過」一模一樣。11 個平行回填
 * 期間這個假綠特別危險——一個 worker 把首行 tag 打錯(`@ingest` 而不是 `@ingestion`)、
 * 或 `cucumber.js` 的 paths glob 漏掉某個資料夾,`accept:phase1` 照樣全綠,而那個
 * 資料夾的 9 個場景**一條都沒跑**。
 *
 * 這是 PITFALLS 的 P-28(掃描器掃到 0 個目標要 FAIL:「這不是很乾淨,是掃描器壞了」)
 * 與坑 2(守門「有沒有被接上」跟守門「會不會紅」是兩件事)在 cucumber 這一層的形態。
 *
 * ## 檢查的性質(不是計數)
 *
 * 對每個**磁碟上存在**的 `features/NN-name/phase-1.feature`:
 *
 *   用它自己的能力 tag(`NN-name` → `@name`,與 `_world.ts` 的 `standaloneKey()`
 *   同一個慣例)單獨跑一次 cucumber,要求退出碼 0 **且**摘要是 `N scenarios (N passed)`
 *   且 N ≥ 1。
 *
 * 斷言對著的是「這個資料夾的場景有沒有被選到並通過」,不是「總共有幾個場景」——
 * 資料夾增加時這個檢查自己長大,不需要有人回來改一個數字(PITFALLS 坑 1:
 * 守門的斷言要對著不變量,不要對著會隨正常演化改變的計數)。
 *
 * 單獨跑:`pnpm --filter @ai-km/features accept:coverage`
 */
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const FEATURES_ROOT = resolve(import.meta.dirname, "..");

/** features/NN-name/ 且底下有 phase-1.feature 的資料夾 */
const folders = readdirSync(FEATURES_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^\d\d-/.test(e.name))
  .map((e) => e.name)
  .filter((name) => existsSync(join(FEATURES_ROOT, name, "phase-1.feature")))
  .sort();

if (folders.length === 0) {
  console.log(
    "phase1-coverage: FAIL — features/ 底下找不到任何 NN-name/phase-1.feature。\n" +
      "  這不是「很乾淨」,是這個掃描器壞了(或 cwd 不對)。掃到 0 個目標一律 FAIL。",
  );
  process.exit(1);
}

/** `06-retrieval` → `@retrieval`(與 _world.ts 的 standaloneKey() 同一個慣例) */
function tagOf(folder: string): string {
  return "@" + folder.replace(/^\d\d-/, "");
}

// `0 scenarios` 沒有括號那半——那正是這個檢查最重要的一種輸入,所以括號整段是選配的。
const SUMMARY = /(\d+) scenarios?(?: \((\d+) passed\))?/;
const failures: string[] = [];

for (const folder of folders) {
  const tag = tagOf(folder);
  const expr = `${tag} and @phase-1 and not @manual and not @e2e`;
  const r = spawnSync("npx", ["cucumber-js", "--tags", expr, "--format", "summary"], {
    cwd: FEATURES_ROOT,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--import=tsx" },
    timeout: 300_000,
  });
  const output = (r.stdout ?? "") + (r.stderr ?? "");
  const m = SUMMARY.exec(output);

  if (r.status !== 0) {
    failures.push(
      `${folder}: 用 tag 「${expr}」單獨跑退出碼 ${r.status}(應為 0)\n` +
        output.trim().split("\n").slice(-20).map((l) => "      " + l).join("\n"),
    );
    continue;
  }
  if (!m) {
    failures.push(`${folder}: 找不到 "N scenarios (N passed)" 摘要行,無法判斷跑了幾個場景\n      輸出尾段:${output.slice(-400)}`);
    continue;
  }
  const total = Number(m[1]);
  const passed = m[2] === undefined ? 0 : Number(m[2]);
  if (total < 1) {
    failures.push(
      `${folder}: phase-1.feature 存在,但用它自己的 tag 「${tag}」選到 0 個場景。\n` +
        `      最可能的原因:feature 檔第一行的能力 tag 不是 ${tag},或 cucumber.js 的 paths 沒涵蓋這個資料夾。\n` +
        `      注意 accept:phase1 在這個狀態下仍然全綠——那正是這個檢查存在的理由。`,
    );
    continue;
  }
  if (passed !== total) {
    failures.push(`${folder}: ${total} 個場景只有 ${passed} 個通過`);
    continue;
  }
  console.log(`phase1-coverage: ${folder.padEnd(26)} ${tag.padEnd(24)} ${total} scenario(s) passed`);
}

if (failures.length > 0) {
  console.log(`\nphase1-coverage: FAIL — ${failures.length}/${folders.length} 個能力資料夾沒通過:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

console.log(
  `\nphase1-coverage: PASS — ${folders.length} 個能力資料夾,每一個用自己的 tag 單獨跑都選到 ≥1 個場景且全數通過。`,
);
