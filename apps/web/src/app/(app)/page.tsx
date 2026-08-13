import { Button } from "@ai-km/ui";

/**
 * Route skeleton placeholder for the (app) authenticated zone, established
 * by E01-S001. Real dashboard content lands in E01-S007; session/auth
 * gating for this route group lands in E01-S004; chrome (sidebar/header)
 * lands in E01-S005.
 */
export default function HomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>AI KM — apps/web</h1>
      <p>Scaffold placeholder. Replace with E01-S007 home dashboard.</p>
      <Button>Placeholder action</Button>
    </main>
  );
}
