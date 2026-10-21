# Retry Strategies

## Exponential Backoff with Jitter

Base formula (start at 2s, max 30s):

```
delay = min(max_delay, base * 2^attempt) + random(0, jitter)
```

- Attempt 1: ~2s
- Attempt 2: ~4s
- Attempt 3: ~8s (usually stop here)

Always cap retries at 2 for agent workflows.

## When to Retry

| Condition | Retry? | Notes |
|---|---|---|
| 429 / rate limit | Yes (once) | Honor Retry-After header if present |
| 5xx | Yes (once) | Log status code |
| Timeout | Yes (once) | Reduce payload first |
| 4xx (except 429) | No | Fix input or auth |
| Validation error | No | Correct arguments |
| Empty but expected data | No | Broaden query or check permissions |

## Implementation Notes

Prefer language-native sleep or the agent's wait capability. Never busy-wait.
Record the exact delay used in logs.
