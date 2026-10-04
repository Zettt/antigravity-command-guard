---
status: proposed
---

# Adopt AntiAgent Security Mechanisms into Command Guard

We will integrate AntiAgent's chained command segmentation, force_ask escalation, exploit patterns, and filesystem boundary checks into antigravity-command-guard while retaining our TypeScript Bun runtime, native settings ingestion, and TypeSafe Jev classifier. This closes verification bypasses without importing non-security desktop and session overhead.

## Considered Options

- Full adoption of the AntiAgent Python codebase: rejected due to external runtime dependencies, process startup latency, and departure from Antigravity settings.json integration.
- Maintenance of the current command guard architecture: rejected due to Turbo mode bypass of yellow tier reviews and unchecked command chaining.
- Selective port of defensive mechanisms into TypeScript: accepted.

## Consequences

- Chained commands joined by semicolons, pipes, or boolean operators will undergo independent segmentation prior to rule evaluation.
- Yellow tier reviews will emit `force_ask` instead of `ask`, preventing automated proceeding under Turbo mode.
- Blocklists will expand to cover network exfiltration, dynamic eval, and shell profile modification.
- The PreToolUse hook configuration and handler will extend coverage to file writing and editing tools.
