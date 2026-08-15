export interface ErrorCodeOption {
  code: string;
  description: string;
}

/**
 * E07-S004 "Error-code search UI". Same reasoning as equipment.ts's own
 * EQUIPMENT_OPTIONS: the real ErrorCode entity belongs to E08-S03/S04
 * (Maintenance Intelligence Backend, Team B) — SOURCE_BASELINE.md's E08
 * entity list names it explicitly, and `contracts/` has zero paths for
 * it. A plain fixed array, not a mutable store — no story in Team A's
 * own E07 scope manages this list, same "closed reference list, not a
 * mutable collection" role EQUIPMENT_OPTIONS already plays.
 */
export const ERROR_CODE_OPTIONS: ErrorCodeOption[] = [
  { code: "E101", description: "馬達過熱" },
  { code: "E202", description: "感測器讀值異常" },
  { code: "E305", description: "氣壓不足" },
  { code: "E410", description: "通訊逾時" },
];
