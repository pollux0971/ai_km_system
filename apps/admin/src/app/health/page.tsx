import SystemHealthDashboard from "./_components/system-health-dashboard";

/**
 * E11-S022 "System health dashboard" — thin route wrapper, same shape
 * audit/page.tsx (E11-S015) already establishes: the page itself owns
 * only the frame, SystemHealthDashboard owns the loading/error/loaded
 * states.
 */
export default function HealthPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>系統健康儀表板</h1>
      <SystemHealthDashboard />
    </main>
  );
}
