# Wayfinder Map: Antigravity Command Safety Plugin

## Destination
An Antigravity plugin using `PreToolUse` lifecycle hooks and TypeSafe Jev to evaluate `run_command` invocations, outputting risk ratings (green, yellow, red), intent summaries, and enforcement decisions (`allow`, `ask`, `force_ask`, `deny`).

## Notes
- Platform: Antigravity plugin architecture (`plugin.json`, `hooks.json`, `PreToolUse` hook).
- Runtime: Bun with TypeScript for hook execution.
- Backend: TypeSafe Jev System One model utilizing `Score`, `Noul`, and `Choice` primitives.
- Performance boundary: Sub-second command evaluation budget.

## Resolved Decisions

### 1. Lifecycle Hook Integration Point
Use Antigravity `PreToolUse` hook with matcher `run_command` over the stdin/stdout JSON protocol.

### 2. Decision Engine Selection
Use TypeSafe Jev System One model for structured judgments and probability output in place of conversational LLMs.

### 3. Jev Judgment Schema
Single-request battery containing:
- `severity` (`Score`): Potential blast radius and harm rating (Levels 0 to 3).
- `destructive` (`Noul`): Probability of irreversible data loss or deletion.
- `outside_workspace` (`Noul`): Probability of accessing paths outside workspace boundaries.
- `intent_category` (`Choice`): Classification into operational categories (`read_only_query`, `build_and_test`, `file_modification`, `dependency_management`, `git_vcs_operation`, `system_administration`, `destructive_deletion`).

### 4. Hook Decision Policy
- Red Tier (`destructive.noul >= 0.70` or `outside_workspace.noul >= 0.60` or `severity.score >= 2.5`): `"deny"`.
- Yellow Tier (`severity.score >= 1.0` or `destructive.noul >= 0.30` or mutation category): `"ask"`.
- Green Tier (`severity.score < 1.0` and low probabilities): `"allow"`.

### 5. Fast-Path Filter
Static in-process pass rules bypass remote API calls for read-only commands (`git status`, `git diff`, `ls`, `pwd`, `cat`, `head`, `tail`, `wc`, `fd`, `rg`, `which`, version checks).

### 6. Failure Fallback Policy
- Timeout threshold: 1500 milliseconds.
- Default fallback on timeout or API error: `"ask"`.
- Hardcoded block on recognized dangerous tokens (`rm -rf`, `mkfs`, `dd`, `chmod -R 777`, `git reset --hard`): `"deny"`.

### 7. Native Permissions Ingestion
Parse `action(target)` entries from `~/.gemini/antigravity-cli/settings.json`, enforcing Antigravity precedence order (`deny` > `ask` > `allow`) prior to remote inference.

### 8. Plugin Packaging
Deploy as `.agents/plugins/command-guard/` with pre-compiled single-file bundle (`dist/index.js`) executed via Bun.

### 9. Context State Enrichment
Construct compact context payload from `stdin` and local transcript tail containing command string, working directory, workspace root, user goal, and prior step failure status (< 300 tokens).

### 10. Local Audit Logging
Append-only log at `logs/audit.jsonl` recording timestamps, conversation IDs, step indices, commands, scores, decisions, and reasons with a 10MB rotation cap.

### 11. Reason Presentation Formatting
Standard badge structure for terminal and IDE dialogs:
`[{TIER} - {STATUS}] Intent: {category} | Detail: {description}`
