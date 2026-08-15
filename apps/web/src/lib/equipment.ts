export interface EquipmentOption {
  id: string;
  name: string;
}

/**
 * E07-S002 "Equipment selector". The real Equipment/EquipmentModel
 * entities belong to E08-S01/S02 (Maintenance Intelligence Backend,
 * Team B) — SOURCE_BASELINE.md's own E08 entity list names them
 * explicitly, and `contracts/` has zero paths for either. Same
 * "Team A 不等待 Backend 完成才開始" precedent (SOURCE_BASELINE §5
 * pinned #35) E05 already followed for KnowledgeBase/E06.
 *
 * A plain fixed array, not a sessionStorage-backed store the way
 * knowledge-bases.ts/maintenance-cases.ts are — there is no story in
 * Team A's own scope for adding/editing/removing equipment (no
 * "equipment management" story exists anywhere in E07's 25-story
 * list), so unlike a KnowledgeBase or a MaintenanceCase this is a
 * closed reference list, not a mutable collection; the same role
 * ai-models.ts's own AI_MODELS plays for `boundModel`.
 */
export const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  { id: "equip-1", name: "3 號生產線包裝機" },
  { id: "equip-2", name: "空壓機 A" },
  { id: "equip-3", name: "傳送帶馬達" },
  { id: "equip-4", name: "CNC 加工機 2 號" },
];
