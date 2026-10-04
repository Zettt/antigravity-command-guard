import { describe, expect, it } from "bun:test";
import { evaluateRiskTier, formatBadge } from "../src/policy.ts";
import type { JevJudgmentBatteryResult } from "../src/types.ts";

describe("formatBadge", () => {
  it("formats badge string according to specification", () => {
    const badge = formatBadge(
      "RED",
      "DENIED",
      "destructive_deletion",
      "High destructive risk",
    );
    expect(badge).toBe(
      "[RED - DENIED] Intent: destructive_deletion | Detail: High destructive risk",
    );
  });

  it("formats yellow review badge correctly", () => {
    const badge = formatBadge(
      "YELLOW",
      "REVIEW",
      "file_modification",
      "Requires review",
    );
    expect(badge).toBe(
      "[YELLOW - REVIEW] Intent: file_modification | Detail: Requires review",
    );
  });

  it("formats green allowed badge correctly", () => {
    const badge = formatBadge(
      "GREEN",
      "ALLOWED",
      "read_only_query",
      "Low risk operation",
    );
    expect(badge).toBe(
      "[GREEN - ALLOWED] Intent: read_only_query | Detail: Low risk operation",
    );
  });
});

describe("evaluateRiskTier", () => {
  describe("Red Tier", () => {
    it("denies when destructive probability >= 0.70 (exact boundary)", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.5 },
        destructive: { noul: 0.7 },
        outside_workspace: { noul: 0.1 },
        intent_category: { choice: "read_only_query" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("deny");
      expect(result.tier).toBe("RED");
      expect(result.status).toBe("DENIED");
      expect(result.reason).toContain("[RED - DENIED]");
      expect(result.reason).toContain("Intent: read_only_query");
      expect(result.reason).toContain("destructive");
    });

    it("denies when destructive probability > 0.70", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 1.0 },
        destructive: { noul: 0.95 },
        outside_workspace: { noul: 0.1 },
        intent_category: { choice: "destructive_deletion" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("deny");
      expect(result.tier).toBe("RED");
      expect(result.status).toBe("DENIED");
      expect(result.reason).toContain("[RED - DENIED]");
    });

    it("denies when outside_workspace probability >= 0.60 (exact boundary)", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.5 },
        destructive: { noul: 0.1 },
        outside_workspace: { noul: 0.6 },
        intent_category: { choice: "read_only_query" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("deny");
      expect(result.tier).toBe("RED");
      expect(result.status).toBe("DENIED");
      expect(result.reason).toContain("[RED - DENIED]");
      expect(result.reason).toContain("outside workspace");
    });

    it("denies when severity score >= 2.5 (exact boundary)", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 2.5 },
        destructive: { noul: 0.1 },
        outside_workspace: { noul: 0.1 },
        intent_category: { choice: "build_and_test" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("deny");
      expect(result.tier).toBe("RED");
      expect(result.status).toBe("DENIED");
      expect(result.reason).toContain("[RED - DENIED]");
      expect(result.reason).toContain("severity");
    });

    it("denies when multiple red triggers are met simultaneously", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 3.0 },
        destructive: { noul: 0.85 },
        outside_workspace: { noul: 0.75 },
        intent_category: { choice: "destructive_deletion" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("deny");
      expect(result.tier).toBe("RED");
      expect(result.status).toBe("DENIED");
      expect(result.reason).toContain("[RED - DENIED]");
    });

    it("takes precedence over yellow tier conditions", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 2.6 },
        destructive: { noul: 0.5 },
        outside_workspace: { noul: 0.1 },
        intent_category: { choice: "file_modification" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("deny");
      expect(result.tier).toBe("RED");
      expect(result.status).toBe("DENIED");
    });
  });

  describe("Yellow Tier", () => {
    it("asks when severity score >= 1.0 (exact boundary)", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 1.0 },
        destructive: { noul: 0.1 },
        outside_workspace: { noul: 0.1 },
        intent_category: { choice: "read_only_query" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("force_ask");
      expect(result.tier).toBe("YELLOW");
      expect(result.status).toBe("REVIEW");
      expect(result.reason).toContain("[YELLOW - REVIEW]");
      expect(result.reason).toContain("severity");
    });

    it("asks when severity score is just below red threshold (2.49)", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 2.49 },
        destructive: { noul: 0.2 },
        outside_workspace: { noul: 0.2 },
        intent_category: { choice: "build_and_test" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("force_ask");
      expect(result.tier).toBe("YELLOW");
      expect(result.status).toBe("REVIEW");
      expect(result.reason).toContain("[YELLOW - REVIEW]");
    });

    it("asks when destructive probability >= 0.30 (exact boundary)", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.5 },
        destructive: { noul: 0.3 },
        outside_workspace: { noul: 0.1 },
        intent_category: { choice: "read_only_query" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("force_ask");
      expect(result.tier).toBe("YELLOW");
      expect(result.status).toBe("REVIEW");
      expect(result.reason).toContain("[YELLOW - REVIEW]");
      expect(result.reason).toContain("destructive");
    });

    it("asks when destructive probability is just below red threshold (0.69)", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.8 },
        destructive: { noul: 0.69 },
        outside_workspace: { noul: 0.2 },
        intent_category: { choice: "read_only_query" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("force_ask");
      expect(result.tier).toBe("YELLOW");
      expect(result.status).toBe("REVIEW");
      expect(result.reason).toContain("[YELLOW - REVIEW]");
    });

    it("asks for file_modification category even with low scores", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.2 },
        destructive: { noul: 0.1 },
        outside_workspace: { noul: 0.05 },
        intent_category: { choice: "file_modification" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("force_ask");
      expect(result.tier).toBe("YELLOW");
      expect(result.status).toBe("REVIEW");
      expect(result.reason).toContain("[YELLOW - REVIEW]");
      expect(result.reason).toContain("file_modification");
    });

    it("asks for dependency_management category even with low scores", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.4 },
        destructive: { noul: 0.05 },
        outside_workspace: { noul: 0.05 },
        intent_category: { choice: "dependency_management" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("force_ask");
      expect(result.tier).toBe("YELLOW");
      expect(result.status).toBe("REVIEW");
      expect(result.reason).toContain("[YELLOW - REVIEW]");
      expect(result.reason).toContain("dependency_management");
    });

    it("asks for system_administration category even with low scores", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.3 },
        destructive: { noul: 0.02 },
        outside_workspace: { noul: 0.1 },
        intent_category: { choice: "system_administration" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("force_ask");
      expect(result.tier).toBe("YELLOW");
      expect(result.status).toBe("REVIEW");
      expect(result.reason).toContain("[YELLOW - REVIEW]");
      expect(result.reason).toContain("system_administration");
    });
  });

  describe("Green Tier", () => {
    it("allows low-risk read_only_query command", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.1 },
        destructive: { noul: 0.01 },
        outside_workspace: { noul: 0.02 },
        intent_category: { choice: "read_only_query" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("allow");
      expect(result.tier).toBe("GREEN");
      expect(result.status).toBe("ALLOWED");
      expect(result.reason).toContain("[GREEN - ALLOWED]");
      expect(result.reason).toContain("Intent: read_only_query");
    });

    it("allows low-risk build_and_test command", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.6 },
        destructive: { noul: 0.05 },
        outside_workspace: { noul: 0.0 },
        intent_category: { choice: "build_and_test" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("allow");
      expect(result.tier).toBe("GREEN");
      expect(result.status).toBe("ALLOWED");
      expect(result.reason).toContain("[GREEN - ALLOWED]");
    });

    it("allows low-risk git_vcs_operation command", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.4 },
        destructive: { noul: 0.1 },
        outside_workspace: { noul: 0.0 },
        intent_category: { choice: "git_vcs_operation" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("allow");
      expect(result.tier).toBe("GREEN");
      expect(result.status).toBe("ALLOWED");
      expect(result.reason).toContain("[GREEN - ALLOWED]");
    });

    it("allows at upper boundaries of green tier (severity 0.99, destructive 0.29, outside 0.59)", () => {
      const judgment: JevJudgmentBatteryResult = {
        severity: { score: 0.99 },
        destructive: { noul: 0.29 },
        outside_workspace: { noul: 0.59 },
        intent_category: { choice: "read_only_query" },
      };
      const result = evaluateRiskTier(judgment);
      expect(result.decision).toBe("allow");
      expect(result.tier).toBe("GREEN");
      expect(result.status).toBe("ALLOWED");
      expect(result.reason).toContain("[GREEN - ALLOWED]");
    });
  });

  describe("Badge format compliance", () => {
    it("ensures all reasons conform to the standard badge regex pattern", () => {
      const badgeRegex =
        /^\[(RED|YELLOW|GREEN) - (DENIED|REVIEW|ALLOWED)\] Intent: [a-z_]+ \| Detail: .+$/;

      const testCases: JevJudgmentBatteryResult[] = [
        {
          severity: { score: 2.8 },
          destructive: { noul: 0.8 },
          outside_workspace: { noul: 0.1 },
          intent_category: { choice: "destructive_deletion" },
        },
        {
          severity: { score: 1.2 },
          destructive: { noul: 0.1 },
          outside_workspace: { noul: 0.1 },
          intent_category: { choice: "build_and_test" },
        },
        {
          severity: { score: 0.2 },
          destructive: { noul: 0.05 },
          outside_workspace: { noul: 0.05 },
          intent_category: { choice: "read_only_query" },
        },
      ];

      for (const judgment of testCases) {
        const result = evaluateRiskTier(judgment);
        expect(result.reason).toMatch(badgeRegex);
      }
    });
  });
});
