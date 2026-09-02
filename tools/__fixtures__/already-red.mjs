// Fixture for mutate.test.ts's exit-1 meta-test ("baseline not green"):
// this file itself is fine, but its paired test asserts something false —
// mutate.mjs must refuse to even attempt a mutation against a target whose
// baseline is already red.
export const VALUE = 1;
