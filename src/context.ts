import type { CommandContextState, PreToolUseInput } from "./types.ts";

export function buildCommandContext(
  input: PreToolUseInput,
): CommandContextState {
  const rawCommand =
    input.arguments?.CommandLine ??
    input.arguments?.command ??
    input.arguments?.cmd ??
    input.toolCall?.args?.CommandLine ??
    input.toolCall?.args?.command ??
    input.toolCall?.args?.cmd ??
    "";

  const rawCwd =
    input.arguments?.Cwd ??
    input.arguments?.cwd ??
    input.toolCall?.args?.Cwd ??
    input.toolCall?.args?.cwd ??
    process.cwd();

  const cwd =
    typeof rawCwd === "string" && rawCwd.trim().length > 0
      ? rawCwd.trim()
      : process.cwd();

  const rawWorkspaceRoot =
    input.context?.workspace_root ??
    input.workspacePaths?.[0] ??
    cwd;

  const workspaceRoot =
    typeof rawWorkspaceRoot === "string" && rawWorkspaceRoot.trim().length > 0
      ? rawWorkspaceRoot.trim()
      : cwd;

  const rawGoal = input.context?.goal;
  const goal =
    typeof rawGoal === "string" && rawGoal.trim().length > 0
      ? rawGoal.trim()
      : undefined;

  return {
    command: typeof rawCommand === "string" ? rawCommand.trim() : "",
    cwd,
    workspace_root: workspaceRoot,
    goal,
  };
}
