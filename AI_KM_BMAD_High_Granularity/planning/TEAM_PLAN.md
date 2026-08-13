# Two-Team Delivery Plan

## Team A — Experience & Application
Owns E01/E03/E05/E07/E09/E11/E13. May build BFF and contract-compatible mocks, but may not bypass domain services.

## Team B — Data & Intelligence Platform
Owns E02/E04/E06/E08/E10/E12/E14. Owns DB/backend core/RAG/vector/ingestion/authz/model gateway/connectors/audit core.

## Parallelization rule
For every A↔B seam:
1. Freeze contract and examples.
2. Team B supplies contract tests/reference mock.
3. Team A develops against generated/typed client.
4. Integration story replaces mock with real service.
5. E2E proves authorization + error + audit behavior.

## Suggested first vertical slice
E02 auth minimum → E01 login/shell → E06 single PDF ingestion → E04 authorized retrieval + citation → E12 local text model gateway → E03 chat streaming/citation → E14 audit/metrics.
