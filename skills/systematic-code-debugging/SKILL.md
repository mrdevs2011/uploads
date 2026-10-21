---
name: systematic-code-debugging
description: "Applies a structured, step-by-step protocol to diagnose and resolve code errors, bugs, and runtime issues. Use when users report crashes, exceptions, unexpected behavior, test failures, or need help debugging logic errors in code."
type: workflow
lifecycle: active
---

# Systematic Code Debugging — Structured Error Resolution Protocol

Follow this protocol to systematically isolate, diagnose, and fix code issues without guessing. Prioritize reproduction, isolation, and verification.

## Hard Constraints
- Always reproduce the error first before proposing fixes.
- Never suggest changes without confirming the root cause through evidence.
- Always include a verification step after any proposed fix.
- Prefer minimal, targeted changes over broad rewrites.
- Document the hypothesis and evidence at each step.

## Workflow

1. **Reproduce the issue**
   - Request the exact error message, stack trace, or unexpected output.
   - Ask for minimal reproducible example (code snippet + inputs).
   - Confirm environment details: language/version, OS, dependencies.

2. **Isolate the failure**
   - Identify the failing component, function, or line from the stack trace.
   - Check recent changes that could introduce the bug.
   - Narrow scope by commenting out or mocking adjacent code if needed.

3. **Form and test hypotheses**
   - List 2-3 most likely causes based on error type (null, type mismatch, race condition, etc.).
   - For each hypothesis, define a quick test (log, assertion, or small experiment).
   - Execute tests and record results. Discard disproven hypotheses.

4. **Implement the fix**
   - Apply the smallest change that addresses the confirmed root cause.
   - Preserve existing behavior for unrelated code paths.
   - Add a regression test or assertion if applicable.

5. **Verify resolution**
   - Re-run the original failing case.
   - Check edge cases related to the fix.
   - Confirm no new errors were introduced.

## Common Error Patterns

| Error Type | Typical Cause | First Check |
|------------|---------------|-------------|
| Null/Undefined | Missing initialization or early return | Trace variable origin |
| Type mismatch | Incorrect casting or API contract change | Inspect types at call site |
| Index/Out of bounds | Off-by-one or empty collection | Validate length before access |
| Timeout/Race | Async timing or shared state | Add logs around concurrent sections |
| Dependency error | Version conflict or missing install | Check lockfile and import paths |

## Output Format
Present findings as:
- **Reproduction**: confirmed / not confirmed
- **Root cause**: one-sentence statement with evidence
- **Fix**: the exact change (code snippet)
- **Verification**: steps and expected outcome

## When NOT to Use
- Pure code review without a reported error
- Performance optimization without a failing case
- Architecture redesign requests
