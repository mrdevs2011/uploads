---
name: tool-failure-debugging
description: "Systematically diagnose and recover from tool call failures, timeouts, invalid outputs, and agent loop stalls. Use when a tool returns errors, hangs, produces unexpected results, or an agent gets stuck retrying."
type: workflow
lifecycle: active
---

# Tool Failure Debugging — Recover Fast from Tool Errors

Diagnose root causes of tool failures and apply targeted recovery. Prefer structured diagnosis over blind retries.

## Core Workflow

1. **Capture the failure**
   - Record exact tool name, arguments, error message/stack, return code, and any partial output.
   - Note whether the failure is deterministic (same input always fails) or intermittent.

2. **Classify the failure**
   | Type | Signals | First action |
   |---|---|---|
   | **Input validation** | Schema error, missing required field, type mismatch | Fix arguments; re-validate against tool schema |
   | **Auth / permission** | 401, 403, "unauthorized", token expired | Check credentials/scopes; refresh token if supported |
   | **Rate limit / quota** | 429, "too many requests", quota exceeded | Back off exponentially; reduce concurrency |
   | **Timeout / hang** | No response within expected time, connection reset | Retry once with longer timeout; simplify payload |
   | **Transient network** | 5xx, connection refused, DNS failure | Retry with jittered backoff (max 2–3 attempts) |
   | **Logic / contract** | 200 but wrong shape, empty when data expected, hallucinated fields | Inspect raw response; adjust parsing or prompt |
   | **Environment** | Missing binary, wrong cwd, permission denied on path | Verify tool environment; use absolute paths |

3. **Apply recovery**
   - **Input issues**: Correct arguments and call once more. Do not loop.
   - **Auth**: Attempt refresh or surface clear "needs re-auth" message. Stop.
   - **Rate limit**: Wait (use exponential backoff starting at 2s) then retry once. If still limited, reduce scope or defer.
   - **Timeout**: Retry once with reduced payload size or simpler query. If still failing, break the task into smaller calls.
   - **Transient**: Retry up to 2 times with 1s + random jitter. Log each attempt.
   - **Logic**: Read the raw tool result carefully. Adjust extraction logic or rephrase the call. Never assume the tool "should have" returned something.
   - **Environment**: Run a minimal diagnostic command (e.g., `which`, `ls`, `pwd`) before retrying the original call.

4. **Escalate or stop**
   - After one targeted recovery attempt fails, stop retrying the same call.
   - Summarize: what was tried, what the error was, and the most likely next human action.
   - Prefer asking for clarification on ambiguous inputs over inventing workarounds.

## Retry Rules (hard limits)

- Never retry the identical call more than twice.
- Never retry validation or auth errors.
- Always change something (arguments, scope, timeout, or approach) between attempts.
- Log every attempt with the exact arguments used.

## Common Patterns

| Pattern | When to use | Example |
|---|---|---|
| **Simplify then expand** | Complex query fails | Drop optional filters, get a small result, then add constraints |
| **Binary search payload** | Large input times out | Halve the input size until it succeeds, then locate the problematic part |
| **Schema echo** | Unclear expected format | Call a "describe" or list-capabilities method if available |
| **Fallback tool** | Primary tool unavailable | Use a simpler alternative (e.g., file read instead of API) and note the degradation |

## Common Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent loops on same error | No classification step | Force classification table before any retry |
| "Works locally but fails in agent" | Environment or cwd difference | Explicitly set working directory and check paths |
| Partial success then failure | Rate limit or token budget | Reduce batch size; checkpoint progress |
| Tool returns empty list | Wrong filter or permissions | Verify with a broader query first |

## References

- See `references/retry-strategies.md` for backoff implementations and jitter formulas.
- See `references/error-taxonomy.md` for extended classification examples.
