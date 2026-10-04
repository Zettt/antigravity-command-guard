// @bun
// src/audit.ts
import { existsSync, promises as fs } from "fs";
import { basename, dirname, extname, join } from "path";
var DEFAULT_LOG_PATH = "logs/audit.jsonl";
var DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
async function rotateLogFile(logPath) {
  const dir = dirname(logPath);
  const ext = extname(logPath);
  const base = basename(logPath, ext);
  let maxIndex = 1;
  while (existsSync(join(dir, `${base}.${maxIndex}${ext}`))) {
    maxIndex++;
  }
  for (let i = maxIndex - 1;i >= 1; i--) {
    const src = join(dir, `${base}.${i}${ext}`);
    const dest = join(dir, `${base}.${i + 1}${ext}`);
    await fs.rename(src, dest);
  }
  const dest1 = join(dir, `${base}.1${ext}`);
  await fs.rename(logPath, dest1);
}
async function writeAuditLog(entry, options) {
  const logPath = options?.logPath ?? DEFAULT_LOG_PATH;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const dir = dirname(logPath);
  if (dir && dir !== ".") {
    await fs.mkdir(dir, { recursive: true });
  }
  try {
    const stats = await fs.stat(logPath);
    if (stats.size >= maxBytes && stats.size > 0) {
      await rotateLogFile(logPath);
    }
  } catch (error) {
    const nodeError = error;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }
  const line = JSON.stringify(entry) + `
`;
  await fs.appendFile(logPath, line, "utf-8");
}

