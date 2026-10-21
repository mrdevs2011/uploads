---
name: systematic-tool-debugging
description: "Diagnose and recover from tool call failures, unexpected outputs, and integration errors in AI agent workflows. Use when tools return errors, timeouts, malformed data, or when debugging multi-step agent actions."
type: workflow
lifecycle: active
---

# Systematic Tool Debugging — Recover from Agent Tool Failures

Follow this structured process to identify root causes of tool failures and apply precise recovery strategies. Do not retry blindly.

## Core Workflow

1. **Capture full context**: Record the exact tool name, arguments, status code, and complete response body or error message.
2. **Classify the failure** using the table below.
3. **Apply the matching recovery action**. Change inputs or strategy before any retry.
4. **Verify success** on the next call. If it fails again with a new error, re-classify.
5. **Stop after 3 failed attempts** on the same tool path. Switch to an alternative tool or approach.

## Failure Classification

| Category | Typical Symptoms | Common Causes | Recovery Action |
|----------|------------------|---------------|-----------------|
| Authentication / Permission | 401, 403, "unauthorized", "forbidden" | Expired token, missing scope, wrong credentials | Refresh credentials or request elevated permissions before retry |
| Rate Limit | 429, "too many requests", "quota exceeded" | Burst traffic, shared quota | Wait with exponential backoff + jitter (start 2s, max 30s) |
| Timeout | Connection timeout, "timed out", partial response | Slow endpoint, oversized payload, network latency | Reduce payload size, increase timeout if configurable, or split the request |
| Malformed / Unexpected Response | JSON parse error, missing fields, wrong schema | API change, partial data, encoding issue | Validate against known schema; extract usable partial data if safe |
| Invalid Input | 400, "validation failed", "bad request" | Wrong parameter type, missing required field, outdated schema | Re-read the tool schema/description and correct the arguments |
| Transient Server / Network | 5xx, connection reset, "unavailable" | Temporary outage, load balancer issue | Retry with backoff (max 3 times). After 3 failures, treat as persistent |
| Empty or Null Result | Success status but empty body or null fields | No data matching query, soft error | Confirm query parameters; try broader or alternative query |

## Recovery Rules

- Always read the complete error message before deciding the next action.
- For schema or parameter errors, re-inspect the tool definition if available.
- Prefer a different tool or decomposition of the task over repeated identical retries.
- Log the failure category and the change made for later pattern detection.

## Common Issues

| Problem | Symptom | Fix |
|---------|---------|-----|
| Blind identical retries | Rapid rate-limit or identical error loop | Classify first; modify inputs or switch path before retry |
| Lost error context | Agent retries without knowing why previous call failed | Capture full response on every failure before proceeding |
| Over-retrying transient errors | Infinite loop on 5xx | Hard limit of 3 attempts; then escalate or change approach |
| Ignoring partial success | Discards usable data because of one bad field | Extract and use valid portions when safe |

## Quick Decision Checklist

- [ ] Full error captured?
- [ ] Category identified from table?
- [ ] Recovery action changes something (params, timing, tool)?
- [ ] Attempt count ≤ 3 for this path?
- [ ] Alternative path considered if still failing?
