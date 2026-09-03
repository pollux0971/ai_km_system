/**
 * Traditional-Chinese check + keyword hit-rate scoring for `verify-asr`
 * (E12-S030 AC2: "經 OpenCC cn→twp 後比對關鍵詞命中率 ≥ 80% 且結果為
 * 繁體(以 OpenCC 反查無簡體字元)").
 */
import * as OpenCC from "opencc-js";

const cn2tw = OpenCC.Converter({ from: "cn", to: "twp" });

/** `text` → OpenCC(cn→twp). Same conversion `services/model-gateway` uses for the real endpoint (E12-S031). */
export function toTraditional(text: string): string {
  return cn2tw(text);
}

/**
 * "以 OpenCC 反查無簡體字元": converting FROM simplified only changes
 * text that actually contained simplified characters — if the
 * conversion is a no-op, the input was already traditional-only.
 */
export function isTraditionalOnly(text: string): boolean {
  return cn2tw(text) === text;
}

/**
 * Fraction (0–1) of `keywords` that appear as a substring of `text`, compared
 * CASE-INSENSITIVELY. Empty keyword list scores 1 (vacuously satisfied).
 *
 * Case is folded because the AC asks whether a keyword was RECOGNISED, and
 * whisper capitalises English technical terms as it sees fit. Found in
 * E12-S030's L3 run on 2026-09-04: the user's real recording came back as
 * "…這個API的Error Code,然後把Deadline更新到系統裡。" — all five of
 * expected.json's keywords present — and scored 60% against an 80% threshold,
 * purely because `error code`/`deadline` are lowercase in the fixture. The
 * check was measuring "recognised AND capitalised identically", which is not
 * the property it exists to assert.
 *
 * `toLowerCase()` is a no-op for Han characters, so the Chinese keywords are
 * unaffected, and folding case does not make different WORDS match — only
 * different cases of the same word (both covered by tests).
 */
export function keywordHitRate(text: string, keywords: readonly string[]): number {
  if (keywords.length === 0) return 1;
  const haystack = text.toLowerCase();
  const hits = keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
  return hits / keywords.length;
}
