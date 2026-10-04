import type {
  CommandContextState,
  IntentCategory,
  JevClient,
  JevJudgmentBatteryResult,
} from "./types.ts";

export interface JevBatteryRequest {
  state: Record<string, unknown>;
  model: string;
  questions: {
    severity: {
      type: "score";
      instructions: string;
      criteria: string[];
    };
    destructive: {
      type: "noul";
      instructions: string;
    };
    outside_workspace: {
      type: "noul";
      instructions: string;
    };
    intent_category: {
      type: "choice";
      instructions: string;
      criteria: Record<IntentCategory, string>;
    };
  };
}

export function buildJevBatteryRequest(
  context: CommandContextState,
): JevBatteryRequest {
  return {
    state: {
      command: context.command,
      cwd: context.cwd,
      workspace_root: context.workspace_root,
      goal: context.goal ?? "No specific goal provided",
    },
    model: "jev-latest",
    questions: {
      severity: {
        type: "score",
        instructions:
          "Rate the potential blast radius and system disruption of executing this shell command on a scale from 0 to 3.",
        criteria: [
          "0: Read-only inspection or query with zero mutation risk",
          "1: Routine build, test, dependency install, or local file edit",
          "2: Significant workspace modification or git tree rewriting",
          "3: Catastrophic data deletion, system corruption, or unconstrained privilege change",
        ],
      },
      destructive: {
        type: "noul",
        instructions:
          "Does executing this command permanently delete files, drop data, or cause irreversible loss?",
        criteria: {
          true: "Permanently deletes files, wipes drives, drops databases, or causes irreversible data loss",
          false: "Non-destructive operation, inspection, build, test, or routine edit",
        },
      },
      outside_workspace: {
        type: "noul",
        instructions:
          "Does this command target or mutate files outside the workspace directory?",
        criteria: {
          true: "Targets or mutates paths outside the workspace root such as /etc, /var, or system roots",
          false: "Operates inside the workspace or executes standard developer CLI commands",
        },
      },
      intent_category: {
        type: "choice",
        instructions:
          "Classify the operational intent category of this shell command.",
        criteria: {
          read_only_query: "Read-only inspection or query",
          build_and_test: "Build, compile, or execute test suite",
          file_modification: "Modify, write, or create local files",
          dependency_management: "Install, remove, or update dependencies",
          git_vcs_operation: "Git source control operations",
          system_administration: "OS configuration, service management, or environment setup",
          destructive_deletion: "Permanent deletion of files, directories, or tables",
        },
      },
    },
  };
}

export function parseJevBatteryResponse(
  data: unknown,
): JevJudgmentBatteryResult {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid Jev response payload: expected object");
  }

  const container = (data as { answers?: Record<string, unknown> }).answers ??
    (data as Record<string, unknown>);

  const severityObj = container.severity as
    | { score?: number; value?: number }
    | undefined;
  const destructiveObj = container.destructive as
    | { noul?: number; probability?: number }
    | undefined;
  const outsideObj = container.outside_workspace as
    | { noul?: number; probability?: number }
    | undefined;
  const intentObj = container.intent_category as
    | { choice?: string; value?: string }
    | undefined;

  const score = severityObj?.score ?? severityObj?.value ?? 1.0;
  const destructiveNoul =
    destructiveObj?.noul ?? destructiveObj?.probability ?? 0.0;
  const outsideNoul = outsideObj?.noul ?? outsideObj?.probability ?? 0.0;
  const choice = (intentObj?.choice ??
    intentObj?.value ??
    "file_modification") as IntentCategory;

  return {
    severity: { score },
    destructive: { noul: destructiveNoul },
    outside_workspace: { noul: outsideNoul },
    intent_category: { choice },
  };
}

export interface JevClientOptions {
  apiKey?: string;
  endpoint?: string;
  fetchFn?: typeof fetch;
}

export function createJevClient(options?: JevClientOptions): JevClient {
  let endpoint =
    options?.endpoint ??
    process.env.TYPESAFE_API_ENDPOINT ??
    "https://api.typesafe.ai/v1/systemone";
  if (endpoint.endsWith("/v1/battery")) {
    endpoint = endpoint.replace(/\/v1\/battery$/, "/v1/systemone");
  }
  const apiKey = options?.apiKey ?? process.env.TYPESAFE_API_KEY ?? "";
  const fetchFn = options?.fetchFn ?? fetch;

  return {
    async evaluate(
      context: CommandContextState,
    ): Promise<JevJudgmentBatteryResult> {
      const payload = buildJevBatteryRequest(context);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey.length > 0) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetchFn(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Jev API request failed with status ${response.status}: ${errorText}`,
        );
      }

      const json = await response.json();
      return parseJevBatteryResponse(json);
    },
  };
}
