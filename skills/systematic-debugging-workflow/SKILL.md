---
name: systematic-debugging-workflow
description: "Guide structured root-cause analysis for code failures, unexpected behavior, and failed tests. Use when debugging errors, crashes, flaky tests, or production incidents."
type: workflow
lifecycle: active
---

# Systematic Debugging Workflow

Follow a structured process to isolate, diagnose, and fix code issues efficiently. Avoid random changes; always gather evidence first.

## When to Use
- Stack traces, exceptions, or failed assertions
- Unexpected outputs or performance regressions
- Flaky tests or intermittent failures
- "It works on my machine" issues

## Core Workflow

1. **Reproduce reliably**
   - Write the minimal steps or test case that triggers the failure.
   - Note exact inputs, environment (Python version, OS, env vars), and frequency.
   - If intermittent, add logging or reduce concurrency to make it deterministic.

2. **Gather evidence**
   - Capture the full stack trace / error message.
   - Collect relevant logs (before and after the failure point).
   - Check recent code changes (`git log`, `git blame`).
   - Note system state: open files, network calls, database queries, memory/CPU.

3. **Form hypotheses**
   - List 2–3 most likely causes ranked by probability.
   - Prefer simple explanations (config, null, race condition, off-by-one) over complex ones.
   - Identify the smallest change that would confirm or refute each hypothesis.

4. **Test hypotheses systematically**
   - Add targeted print/log statements or use a debugger (breakpoint at the failure line).
   - Isolate variables: comment out sections, mock dependencies, run with reduced data.
   - Measure before/after: timing, memory, query counts.
   - Stop when one hypothesis is confirmed by evidence.

5. **Implement the fix**
   - Make the minimal change that addresses the root cause.
   - Add a regression test that fails before the fix and passes after.
   - Document why the fix works (comment or commit message).

6. **Verify and prevent**
   - Run the original failing case + related tests.
   - Check for similar patterns elsewhere in the codebase.
   - Consider adding monitoring, assertions, or better error messages.

## Debugging Tools Quick Reference

| Tool / Technique | Best For | Command / Example |
|------------------|----------|-------------------|
| Python traceback | Exception location | `python -c "import traceback; traceback.print_exc()"` or `pdb` |
| Logging | Flow and state | `logging.debug(f"var={var}")` with level control |
| Git history | Recent changes | `git log -p -- path/to/file.py` |
| Bisect | Regression hunting | `git bisect start` / `git bisect bad` / `git bisect good` |
| Minimal repro | Isolation | Strip code until only the bug remains |
| Assertions | Early detection | `assert condition, "descriptive message"` |

## Common Failure Patterns

| Symptom | Likely Cause | First Check |
|---------|--------------|-------------|
| NoneType has no attribute | Missing null check / failed lookup | Print the value just before the error |
| Race condition / flaky | Shared mutable state | Add locks or make immutable; run with higher concurrency |
| Works locally, fails in CI | Env differences | Compare Python versions, deps, env vars, paths |
| Slow performance | N+1 queries or nested loops | Profile with `cProfile` or add timing logs |
| Silent failure | Swallowed exception | Search for bare `except:` or empty catch blocks |

## Error Handling Rules
- Never swallow exceptions without logging the full traceback.
- Prefer specific exceptions over bare `except Exception`.
- Include context in error messages: input values, IDs, expected vs actual.
- After fixing, remove temporary debug prints before committing.

## When Stuck
- Explain the problem out loud or write it down (rubber-duck method).
- Reduce the problem size by 50% and retest.
- Search for the exact error message + library name.
- Ask for a second pair of eyes with the evidence collected in steps 1–2.
