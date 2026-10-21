---
description: "Language- and runtime-specific debugging patterns and common pitfalls. Read when the core workflow needs domain detail."
---

# Debugging Patterns

## Python
- Prefer `traceback.print_exc()` or the built-in debugger (`breakpoint()`).
- Check for mutable default arguments and late binding in closures.
- Use `logging` over `print` for evidence that survives later runs.

## JavaScript / TypeScript
- Distinguish between `undefined` and `null`.
- Watch for unhandled promise rejections and missing `await`.
- Use the browser or Node inspector for async stack traces.

## General
- Always capture the exact command and environment variables that reproduce the failure.
- Compare working vs. failing dependency lockfiles when a regression appears after an update.
