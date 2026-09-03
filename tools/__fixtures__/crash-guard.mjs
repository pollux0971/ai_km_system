// Fixture for mutate.mjs's own IN-FLIGHT MARKER meta-test (E04-S083,
// redesigned per coordinator review). Same shape as good-guard.mjs — a
// real guard whose test checks the returned VALUE — but its test (see
// crash-guard.test.ts) sleeps for a few seconds. That delay gives an
// external, UNCATCHABLE `kill -9` (SIGKILL) a real window to land after
// the mutation has been written to disk but before mutate.mjs would
// otherwise restore it — the one failure mode no signal handler can fix,
// which is exactly what the in-flight marker exists to recover from on
// the NEXT invocation.
export function classify(score) {
  return score >= 0.5 ? "pass" : "fail";
}
