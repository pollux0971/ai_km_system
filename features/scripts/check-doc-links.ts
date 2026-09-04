/**
 * 文件重構工單反向驗證退回後補的守門:掃描 `docs/`、`features/`、根目錄
 * `README.md`、`CLAUDE.md`、`.claude/` 裡的**相對 markdown 連結**,目標檔案／
 * 目錄不存在就列出來並 `exit 1`。
 *
 * 背景(2026-09-04,docs-archive-restructure 分支的技術顧問覆核):agent 原本
 * 用一個只存在於 scratchpad、寫死兩條路徑存在性檢查的腳本做反向驗證,
 * 顧問自己掃過 `docs/`「何時讀哪份」那張表後發現裡面**沒有一條是真的 markdown
 * 連結**(全是反引號提檔名)——所以 repo 裡當時**沒有任何東西**會因為
 * `archive/README.md` 消失而變紅。本檔與 `docs/README.md` 表格改成真連結
 * 兩件事必須一起做,守門才有牙齒。
 *
 * ## 排除
 *
 * - `archive/`、`node_modules/` 底下的檔案不當**掃描來源**(它們是凍結歷史,
 *   內部連結原樣保留);但活文件連到 `archive/` 底下的目標,存在性照樣檢查。
 * - 外部連結(有 `://` 的 scheme、`mailto:`、`tel:`)與純錨點(`#foo`)不算
 *   「相對連結」,不檢查。
 *
 * ## 「掃到 0 條也要失敗」
 *
 * 一個掃描器找不到任何連結可掃,和「連結全部正常」的 exit code 一模一樣——
 * 這正是本次退回要修的那種病的另一面(嵌入版本檢查的 typecheck 在載入 26 個
 * 檔案和一個都沒載入時 exit code 相同)。所以掃到的相對連結數必須 > 0,
 * 否則本身視為 FAIL(掃描器壞了,不是文件很乾淨)。
 *
 * 用法:`pnpm --filter @ai-km/features docs:links`(exit 0 = 有掃到連結、全部
 * 存在);也掛進 `pnpm --filter @ai-km/features test` 與 root 的 `pnpm docs:links`。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** 個別檔案(不是整個目錄)也要掃 */
const ROOT_FILES = ["README.md", "CLAUDE.md"];
/** 整個目錄樹都要掃(遞迴,排除 archive/node_modules) */
const ROOT_DIRS = ["docs", "features", ".claude"];

const EXCLUDED_DIR_NAMES = new Set(["archive", "node_modules", ".git"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (EXCLUDED_DIR_NAMES.has(name)) continue;
    const full = join(dir, name);
    let isDir: boolean;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) walk(full, out);
    else if (name.endsWith(".md") || name.endsWith(".mdx")) out.push(full);
  }
  return out;
}

const files: string[] = [];
for (const f of ROOT_FILES) {
  const full = join(REPO_ROOT, f);
  if (existsSync(full)) files.push(full);
}
for (const d of ROOT_DIRS) {
  walk(join(REPO_ROOT, d), files);
}

/** `[text](target)` — also matches image syntax `![alt](target)`, which is fine: a broken
 *  image reference is the same class of problem as a broken doc link. */
const LINK_RE = /\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function isExternalOrAnchor(target: string): boolean {
  if (target === "" || target.startsWith("#")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return true; // has a URI scheme (http:, mailto:, tel:, …)
  return false;
}

interface Broken {
  file: string;
  target: string;
  raw: string;
}

let scanned = 0;
const broken: Broken[] = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(content))) {
    const raw = m[1]!;
    if (isExternalOrAnchor(raw)) continue;
    scanned++;
    const withoutFragment = raw.split("#")[0]!.split("?")[0]!;
    if (withoutFragment === "") continue; // pure-fragment link on a non-# prefixed but odd form
    const targetPath = resolve(dirname(file), withoutFragment);
    if (!existsSync(targetPath)) {
      broken.push({ file: relative(REPO_ROOT, file), target: raw, raw });
    }
  }
}

console.log(`doc-links: ${files.length} file(s) scanned, ${scanned} relative markdown link(s) found.`);

if (scanned === 0) {
  console.log("doc-links: FAIL — zero relative links found. That is not \"docs are clean\", it means the scanner isn't matching anything (wrong roots, wrong regex, or the docs genuinely stopped cross-referencing each other — any of which needs a human to look, not a silent pass).");
  process.exit(1);
}

if (broken.length > 0) {
  for (const b of broken) {
    console.log(`[BROKEN] ${b.file} -> ${b.target}`);
  }
  console.log(`\ndoc-links: FAIL — ${broken.length} broken relative link(s) out of ${scanned} scanned.`);
  process.exit(1);
}

console.log(`doc-links: PASS — all ${scanned} relative markdown link(s) resolve.`);
process.exit(0);
