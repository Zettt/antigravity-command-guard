import { describe, expect, it } from "bun:test";
import { handlePreToolUse } from "../src/handler.ts";
import type { AuditLogEntry, PreToolUseInput } from "../src/types.ts";


describe("handlePreToolUse", () => {
  it("allows non-command tools without evaluation", async () => {
    const input: PreToolUseInput = {
      tool_name: "view_file",
      arguments: { AbsolutePath: "/foo/bar.ts" },
    };
    const response = await handlePreToolUse(input);
    expect(response.decision).toBe("allow");
  });

  it("allows fast-path read-only command with green tier badge", async () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "git status" },
    };
    const response = await handlePreToolUse(input);
    expect(response.decision).toBe("allow");
    expect(response.reason).toContain("[GREEN - ALLOWED]");
    expect(response.reason).toContain("read_only_query");
  });

  it("handles version queries on fast-path", async () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "bun --version" },
    };
    const response = await handlePreToolUse(input);
    expect(response.decision).toBe("allow");
    expect(response.reason).toContain("[GREEN - ALLOWED]");
  });

  it("defaults non-fast-path commands to force_ask in initial scaffolding", async () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "touch newfile.txt" },
    };
    const response = await handlePreToolUse(input);
    expect(response.decision).toBe("force_ask");
  });

  it("defaults empty command to force_ask", async () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: {},
    };
    const response = await handlePreToolUse(input);
    expect(response.decision).toBe("force_ask");
  });

  it("denies dangerous token command with red tier badge", async () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "rm -rf /workspace" },
    };
    const response = await handlePreToolUse(input);
    expect(response.decision).toBe("deny");
    expect(response.reason).toContain("[RED - DENIED]");
    expect(response.reason).toContain("destructive_deletion");
    expect(response.reason).toContain("rm -rf");
  });

  it("denies git reset hard with red tier badge", async () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "git reset --hard HEAD~1" },
    };
    const response = await handlePreToolUse(input);
    expect(response.decision).toBe("deny");
    expect(response.reason).toContain("[RED - DENIED]");
    expect(response.reason).toContain("git reset --hard");
  });

  it("enforces native settings deny rule over fast-path", async () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "git status" },
    };
    const mockEnv = {
      readSettings: () => ({
        permissions: {
          deny: ["command(git status)"],
        },
      }),
    };
    const response = await handlePreToolUse(input, mockEnv);
    expect(response.decision).toBe("deny");
    expect(response.reason).toContain("[RED - DENIED]");
    expect(response.reason).toContain("user_preference");
    expect(response.reason).toContain("command(git status)");
  });

  it("enforces native settings allow rule", async () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "bun test" },
    };
    const mockEnv = {
      readSettings: () => ({
        permissions: {
          allow: ["command(bun test)"],
        },
      }),
    };
    const response = await handlePreToolUse(input, mockEnv);
    expect(response.decision).toBe("allow");
    expect(response.reason).toContain("[GREEN - ALLOWED]");
    expect(response.reason).toContain("user_preference");
  });

  it("enforces native settings ask rule", async () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "ls" },
    };
    const mockEnv = {
      readSettings: () => ({
        permissions: {
          ask: ["command(ls)"],
        },
      }),
    };
    const response = await handlePreToolUse(input, mockEnv);
    expect(response.decision).toBe("force_ask");
    expect(response.reason).toContain("[YELLOW - REVIEW]");
    expect(response.reason).toContain("user_preference");
  });

  it("invokes jevClient for commands requiring semantic evaluation", async () => {
    let capturedContext: unknown = null;
    const mockEnv = {
      jevClient: {
        evaluate: async (ctx: unknown) => {
          capturedContext = ctx;
          return {
            severity: { score: 1.5 },
            destructive: { noul: 0.1 },
            outside_workspace: { noul: 0.05 },
            intent_category: { choice: "build_and_test" as const },
          };
        },
      },
    };

    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "cargo build --release", Cwd: "/app" },
      context: { workspace_root: "/app", goal: "Compile release binary" },
    };

    const response = await handlePreToolUse(input, mockEnv);
    expect(capturedContext).not.toBeNull();
    expect((capturedContext as { command: string }).command).toBe(
      "cargo build --release",
    );
    expect(response.decision).toBeDefined();
  });

  it("evaluates Red tier decision (deny) when Jev reports high risk", async () => {
    const mockEnv = {
      jevClient: {
        evaluate: async () => ({
          severity: { score: 2.8 },
          destructive: { noul: 0.8 },
          outside_workspace: { noul: 0.1 },
          intent_category: { choice: "destructive_deletion" as const },
        }),
      },
    };
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "shred important_file.txt" },
    };
    const response = await handlePreToolUse(input, mockEnv);
    expect(response.decision).toBe("deny");
    expect(response.reason).toContain("[RED - DENIED]");
    expect(response.reason).toContain("Intent: destructive_deletion");
  });

  it("evaluates Yellow tier decision (ask) when Jev reports moderate risk", async () => {
    const mockEnv = {
      jevClient: {
        evaluate: async () => ({
          severity: { score: 1.2 },
          destructive: { noul: 0.1 },
          outside_workspace: { noul: 0.05 },
          intent_category: { choice: "dependency_management" as const },
        }),
      },
    };
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "npm install lodash" },
    };
    const response = await handlePreToolUse(input, mockEnv);
    expect(response.decision).toBe("force_ask");
    expect(response.reason).toContain("[YELLOW - REVIEW]");
    expect(response.reason).toContain("Intent: dependency_management");
  });

  it("evaluates Green tier decision (allow) when Jev reports low risk", async () => {
    const mockEnv = {
      jevClient: {
        evaluate: async () => ({
          severity: { score: 0.2 },
          destructive: { noul: 0.05 },
          outside_workspace: { noul: 0.01 },
          intent_category: { choice: "build_and_test" as const },
        }),
      },
    };
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "make build" },
    };
    const response = await handlePreToolUse(input, mockEnv);
    expect(response.decision).toBe("allow");
    expect(response.reason).toContain("[GREEN - ALLOWED]");
    expect(response.reason).toContain("Intent: build_and_test");
  });

  it("triggers fallback to ask when evaluation exceeds timeout budget", async () => {
    const mockEnv = {
      timeoutMs: 25,
      jevClient: {
        evaluate: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            severity: { score: 0.1 },
            destructive: { noul: 0.01 },
            outside_workspace: { noul: 0.01 },
            intent_category: { choice: "build_and_test" as const },
          };
        },
      },
    };
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "make build" },
    };
    const response = await handlePreToolUse(input, mockEnv);
    expect(response.decision).toBe("force_ask");
    expect(response.reason).toBe(
      "[YELLOW - REVIEW] Intent: timeout_fallback | Detail: Evaluation exceeded 25ms budget",
    );
  });

  it("reflects custom timeoutMs in timeout fallback badge detail", async () => {
    const mockEnv = {
      jevClient: {
        evaluate: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            severity: { score: 0 },
            destructive: { noul: 0 },
            outside_workspace: { noul: 0 },
            intent_category: { choice: "build_and_test" as const },
          };
        },
      },
      timeoutMs: 10,
    };
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "make build" },
    };
    const response = await handlePreToolUse(input, mockEnv);
    expect(response.decision).toBe("force_ask");
    expect(response.reason).toBe(
      "[YELLOW - REVIEW] Intent: timeout_fallback | Detail: Evaluation exceeded 10ms budget",
    );
  });

  it("triggers fallback to force_ask when Jev evaluation throws network error", async () => {
    const mockEnv = {
      jevClient: {
        evaluate: async () => {
          throw new Error("Connection refused (ECONNREFUSED)");
        },
      },
    };
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: { CommandLine: "make build" },
    };
    const response = await handlePreToolUse(input, mockEnv);
    expect(response.decision).toBe("force_ask");
    expect(response.reason).toBe(
      "[YELLOW - REVIEW] Intent: error_fallback | Detail: Evaluation error: Connection refused (ECONNREFUSED)",
    );
  });

  describe("audit logging integration", () => {
    it("captures audit record for allow path (fast-path)", async () => {
      let loggedEntry: AuditLogEntry | null = null;
      const mockEnv = {
        logAudit: async (entry: AuditLogEntry) => {
          loggedEntry = entry;
        },
      };

      const input: PreToolUseInput = {
        tool_name: "run_command",
        arguments: { CommandLine: "git status", Cwd: "/workspace/project" },
        context: { workspace_root: "/workspace" },
      };

      const response = await handlePreToolUse(input, mockEnv);
      expect(response.decision).toBe("allow");
      expect(loggedEntry).not.toBeNull();
      expect(loggedEntry!.decision).toBe("allow");
      expect(loggedEntry!.command).toBe("git status");
      expect(loggedEntry!.cwd).toBe("/workspace/project");
      expect(loggedEntry!.workspace_root).toBe("/workspace");
      expect(loggedEntry!.tier).toBe("GREEN");
      expect(loggedEntry!.reason).toContain("[GREEN - ALLOWED]");
      expect(typeof loggedEntry!.timestamp).toBe("string");
      expect(new Date(loggedEntry!.timestamp).toISOString()).toBe(
        loggedEntry!.timestamp,
      );
      expect(typeof loggedEntry!.latency_ms).toBe("number");
      expect(loggedEntry!.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it("captures audit record for deny path (blocked token)", async () => {
      let loggedEntry: AuditLogEntry | null = null;
      const mockEnv = {
        logAudit: async (entry: AuditLogEntry) => {
          loggedEntry = entry;
        },
      };

      const input: PreToolUseInput = {
        tool_name: "run_command",
        arguments: { CommandLine: "rm -rf /" },
      };

      const response = await handlePreToolUse(input, mockEnv);
      expect(response.decision).toBe("deny");
      expect(loggedEntry).not.toBeNull();
      expect(loggedEntry!.decision).toBe("deny");
      expect(loggedEntry!.command).toBe("rm -rf /");
      expect(loggedEntry!.tier).toBe("RED");
      expect(loggedEntry!.reason).toContain("[RED - DENIED]");
    });

    it("captures audit record for ask path with Jev scores", async () => {
      let loggedEntry: AuditLogEntry | null = null;
      const judgmentResult = {
        severity: { score: 1.5 },
        destructive: { noul: 0.2 },
        outside_workspace: { noul: 0.1 },
        intent_category: { choice: "dependency_management" as const },
      };
      const mockEnv = {
        jevClient: {
          evaluate: async () => judgmentResult,
        },
        logAudit: async (entry: AuditLogEntry) => {
          loggedEntry = entry;
        },
      };

      const input: PreToolUseInput = {
        tool_name: "run_command",
        arguments: { CommandLine: "npm install express", Cwd: "/app" },
        context: { workspace_root: "/app" },
      };

      const response = await handlePreToolUse(input, mockEnv);
      expect(response.decision).toBe("force_ask");
      expect(loggedEntry).not.toBeNull();
      expect(loggedEntry!.decision).toBe("force_ask");
      expect(loggedEntry!.command).toBe("npm install express");
      expect(loggedEntry!.tier).toBe("YELLOW");
      expect(loggedEntry!.scores).toEqual(judgmentResult);
    });

    it("captures audit record for native settings decision", async () => {
      let loggedEntry: AuditLogEntry | null = null;
      const mockEnv = {
        readSettings: () => ({
          permissions: {
            deny: ["command(kill -9)"],
          },
        }),
        logAudit: async (entry: AuditLogEntry) => {
          loggedEntry = entry;
        },
      };

      const input: PreToolUseInput = {
        tool_name: "run_command",
        arguments: { CommandLine: "kill -9 1234" },
      };

      const response = await handlePreToolUse(input, mockEnv);
      expect(response.decision).toBe("deny");
      expect(loggedEntry).not.toBeNull();
      expect(loggedEntry!.decision).toBe("deny");
      expect(loggedEntry!.tier).toBe("RED");
      expect(loggedEntry!.reason).toContain("Native settings deny rule");
    });

    it("does not invoke logAudit for non-command tools", async () => {
      let logAuditCalled = false;
      const mockEnv = {
        logAudit: async () => {
          logAuditCalled = true;
        },
      };

      const input: PreToolUseInput = {
        tool_name: "view_file",
        arguments: { AbsolutePath: "/path/to/file.ts" },
      };

      const response = await handlePreToolUse(input, mockEnv);
      expect(response.decision).toBe("allow");
      expect(logAuditCalled).toBe(false);
    });
  });

  describe("filesystem mutation tool guard", () => {
    const workspaceRoot = "/Users/developer/project";

    it("allows write_to_file within active workspace", async () => {
      const input: PreToolUseInput = {
        tool_name: "write_to_file",
        arguments: { TargetFile: "/Users/developer/project/src/index.ts" },
        context: { workspace_root: workspaceRoot },
      };
      const response = await handlePreToolUse(input);
      expect(response.decision).toBe("allow");
      expect(response.reason).toContain("[GREEN - ALLOWED]");
      expect(response.reason).toContain("Safe intra-workspace file mutation");
    });

    it("requires review for write_to_file targeting sensitive secret paths (.env)", async () => {
      const input: PreToolUseInput = {
        tool_name: "write_to_file",
        arguments: { TargetFile: "/Users/developer/project/.env" },
        context: { workspace_root: workspaceRoot },
      };
      const response = await handlePreToolUse(input);
      expect(response.decision).toBe("force_ask");
      expect(response.reason).toContain("[YELLOW - REVIEW]");
      expect(response.reason).toContain("Mutating sensitive target");
    });

    it("requires review for replace_file_content targeting SSH keys", async () => {
      const input: PreToolUseInput = {
        tool_name: "replace_file_content",
        arguments: { TargetFile: "/Users/developer/.ssh/id_rsa" },
        context: { workspace_root: workspaceRoot },
      };
      const response = await handlePreToolUse(input);
      expect(response.decision).toBe("force_ask");
      expect(response.reason).toContain("Mutating sensitive target");
    });

    it("requires review for write_to_file outside active workspace", async () => {
      const input: PreToolUseInput = {
        tool_name: "write_to_file",
        arguments: { TargetFile: "/tmp/external-project/script.ts" },
        context: { workspace_root: workspaceRoot },
      };
      const response = await handlePreToolUse(input);
      expect(response.decision).toBe("force_ask");
      expect(response.reason).toContain("outside active workspace");
    });

    it("auto-approves write_to_file targeting trusted artifact directory", async () => {
      const input: PreToolUseInput = {
        tool_name: "write_to_file",
        arguments: { TargetFile: "/tmp/antigravity/artifacts/output.md" },
        context: {
          workspace_root: workspaceRoot,
          artifact_directory: "/tmp/antigravity/artifacts",
        },
      };
      const response = await handlePreToolUse(input);
      expect(response.decision).toBe("allow");
      expect(response.reason).toContain("[GREEN - ALLOWED]");
      expect(response.reason).toContain("Auto-approved agent artifact mutation");
    });

    it("auto-approves write_to_file inside standard antigravity brain artifact path", async () => {
      const input: PreToolUseInput = {
        tool_name: "write_to_file",
        arguments: { TargetFile: "/Users/zettt/.gemini/antigravity/brain/sess-123/chart.png" },
        context: { workspace_root: workspaceRoot },
      };
      const response = await handlePreToolUse(input);
      expect(response.decision).toBe("allow");
      expect(response.reason).toContain("[GREEN - ALLOWED]");
      expect(response.reason).toContain("Auto-approved agent artifact mutation");
    });

    it("requires review if no target path is provided for file mutation tool", async () => {
      const input: PreToolUseInput = {
        tool_name: "write_to_file",
        arguments: {},
        context: { workspace_root: workspaceRoot },
      };
      const response = await handlePreToolUse(input);
      expect(response.decision).toBe("force_ask");
      expect(response.reason).toContain("No target file path specified");
    });
  });
});

