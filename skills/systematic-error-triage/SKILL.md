---
name: systematic-error-triage
description: "Triage coding and runtime errors using a systematic 5-step framework. Use when debugging exceptions, unexpected behavior, stack traces, or production incidents."
type: workflow
lifecycle: active
---

# Systematic Error Triage — Diagnose Fast, Fix Right

Apply a consistent 5-step process to any error. Prefer root-cause over symptom treatment. Stop at the first step that yields a clear, testable hypothesis.

## When to Use
- Unhandled exceptions or crashes
- Unexpected output or silent failures
- Intermittent bugs, race conditions, or flaky tests
- Production incidents with limited context

## 5-Step Triage

1. **Capture** — Collect minimal reproducible context.  
   Record: exact error message, full stack trace (top 15 frames), input values, environment (OS, runtime version, recent changes), and timestamp.  
   If missing, ask once for the missing piece; do not guess.

2. **Classify** — Categorize the failure.  
   | Category | Typical signals | First action |
   |---|---|---|
   | Syntax / Compile | Parse error, missing symbol | Fix the reported line |
   | Type / Contract | TypeError, assertion fail | Check call site vs signature |
   | Logic | Wrong result, off-by-one | Add assertions around suspect region |
   | Resource | OOM, timeout, file-not-found | Inspect limits and paths |
   | Concurrency | Intermittent, race | Reproduce under load or with logs |
   | External | 4xx/5xx, network | Check status code + retry policy |
   | Environment | Works locally, fails in CI | Diff env vars and deps |

3. **Hypothesize** — Form one primary hypothesis and one alternative.  
   Write them as falsifiable statements: “If I change X, the error disappears.”  
   Prefer the simplest explanation that fits the evidence.

4. **Verify** — Test the hypothesis with the smallest possible experiment.  
   - Add a targeted log or assertion.  
   - Isolate the failing unit (unit test, minimal repro).  
   - Bisect recent commits if the failure is new.  
   Do not change multiple things at once.

5. **Remediate & Prevent** — Apply the fix, then add a guard.  
   - Fix the root cause.  
   - Add a regression test or assertion that would have caught it.  
   - Document the class of error in a comment or runbook entry if it is likely to recur.

## Common Issues

| Symptom | Likely miss | Fix |
|---|---|---|
| Same error returns after “fix” | Treated symptom only | Return to step 3 and re-hypothesize |
| Intermittent failure | Concurrency or external dependency | Add timestamps and correlation IDs |
| Stack trace points to library | Caller violated contract | Inspect the call site and arguments |
| Error only in production | Missing env or data difference | Compare configs and sample the failing input |

## Output Format
When reporting results, use:

```
**Category**: ...
**Hypothesis**: ...
**Verification**: ...
**Fix**: ...
**Prevention**: ...
```

Stop early if the error is fully resolved and a regression check is in place.