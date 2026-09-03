// Fixture for mutate.mjs's own PRE-FLIGHT SELF-CHECK meta-test (E04-S083).
// A plain, otherwise-unremarkable guard — deliberately its OWN dedicated
// fixture, not a reuse of good-guard.mjs, because this meta-test manually
// corrupts this file's bytes on disk to simulate "left mutated by an
// interrupted previous run", and doing that to a fixture other tests also
// use would make them interfere with each other.
export function classify(score) {
  return score >= 0.5 ? "pass" : "fail";
}
