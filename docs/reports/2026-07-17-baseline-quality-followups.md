# Baseline Quality Follow-ups

This file records pre-existing build and test failures observed before the
P0-1 backup automation work began. They are intentionally kept out of the
backup branch so that the emergency data-protection work remains reviewable.

## Processing order

1. Complete P0-1 backup automation and recovery verification.
2. Complete the P0 PayPal security remediation.
3. Fix the tiered-billing model-list regression before the next production
   release.
4. Fix Claude file-content conversion and test-database isolation.

## Recorded issues

### P0: tiered-billing model-list regression

- Failing test:
  `controller.TestListModelsTokenLimitIncludesTieredBillingModel`
- Risk: tiered/dynamic billing models may be omitted or represented
  incorrectly in the model list, which can affect pricing and quota behavior.
- Gate: must pass before the next production release.
- Required preparation: read `pkg/billingexpr/expr.md` before changing billing
  code.

### P1: Claude file-content conversion regressions

- Failing tests:
  - `TestRequestOpenAI2ClaudeMessage_IgnoresUnsupportedFileContent`
  - `TestRequestOpenAI2ClaudeMessage_SupportsPDFFileContent`
  - `TestRequestOpenAI2ClaudeMessage_ConvertsTextFileContentToText`
- Risk: PDF, text, or unsupported attachments may be sent upstream using the
  wrong Claude content type.
- Gate: resolve as part of the public model-contract reliability work.

### P1: test database lifecycle isolation

- Symptom: controller test output includes `sql: database is closed` while a
  user-group lookup is still running.
- Risk: shared database lifecycle or test concurrency can create flaky tests
  and obscure real regressions.
- Gate: controller tests must run repeatedly without closed-database errors.

### Test-environment note: missing frontend dist directories

- Symptom: a fresh worktree cannot compile the root Go package because
  `web/classic/dist` is absent from the `go:embed` input.
- Classification: build/test setup issue, not a user-facing product defect.
- Constraint: generated `dist` directories must not be committed merely to
  make tests pass.
- Follow-up: make the documented test/CI workflow build the required frontend
  assets before running root-package Go tests, or provide a safe test-only
  preparation step.