// src/blocklist.ts
var WRAPPER_PREFIXES = new Set(["sudo", "env", "nohup", "time"]);
var CATASTROPHIC_TARGET_PATTERN = /^(\/|\/\*|~|~\*|\.\.\/|\.\.\\|\/etc|\/var|\/usr|\/home|\/root|\/bin|\/sbin|\/System|\/Library|\/boot|\/dev|\/proc|\/sys|[A-Za-z]:[\\\/]|\$HOME|\$\{HOME\}|\$ROOT|\$\{ROOT\})/i;
var RM_RECURSIVE_PATTERN = /\brm\s+(?:-[a-zA-Z0-9_-]+\s+)*((?:-[a-zA-Z]*(?:[rR]f|f[rR])[a-zA-Z]*|-[a-zA-Z]*[rR][a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*[rR][a-zA-Z]*))\s+(.*)/;
var EXPLOIT_PATTERNS = [
  {
    pattern: /\bbase64\s+(-d|-D|--decode)\s*\|\s*(sh|bash|zsh|python[0-9]?|ruby|perl)\b/i,
    token: "base64 | sh"
  },
  {
    pattern: /\beval\s+(["']|\$\()/i,
    token: "eval dynamic execution"
  },
  {
    pattern: /(>>|>)\s*(~?\/\.(bashrc|zshrc|bash_profile|profile|zprofile)|\/etc\/(hosts|sudoers|environment))\b/i,
    token: "shell profile tampering"
  },
  {
    pattern: /-o\s+StrictHostKeyChecking=no\b/i,
    token: "StrictHostKeyChecking=no"
  },
  {
    pattern: /\b(powershell|pwsh)\b.*-(enc|encodedcommand)\b/i,
    token: "powershell encoded command"
  },
  {
    pattern: /(>>|>)\s*(\$profile|\$profile\..*|\bMicrosoft\.PowerShell_profile\.ps1\b)/i,
    token: "powershell profile tampering"
  },
  {
    pattern: /(\bbash\b.*>&\s*\/dev\/tcp\/|\b(nc|ncat|netcat)\s+(-e\s+|\/bin\/|\d+\.\d+\.\d+\.\d+)|\/bin\/sh\s+-i\s+2>&1|\bmkfifo\b.*\|\s*(nc|ncat|netcat)|\bsocat\s+exec:)/i,
    token: "reverse shell"
  },
  {
    pattern: /(curl|wget)\s+.*(-o|--output)\s+\S+\s*(&&|;)\s*(bash|sh|zsh|chmod\s+\+x)/i,
    token: "download-and-execute chain"
  },
  {
    pattern: /(curl|wget)\s+.*\|\s*(bash|sh|zsh)/i,
    token: "curl | bash"
  },
  {
    pattern: /\b(curl|wget)\s+.*(?:-d\s+@|-F\s+.*@|--data-binary\s+@|--post-file[=\s]+).*(\.env|id_rsa|id_ed25519|\.ssh|\.aws|\.kube|\.npmrc|\.pypirc|\.netrc|\/etc\/shadow)/i,
    token: "credential exfiltration"
  },
  {
    pattern: /\bgit\s+config\s+.*(core\.fsmonitor|core\.sshCommand|diff\..*\.command)(\s*=\s*|\s+)/i,
    token: "git config command execution"
  }
];
function splitCommandChain(command) {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const segments = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escapeNext = false;
  for (let i = 0;i < trimmed.length; i++) {
    const char = trimmed[i];
    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }
    if (char === "\\" && !inSingleQuote) {
      escapeNext = true;
      current += char;
      continue;
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }
    if (!inSingleQuote && !inDoubleQuote) {
      if (char === `
` || char === "\r" || char === ";") {
        if (current.trim().length > 0) {
          segments.push(current.trim());
        }
        current = "";
        continue;
      }
      if (char === "&" && trimmed[i + 1] === "&") {
        if (current.trim().length > 0) {
          segments.push(current.trim());
        }
        current = "";
        i++;
        continue;
      }
      if (char === "|" && trimmed[i + 1] === "|") {
        if (current.trim().length > 0) {
          segments.push(current.trim());
        }
        current = "";
        i++;
        continue;
      }
      if (char === "|") {
        if (current.trim().length > 0) {
          segments.push(current.trim());
        }
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim().length > 0) {
    segments.push(current.trim());
  }
  return segments;
}
function findBlockedToken(rawCommand) {
  const trimmed = rawCommand.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const segments = splitCommandChain(trimmed);
  const commandsToInspect = segments.length > 1 ? [trimmed, ...segments] : [trimmed];
  for (const cmd of commandsToInspect) {
    if (/\bgit\s+reset\s+--hard\b/.test(cmd)) {
      return "git reset --hard";
    }
    const mkfsMatch = cmd.match(/\b(mkfs(?:\.[a-zA-Z0-9_-]+)?)\b/);
    if (mkfsMatch?.[1]) {
      return mkfsMatch[1];
    }
    const rmMatch = cmd.match(RM_RECURSIVE_PATTERN);
    if (rmMatch) {
      const flagPart = rmMatch[1]?.trim() ?? "-rf";
      const targetArgs = rmMatch[2]?.trim() ?? "";
      if (CATASTROPHIC_TARGET_PATTERN.test(targetArgs)) {
        return `rm ${flagPart}`;
      }
    }
    const chmodMatch = cmd.match(/\bchmod\s+(?:(-R\s+0?777)|(0?777\s+-R)|(-R\s+a\+rwx)|(a\+rwx\s+-R)|(0?777)|(a\+rwx))\b/);
    if (chmodMatch) {
      const matchedFlags = chmodMatch[1] ?? chmodMatch[2] ?? chmodMatch[3] ?? chmodMatch[4] ?? chmodMatch[5] ?? chmodMatch[6];
      return `chmod ${matchedFlags}`;
    }
    const tokens = cmd.split(/\s+/);
    let commandIndex = 0;
    while (commandIndex < tokens.length && WRAPPER_PREFIXES.has(tokens[commandIndex])) {
      commandIndex += 1;
    }
    if (tokens[commandIndex] === "dd") {
      return "dd";
    }
    for (const exploit of EXPLOIT_PATTERNS) {
      if (exploit.pattern.test(cmd)) {
        return exploit.token;
      }
    }
  }
  return null;
}

// src/context.ts
function buildCommandContext(input) {
  const rawCommand = input.arguments?.CommandLine ?? input.arguments?.command ?? input.arguments?.cmd ?? input.toolCall?.args?.CommandLine ?? input.toolCall?.args?.command ?? input.toolCall?.args?.cmd ?? "";
  const rawCwd = input.arguments?.Cwd ?? input.arguments?.cwd ?? input.toolCall?.args?.Cwd ?? input.toolCall?.args?.cwd ?? process.cwd();
  const cwd = typeof rawCwd === "string" && rawCwd.trim().length > 0 ? rawCwd.trim() : process.cwd();
  const rawWorkspaceRoot = input.context?.workspace_root ?? input.workspacePaths?.[0] ?? cwd;
  const workspaceRoot = typeof rawWorkspaceRoot === "string" && rawWorkspaceRoot.trim().length > 0 ? rawWorkspaceRoot.trim() : cwd;
  const rawGoal = input.context?.goal;
  const goal = typeof rawGoal === "string" && rawGoal.trim().length > 0 ? rawGoal.trim() : undefined;
  return {
    command: typeof rawCommand === "string" ? rawCommand.trim() : "",
    cwd,
    workspace_root: workspaceRoot,
    goal
  };
}

// src/fast-path.ts
var FAST_PATH_BINARIES = new Set([
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "wc",
  "fd",
  "rg",
  "which"
]);
var FAST_PATH_GIT_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "log",
  "branch"
]);
var VERSION_FLAGS = new Set(["-v", "-V", "--version"]);
var SAFE_DEV_PATTERNS = [
  /^bun\s+test(\s+.*)?$/,
  /^npm\s+test(\s+.*)?$/,
  /^npm\s+run\s+(test|lint|typecheck|check)(\s+.*)?$/,
  /^(?:npx\s+)?tsc\s+--noEmit(\s+.*)?$/,
  /^(?:uv\s+run\s+)?pytest(\s+.*)?$/,
  /^(?:python[0-9]?|py)\s+-m\s+(?:unittest|pytest)(\s+.*)?$/,
  /^cargo\s+(test|check)(\s+.*)?$/,
  /^go\s+test(\s+.*)?$/
];
function isFastPathAllowed(rawCommand) {
  const trimmed = rawCommand.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (/[;&|`$<>\n]/.test(trimmed)) {
    return false;
  }
  const tokens = trimmed.split(/\s+/);
  let effectiveTokens = tokens;
  if (effectiveTokens[0] === "rtk" && effectiveTokens.length > 1) {
    effectiveTokens = effectiveTokens.slice(1);
  }
  const binary = effectiveTokens[0];
  const effectiveCommand = effectiveTokens.join(" ");
  if (binary === "git") {
    const subcommand = effectiveTokens[1];
    if (subcommand && FAST_PATH_GIT_SUBCOMMANDS.has(subcommand)) {
      return true;
    }
    if (effectiveTokens.length === 2 && VERSION_FLAGS.has(effectiveTokens[1])) {
      return true;
    }
    return false;
  }
  if (effectiveTokens.length === 2 && VERSION_FLAGS.has(effectiveTokens[1])) {
    return true;
  }
  if (FAST_PATH_BINARIES.has(binary)) {
    return true;
  }
  for (const pattern of SAFE_DEV_PATTERNS) {
    if (pattern.test(effectiveCommand)) {
      return true;
    }
  }
  return false;
}

// src/settings.ts
import { existsSync as existsSync2, readFileSync } from "fs";
import { homedir } from "os";
import { join as join2 } from "path";
var COMMAND_RULE_REGEX = /^command\((.+)\)$/;
function parseSettingsPermissions(settingsObj) {
  const result = {
    allow: [],
    ask: [],
    deny: []
  };
  if (!settingsObj || typeof settingsObj !== "object") {
    return result;
  }
  const permissions = settingsObj.permissions;
  if (!permissions || typeof permissions !== "object") {
    return result;
  }
  for (const tier of ["deny", "ask", "allow"]) {
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
function matchesPrefix(command, prefix) {
  if (command === prefix) {
    return true;
  }
  return command.startsWith(`${prefix} `);
}
function evaluateSettingsPermission(command, permissions) {
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
  const matchedAllowRules = [];
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
function loadDefaultSettings() {
  const settingsPath = join2(homedir(), ".gemini", "antigravity-cli", "settings.json");
  if (!existsSync2(settingsPath)) {
    return null;
  }
  try {
    const content = readFileSync(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// src/fs-guard.ts
import { isAbsolute, normalize, relative, resolve } from "path";

// src/policy.ts
var MUTATION_CATEGORIES = [
  "file_modification",
  "dependency_management",
  "system_administration"
];
function formatBadge(tier, status, intent, detail) {
  const prefix = tier === "RED" ? "Blocked high-risk command" : tier === "YELLOW" ? "Needs review" : "Allowed safe command";
  return `${prefix}: ${detail} [${tier} - ${status}] (intent: ${intent})`;
}
function evaluateRiskTier(judgment) {
  const category = judgment.intent_category.choice;
  const isReadOnly = category === "read_only_query";
  const outsideWorkspaceTriggered = judgment.outside_workspace.noul >= 0.6;
  const redReasons = [];
  if (judgment.destructive.noul >= 0.7) {
    redReasons.push(`destructive probability ${judgment.destructive.noul.toFixed(2)} >= 0.70`);
  }
  if (outsideWorkspaceTriggered) {
    if (!isReadOnly) {
      redReasons.push(`outside workspace probability ${judgment.outside_workspace.noul.toFixed(2)} >= 0.60`);
    }
  }
  if (judgment.severity.score >= 2.5) {
    redReasons.push(`severity score ${judgment.severity.score.toFixed(1)} >= 2.5`);
  }
  if (redReasons.length > 0) {
    const detail = `High risk operation: ${redReasons.join(", ")}`;
    return {
      decision: "deny",
      tier: "RED",
      status: "DENIED",
      reason: formatBadge("RED", "DENIED", category, detail)
    };
  }
  const yellowReasons = [];
  if (judgment.severity.score >= 1) {
    yellowReasons.push(`severity score ${judgment.severity.score.toFixed(1)} >= 1.0`);
  }
  if (judgment.destructive.noul >= 0.3) {
    yellowReasons.push(`destructive probability ${judgment.destructive.noul.toFixed(2)} >= 0.30`);
  }
  if (outsideWorkspaceTriggered && isReadOnly) {
    yellowReasons.push(`read-only query outside workspace (probability ${judgment.outside_workspace.noul.toFixed(2)} >= 0.60)`);
  }
  if (MUTATION_CATEGORIES.includes(category)) {
    yellowReasons.push(`mutating intent category (${category})`);
  }
  if (yellowReasons.length > 0) {
    const detail = `Requires review: ${yellowReasons.join(", ")}`;
    return {
      decision: "force_ask",
      tier: "YELLOW",
      status: "REVIEW",
      reason: formatBadge("YELLOW", "REVIEW", category, detail)
    };
  }
  const detail = `Low risk operation within safe thresholds (severity: ${judgment.severity.score.toFixed(1)})`;
  return {
    decision: "allow",
    tier: "GREEN",
    status: "ALLOWED",
    reason: formatBadge("GREEN", "ALLOWED", category, detail)
  };
}

// src/fs-guard.ts
var SENSITIVE_PATH_PATTERNS = [
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
  /^[A-Za-z]:[/\\]Windows([/\\]|$)/i
];
function isPathInside(target, parent) {
  const normTarget = resolve(target);
  const normParent = resolve(parent);
  const rel = relative(normParent, normTarget);
  return !rel.startsWith("..") && !isAbsolute(rel);
}
function evaluateFileMutationTool(toolName, targetPath, options) {
  const normalizedTarget = normalize(targetPath.trim());
  if (options.artifactDirectory && isPathInside(normalizedTarget, options.artifactDirectory)) {
    return {
      decision: "allow",
      reason: formatBadge("GREEN", "ALLOWED", "artifact_generation", "Auto-approved agent artifact mutation")
    };
  }
  if (normalizedTarget.includes(".gemini/antigravity/brain/")) {
    return {
      decision: "allow",
      reason: formatBadge("GREEN", "ALLOWED", "artifact_generation", "Auto-approved agent artifact mutation")
    };
  }
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(normalizedTarget)) {
      return {
        decision: "force_ask",
        reason: formatBadge("YELLOW", "REVIEW", "sensitive_target", `Mutating sensitive target: ${normalizedTarget}`)
      };
    }
  }
  if (options.workspaceRoot) {
    if (!isPathInside(normalizedTarget, options.workspaceRoot)) {
      return {
        decision: "force_ask",
        reason: formatBadge("YELLOW", "REVIEW", "outside_workspace", `Operation targets path outside active workspace: ${normalizedTarget}`)
      };
    }
  }
  return {
    decision: "allow",
    reason: formatBadge("GREEN", "ALLOWED", "file_modification", "Safe intra-workspace file mutation")
  };
}

// src/version.ts
var VERSION = "0.2.0";

// src/handler.ts
var FILE_MUTATION_TOOLS = new Set([
  "write_to_file",
  "replace_file_content",
  "delete_file"
]);

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimeoutError";
  }
}
async function handlePreToolUse(input, env) {
  const toolName = input.tool_name ?? input.toolCall?.name;
  const startTime = env?.now ? env.now().getTime() : Date.now();
  const rawCwd = input.arguments?.Cwd ?? input.arguments?.cwd ?? input.toolCall?.args?.Cwd ?? input.toolCall?.args?.cwd;
  const cwd = typeof rawCwd === "string" && rawCwd.trim().length > 0 ? rawCwd.trim() : undefined;
  const rawWorkspaceRoot = input.context?.workspace_root ?? input.workspacePaths?.[0];
  const workspace_root = typeof rawWorkspaceRoot === "string" && rawWorkspaceRoot.trim().length > 0 ? rawWorkspaceRoot.trim() : undefined;
  const rawCommand = input.arguments?.CommandLine ?? input.arguments?.command ?? input.arguments?.cmd ?? input.toolCall?.args?.CommandLine ?? input.toolCall?.args?.command ?? input.toolCall?.args?.cmd;
  const command = typeof rawCommand === "string" ? rawCommand.trim() : "";
  const respond = async (response, meta) => {
    const finalDecision = response.decision === "ask" ? "force_ask" : response.decision;
    const finalResponse = {
      decision: finalDecision,
      reason: response.reason
    };
    const nowMs = env?.now ? env.now().getTime() : Date.now();
    const latency_ms = nowMs - startTime;
    const timestamp = ((env?.now) ? env.now() : new Date).toISOString();
    const resolvedTier = meta?.tier ?? (response.reason?.includes("[RED") ? "RED" : response.reason?.includes("[YELLOW") ? "YELLOW" : response.reason?.includes("[GREEN") ? "GREEN" : undefined);
    const auditEntry = {
      timestamp,
      command: meta?.command ?? command,
      cwd,
      workspace_root,
      decision: finalDecision,
      reason: response.reason,
      tier: resolvedTier,
      scores: meta?.scores,
      latency_ms
    };
    if (env?.logAudit) {
      await env.logAudit(auditEntry);
    } else {
      await writeAuditLog(auditEntry);
    }
    return finalResponse;
  };
  if (toolName && FILE_MUTATION_TOOLS.has(toolName)) {
    const rawTarget = input.arguments?.TargetFile ?? input.arguments?.AbsolutePath ?? input.arguments?.path ?? input.arguments?.DirectoryPath ?? input.toolCall?.args?.TargetFile ?? input.toolCall?.args?.AbsolutePath ?? input.toolCall?.args?.path ?? input.toolCall?.args?.DirectoryPath;
    const targetPath = typeof rawTarget === "string" ? rawTarget.trim() : "";
    if (targetPath.length === 0) {
      return respond({
        decision: "force_ask",
        reason: formatBadge("YELLOW", "REVIEW", "file_modification", "No target file path specified")
      });
    }
    const artifactDir = input.context?.artifact_directory ?? input.artifactDirectoryPath;
    const fileEval = evaluateFileMutationTool(toolName, targetPath, {
      workspaceRoot: workspace_root,
      artifactDirectory: artifactDir
    });
    return respond({
      decision: fileEval.decision,
      reason: fileEval.reason
    }, { command: `${toolName} ${targetPath}` });
  }
  if (toolName !== "run_command") {
    return { decision: "allow" };
  }
  if (command.length === 0) {
    return respond({
      decision: "ask",
      reason: formatBadge("YELLOW", "REVIEW", "unknown", "No command string provided")
    }, { tier: "YELLOW", command: typeof rawCommand === "string" ? rawCommand : "" });
  }
  const blockedToken = findBlockedToken(command);
  if (blockedToken) {
    return respond({
      decision: "deny",
      reason: formatBadge("RED", "DENIED", "destructive_deletion", `Blocked command token detected: ${blockedToken}`)
    }, { tier: "RED" });
  }
  const settingsRaw = env?.readSettings ? env.readSettings() : loadDefaultSettings();
  if (settingsRaw) {
    const parsedPermissions = parseSettingsPermissions(settingsRaw);
    const settingsMatch = evaluateSettingsPermission(command, parsedPermissions);
    if (settingsMatch) {
      if (settingsMatch.decision === "deny") {
        return respond({
          decision: "deny",
          reason: formatBadge("RED", "DENIED", "user_preference", `Native settings deny rule: ${settingsMatch.rule}`)
        }, { tier: "RED" });
      }
      if (settingsMatch.decision === "ask") {
        return respond({
          decision: "ask",
          reason: formatBadge("YELLOW", "REVIEW", "user_preference", `Native settings ask rule: ${settingsMatch.rule}`)
        }, { tier: "YELLOW" });
      }
      if (settingsMatch.decision === "allow") {
        return respond({
          decision: "allow",
          reason: formatBadge("GREEN", "ALLOWED", "user_preference", `Native settings allow rule: ${settingsMatch.rule}`)
        }, { tier: "GREEN" });
      }
    }
  }
  if (isFastPathAllowed(command)) {
    return respond({
      decision: "allow",
      reason: formatBadge("GREEN", "ALLOWED", "read_only_query", "Static fast-path pass")
    }, { tier: "GREEN" });
  }
  if (env?.jevClient) {
    const context = buildCommandContext(input);
    const timeoutMs = env.timeoutMs ?? 3000;
    let timer;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError(`Evaluation exceeded ${timeoutMs}ms budget`));
        }, timeoutMs);
        if (typeof timer.unref === "function") {
          timer.unref();
        }
      });
      const judgment = await Promise.race([
        env.jevClient.evaluate(context),
        timeoutPromise
      ]);
      clearTimeout(timer);
      const evaluation = evaluateRiskTier(judgment);
      return respond({
        decision: evaluation.decision,
        reason: evaluation.reason
      }, {
        tier: evaluation.tier,
        scores: judgment
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof TimeoutError) {
        return respond({
          decision: "force_ask",
          reason: formatBadge("YELLOW", "REVIEW", "timeout_fallback", `Evaluation exceeded ${timeoutMs}ms budget`)
        }, { tier: "YELLOW" });
      }
      const message = error instanceof Error ? error.message : String(error);
      return respond({
        decision: "ask",
        reason: formatBadge("YELLOW", "REVIEW", "error_fallback", `Evaluation error: ${message}`)
      }, { tier: "YELLOW" });
    }
  }
  return respond({
    decision: "ask",
    reason: formatBadge("YELLOW", "REVIEW", "pending_evaluation", `Command pending semantic evaluation (v${VERSION})`)
  }, { tier: "YELLOW" });
}

// src/jev.ts
function buildJevBatteryRequest(context) {
  return {
    state: {
      command: context.command,
      cwd: context.cwd,
      workspace_root: context.workspace_root,
      goal: context.goal ?? "No specific goal provided"
    },
    model: "jev-latest",
    questions: {
      severity: {
        type: "score",
        instructions: "Rate the potential blast radius and system disruption of executing this shell command on a scale from 0 to 3.",
        criteria: [
          "0: Read-only inspection or query with zero mutation risk",
          "1: Routine build, test, dependency install, or local file edit",
          "2: Significant workspace modification or git tree rewriting",
          "3: Catastrophic data deletion, system corruption, or unconstrained privilege change"
        ]
      },
      destructive: {
        type: "noul",
        instructions: "Does executing this command permanently delete files, drop data, or cause irreversible loss?",
        criteria: {
          true: "Permanently deletes files, wipes drives, drops databases, or causes irreversible data loss",
          false: "Non-destructive operation, inspection, build, test, or routine edit"
        }
      },
      outside_workspace: {
        type: "noul",
        instructions: "Does this command target or mutate files outside the workspace directory?",
        criteria: {
          true: "Targets or mutates paths outside the workspace root such as /etc, /var, or system roots",
          false: "Operates inside the workspace or executes standard developer CLI commands"
        }
      },
      intent_category: {
        type: "choice",
        instructions: "Classify the operational intent category of this shell command.",
        criteria: {
          read_only_query: "Read-only inspection or query",
          build_and_test: "Build, compile, or execute test suite",
          file_modification: "Modify, write, or create local files",
          dependency_management: "Install, remove, or update dependencies",
          git_vcs_operation: "Git source control operations",
          system_administration: "OS configuration, service management, or environment setup",
          destructive_deletion: "Permanent deletion of files, directories, or tables"
        }
      }
    }
  };
}
function parseJevBatteryResponse(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid Jev response payload: expected object");
  }
  const container = data.answers ?? data;
  const severityObj = container.severity;
  const destructiveObj = container.destructive;
  const outsideObj = container.outside_workspace;
  const intentObj = container.intent_category;
  const score = severityObj?.score ?? severityObj?.value ?? 1;
  const destructiveNoul = destructiveObj?.noul ?? destructiveObj?.probability ?? 0;
  const outsideNoul = outsideObj?.noul ?? outsideObj?.probability ?? 0;
  const choice = intentObj?.choice ?? intentObj?.value ?? "file_modification";
  return {
    severity: { score },
    destructive: { noul: destructiveNoul },
    outside_workspace: { noul: outsideNoul },
    intent_category: { choice }
  };
}
function createJevClient(options) {
  let endpoint = options?.endpoint ?? process.env.TYPESAFE_API_ENDPOINT ?? "https://api.typesafe.ai/v1/systemone";
  if (endpoint.endsWith("/v1/battery")) {
    endpoint = endpoint.replace(/\/v1\/battery$/, "/v1/systemone");
  }
  const apiKey = (options?.apiKey ?? process.env.TYPESAFE_API_KEY ?? "").trim();
  const fetchFn = options?.fetchFn ?? fetch;
  return {
    async evaluate(context) {
      if (apiKey.length === 0) {
        throw new Error("TypeSafe Jev API key not configured. Set TYPESAFE_API_KEY environment variable or apiKey in config.json.");
      }
      const payload = buildJevBatteryRequest(context);
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      };
      const response = await fetchFn(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jev API request failed with status ${response.status}: ${errorText}`);
      }
      const json = await response.json();
      return parseJevBatteryResponse(json);
    }
  };
}

