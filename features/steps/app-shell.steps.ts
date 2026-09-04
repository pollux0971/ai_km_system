/**
 * 11-app-shell phase-1 步驟(回填)。
 *
 * 每一步呼叫的入口都是 apps/web 自己在 runtime 走的那個,也正是它自己的 vitest
 * 測試在呼叫的那個:
 *
 * - `visibleNavItems` / `visibleEntryCards` / `rolesRequiredFor`
 *   (`apps/web/src/lib/nav-items.test.ts`)——sidebar.tsx、quick-entry-cards.tsx、
 *   role-guard.tsx 三個元件讀的同一張表。
 * - `formatRelativeTime`(`apps/web/src/lib/format-time.test.ts`)——首頁「最近對話」
 *   磚上的那一行。
 * - `apps/web/src/app/globals.css` 與 `packages/design-tokens/src/m3.ts`
 *   (`apps/web/src/app/globals-m3-tokens.test.ts`)——app 真的載入的那份樣式表。
 * - `packages/design-tokens/src/m3-theme.css` 與 `contrast.ts` / `m3-roles.ts`
 *   (`packages/design-tokens/scripts/generate-m3-theme.test.ts`)——app 真的 @import
 *   的那份色票。
 *
 * features 的 runner 是 node + tsx,**沒有 jsdom**,所以這裡一律走「畫面背後那個
 * 純資料入口」;需要視窗才存在的行為(rail/drawer/modal 斷點、跨視窗即時列)在
 * phase-2 與檔尾的 @e2e 場景,不在這裡假裝。
 */
import { Given, Then, When } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, type KmWorld } from "./_world.js";

import { rolesRequiredFor, visibleEntryCards, visibleNavItems, type NavItem } from "../../apps/web/src/lib/nav-items.js";
import { formatRelativeTime } from "../../apps/web/src/lib/format-time.js";
import { elevation, motion, shape, stateLayer, typescale } from "../../packages/design-tokens/src/m3.js";
import { M3_COLOR_ROLES, M3_CONTRAST_PAIRS, cssVarForRole, type M3ColorRole } from "../../packages/design-tokens/src/m3-roles.js";
import { contrastRatio } from "../../packages/design-tokens/src/contrast.js";

const WEB_GLOBALS_CSS = "apps/web/src/app/globals.css";
const SHIPPED_THEME_CSS = "packages/design-tokens/src/m3-theme.css";

/** "a, b, c" → ["a","b","c"];空字串 → [] */
function commaList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function camelToKebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** `--name: value;` 全抓出來(與 globals-m3-tokens.test.ts 同一條 regex) */
function extractCssVars(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    result[`--${match[1]}`] = match[2]!.trim();
  }
  return result;
}

/** `NavItem["roles"]`(undefined / "all" / 角色陣列)寫成場景裡看得懂的一句話 */
function describeRoles(roles: NavItem["roles"] | undefined): string {
  if (roles === undefined) return "nothing in particular";
  if (roles === "all") return "everyone";
  return roles.join(", ");
}

interface ShellState {
  roles: string[];
  navigation: NavItem[];
  shortcuts: NavItem[];
  askedPath: string;
  demandedRoles: NavItem["roles"] | undefined;
  cssVars: Record<string, string>;
  cssSource: string;
  lightScheme: Record<string, string>;
  darkScheme: Record<string, string>;
  now: Date;
  tile: string;
}

function state(world: KmWorld): ShellState {
  if (!world.bag["appShell"]) {
    world.bag["appShell"] = {
      roles: [],
      navigation: [],
      shortcuts: [],
      askedPath: "",
      demandedRoles: undefined,
      cssVars: {},
      cssSource: "",
      lightScheme: {},
      darkScheme: {},
      now: new Date(0),
      tile: "",
    } satisfies ShellState;
  }
  return world.bag["appShell"] as ShellState;
}

/** "30s" / "5m" / "3h" / "7d" → 毫秒 */
function agoToMs(ago: string): number {
  const match = /^(\d+)([smhd])$/.exec(ago.trim());
  assert.ok(match, `「上次動到」的寫法只支援 30s / 5m / 3h / 7d 這種格式,收到「${ago}」`);
  const amount = Number(match[1]);
  const unit = match[2];
  const perUnit: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * perUnit[unit!]!;
}

// ---------------------------------------------------------------- Given

Given("a person signed in to the app shell holding the roles {string}", function (this: KmWorld, roles: string) {
  state(this).roles = commaList(roles);
});

Given("the home page is drawn at {string}", function (this: KmWorld, iso: string) {
  state(this).now = new Date(iso);
});

// ---------------------------------------------------------------- When

When("the app shell is assembled for that person", function (this: KmWorld) {
  const shell = state(this);
  shell.navigation = visibleNavItems(shell.roles);
  shell.shortcuts = visibleEntryCards(shell.roles);
});

