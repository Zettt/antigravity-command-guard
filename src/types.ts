export type PreToolUseDecision = "allow" | "ask" | "force_ask" | "deny";

export interface PreToolUseInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_call_id?: string;
  arguments?: {
    CommandLine?: string;
    command?: string;
    cmd?: string;
    Cwd?: string;
    cwd?: string;
    TargetFile?: string;
    AbsolutePath?: string;
    path?: string;
    DirectoryPath?: string;
    [key: string]: unknown;
  };
  toolCall?: {
    name?: string;
    args?: {
      CommandLine?: string;
      command?: string;
      cmd?: string;
      Cwd?: string;
      cwd?: string;
      TargetFile?: string;
      AbsolutePath?: string;
      path?: string;
      DirectoryPath?: string;
      [key: string]: unknown;
    };
  };
  context?: {
    workspace_root?: string;
    goal?: string;
    artifact_directory?: string;
    [key: string]: unknown;
  };
  workspacePaths?: string[];
  conversationId?: string;
  stepIdx?: number;
  artifactDirectoryPath?: string;
}

export interface PreToolUseResponse {
  decision: PreToolUseDecision;
  reason?: string;
}

export interface CommandContextState {
  command: string;
  cwd: string;
  workspace_root: string;
  goal?: string;
}

export type IntentCategory =
  | "read_only_query"
  | "build_and_test"
  | "file_modification"
  | "dependency_management"
  | "git_vcs_operation"
  | "system_administration"
  | "destructive_deletion";

export interface JevJudgmentBatteryResult {
  severity: { score: number };
  destructive: { noul: number };
  outside_workspace: { noul: number };
  intent_category: { choice: IntentCategory };
}

export interface JevClient {
  evaluate(context: CommandContextState): Promise<JevJudgmentBatteryResult>;
}

export type RiskTier = "RED" | "YELLOW" | "GREEN";
export type RiskStatus = "DENIED" | "REVIEW" | "ALLOWED";

export interface RiskTierEvaluation {
  decision: PreToolUseDecision;
  tier: RiskTier;
  status: RiskStatus;
  reason: string;
}

export interface AuditLogEntry {
  timestamp: string;
  command: string;
  cwd?: string;
  workspace_root?: string;
  decision: PreToolUseDecision;
  reason?: string;
  tier?: string;
  scores?: JevJudgmentBatteryResult;
  latency_ms?: number;
}

export interface Environment {
  now?: () => Date;
  readSettings?: () => Record<string, unknown> | null;
  logAudit?: (entry: AuditLogEntry) => Promise<void> | void;
  jevClient?: JevClient;
  timeoutMs?: number;
}

