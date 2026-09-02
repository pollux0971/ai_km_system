// Fixture for mutate.test.ts's exit-4 meta-test: a mutation whose
// replacement text is not merely wrong logic but invalid JavaScript syntax,
// so the post-mutation vitest run fails to even collect the file (a
// collection error), never reaching an assertion at all.
export function addOne(n) {
  return n + 1;
}
