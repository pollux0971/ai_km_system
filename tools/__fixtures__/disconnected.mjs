// Fixture for mutate.test.ts's exit-2 meta-test: a value whose CONTENT no
// test checks — only its type/presence — modelling the wave's signature
// defect (an existence-only assertion that stays green when the real value
// is wrong). See services/retrieval/src/rerank/retrieve-with-reranking.ts's
// real-world analog, used for this story's real-case reverse verification.
export const GREETING = "hello";
