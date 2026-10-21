# Error Taxonomy

Extended classification examples for common agent tools.

## Input Validation

- Missing required field
- Wrong type (string vs number)
- Path traversal or invalid characters
- Payload too large for the tool

## Authentication & Authorization

- Expired token / session
- Insufficient scope (e.g., read-only token used for write)
- Missing API key in environment
- Org-level permission denied

## Rate Limits & Quotas

- Per-minute / per-hour limits
- Concurrent request limits
- Token or credit quota exhausted
- Provider-specific throttling (GitHub secondary rate limit, OpenAI RPM, etc.)

## Timeouts & Network

- Socket timeout
- DNS resolution failure
- Connection reset by peer
- Proxy or firewall interference

## Contract / Logic Errors

- Tool returns 200 but missing expected keys
- Pagination not handled (only first page returned)
- Silent truncation
- Hallucinated or stale data in response

## Environment & Setup

- Binary not in PATH
- Wrong working directory
- File permissions
- Missing dependency or runtime

Use this taxonomy to map any new error message into one of the six core categories before deciding on a recovery action.
