/**
 * Shared test fixtures/helpers for apps/web and apps/admin. Kept intentionally
 * empty of framework wiring (e.g. Testing Library render helpers) until the
 * first story that needs it picks the concrete test runner/setup.
 */

export function makeTestId(scope: string, name: string): string {
  return `${scope}:${name}`;
}
