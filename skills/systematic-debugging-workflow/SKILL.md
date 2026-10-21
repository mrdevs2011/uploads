---
name: systematic-debugging-workflow
description: "Guide for systematically debugging software issues. Use when investigating bugs, errors, unexpected behavior, performance problems, or failed tests in code."
type: workflow
lifecycle: active
---

# Systematic Debugging Workflow

Follow this structured process to identify, isolate, and resolve bugs efficiently. Prefer reproduction and evidence over guessing.

## Core Workflow

1. **Reproduce the issue**
   - Obtain exact steps, input, environment, and expected vs actual behavior.
   - Create a minimal failing test or script if none exists.
   - Confirm it fails consistently.

2. **Gather evidence**
   - Collect error messages, stack traces, logs, and relevant code paths.
   - Note recent changes (git log, diffs).
   - Check configuration, dependencies, and environment variables.

3. **Isolate the cause**
   - Binary search: comment out or stub sections to narrow the failing region.
   - Add targeted logging or use a debugger at suspected points.
   - Verify assumptions with assertions or print statements.
   - Check edge cases, nulls, types, and boundaries.

4. **Form and test hypotheses**
   - State a clear hypothesis: "If X is true, then changing Y should fix Z."
   - Make the smallest possible change to test it.
   - Re-run the reproduction after each change.
   - Discard hypotheses that fail; refine those that partially succeed.

5. **Implement the fix**
   - Prefer the simplest correct fix.
   - Add or update tests to prevent regression.
   - Document the root cause briefly in commit message or comments only if non-obvious.

6. **Verify and clean up**
   - Confirm the original issue is resolved and no new issues introduced.
   - Remove temporary debug code.
   - Run full relevant test suite.

## Key Principles

- Reproduce first. No reproduction = no reliable fix.
- One variable at a time. Change only one thing per experiment.
- Evidence over intuition. Trust logs and debugger over memory.
- Smallest fix. Avoid rewriting unrelated code.

## Common Debugging Tools

| Situation              | Preferred Tool                  | Notes                              |
|------------------------|---------------------------------|------------------------------------|
| Stack traces / exceptions | Language debugger / IDE        | Set breakpoints at throw sites     |
| Performance / hangs    | Profiler, sampling             | Look for hot spots or locks        |
| Intermittent failures  | Logging + correlation IDs      | Increase log level temporarily     |
| Dependency issues      | Package lock + clean install   | Check versions and transitive deps |
| Environment differences| Container / exact version match| Compare env vars and OS            |

## Common Issues

| Symptom                     | Likely Cause                  | First Check                     |
|-----------------------------|-------------------------------|---------------------------------|
| Works locally, fails in CI  | Env / dependency mismatch     | Exact package versions, secrets |
| Intermittent test failure   | Race condition / shared state | Timing, order, cleanup          |
| Null / undefined error      | Missing initialization        | Call path and default values    |
| Off-by-one / boundary       | Loop or index logic           | Inputs at 0, 1, n-1, n          |

See `references/debug-patterns.md` for language-specific patterns if available.
