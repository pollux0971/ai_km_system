// Fixture for mutate.mjs's own SIGNAL-SAFETY meta-test (E04-S083). Same
// shape as good-guard.mjs — a real guard whose test checks the returned
// VALUE, not merely that something was returned — but its test (see
// slow-guard.test.ts) sleeps for a few seconds first. That sleep is the
// whole point: it gives an external `kill -TERM` a real window to land
// while mutate.mjs is blocked waiting on the vitest child process, AFTER
// this file has been mutated on disk but BEFORE mutate.mjs's own restore
// step has run.
export function classify(score) {
  return score >= 0.5 ? "pass" : "fail";
}
