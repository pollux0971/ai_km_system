/**
 * Provider Fidelity (PF) — the executable version of "this AC is only provable
 * with a real model".
 *
 * ── NAMING, AND WHY IT CHANGED (2026-09-02) ─────────────────────────────────
 *
 * This scale used to be called L0–L3, which collided head-on with
 * `AI_KM_BMAD_High_Granularity/policies/TESTING_POLICY.md`, the repo's #1
 * authority, whose L0–L6 mean something else entirely. The worst collision was
 * L3: the policy's L3 is "integration — DB/object/vector/queue boundaries",
 * this scale's L3 was "a real model". Two documents, the same token, opposite
 * meanings, and nothing to stop an AC citing one and being reviewed against
 * the other.
 *
 * So the two axes are now named apart, and they are genuinely orthogonal:
 *
 *   policy L0–L6  WHAT KIND OF TEST this is — static, unit, seam, integration,
 *                 E2E, security, RAG evaluation. The primary classification;
 *                 every AC carries one.
 *   PF0–PF3       HOW REAL THE MODEL IS behind that test. Only meaningful for
 *                 ACs that touch an embedding or generation provider, so only
 *                 those carry a PF tag.
 *
 * A sqlite-vec persistence test is policy L3 (a vector-store boundary) at PF2
 * (the embeddings feeding it are still deterministic). A semantic-recall
 * evaluation is policy L6 at PF3. Neither sentence is expressible on one axis.
 *
 * ── WHY THE MECHANISM EXISTS ────────────────────────────────────────────────
 *
 * The repo's PROGRESS.md contains 18 `降級`, 5 `補做獨立審核` and 28 `稽核`.
 * Every one has the same shape: an AC was claimed as met, but the evidence
 * behind it could not actually prove it. Claim and evidence were both prose,
 * so nothing checked that they matched — a human auditor had to notice, days
 * later.
 *
 * A fake provider makes that failure much easier to hit: everything is green,
 * fast and deterministic, and nothing in the test output says "by the way, the
 * model was a stub". So fidelity is attached to the PROVIDER as data, and a
 * test needing more fidelity than its providers can supply fails loudly at
 * setup time.
 *
 * This does not replace review. It removes the single most common thing review
 * was being asked to catch.
 *
 * ── THE LEVELS ──────────────────────────────────────────────────────────────
 *
 *   PF0  No provider involved at all. Pure logic, no I/O.
 *   PF1  Fake providers in process, in-memory store. Proves plumbing,
 *        ordering, scoping. Runs on a loaded laptop.
 *   PF2  Fake providers over a real socket, real persistence on disk. Adds
 *        serialisation, timeouts, error mapping, migrations — the seams that
 *        broke in E04-S049…S053.
 *   PF3  Real model against a fixed evaluation set. The ONLY level that can
 *        speak to answer quality, hallucination rate, citation correctness or
 *        semantic recall.
 *
 * WHAT EACH LEVEL CANNOT DO is the part that matters. See `FIDELITY_LIMITS`.
 */

export const PROVIDER_FIDELITY_LEVELS = ["PF0", "PF1", "PF2", "PF3"] as const;

export type ProviderFidelity = (typeof PROVIDER_FIDELITY_LEVELS)[number];

const FIDELITY_ORDER: Readonly<Record<ProviderFidelity, number>> = Object.freeze({
  PF0: 0,
  PF1: 1,
  PF2: 2,
  PF3: 3,
});

/**
 * Human-readable statement of what a level is NOT evidence for. Included in the
 * thrown error so the failure explains itself without a doc lookup.
 */
export const FIDELITY_LIMITS: Readonly<Record<ProviderFidelity, string>> = Object.freeze({
  PF0: "純邏輯,不觸碰任何 I/O。不能證明任何跨模組行為。",
  PF1: "模型是假的、儲存在記憶體。可證明管線接線、檢索排序、權限過濾;不能證明語意召回、答案品質、序列化與持久化。",
  PF2: "模型仍是假的,但走真實 HTTP 與真實持久化。可額外證明序列化、逾時、錯誤映射、schema/migration;不能證明任何與模型輸出品質有關的事。",
  PF3: "真實模型 + 固定評估集。可證明語意召回、答案品質、引用正確性。",
});

/** Anything that participates in the pipeline and has a provable ceiling. */
export interface FidelityRatedComponent {
  /** Stable identifier used in error messages, e.g. "embedding:deterministic". */
  readonly componentId: string;
  /** The HIGHEST provider fidelity this component can legitimately support. */
  readonly fidelityCeiling: ProviderFidelity;
}

export class ProviderFidelityError extends Error {
  override readonly name = "ProviderFidelityError";
  readonly required: ProviderFidelity;
  readonly offenders: readonly FidelityRatedComponent[];

  constructor(message: string, required: ProviderFidelity, offenders: readonly FidelityRatedComponent[]) {
    super(message);
    this.required = required;
    this.offenders = offenders;
  }
}

export function isAtLeast(actual: ProviderFidelity, required: ProviderFidelity): boolean {
  return FIDELITY_ORDER[actual] >= FIDELITY_ORDER[required];
}

/**
 * Call this at the top of any test whose ACs need a specific provider fidelity.
 *
 * A test asserting citation correctness declares PF3. If it is wired with the
 * deterministic embedding provider (ceiling PF1), this throws before a single
 * assertion runs — so the suite cannot go green while proving nothing.
 *
 * The inverse is deliberately NOT an error: running an PF1 test against real
 * providers is wasteful but not dishonest, so it is allowed.
 */
export function requireProviderFidelity(
  required: ProviderFidelity,
  components: readonly FidelityRatedComponent[],
): void {
  const offenders = components.filter((c) => !isAtLeast(c.fidelityCeiling, required));
  if (offenders.length === 0) return;

  const detail = offenders
    .map((c) => `  - ${c.componentId} 的上限是 ${c.fidelityCeiling}`)
    .join("\n");

  throw new ProviderFidelityError(
    `此測試宣稱提供 ${required} 級證據,但以下元件無法支撐:\n${detail}\n\n` +
      `${required} 的意義:${FIDELITY_LIMITS[required]}\n\n` +
      `請改為以 ${required} 級元件執行,或把該 AC 的宣稱層級調整為實際可證明的等級。` +
      `不要放寬本檢查——它擋下的正是「全綠但什麼都沒證明」。`,
    required,
    offenders,
  );
}

/** The effective fidelity of a pipeline is its weakest component. */
export function effectiveFidelity(components: readonly FidelityRatedComponent[]): ProviderFidelity {
  if (components.length === 0) return "PF0";
  let weakest: ProviderFidelity = "PF3";
  for (const c of components) {
    if (FIDELITY_ORDER[c.fidelityCeiling] < FIDELITY_ORDER[weakest]) weakest = c.fidelityCeiling;
  }
  return weakest;
}
