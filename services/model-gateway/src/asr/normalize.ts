/**
 * Post-processing for whisper's raw output (E12-S031 spec "技術決策"
 * §後處理): OpenCC Simplified→Taiwan-Traditional, whitespace cleanup,
 * whisper no-speech hallucination filtering.
 */
import * as OpenCC from "opencc-js";

const converter = OpenCC.Converter({ from: "cn", to: "twp" });

/**
 * Whisper's well-documented no-speech hallucination artifacts (silence or
 * near-silence input still produces confident-looking text) — these exact
 * phrases are widely reported against Whisper on Chinese audio. Matched
 * against the WHOLE normalized/trimmed result ("純「謝謝觀看」" in the
 * spec — the recognized text consisted of *only* this, not that a real
 * sentence happened to contain it as a substring), not stripped out of a
 * longer real sentence.
 */
const HALLUCINATION_BLACKLIST: readonly string[] = [
  "謝謝觀看",
  "謝謝收看",
  "請不吝點贊訂閱轉發打賞支持明鏡與點點欄目",
  "字幕由Amara.org社群提供",
];

const TRAILING_PUNCTUATION = /[。！？.!?、,，\s]+$/g;
const CJK_RANGE = "\\u4e00-\\u9fff";
const WHITESPACE_BETWEEN_CJK = new RegExp(`(?<=[${CJK_RANGE}])\\s+(?=[${CJK_RANGE}])`, "g");

function isHallucinationOnly(text: string): boolean {
  const collapsed = text.replace(/\s+/g, "").replace(TRAILING_PUNCTUATION, "");
  return HALLUCINATION_BLACKLIST.some((phrase) => collapsed === phrase.replace(/\s+/g, ""));
}

/**
 * `raw` → OpenCC(cn→twp) → trim → collapse whitespace between CJK
 * characters (keeping a single space between CJK and Latin/digits) →
 * drop whole-string hallucination artifacts. Empty input returns "".
 */
export function normalizeTranscript(raw: string): string {
  if (!raw) return "";

  let text = converter(raw);
  text = text.trim();
  text = text.replace(WHITESPACE_BETWEEN_CJK, "");

  if (isHallucinationOnly(text)) return "";

  return text;
}
