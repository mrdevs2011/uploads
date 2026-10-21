---
name: root-cause-debugging
description: "Systematically debug coding errors by classifying symptoms, isolating root causes with evidence, and verifying fixes. Use when encountering runtime errors, unexpected behavior, failing tests, or unexplained bugs."
type: workflow
lifecycle: active
---

# Root Cause Debugging — Isolate and Fix Bugs Reliably

Use this workflow when code fails, behaves unexpectedly, or tests fail. Prefer evidence over guesses. Never apply a fix without confirming the root cause.

## Core Workflow

1. **Classify the symptom**
   - Capture the exact error message, stack trace, or observed behavior.
   - Note environment: language/runtime, version, OS, inputs, recent changes.
   - Classify: crash, incorrect output, hang/timeout, flaky test, performance regression, or silent failure.

2. **Reproduce reliably**
   - Reduce to the smallest input or test case that triggers the issue.
   - Run the failing command/test in isolation.
   - Confirm it fails consistently before proceeding.

3. **Gather evidence**
   - Read the full stack trace or logs.
   - Add targeted logging or use a debugger at the failure site.
   - Check recent commits, dependency changes, and configuration.
   - Inspect relevant data structures or state at the point of failure.

4. **Form and test hypotheses**
   - List 1–3 plausible root causes ranked by likelihood.
   - For each, design a minimal experiment (add assert, print, or temporary change) that would confirm or rule it out.
   - Execute the highest-probability experiment first.

5. **Identify the root cause**
   - Stop when evidence confirms a single cause.
   - Document: what failed, why it failed, and the exact condition that triggers it.

6. **Apply and verify the fix**
   - Make the smallest change that eliminates the root cause.
   - Re-run the reproduction case and related tests.
   - Check for regressions in adjacent functionality.
   - Only then commit or declare the bug fixed.

## Classification Table

| Symptom | First checks | Common root causes |
|---|---|---|
| Crash / exception | Stack trace, last successful log | Null/undefined, out-of-bounds, type mismatch, unhandled promise |
| Wrong output | Inputs, intermediate values | Off-by-one, wrong formula, stale data, race condition |
| Hang / timeout | Resource usage, locks, network | Deadlock, infinite loop, missing await, external dependency |
| Flaky test | Timing, shared state, order | Race, unseeded randomness, external service, cleanup |
| Performance | Profiles, query plans, allocations | N+1, missing index, unnecessary copy, hot loop |

## Common Issues

| Problem | Action |
|---|---|
| Cannot reproduce | Check environment parity, clean build, dependency lockfile, or concurrent interference |
| Multiple symptoms | Fix one confirmed root cause at a time; re-evaluate after each fix |
| Fix introduces new bug | Revert, re-verify original root cause, and choose a narrower change |
| No stack trace | Add logging at boundaries, enable verbose mode, or use a debugger |

## When to Stop and Escalate

Stop and gather more information if:
- Reproduction is impossible after three attempts.
- The failure depends on external systems you cannot control.
- Evidence points to a library or compiler bug.

See `references/debugging-patterns.md` for language-specific patterns if needed.
