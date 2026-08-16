import ErpQueryList from "./_components/erp-query-list";

/**
 * E09-S001: the ERP assistant home route (nav-items.ts's "/erp" entry,
 * established back in E01-S006/S009 as an entry point before this page
 * existed — role-gated to sales_purchasing/super_administrator via the
 * global RoleGuard in apps/web/src/app/(app)/layout.tsx, so this page
 * itself needs no additional authorization wiring of its own). Page
 * frame only; ErpQueryList owns the loading/error/empty/loaded states.
 *
 * No entry link yet, deliberately — E09-S002 "Natural-language query
 * composer" is the story that owns the first real interactive step of
 * asking a new question, and its target route doesn't exist yet. Same
 * relationship maintenance/page.tsx's own doc comment establishes
 * between E07-S001 and E07-S002.
 */
export default function ErpPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>ERP 助手</h1>
      <ErpQueryList />
    </main>
  );
}
