import { Button } from "@ai-km/ui";

/**
 * Pre-story scaffolding only. This is the precondition for E01-S001
 * (Web application bootstrap & route skeleton), not the story itself —
 * E01-S001 still needs to add real shell/nav/auth-gated layout, telemetry
 * and its own acceptance criteria on top of this.
 */
export default function HomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>AI KM — apps/web</h1>
      <p>Scaffold placeholder. Replace with E01-S001 application shell.</p>
      <Button>Placeholder action</Button>
    </main>
  );
}
