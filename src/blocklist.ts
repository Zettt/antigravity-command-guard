const WRAPPER_PREFIXES = new Set(["sudo", "env", "nohup", "time"]);

export const CATASTROPHIC_TARGET_PATTERN =
  /^(\/|\/\*|~|~\*|\.\.\/|\.\.\\|\/etc|\/var|\/usr|\/home|\/root|\/bin|\/sbin|\/System|\/Library|\/boot|\/dev|\/proc|\/sys|[A-Za-z]:[\\\/]|\$HOME|\$\{HOME\}|\$ROOT|\$\{ROOT\})/i;

const RM_RECURSIVE_PATTERN =
  /\brm\s+(?:-[a-zA-Z0-9_-]+\s+)*((?:-[a-zA-Z]*(?:[rR]f|f[rR])[a-zA-Z]*|-[a-zA-Z]*[rR][a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*[rR][a-zA-Z]*))\s+(.*)/;

export const EXPLOIT_PATTERNS: Array<{ pattern: RegExp; token: string }> = [
  {
    pattern: /\bbase64\s+(-d|-D|--decode)\s*\|\s*(sh|bash|zsh|python[0-9]?|ruby|perl)\b/i,
    token: "base64 | sh",
  },
  {
    pattern: /\beval\s+(["']|\$\()/i,
    token: "eval dynamic execution",
  },
  {
    pattern: /(>>|>)\s*(~?\/\.(bashrc|zshrc|bash_profile|profile|zprofile)|\/etc\/(hosts|sudoers|environment))\b/i,
    token: "shell profile tampering",
  },
  {
    pattern: /-o\s+StrictHostKeyChecking=no\b/i,
    token: "StrictHostKeyChecking=no",
  },
  {
    pattern: /\b(powershell|pwsh)\b.*-(enc|encodedcommand)\b/i,
    token: "powershell encoded command",
  },
  {
    pattern: /(>>|>)\s*(\$profile|\$profile\..*|\bMicrosoft\.PowerShell_profile\.ps1\b)/i,
    token: "powershell profile tampering",
  },
  {
    pattern: /(\bbash\b.*>&\s*\/dev\/tcp\/|\b(nc|ncat|netcat)\s+(-e\s+|\/bin\/|\d+\.\d+\.\d+\.\d+)|\/bin\/sh\s+-i\s+2>&1|\bmkfifo\b.*\|\s*(nc|ncat|netcat)|\bsocat\s+exec:)/i,
    token: "reverse shell",
  },
  {
    pattern: /(curl|wget)\s+.*(-o|--output)\s+\S+\s*(&&|;)\s*(bash|sh|zsh|chmod\s+\+x)/i,
    token: "download-and-execute chain",
  },
  {
    pattern: /(curl|wget)\s+.*\|\s*(bash|sh|zsh)/i,
    token: "curl | bash",
  },
  {
    pattern: /\b(curl|wget)\s+.*(?:-d\s+@|-F\s+.*@|--data-binary\s+@|--post-file[=\s]+).*(\.env|id_rsa|id_ed25519|\.ssh|\.aws|\.kube|\.npmrc|\.pypirc|\.netrc|\/etc\/shadow)/i,
    token: "credential exfiltration",
  },
  {
    pattern: /\bgit\s+config\s+.*(core\.fsmonitor|core\.sshCommand|diff\..*\.command)(\s*=\s*|\s+)/i,
    token: "git config command execution",
  },
];

export function splitCommandChain(command: string): string[] {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const segments: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escapeNext = false;

  for (let i = 0; i < trimmed.length; i++) {
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
      if (char === "\n" || char === "\r" || char === ";") {
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

export function findBlockedToken(rawCommand: string): string | null {
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

    const chmodMatch = cmd.match(
      /\bchmod\s+(?:(-R\s+0?777)|(0?777\s+-R)|(-R\s+a\+rwx)|(a\+rwx\s+-R)|(0?777)|(a\+rwx))\b/,
    );
    if (chmodMatch) {
      const matchedFlags =
        chmodMatch[1] ??
        chmodMatch[2] ??
        chmodMatch[3] ??
        chmodMatch[4] ??
        chmodMatch[5] ??
        chmodMatch[6];
      return `chmod ${matchedFlags}`;
    }

    const tokens = cmd.split(/\s+/);
    let commandIndex = 0;
    while (
      commandIndex < tokens.length &&
      WRAPPER_PREFIXES.has(tokens[commandIndex])
    ) {
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
