import { ERP_SCENARIO_OPTIONS } from "./erp-scenarios";
import { getErpResultTable } from "./erp-result-tables";

/**
 * E09-S010 "KPI card". Deliberately does NOT hand-author a fourth
 * parallel mock-data file with its own independently-typed numbers —
 * E09-S008's own independent review caught exactly that failure mode
 * (erp-results.ts's summary claiming "8 筆" while erp-result-tables.ts
 * only had 4 rows, two files each hand-typed with a number nobody
 * cross-checked). Instead the KPI value is *derived* from
 * getErpResultTable's own row count — consistent with the table by
 * construction, not by discipline, so there is nothing left to drift.
 *
 * The label reuses ERP_SCENARIO_OPTIONS' own already-approved label
 * (S003) rather than inventing new scenario-specific copy, for the same
 * "don't duplicate a fact that already has a single source of truth"
 * reasoning.
 */
export interface ErpResultKpi {
  label: string;
  value: number;
}

const FALLBACK_LABEL = "查詢結果筆數";

export function getErpResultKpi(scenarioId: string): ErpResultKpi {
  const table = getErpResultTable(scenarioId);
  const scenario = ERP_SCENARIO_OPTIONS.find((option) => option.id === scenarioId);

  return {
    label: scenario ? `「${scenario.label}」結果筆數` : FALLBACK_LABEL,
    value: table.rows.length,
  };
}
