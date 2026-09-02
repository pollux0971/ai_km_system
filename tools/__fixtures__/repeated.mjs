// Fixture for mutate.test.ts's exit-1 meta-test ("--replace not exactly
// once"): the return value below is duplicated across two functions, so
// mutate.mjs must refuse to guess which occurrence is meant — no --nth
// escape hatch exists.
export function first() {
  return "dup";
}
export function second() {
  return "dup";
}
