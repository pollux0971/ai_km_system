/**
 * E11-S026 — shared between playwright.config.ts (the `admin` project's
 * `use.storageState`) and auth.setup.ts (where it's written), kept in its
 * own file so the config doesn't have to import the test-definition file
 * itself just to read this path.
 */
export const STORAGE_STATE_PATH = "test-results/.auth/admin-storage-state.json";
