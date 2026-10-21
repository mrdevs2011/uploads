---
name: python-exception-triage
description: "Systematically analyze, categorize, and fix Python exceptions and stack traces. Use when debugging runtime errors, unexpected crashes, or reviewing exception handling in Python code."
type: workflow
lifecycle: active
---

# Python Exception Triage — Systematic Error Analysis

Categorize the exception, extract the root cause from the traceback, and apply the minimal correct fix.

## Core Workflow

1. Capture the full traceback and surrounding context (last 20 lines of relevant code).
2. Identify the exception class and message.
3. Classify the error using the table below.
4. Trace the call stack to the originating line.
5. Apply the corresponding fix pattern.
6. Verify the fix with a minimal reproduction.
7. Add a regression test if the error is user-facing or in a library path.

## Exception Classification

| Category | Common Exceptions | Root Cause Indicators | Preferred Fix |
|----------|-------------------|-----------------------|---------------|
| Type mismatch | TypeError, AttributeError | Wrong type passed or missing attribute | Add isinstance check or correct type conversion |
| Missing resource | FileNotFoundError, KeyError, IndexError | Path, key, or index does not exist | Guard with existence check or provide default |
| Value error | ValueError, AssertionError | Invalid argument or failed invariant | Validate inputs early; raise clearer error |
| External failure | ConnectionError, TimeoutError, OSError | Network, disk, or system call failed | Retry with backoff or fail gracefully |
| Logic error | ZeroDivisionError, RecursionError | Algorithm or state bug | Fix the algorithm; add bounds checks |

## Fix Patterns

**TypeError / AttributeError**
- Print type of each operand.
- Replace with explicit conversion or method that exists on the actual type.
- Prefer `getattr(obj, name, default)` over bare attribute access when optional.

**KeyError / IndexError**
- Use `.get(key, default)` for dicts.
- Check `if index < len(seq)` before access.
- Prefer iteration over manual indexing.

**FileNotFoundError**
- Resolve absolute path with `pathlib.Path.resolve()`.
- Create parent directories with `mkdir(parents=True, exist_ok=True)` only when creation is intended.

**Connection / Timeout**
- Wrap in try/except with exponential backoff (max 3 attempts).
- Surface a clear user-facing message instead of the raw exception.

## Common Issues

| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| Traceback stops at library code | Error originates in caller | Inspect the frame above the library |
| "NoneType has no attribute" | Missing return or failed lookup | Check for None before method call |
| Exception swallowed by broad except | Bare `except:` or `except Exception:` | Catch specific exceptions; re-raise after logging |
| Error only in production | Environment difference | Compare Python version, installed packages, and env vars |

## Verification

After applying the fix:
1. Reproduce the original failing input.
2. Confirm the exception is gone or correctly handled.
3. Check that nearby edge cases still pass.
4. If the skill is used inside an agent loop, ensure the tool returns a structured error instead of crashing the session.
