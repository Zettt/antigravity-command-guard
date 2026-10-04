const FAST_PATH_BINARIES = new Set([
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "wc",
  "fd",
  "rg",
  "which",
]);

const FAST_PATH_GIT_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "log",
  "branch",
]);

const VERSION_FLAGS = new Set(["-v", "-V", "--version"]);

const SAFE_DEV_PATTERNS = [
  /^bun\s+test(\s+.*)?$/,
  /^npm\s+test(\s+.*)?$/,
  /^npm\s+run\s+(test|lint|typecheck|check)(\s+.*)?$/,
  /^(?:npx\s+)?tsc\s+--noEmit(\s+.*)?$/,
  /^(?:uv\s+run\s+)?pytest(\s+.*)?$/,
  /^(?:python[0-9]?|py)\s+-m\s+(?:unittest|pytest)(\s+.*)?$/,
  /^cargo\s+(test|check)(\s+.*)?$/,
  /^go\s+test(\s+.*)?$/,
];

export function isFastPathAllowed(rawCommand: string): boolean {
  const trimmed = rawCommand.trim();
  if (trimmed.length === 0) {
    return false;
  }

  // Reject chained commands, pipes, redirection, process substitution, or
  // shell substitutions: a redirect lets a read-only binary write anywhere.
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
