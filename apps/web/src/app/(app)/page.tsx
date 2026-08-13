import { Button } from "@ai-km/ui";

/**
 * Route skeleton placeholder for the (app) authenticated zone, established
 * by E01-S001. Real dashboard content lands in E01-S007.
 *
 * E01-S004 temporarily added a "Signed in as {userId}" line here as its
 * own minimal proof that useCurrentUser() delivers a session end-to-end.
 * E01-S005's header/user-menu (AppShell, wired in (app)/layout.tsx) now
 * shows the current user permanently and more appropriately, so that line
 * is removed here as redundant rather than carried forward to E01-S007.
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
