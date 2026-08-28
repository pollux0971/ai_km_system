import { Suspense } from "react";
import LoginForm from "./login-form";

/**
 * Next.js requires a Suspense boundary around any Client Component that
 * calls useSearchParams() (used by LoginForm for the returnUrl redirect),
 * otherwise the route can't be statically rendered. Mirrors
 * apps/web/src/app/(public)/login/page.tsx exactly.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