When("the app shell is asked which roles the page {string} demands", function (this: KmWorld, path: string) {
  const shell = state(this);
  shell.askedPath = path;
  shell.demandedRoles = rolesRequiredFor(path);
});

When("the app shell's own stylesheet is read", function (this: KmWorld) {
  const shell = state(this);
  shell.cssSource = readFileSync(join(ROOT, WEB_GLOBALS_CSS), "utf8");
  shell.cssVars = extractCssVars(shell.cssSource);
  assert.ok(
    Object.keys(shell.cssVars).length > 0,
    `${WEB_GLOBALS_CSS} 裡一個 CSS custom property 都沒解析到——是解析器壞了,不是樣式表很乾淨`,
  );
});

When("the app shell's shipped colour scheme is read", function (this: KmWorld) {
  const shell = state(this);
  const css = readFileSync(join(ROOT, SHIPPED_THEME_CSS), "utf8");
  const [lightBlock, darkBlock] = css.split("@media (prefers-color-scheme: dark)");
  assert.ok(
    lightBlock && darkBlock,
    `${SHIPPED_THEME_CSS} 裡找不到 @media (prefers-color-scheme: dark) 這個分界,無法分出淺色與深色兩套`,
  );
  shell.lightScheme = extractCssVars(lightBlock);
  shell.darkScheme = extractCssVars(darkBlock);
});

When("the app shell puts a conversation last touched {string} on a home tile", function (this: KmWorld, ago: string) {
  const shell = state(this);
  const lastTouched = new Date(shell.now.getTime() - agoToMs(ago)).toISOString();
  shell.tile = formatRelativeTime(lastTouched, shell.now);
});

// ---------------------------------------------------------------- Then

Then("the app shell's main navigation is labelled {string}", function (this: KmWorld, expected: string) {
  const actual = state(this).navigation.map((item) => item.label);
  assert.deepEqual(
    actual,
    commaList(expected),
    `主導覽的字樣應為「${expected}」,實際為「${actual.join(", ")}」`,
  );
});

Then("the app shell's main navigation goes exactly to {string}", function (this: KmWorld, expected: string) {
  const shell = state(this);
  const actual = shell.navigation.map((item) => item.href);
  assert.deepEqual(
    actual,
    commaList(expected),
    `角色「${shell.roles.join(", ") || "(無)"}」的主導覽應通往「${expected}」,實際通往「${actual.join(", ")}」`,
  );
});

Then("the app shell's home headline is set in {string} on {string}", function (this: KmWorld, size: string, lineHeight: string) {
  // 首頁 <h1> 用 .home-headline,它的 font 由 --md-sys-typescale-display-small-*
  // 組成(globals.css);那組變數與這裡的 token 不得漂移,由「stylesheet 是從
  // token 源切下來的」那個場景守著。
  assert.equal(typescale.displaySmall.fontSize, size, `首頁大標的字級應為 ${size},實際為 ${typescale.displaySmall.fontSize}`);
  assert.equal(
    typescale.displaySmall.lineHeight,
    lineHeight,
    `首頁大標的行高應為 ${lineHeight},實際為 ${typescale.displaySmall.lineHeight}`,
  );
});

Then("the app shell's home shortcuts go exactly to {string}", function (this: KmWorld, expected: string) {
  const shell = state(this);
  const actual = shell.shortcuts.map((item) => item.href);
  assert.deepEqual(
    actual,
    commaList(expected),
    `角色「${shell.roles.join(", ") || "(無)"}」的首頁捷徑應通往「${expected}」,實際通往「${actual.join(", ")}」`,
  );
});

Then("every home shortcut is also in the app shell's main navigation", function (this: KmWorld) {
  const shell = state(this);
  const navigable = new Set(shell.navigation.map((item) => item.href));
  const extra = shell.shortcuts.map((item) => item.href).filter((href) => !navigable.has(href));
  assert.deepEqual(
    extra,
    [],
    `首頁捷徑通往「${extra.join(", ")}」,但主導覽沒有這些去處——首頁不得比側欄多開一扇門`,
  );
});

Then("the app shell demands {string}", function (this: KmWorld, expected: string) {
  const shell = state(this);
  const actual = describeRoles(shell.demandedRoles);
  assert.equal(actual, expected, `「${shell.askedPath}」應要求 ${expected},實際要求 ${actual}`);
});

