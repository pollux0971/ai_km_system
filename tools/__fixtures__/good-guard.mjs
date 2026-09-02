// Fixture for mutate.test.ts's exit-0 meta-test: a REAL guard whose test
// actually checks the value classify() returns, not merely that it returned
// something.
export function classify(score) {
  return score >= 0.5 ? "pass" : "fail";
}
