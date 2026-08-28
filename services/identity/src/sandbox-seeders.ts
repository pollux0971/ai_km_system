/**
 * Sandbox seeder registry (E02-S032 AC7, ADR 0005 §5).
 *
 * `AI_KM_TEST_SANDBOX=true` gives every login a fresh `ownerKey`; a seeder
 * registered here populates that owner's starting data (demo conversations,
 * etc.) so the sandbox is not an empty account. E04-S041/S042 register the
 * real seeders; this story only proves the registry itself works, with a
 * seeder of its own in the test suite.
 *
 * A module-level list, not an `app` decorator: `registerSandboxSeeder` is
 * meant to be called at another domain's OWN plugin module load time, before
 * that domain necessarily has a Fastify instance to decorate.
 */

export type SandboxSeeder = (ownerKey: string) => void | Promise<void>;

const seeders: SandboxSeeder[] = [];

export function registerSandboxSeeder(seeder: SandboxSeeder): void {
  seeders.push(seeder);
}

export async function runSandboxSeeders(ownerKey: string): Promise<void> {
  for (const seeder of seeders) {
    // Sequential, not Promise.all: seeders may share setup order assumptions
    // (e.g. a conversation must exist before a message referencing it), and
    // a login is not on a latency budget tight enough to need parallelism.
    await seeder(ownerKey);
  }
}

/** Test-only: registrations must not leak between isolated test cases. */
export function _resetSandboxSeedersForTest(): void {
  seeders.length = 0;
}
