import { ERP_PREDICTION_HORIZONS } from "./erp-prediction-horizons";

/**
 * E09-S019 "Prediction result". Unlike getErpResultKpi (E09-S010), which
 * derives its value from an already-executed, already-real table (so a
 * hand-typed duplicate would drift from that ground truth — the exact
 * cross-file drift E09-S008's own independent review caught), a
 * *prediction* has no ground truth to derive from in this mock system at
 * all: any number describing a future that hasn't happened is equally
 * invented no matter how it's computed. Rather than fabricate a distinct,
 * scenario-specific business narrative for all 4 whitelisted scenarios
 * (risking inconsistent-sounding, overly-specific-yet-meaningless claims
 * for scenarios a "growth %" doesn't obviously fit, e.g. purchase order
 * status), this applies one honestly-uniform, MVP-simplified growth-rate
 * table (AC8) per horizon, reused identically across every scenario via
 * the scenario's own already-known label — same "one fact, one source"
 * discipline getErpResultKpi/getAppliedFilterLabel already established,
 * just applied to something with literally nothing to derive from
 * instead of an existing table.
 */
const PREDICTION_GROWTH_RATES: Record<string, number> = {
  "next-month": 3,
  "next-quarter": 8,
  "next-year": 15,
};

/**
 * Never throws for an unrecognized horizon id — falls back to a
 * scenario-naming-but-rate-free message, same fail-closed-but-actionable
 * reasoning getErpResultSummary's own fallback already follows.
 */
export function getErpPrediction(scenarioLabel: string, horizonId: string): string {
  const rate = PREDICTION_GROWTH_RATES[horizonId];
  const horizon = ERP_PREDICTION_HORIZONS.find((candidate) => candidate.id === horizonId);

  if (rate === undefined || !horizon) {
    return `「${scenarioLabel}」暫無可用的預測資訊。`;
  }

  return `預測「${scenarioLabel}」${horizon.label}將較本期成長約 ${rate}%。`;
}
