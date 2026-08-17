import SystemSettingsPanel from "./_components/system-settings-panel";

/**
 * E11-S020 "System settings" — thin route wrapper, same shape
 * audit/page.tsx (E11-S015) already establishes: the page itself owns
 * only the frame, SystemSettingsPanel owns the loading/error/loaded
 * states.
 */
export default function SettingsPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>系統設定</h1>
      <SystemSettingsPanel />
    </main>
  );
}
