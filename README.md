# Antigravity Command Guard

[![Version](https://img.shields.io/badge/version-0.5.0-blue.svg)](package.json)
[![Runtime](https://img.shields.io/badge/runtime-bun_%3E%3D_1.0-orange.svg)](https://bun.sh)
[![Tests](https://img.shields.io/badge/tests-108%20passing-brightgreen.svg)](tests/)

**Command Guard** is an autonomous safety plugin and `PreToolUse` lifecycle gate for Google Antigravity (compatible with both the Antigravity CLI `agy` and the Antigravity Desktop IDE).

It intercepts agent tool executions (`run_command`, `write_to_file`, `replace_file_content`) to prevent catastrophic file deletion, unintended system mutations, credential exfiltration, and out-of-workspace escapes while maintaining zero latency for routine developer tasks.

Read ["Risk Tiers and Reason Badges"](#risk-tiers-and-reason-badges) for which Command Guard messages will appear when you're using it from now. The typical permission dialog will be the same. Pay attention to the message above the dialog. It will give you an enriched explanation of why this confirmation is requested.

---

## Architecture Pipeline

Every command evaluated by Command Guard progresses through an ordered multi-tier evaluation pipeline:

```text
Tool Invocation (run_command / write_to_file / replace_file_content)
   │
   ├── 1. Filesystem Guard ──────────────────────► Auto-approves agent artifacts
   │                                               Flags sensitive targets (.env, .git, etc.)
   │
   ├── 2. Catastrophic Blocklist ────────────────► RED (DENIED) on rm -rf /, mkfs,
   │                                               eval dynamic code, reverse shells
   │
   ├── 3. Native Settings Permissions ───────────► Ingests settings.json rules
   │                                               Precedence: deny > ask > allow
   │
   ├── 4. Static Fast-Path Filter ───────────────► GREEN (ALLOWED) in 0ms for
   │                                               ls, pwd, cat, git status, bun test, pytest
   │
   ├── 5. TypeSafe Jev System One Evaluation ────► Semantic evaluation
   │                                               Calculates severity, destructive probability,
   │                                               workspace escape risk, and intent category
   │
   └── 6. Audit Logging ─────────────────────────► JSONL append to logs/audit.jsonl
                                                   Automated 10MB file rotation
```

### Compound Command Dissection

A common failure mode in rudimentary command filtering plugins is vulnerability to command chaining (for example, concealing a destructive operation behind an innocuous prefix or piping dynamic scripts). 

Command Guard parses shell command streams to extract individual execution segments:
* **Supported Operators**: Recursively splits chains connected by `&&`, `||`, `;`, newlines, and singular pipes (`|`).
* **Quote-Aware Tokenization**: Correctly distinguishes shell chaining operators from character literals enclosed in single (`'...'`) or double (`"..."`) quotation marks.
* **Segment-Level Enforcement**: Every segment is evaluated independently against catastrophic token blocklists, exploit patterns (`curl ... | bash`, `eval dynamic execution`, shell profile modification), and user settings permissions. If any segment within a pipeline violates safety policy, the entire chain is intercepted.

---

## Operational Efficacy

Audit telemetry recorded across 281 live agent executions indicates a reduction in confirmation interruptions:

* **69.04% Prompt Reduction**: Only 30.96% of commands required human review. 69.04% resolved automatically without prompt fatigue.
* **60.50% Safe Auto-Approval (`GREEN`)**: Routine development operations (`git status`, test runners, file inspection) were approved silently.
* **8.54% Immediate Hard Denials (`RED`)**: High-risk operations (`git reset --hard`, out-of-workspace escapes, blocked commands) were aborted immediately without requiring the user to evaluate blast radius.
* **Sub-Millisecond Deterministic Latency**: Fast-path and static rule evaluations execute in under 1.00 ms, introducing negligible delay to agent execution loops.

---

## Installation

### Prerequisites

* **Runtime**: [Bun](https://bun.sh) (`bun` version 1.0 or higher accessible in system PATH).
* **Environment**: Antigravity CLI (`agy`) or Antigravity Desktop IDE.
* **Credentials** *(Optional)*: TypeSafe System One API key for semantic Jev evaluation.

### Quick Installation (Antigravity CLI & TUI)

Using the Antigravity CLI:

```bash
agy plugin install https://github.com/zettt/antigravity-command-guard.git
```

Or inside an active Antigravity chat session:

```text
/plugin install https://github.com/zettt/antigravity-command-guard.git
```

---

### Manual Global Installation

Alternatively, clone directly into your Antigravity global plugins directory:

```bash
# 1. Clone into the global Antigravity plugins directory
git clone https://github.com/zettt/antigravity-command-guard.git ~/.gemini/config/plugins/command-guard

# 2. Navigate to directory
cd ~/.gemini/config/plugins/command-guard

# 3. Create configuration file from template
cp config.example.json config.json
```

Antigravity automatically discovers and activates plugins present in `~/.gemini/config/plugins/`.

### Workspace-Scoped Installation

To enforce project-specific guardrails for a team repository:

```bash
# Add as a submodule in your project root
git submodule add https://github.com/zettt/antigravity-command-guard.git .agents/plugins/command-guard
cp .agents/plugins/command-guard/config.example.json .agents/plugins/command-guard/config.json
```

---

## Configuration

Settings are managed via `config.json` inside the plugin directory or via environment variables.

### File Configuration (`config.json`)

```json
{
  "apiKey": "<YOUR_TYPESAFE_API_KEY>",
  "endpointUrl": "https://api.typesafe.ai/v1/systemone",
  "timeoutMs": 3000
}
```

### Environment Variable Overrides

Environment variables take precedence over `config.json`:

* `TYPESAFE_API_KEY`: API authentication key.
* `TYPESAFE_API_ENDPOINT`: Endpoint URL (default: `https://api.typesafe.ai/v1/systemone`).
* `COMMAND_GUARD_TIMEOUT_MS`: Execution timeout budget for Jev queries (default: `3000`).

### Offline & Keyless Operation

If no API key is configured, Command Guard functions in deterministic mode:

* Static fast-path rules (`git status`, `ls`, test runners) execute without interruption.
* Catastrophic tokens and exploit chains (`rm -rf`, `git reset --hard`) are blocked immediately.
* Native user settings permissions remain fully enforced.
* Complex or unfamiliar commands escalate safely to Yellow interactive review with an explanatory notice.

---

## Updating the Plugin

Because `config.json` and `logs/` are excluded by `.gitignore`, updating the plugin preserves your local authentication key and audit history:

```bash
# 1. Navigate to your installed plugin directory
cd ~/.gemini/config/plugins/command-guard

# 2. Pull the latest release
git pull origin main

# 3. If running from source, recompile the bundle:
bun run build
```

Antigravity executes the updated bundle on the subsequent agent turn without requiring an application restart.

---

## Risk Tiers and Reason Badges

Command Guard formats decision rationales into concise, human-scannable badges:

### 1. RED Tier (`DENIED`)

Hard block. Immediately aborts execution with a reason badge:

```text
tool call denied by pre-tool hook: Blocked high-risk command: Blocked command token detected: git reset --hard [RED - DENIED] (intent: destructive_deletion)
tool call denied by pre-tool hook: Blocked high-risk command: Catastrophic data loss risk (0.85) [RED - DENIED] (intent: destructive_deletion)
tool call denied by pre-tool hook: Blocked high-risk command: Mutating path outside workspace (0.90) [RED - DENIED] (intent: file_modification)
```

### 2. YELLOW Tier (`REVIEW`)

Interactive escalation. Displays confirmation modal to the user:

```text
Needs review: Severity indicates workspace modification (2.0) [YELLOW - REVIEW] (intent: git_vcs_operation)
Needs review: Elevated severity score (1.8) [YELLOW - REVIEW] (intent: build_and_test)
Needs review: Mutating operation (file modification) [YELLOW - REVIEW] (intent: file_modification)
Needs review: Read query outside workspace (0.80) [YELLOW - REVIEW] (intent: read_only_query)
```

### 3. GREEN Tier (`ALLOWED`)

Auto-approved with zero user friction:

```text
Allowed safe command: Static fast-path pass [GREEN - ALLOWED] (intent: read_only_query)
Allowed safe command: Routine operation within safe thresholds (severity: 1.0) [GREEN - ALLOWED] (intent: build_and_test)
Allowed safe command: Routine operation within safe thresholds (severity: 1.2) [GREEN - ALLOWED] (intent: git_vcs_operation)
```

---

## Development and Testing

Command Guard is implemented in TypeScript using the Bun runtime.

```bash
# Install dependencies
bun install

# Run automated test suites (108 tests)
bun test

# Build single-file production bundle
bun run build
```

---

## License

MIT
