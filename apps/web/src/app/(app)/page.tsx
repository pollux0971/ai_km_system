"use client";

import { Button } from "@ai-km/ui";
import { useCurrentUser } from "@/lib/session-context";

/**
 * Route skeleton placeholder for the (app) authenticated zone, established
 * by E01-S001. Real dashboard content lands in E01-S007; chrome
 * (sidebar/header) lands in E01-S005. The "signed in as" line is E01-S004's
 * own minimal, temporary proof that useCurrentUser() actually delivers a
 * session end-to-end (not just in isolated unit tests) — replace this
 * whole placeholder in E01-S007 rather than keeping the line around.
 */
export default function HomePage() {
  const user = useCurrentUser();

  return (
    <main style={{ padding: 32 }}>
      <h1>AI KM — apps/web</h1>
      <p>Scaffold placeholder. Replace with E01-S007 home dashboard.</p>
      <p>Signed in as {user.userId}</p>
      <Button>Placeholder action</Button>
    </main>
  );
}
