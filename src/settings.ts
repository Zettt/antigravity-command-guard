import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { splitCommandChain } from "./blocklist.ts";
import type { PreToolUseDecision } from "./types.ts";

export interface ParsedPermissions {
  allow: string[];
  ask: string[];
  deny: string[];
}

export interface SettingsMatchResult {
  decision: PreToolUseDecision;
  rule: string;
}

const COMMAND_RULE_REGEX = /^command\((.+)\)$/;

export function parseSettingsPermissions(
  settingsObj: unknown,
): ParsedPermissions {
  const result: ParsedPermissions = {
    allow: [],
    ask: [],
    deny: [],
  };

  if (!settingsObj || typeof settingsObj !== "object") {
    return result;
  }

  const permissions = (settingsObj as { permissions?: Record<string, unknown> })
    .permissions;
  if (!permissions || typeof permissions !== "object") {
    return result;
  }

  for (const tier of ["deny", "ask", "allow"] as const) {
    const list = permissions[tier];
    if (Array.isArray(list)) {
      for (const item of list) {
        if (typeof item === "string") {
          const match = item.trim().match(COMMAND_RULE_REGEX);
          if (match?.[1]) {
            result[tier].push(match[1].trim());
          }
        }
      }
    }
  }

  return result;
}

function matchesPrefix(command: string, prefix: string): boolean {
  if (command === prefix) {
    return true;
  }
  return command.startsWith(`${prefix} `);
}

export function evaluateSettingsPermission(
  command: string,
  permissions: ParsedPermissions,
): SettingsMatchResult | null {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const segments = splitCommandChain(trimmed);
  if (segments.length === 0) {
    return null;
  }

  for (const seg of segments) {
    for (const prefix of permissions.deny) {
      if (matchesPrefix(seg, prefix)) {
        return { decision: "deny", rule: `command(${prefix})` };
      }
    }
  }

  for (const prefix of permissions.deny) {
    if (matchesPrefix(trimmed, prefix)) {
      return { decision: "deny", rule: `command(${prefix})` };
    }
  }

  for (const seg of segments) {
    for (const prefix of permissions.ask) {
      if (matchesPrefix(seg, prefix)) {
        return { decision: "ask", rule: `command(${prefix})` };
      }
    }
  }

  for (const prefix of permissions.ask) {
    if (matchesPrefix(trimmed, prefix)) {
      return { decision: "ask", rule: `command(${prefix})` };
    }
  }

  const matchedAllowRules: string[] = [];
  for (const seg of segments) {
    let segmentAllowed = false;
    for (const prefix of permissions.allow) {
      if (matchesPrefix(seg, prefix)) {
        matchedAllowRules.push(`command(${prefix})`);
        segmentAllowed = true;
        break;
      }
    }
    if (!segmentAllowed) {
      return null;
    }
  }

  if (matchedAllowRules.length > 0) {
    return { decision: "allow", rule: matchedAllowRules.join(" && ") };
  }

  return null;
}

export function loadDefaultSettings(): Record<string, unknown> | null {
  const settingsPath = join(
    homedir(),
    ".gemini",
    "antigravity-cli",
    "settings.json",
  );
  if (!existsSync(settingsPath)) {
    return null;
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}
