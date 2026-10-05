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
      `Catastrophic data loss risk (${judgment.destructive.noul.toFixed(2)})`,
    );
  }
  if (outsideTriggered && !isReadOnly) {
    reasons.push(
      `Mutating path outside workspace (${judgment.outside_workspace.noul.toFixed(2)})`,
    );
  }
  if (judgment.severity.score >= 2.5) {
    reasons.push(`Critical severity rating (${judgment.severity.score.toFixed(1)})`);
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
  if (judgment.severity.score >= 2.0) {
    reasons.push(
      `Severity indicates workspace modification (${judgment.severity.score.toFixed(1)})`,
    );
  } else if (judgment.severity.score >= 1.5) {
    reasons.push(
      `Elevated severity score (${judgment.severity.score.toFixed(1)})`,
    );
  }
  if (judgment.destructive.noul >= 0.3) {
    reasons.push(
      `Moderate data loss risk (${judgment.destructive.noul.toFixed(2)})`,
    );
  }
  if (outsideTriggered && isReadOnly) {
    reasons.push(
      `Read query outside workspace (${judgment.outside_workspace.noul.toFixed(2)})`,
    );
  }
  if (MUTATION_CATEGORIES.includes(category)) {
    reasons.push(`Mutating operation (${category.replace(/_/g, " ")})`);
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
    const detail = redReasons.join(", ");
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
    const detail = yellowReasons.join(", ");
    return {
      decision: "force_ask",
      tier: "YELLOW",
      status: "REVIEW",
      reason: formatBadge("YELLOW", "REVIEW", category, detail),
    };
  }

  const detail = `Routine operation within safe thresholds (severity: ${judgment.severity.score.toFixed(1)})`;
  return {
    decision: "allow",
    tier: "GREEN",
    status: "ALLOWED",
    reason: formatBadge("GREEN", "ALLOWED", category, detail),
  };
}
