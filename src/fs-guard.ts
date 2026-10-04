import { isAbsolute, normalize, relative, resolve } from "node:path";

export const SENSITIVE_PATH_PATTERNS = [
  /(^|[/\\])\.env(\.[a-zA-Z0-9_-]+)?$/i,
  /(^|[/\\])\.git([/\\]|$)/i,
  /(^|[/\\])\.ssh([/\\]|$)/i,
  /(^|[/\\])(id_rsa|id_ed25519|id_ecdsa|id_dsa)(\.pub)?$/i,
  /(^|[/\\])\.aws([/\\]credentials|config)?$/i,
  /(^|[/\\])\.kube([/\\]config)?$/i,
  /(^|[/\\])(\.npmrc|\.pypirc|\.netrc)$/i,
  /(^|[/\\])(secrets?|credentials?)\.(json|ya?ml|env|key)$/i,
  /^\/etc([/\\]|$)/i,
  /^\/private\/etc([/\\]|$)/i,
  /^\/System([/\\]|$)/i,
  /^\/Library([/\\]|$)/i,
  /^[A-Za-z]:[/\\]Windows([/\\]|$)/i,
];

export interface FileToolEvaluation {
  decision: "allow" | "force_ask" | "deny";
  reason: string;
}

export function isPathInside(target: string, parent: string): boolean {
  const normTarget = resolve(target);
  const normParent = resolve(parent);
  const rel = relative(normParent, normTarget);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export function evaluateFileMutationTool(
  toolName: string,
  targetPath: string,
  options: {
    workspaceRoot?: string;
    artifactDirectory?: string;
  },
): FileToolEvaluation {
  const normalizedTarget = normalize(targetPath.trim());

  if (options.artifactDirectory && isPathInside(normalizedTarget, options.artifactDirectory)) {
    return {
      decision: "allow",
      reason: "[GREEN - ALLOWED] Intent: artifact_generation | Detail: Auto-approved agent artifact mutation",
    };
  }

  if (normalizedTarget.includes(".gemini/antigravity/brain/")) {
    return {
      decision: "allow",
      reason: "[GREEN - ALLOWED] Intent: artifact_generation | Detail: Auto-approved agent artifact mutation",
    };
  }

  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(normalizedTarget)) {
      return {
        decision: "force_ask",
        reason: `[YELLOW - REVIEW] Intent: sensitive_target | Detail: Mutating sensitive target: ${normalizedTarget}`,
      };
    }
  }

  if (options.workspaceRoot) {
    if (!isPathInside(normalizedTarget, options.workspaceRoot)) {
      return {
        decision: "force_ask",
        reason: `[YELLOW - REVIEW] Intent: outside_workspace | Detail: Operation targets path outside active workspace: ${normalizedTarget}`,
      };
    }
  }

  return {
    decision: "allow",
    reason: "[GREEN - ALLOWED] Intent: file_modification | Detail: Safe intra-workspace file mutation",
  };
}
