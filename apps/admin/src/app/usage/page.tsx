import UsageDashboard from "./_components/usage-dashboard";

/**
 * E11-S021 "Usage dashboard" — thin route wrapper, same shape
 * audit/page.tsx (E11-S015) already establishes: the page itself owns
 * only the frame, UsageDashboard owns the loading/error/loaded states.
 */
export default function UsagePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>使用量儀表板</h1>
      <UsageDashboard />
    </main>
  );
}
