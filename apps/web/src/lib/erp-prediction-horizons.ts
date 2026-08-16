/**
 * E09-S018 "Prediction scenario selector". SOURCE_BASELINE names
 * "Prediction" as one capability alongside Table/KPI/Chart/Excel Export
 * under the same "ERP AI" feature set, but pins nothing about what gets
 * predicted or how — unlike ERP_SCENARIO_OPTIONS (pinned #19-21's own
 * whitelisted query views), there is no second, separate "prediction
 * scenario" business taxonomy anywhere in the spec baseline. Reusing
 * ERP_SCENARIO_OPTIONS a second time here would misname this list (the
 * business scenario is already fixed by the query itself — see S003 —
 * long before a user ever reaches this page's own prediction section),
 * so "scenario" in this story's own title is read as "which selectable
 * option," not a re-selection of the business area: a prediction time
 * horizon for the query's own already-selected scenario. A fixed array,
 * same "no story in Team A's own scope for adding/editing/removing"
 * reasoning ERP_SCENARIO_OPTIONS/EQUIPMENT_OPTIONS/ERROR_CODE_OPTIONS
 * already establish for their own reference lists.
 */
export interface ErpPredictionHorizon {
  id: string;
  label: string;
}

export const ERP_PREDICTION_HORIZONS: ErpPredictionHorizon[] = [
  { id: "next-month", label: "下月" },
  { id: "next-quarter", label: "下季" },
  { id: "next-year", label: "下年" },
];
