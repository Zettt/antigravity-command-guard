import { writeAuditLog } from "./audit.ts";
import { findBlockedToken } from "./blocklist.ts";
import { buildCommandContext } from "./context.ts";
import { isFastPathAllowed } from "./fast-path.ts";
import {
  evaluateSettingsPermission,
  loadDefaultSettings,
  parseSettingsPermissions,
} from "./settings.ts";
import { evaluateFileMutationTool } from "./fs-guard.ts";
import { evaluateRiskTier, formatBadge } from "./policy.ts";
import { VERSION } from "./version.ts";
import type {
  AuditLogEntry,
  Environment,
  JevJudgmentBatteryResult,
  PreToolUseDecision,
  PreToolUseInput,
  PreToolUseResponse,
} from "./types.ts";

const FILE_MUTATION_TOOLS = new Set([
  "write_to_file",
  "replace_file_content",
  "delete_file",
]);

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export async function handlePreToolUse(
  input: PreToolUseInput,
  env?: Environment,
): Promise<PreToolUseResponse> {
  const toolName = input.tool_name ?? input.toolCall?.name;
  const startTime = env?.now ? env.now().getTime() : Date.now();

  const rawCwd =
    input.arguments?.Cwd ??
    input.arguments?.cwd ??
    input.toolCall?.args?.Cwd ??
    input.toolCall?.args?.cwd;
  const cwd =
    typeof rawCwd === "string" && rawCwd.trim().length > 0
      ? rawCwd.trim()
      : undefined;

  const rawWorkspaceRoot =
    input.context?.workspace_root ?? input.workspacePaths?.[0];
  const workspace_root =
    typeof rawWorkspaceRoot === "string" && rawWorkspaceRoot.trim().length > 0
      ? rawWorkspaceRoot.trim()
      : undefined;

  const rawCommand =
    input.arguments?.CommandLine ??
    input.arguments?.command ??
    input.arguments?.cmd ??
    input.toolCall?.args?.CommandLine ??
    input.toolCall?.args?.command ??
    input.toolCall?.args?.cmd;
  const command = typeof rawCommand === "string" ? rawCommand.trim() : "";

  const respond = async (
    response: PreToolUseResponse,
    meta?: {
      tier?: string;
      scores?: JevJudgmentBatteryResult;
      command?: string;
    },
  ): Promise<PreToolUseResponse> => {
    const finalDecision: PreToolUseDecision =
      response.decision === "ask" ? "force_ask" : response.decision;
    const finalResponse: PreToolUseResponse = {
      decision: finalDecision,
      reason: response.reason,
    };

    const nowMs = env?.now ? env.now().getTime() : Date.now();
    const latency_ms = nowMs - startTime;
    const timestamp = (env?.now ? env.now() : new Date()).toISOString();

    const resolvedTier =
      meta?.tier ??
      (response.reason?.includes("[RED")
        ? "RED"
        : response.reason?.includes("[YELLOW")
          ? "YELLOW"
          : response.reason?.includes("[GREEN")
            ? "GREEN"
            : undefined);

    const auditEntry: AuditLogEntry = {
      timestamp,
      command: meta?.command ?? command,
      cwd,
      workspace_root,
      decision: finalDecision,
      reason: response.reason,
      tier: resolvedTier,
      scores: meta?.scores,
      latency_ms,
    };

    if (env?.logAudit) {
      await env.logAudit(auditEntry);
    } else {
      await writeAuditLog(auditEntry);
    }

    return finalResponse;
  };

  if (toolName && FILE_MUTATION_TOOLS.has(toolName)) {
    const rawTarget =
      input.arguments?.TargetFile ??
      input.arguments?.AbsolutePath ??
      input.arguments?.path ??
      input.arguments?.DirectoryPath ??
      input.toolCall?.args?.TargetFile ??
      input.toolCall?.args?.AbsolutePath ??
      input.toolCall?.args?.path ??
      input.toolCall?.args?.DirectoryPath;
    const targetPath = typeof rawTarget === "string" ? rawTarget.trim() : "";
    if (targetPath.length === 0) {
      return respond({
        decision: "force_ask",
        reason: formatBadge(
          "YELLOW",
          "REVIEW",
          "file_modification",
          "No target file path specified",
        ),
      });
    }

    const artifactDir =
      input.context?.artifact_directory ??
      input.artifactDirectoryPath;

    const fileEval = evaluateFileMutationTool(toolName, targetPath, {
      workspaceRoot: workspace_root,
      artifactDirectory: artifactDir,
    });

    return respond(
      {
        decision: fileEval.decision,
        reason: fileEval.reason,
      },
      { command: `${toolName} ${targetPath}` },
    );
  }

  if (toolName !== "run_command") {
    return { decision: "allow" };
  }

  if (command.length === 0) {
    return respond(
      {
        decision: "ask",
        reason: formatBadge(
          "YELLOW",
          "REVIEW",
          "unknown",
          "No command string provided",
        ),
      },
      { tier: "YELLOW", command: typeof rawCommand === "string" ? rawCommand : "" },
    );
  }

  const blockedToken = findBlockedToken(command);
  if (blockedToken) {
    return respond(
      {
        decision: "deny",
        reason: formatBadge(
          "RED",
          "DENIED",
          "destructive_deletion",
          `Blocked command token detected: ${blockedToken}`,
        ),
      },
      { tier: "RED" },
    );
  }

  const settingsRaw = env?.readSettings ? env.readSettings() : loadDefaultSettings();
  if (settingsRaw) {
    const parsedPermissions = parseSettingsPermissions(settingsRaw);
    const settingsMatch = evaluateSettingsPermission(command, parsedPermissions);
    if (settingsMatch) {
      if (settingsMatch.decision === "deny") {
        return respond(
          {
            decision: "deny",
            reason: formatBadge(
              "RED",
              "DENIED",
              "user_preference",
              `Native settings deny rule: ${settingsMatch.rule}`,
            ),
          },
          { tier: "RED" },
        );
      }
      if (settingsMatch.decision === "ask") {
        return respond(
          {
            decision: "ask",
            reason: formatBadge(
              "YELLOW",
              "REVIEW",
              "user_preference",
              `Native settings ask rule: ${settingsMatch.rule}`,
            ),
          },
          { tier: "YELLOW" },
        );
      }
      if (settingsMatch.decision === "allow") {
        return respond(
          {
            decision: "allow",
            reason: formatBadge(
              "GREEN",
              "ALLOWED",
              "user_preference",
              `Native settings allow rule: ${settingsMatch.rule}`,
            ),
          },
          { tier: "GREEN" },
        );
      }
    }
  }

  if (isFastPathAllowed(command)) {
    return respond(
      {
        decision: "allow",
        reason: formatBadge(
          "GREEN",
          "ALLOWED",
          "read_only_query",
          "Static fast-path pass",
        ),
      },
      { tier: "GREEN" },
    );
  }

  if (env?.jevClient) {
    const context = buildCommandContext(input);
    const timeoutMs = env.timeoutMs ?? 3000;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError(`Evaluation exceeded ${timeoutMs}ms budget`));
        }, timeoutMs);
        if (typeof timer.unref === "function") {
          timer.unref();
        }
      });

      const judgment = await Promise.race([
        env.jevClient.evaluate(context),
        timeoutPromise,
      ]);
      clearTimeout(timer);

      const evaluation = evaluateRiskTier(judgment);
      return respond(
        {
          decision: evaluation.decision,
          reason: evaluation.reason,
        },
        {
          tier: evaluation.tier,
          scores: judgment,
        },
      );
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof TimeoutError) {
        return respond(
          {
            decision: "force_ask",
            reason: formatBadge(
              "YELLOW",
              "REVIEW",
              "timeout_fallback",
              `Evaluation exceeded ${timeoutMs}ms budget`,
            ),
          },
          { tier: "YELLOW" },
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      return respond(
        {
          decision: "ask",
          reason: formatBadge(
            "YELLOW",
            "REVIEW",
            "error_fallback",
            `Evaluation error: ${message}`,
          ),
        },
        { tier: "YELLOW" },
      );
    }
  }

  return respond(
    {
      decision: "ask",
      reason: formatBadge(
        "YELLOW",
        "REVIEW",
        "pending_evaluation",
        `Command pending semantic evaluation (v${VERSION})`,
      ),
    },
    { tier: "YELLOW" },
  );
}

