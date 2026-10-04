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

function findPrefixRuleMatch(
  segments: string[],
  trimmed: string,
  prefixes: string[],
): string | null {
  for (const seg of segments) {
    for (const prefix of prefixes) {
      if (matchesPrefix(seg, prefix)) {
        return `command(${prefix})`;
      }
    }
  }
  for (const prefix of prefixes) {
    if (matchesPrefix(trimmed, prefix)) {
      return `command(${prefix})`;
    }
  }
  return null;
}

function findAllowChainMatch(
  segments: string[],
  allowPrefixes: string[],
): string | null {
  const matchedRules: string[] = [];
  for (const seg of segments) {
    let segmentAllowed = false;
    for (const prefix of allowPrefixes) {
      if (matchesPrefix(seg, prefix)) {
        matchedRules.push(`command(${prefix})`);
        segmentAllowed = true;
        break;
      }
    }
    if (!segmentAllowed) {
      return null;
    }
  }
  return matchedRules.length > 0 ? matchedRules.join(" && ") : null;
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

  const denyRule = findPrefixRuleMatch(segments, trimmed, permissions.deny);
  if (denyRule) {
    return { decision: "deny", rule: denyRule };
  }

  const askRule = findPrefixRuleMatch(segments, trimmed, permissions.ask);
  if (askRule) {
    return { decision: "ask", rule: askRule };
  }

  const allowRule = findAllowChainMatch(segments, permissions.allow);
  if (allowRule) {
    return { decision: "allow", rule: allowRule };
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
