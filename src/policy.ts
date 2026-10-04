import type {
  IntentCategory,
  JevJudgmentBatteryResult,
  RiskStatus,
  RiskTier,
  RiskTierEvaluation,
} from "./types.ts";

export const MUTATION_CATEGORIES: ReadonlyArray<IntentCategory> = [
  "file_modification",
  "dependency_management",
  "system_administration",
];

export function formatBadge(
  tier: RiskTier,
  status: RiskStatus,
  intent: string,
  detail: string,
): string {
  const prefix =
    tier === "RED"
      ? "Blocked high-risk command"
      : tier === "YELLOW"
        ? "Needs review"
        : "Allowed safe command";
  return `${prefix}: ${detail} [${tier} - ${status}] (intent: ${intent})`;
}

function collectRedReasons(
  judgment: JevJudgmentBatteryResult,
  outsideTriggered: boolean,
  isReadOnly: boolean,
): string[] {
  const reasons: string[] = [];
  if (judgment.destructive.noul >= 0.7) {
    reasons.push(
      `destructive probability ${judgment.destructive.noul.toFixed(2)} >= 0.70`,
    );
  }
  if (outsideTriggered && !isReadOnly) {
    reasons.push(
      `outside workspace probability ${judgment.outside_workspace.noul.toFixed(2)} >= 0.60`,
    );
  }
  if (judgment.severity.score >= 2.5) {
    reasons.push(`severity score ${judgment.severity.score.toFixed(1)} >= 2.5`);
  }
  return reasons;
}

function collectYellowReasons(
  judgment: JevJudgmentBatteryResult,
  outsideTriggered: boolean,
  isReadOnly: boolean,
  category: IntentCategory,
): string[] {
  const reasons: string[] = [];
  if (judgment.severity.score >= 1.0) {
    reasons.push(
      `severity score ${judgment.severity.score.toFixed(1)} >= 1.0`,
    );
  }
  if (judgment.destructive.noul >= 0.3) {
    reasons.push(
      `destructive probability ${judgment.destructive.noul.toFixed(2)} >= 0.30`,
    );
  }
  if (outsideTriggered && isReadOnly) {
    reasons.push(
      `read-only query outside workspace (probability ${judgment.outside_workspace.noul.toFixed(2)} >= 0.60)`,
    );
  }
  if (MUTATION_CATEGORIES.includes(category)) {
    reasons.push(`mutating intent category (${category})`);
  }
  return reasons;
}

export function evaluateRiskTier(
  judgment: JevJudgmentBatteryResult,
): RiskTierEvaluation {
  const category = judgment.intent_category.choice;
  const isReadOnly = category === "read_only_query";
  const outsideTriggered = judgment.outside_workspace.noul >= 0.6;

  const redReasons = collectRedReasons(judgment, outsideTriggered, isReadOnly);
  if (redReasons.length > 0) {
    const detail = `High risk operation: ${redReasons.join(", ")}`;
    return {
      decision: "deny",
      tier: "RED",
      status: "DENIED",
      reason: formatBadge("RED", "DENIED", category, detail),
    };
  }

  const yellowReasons = collectYellowReasons(
    judgment,
    outsideTriggered,
    isReadOnly,
    category,
  );
  if (yellowReasons.length > 0) {
    const detail = `Requires review: ${yellowReasons.join(", ")}`;
    return {
      decision: "force_ask",
      tier: "YELLOW",
      status: "REVIEW",
      reason: formatBadge("YELLOW", "REVIEW", category, detail),
    };
  }

  const detail = `Low risk operation within safe thresholds (severity: ${judgment.severity.score.toFixed(1)})`;
  return {
    decision: "allow",
    tier: "GREEN",
    status: "ALLOWED",
    reason: formatBadge("GREEN", "ALLOWED", category, detail),
  };
}
