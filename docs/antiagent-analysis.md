# AntiAgent Architectural and Security Analysis

## Context

A comparative evaluation was conducted between [AntiAgent](https://github.com/aiden-guan/AntiAgent) and [antigravity-command-guard](file:///Users/zettt/Code/antigravity-command-guard). Both systems operate as gatekeepers inside the Google Antigravity `PreToolUse` lifecycle hook protocol.

## Codebase Quantitative Distribution

Inspection of the AntiAgent repository reveals a total volume of approximately 12,000 lines of Python, Swift, and configuration code. 

The safety and security evaluation engine comprises approximately 2,079 lines:

- `antiagent/engine/evaluator.py` (208 lines): Core multi-tier evaluation pipeline.
- `antiagent/engine/heuristics/command_guard.py` (195 lines): Deterministic shell parsing and safe command rules.
- `antiagent/engine/heuristics/fs_guard.py` (200 lines): Workspace boundary and secret path detection.
- `antiagent/engine/heuristics/vulnerability_guard.py` (132 lines): Exploit, injection, and privilege escalation patterns.
- `antiagent/engine/heuristics/git_guard.py` (75 lines): Git operation constraints.
- `antiagent/engine/heuristics/tool_guard.py` (52 lines): Safe read tool allowlists.
- `antiagent/engine/context_extractor.py` (201 lines): Task transcript context collection.
- `antiagent/engine/supervisor/*.py` (708 lines): LLM prompts and evaluation adapters.
- `antiagent/audit/logger.py` (104 lines): File-based audit logging.
- `antiagent/hook.py` (204 lines): CLI hook entrypoint.

The remaining 9,269 lines of code constitute non-security application infrastructure:

- `antiagent/cli.py` (1,945 lines): Command line arguments, local installation, and doctor verification.
- `antiagent/engine/remote_sessions.py` (1,515 lines): Remote web session multiplexing.
- `antiagent/engine/conversations.py` (1,387 lines): SQLite extraction of historical Antigravity chat logs.
- `antiagent/updater.py` (1,274 lines): Automated GitHub release checking and self-updating.
- `antiagent/engine/pty_bridge.py` & `pty.py` (1,038 lines): Terminal pseudo-terminal interaction layer.
- `antiagent/desktop/` & `dashboard/` (~2,000 lines + Swift): Native macOS menu bar application, Windows launcher, and web dashboard server.
- `antiagent/engine/pr_monitor.py` (633 lines): Background GitHub Pull Request status monitoring.
- `antiagent/engine/prompt_queue.py` (477 lines): Keyboard shortcut queue interception.

Therefore, approximately 75 percent of the AntiAgent codebase provides user interface wrappers, distribution utilities, and agent session tooling rather than threat detection logic.

## Security Capabilities Comparison

| Dimension | AntiAgent | antigravity-command-guard |
| :--- | :--- | :--- |
| **Runtime Engine** | Python 3.9+ via separate process | TypeScript bundle via Bun |
| **Tool Scope** | Multi-tool (`run_command`, `write_to_file`, `replace_file_content`) | Single tool (`run_command`) |
| **Chained Execution** | Splits operators (`;`, `&&`, `\|\|`, `\n`) | Prefix comparison only |
| **Escalation Mode** | Emits `force_ask` to halt Turbo execution | Emits `ask` |
| **Exploit Database** | 16 dedicated injection and exfiltration patterns | 5 command token patterns |
| **Model Evaluation** | Unstructured conversational LLMs | Structured TypeSafe Jev System One |
| **User Preference** | Separate `.antiagent.json` files | Native Antigravity `settings.json` |

## Adopted Architectural Improvements

1. Upgrade `ask` decisions to `force_ask` to prevent automated bypass under Antigravity Turbo execution modes.
2. Segment chained command strings prior to permission and safety checks.
3. Incorporate deterministic vulnerability signatures covering reverse shells, credential exfiltration, and profile tampering.
4. Expand lifecycle interception to filesystem mutation tools (`write_to_file`, `replace_file_content`).
5. Add standard compilation and test commands to the fast-path bypass table.
