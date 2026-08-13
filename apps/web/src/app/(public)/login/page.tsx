import { Suspense } from "react";
import LoginForm from "./login-form";

/**
 * Next.js requires a Suspense boundary around any Client Component that
 * calls useSearchParams() (used by LoginForm for E01-S003's returnUrl),
 * otherwise the route can't be statically rendered.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
