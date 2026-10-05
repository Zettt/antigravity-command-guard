---
name: command-guard
description: Evaluates shell command safety and file mutations in real time using TypeSafe Jev System One judgments, deterministic risk tiers (Red, Yellow, Green), fast-path rules, dangerous token blocks, and local audit logging.
---

# Command Guard

Command Guard is an Antigravity plugin and `PreToolUse` safety gate. It intercepts `run_command`, `write_to_file`, and `replace_file_content` invocations to protect against destructive filesystem operations, unintended mutations, and directory boundary escapes.

## Features

- **Fast-Path Filter**: Instant pass for read-only utilities (`git status`, `git diff`, `ls`, `cat`, `head`, `tail`, `wc`, `fd`, `rg`, `which`) and version flags.
- **Dangerous Token Blocklist**: In-process rejection for catastrophic command tokens (`rm -rf`, `mkfs`, `dd`, `chmod -R 777`, `git reset --hard`).
- **Native Permissions Ingestion**: Enforces user permission rules from `~/.gemini/antigravity-cli/settings.json` with precedence order `deny` > `ask` > `allow`.
- **TypeSafe Jev Judgment Battery**: Evaluates severity (`Score`), destructive risk (`Noul`), workspace escape probability (`Noul`), and operational intent (`Choice`).
- **Deterministic Enforcement**: Maps risk scores to Red (`deny`), Yellow (`force_ask`), and Green (`allow`) tiers with formatted human-scannable reason badges.
- **Filesystem Guard**: Auto-approves agent artifact mutations under `.gemini/antigravity/brain/`, while protecting sensitive files (`.env`, `.ssh/`, `.git/`, credentials) and outside-workspace target paths.
- **Audit Logging**: Appends all evaluated events to `logs/audit.jsonl` with an automated 10MB cascading file rotation limit.