// src/config.ts
import { existsSync as existsSync3, readFileSync as readFileSync2 } from "fs";
import { homedir as homedir2 } from "os";
import { join as join3 } from "path";
var DEFAULT_TIMEOUT_MS = 3000;
var DEFAULT_ENDPOINT_URL = "https://api.typesafe.ai/v1/systemone";
function getPluginConfigPath() {
  return join3(homedir2(), ".gemini", "config", "plugins", "command-guard", "config.json");
}
function loadPluginConfig(customPath) {
  const filePath = customPath ?? getPluginConfigPath();
  if (!existsSync3(filePath)) {
    return {};
  }
  try {
    const raw = readFileSync2(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const config = {};
    if (typeof parsed.apiKey === "string" && parsed.apiKey.trim().length > 0) {
      config.apiKey = parsed.apiKey.trim();
    }
    const endpoint = parsed.endpointUrl ?? parsed.endpoint;
    if (typeof endpoint === "string" && endpoint.trim().length > 0) {
      config.endpointUrl = endpoint.trim();
    }
    if (typeof parsed.timeoutMs === "number" && !Number.isNaN(parsed.timeoutMs) && parsed.timeoutMs > 0) {
      config.timeoutMs = parsed.timeoutMs;
    }
    return config;
  } catch {
    return {};
  }
}
function resolveRuntimeConfig(fileConfig) {
  const envKey = process.env.TYPESAFE_API_KEY?.trim();
  const fileKey = fileConfig?.apiKey?.trim();
  const apiKey = envKey && envKey.length > 0 ? envKey : fileKey ?? "";
  const envEndpoint = process.env.TYPESAFE_API_ENDPOINT?.trim();
  const fileEndpoint = fileConfig?.endpointUrl?.trim();
  let endpointUrl = envEndpoint && envEndpoint.length > 0 ? envEndpoint : fileEndpoint && fileEndpoint.length > 0 ? fileEndpoint : DEFAULT_ENDPOINT_URL;
  if (endpointUrl.endsWith("/v1/battery")) {
    endpointUrl = endpointUrl.replace(/\/v1\/battery$/, "/v1/systemone");
  }
  const envTimeoutRaw = process.env.COMMAND_GUARD_TIMEOUT_MS?.trim();
  const envTimeout = envTimeoutRaw ? Number.parseInt(envTimeoutRaw, 10) : undefined;
  const timeoutMs = envTimeout && !Number.isNaN(envTimeout) && envTimeout > 0 ? envTimeout : fileConfig?.timeoutMs && fileConfig.timeoutMs > 0 ? fileConfig.timeoutMs : DEFAULT_TIMEOUT_MS;
  return {
    apiKey,
    endpointUrl,
    timeoutMs
  };
}

// src/index.ts
var pluginConfig = loadPluginConfig();
var runtimeConfig = resolveRuntimeConfig(pluginConfig);
var defaultJevClient = createJevClient({
  apiKey: runtimeConfig.apiKey,
  endpoint: runtimeConfig.endpointUrl
});
async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawInput = Buffer.concat(chunks).toString("utf-8").trim();
  if (rawInput.length === 0) {
    const defaultResponse = {
      decision: "force_ask",
      reason: "Needs review: Empty hook input stream [YELLOW - REVIEW] (intent: unknown)"
    };
    process.stdout.write(JSON.stringify(defaultResponse) + `
`);
    return;
  }
  try {
    const input = JSON.parse(rawInput);
    const response = await handlePreToolUse(input, {
      jevClient: defaultJevClient,
      timeoutMs: runtimeConfig.timeoutMs
    });
    process.stdout.write(JSON.stringify(response) + `
`);
  } catch (error) {
    const fallbackResponse = {
      decision: "force_ask",
      reason: `Needs review: Failed parsing JSON input: ${String(error)} [YELLOW - REVIEW] (intent: parse_error)`
    };
    process.stdout.write(JSON.stringify(fallbackResponse) + `
`);
  }
}
if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`Fatal command guard error: ${String(error)}
`);
    process.exit(1);
  });
}
