---
status: accepted
---

# Plain-Language Reasons, Plugin Configuration File, and Outside-Workspace Policy

We will enhance command guard diagnostic clarity, introduce external `config.json` configuration loading, increase evaluation latency budgets, and distinguish read-only outside-workspace inspections from destructive mutations.

## Context

1. Interaction feedback indicated that raw bracketed identifiers such as `[YELLOW - REVIEW]` without leading human-readable descriptions provide sub-optimal context in Antigravity client confirmation dialogs.
2. The Jev API client relied exclusively on environment variables (`TYPESAFE_API_KEY`, `TYPESAFE_API_ENDPOINT`), lacking a file-based configuration mechanism (`config.json`) within `~/.gemini/config/plugins/command-guard/`.
3. High latency calls under network jitter exceeded the default 1500 millisecond budget, causing premature timeout fallbacks.
4. The policy engine classified any command with `outside_workspace >= 0.60` as a RED deny, preventing safe external read-only queries (such as system diagnostics or documentation searches) that should instead be reviewed under YELLOW.

## Decision

1. Prefix verdict explanations with clear, descriptive plain-language summaries before diagnostic metadata badges.
2. Ingest plugin configuration from `~/.gemini/config/plugins/command-guard/config.json` with precedence: Environment Variables > `config.json` > Hardcoded Defaults.
3. Support `apiKey`, `endpointUrl` (or `endpoint`), and `timeoutMs` settings, raising the default timeout budget to 3000 milliseconds.
4. Route read-only inspection queries targeting paths outside the active workspace to YELLOW (`force_ask`) rather than RED (`deny`) if destructive probability remains below 0.70 and severity remains below 2.5.
5. Embed semantic version metadata (`0.2.0`) in evaluation responses and audit logs.

## Consequences

- Antigravity confirmation prompts display human-readable context directly.
- Users can supply TypeSafe credentials without exporting shell variables.
- Read-only external inspections are not denied prematurely.
- Test suites must validate precedence rules and fallback behaviors.
