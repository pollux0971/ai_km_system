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

/** Fraction (0–1) of `keywords` that appear as a substring of `text`. Empty keyword list scores 1 (vacuously satisfied). */
export function keywordHitRate(text: string, keywords: readonly string[]): number {
  if (keywords.length === 0) return 1;
  const hits = keywords.filter((keyword) => text.includes(keyword)).length;
  return hits / keywords.length;
}
