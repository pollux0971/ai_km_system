import LatencyDashboard from "./_components/latency-dashboard";

/**
 * E13-S013 "Latency dashboard" — thin route wrapper, same shape
 * usage/page.tsx (E11-S021) already establishes: the page itself owns
 * only the frame, LatencyDashboard owns the loading/error/loaded states.
 */
export default function LatencyPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>延遲儀表板</h1>
      <LatencyDashboard />
    </main>
  );
}
