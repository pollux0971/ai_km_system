import ConnectorList from "./_components/connector-list";

/**
 * E11-S014 "Connector admin" — thin route wrapper, same shape
 * models/page.tsx (E11-S013) already establishes: the page itself owns
 * only the frame, ConnectorList owns the loading/error/empty/loaded
 * states and the per-row status toggle.
 */
export default function ConnectorsPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>連接器管理</h1>
      <ConnectorList />
    </main>
  );
}
