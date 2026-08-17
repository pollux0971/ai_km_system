import AuditEventList from "./_components/audit-event-list";

/**
 * E11-S015 "Audit viewer" — thin route wrapper, same shape
 * roles/page.tsx (E11-S006) already establishes: the page itself owns
 * only the frame, AuditEventList owns the loading/error/empty/loaded
 * states.
 */
export default function AuditPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>稽核紀錄</h1>
      <AuditEventList />
    </main>
  );
}