Then(
  "every Material 3 type scale, shape, elevation, state and motion value in it equals the design token of the same name",
  function (this: KmWorld) {
    const { cssVars } = state(this);
    const drift: string[] = [];
    const check = (name: string, expected: string) => {
      const actual = cssVars[name];
      if (actual !== expected) drift.push(`${name}: 樣式表「${actual ?? "(缺)"}」≠ token「${expected}」`);
    };

    for (const [key, style] of Object.entries(typescale)) {
      const kebab = camelToKebab(key);
      check(`--md-sys-typescale-${kebab}-size`, style.fontSize);
      check(`--md-sys-typescale-${kebab}-line-height`, style.lineHeight);
      check(`--md-sys-typescale-${kebab}-weight`, String(style.fontWeight));
      check(`--md-sys-typescale-${kebab}-tracking`, style.letterSpacing);
    }
    for (const [key, value] of Object.entries(shape)) check(`--md-sys-shape-corner-${camelToKebab(key)}`, value);
    for (const [level, value] of Object.entries(elevation)) check(`--md-sys-elevation-level${level}`, value);
    for (const [key, value] of Object.entries(stateLayer)) check(`--md-sys-state-${key}-opacity`, String(value));
    check("--md-sys-motion-easing-standard", motion.easing.standard);
    check("--md-sys-motion-easing-emphasized", motion.easing.emphasized);
    check("--md-sys-motion-duration-short", motion.duration.short);
    check("--md-sys-motion-duration-medium", motion.duration.medium);
    check("--md-sys-motion-duration-long", motion.duration.long);

    assert.deepEqual(drift, [], `${WEB_GLOBALS_CSS} 與 packages/design-tokens/src/m3.ts 漂移了:\n  ${drift.join("\n  ")}`);
  },
);

Then("the app shell's stylesheet declares no colour of its own outside the generated Material 3 theme", function (this: KmWorld) {
  const { cssSource } = state(this);
  const importLine = '@import "@ai-km/design-tokens/m3-theme.css";';
  assert.ok(cssSource.includes(importLine), `${WEB_GLOBALS_CSS} 應以 ${importLine} 取得色票,實際找不到這一行`);
  const literals = cssSource.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
  assert.deepEqual(literals, [], `${WEB_GLOBALS_CSS} 自己寫死了色碼「${literals.join(", ")}」,那些顏色不會跟著 M3 角色換主題`);
});

Then("every Material 3 colour role has a value in both the light and the dark scheme", function (this: KmWorld) {
  const shell = state(this);
  const missing: string[] = [];
  for (const role of M3_COLOR_ROLES) {
    const name = cssVarForRole(role);
    if (!shell.lightScheme[name]) missing.push(`${role}(淺色)`);
    if (!shell.darkScheme[name]) missing.push(`${role}(深色)`);
  }
  assert.deepEqual(missing, [], `${SHIPPED_THEME_CSS} 少了這些角色:${missing.join(", ")}`);
});

Then(
  "every colour role except {string} and {string} changes value between light and dark",
  function (this: KmWorld, alwaysBlackA: string, alwaysBlackB: string) {
    const shell = state(this);
    const exempt = new Set([alwaysBlackA, alwaysBlackB]);
    const unchanged: string[] = [];
    for (const role of M3_COLOR_ROLES) {
      if (exempt.has(role)) continue;
      const name = cssVarForRole(role);
      const light = shell.lightScheme[name];
      const dark = shell.darkScheme[name];
      if (light !== undefined && light === dark) unchanged.push(`${role}=${light}`);
    }
    assert.deepEqual(
      unchanged,
      [],
      `這些角色在深色模式下沒有換色,深色主題等於沒生效:${unchanged.join(", ")}`,
    );
  },
);

Then(
  "every on-colour and the surface it names contrast at least {float} to 1 in the {string} scheme",
  function (this: KmWorld, minimum: number, mode: string) {
    const shell = state(this);
    const scheme = mode === "dark" ? shell.darkScheme : shell.lightScheme;
    const tooFaint: string[] = [];
    for (const [onRole, role] of M3_CONTRAST_PAIRS) {
      const onHex = scheme[cssVarForRole(onRole as M3ColorRole)];
      const hex = scheme[cssVarForRole(role as M3ColorRole)];
      assert.ok(onHex && hex, `${mode} 配色少了 ${onRole} 或 ${role},無法計算對比`);
      const ratio = contrastRatio(onHex, hex);
      if (ratio < minimum) tooFaint.push(`${onRole}(${onHex})/${role}(${hex}) = ${ratio.toFixed(2)}:1`);
    }
    assert.deepEqual(
      tooFaint,
      [],
      `${mode} 配色裡這幾組字與底的對比低於 ${minimum}:1,小字會讀不到:${tooFaint.join(", ")}`,
    );
  },
);

Then("the home tile reads {string}", function (this: KmWorld, expected: string) {
  const shell = state(this);
  assert.equal(shell.tile, expected, `首頁磚上應寫「${expected}」,實際寫「${shell.tile}」`);
});

Then("the home tile does not say {string}", function (this: KmWorld, forbidden: string) {
  const shell = state(this);
  assert.ok(!shell.tile.includes(forbidden), `首頁磚上不該再出現「${forbidden}」,實際寫「${shell.tile}」`);
});

Then("the home tile shows a calendar date containing {string}", function (this: KmWorld, fragment: string) {
  const shell = state(this);
  assert.ok(shell.tile.includes(fragment), `首頁磚上應改成含「${fragment}」的日期,實際寫「${shell.tile}」`);
});
