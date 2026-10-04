import { describe, expect, it } from "bun:test";
import { buildCommandContext } from "../src/context.ts";
import type { PreToolUseInput } from "../src/types.ts";

describe("buildCommandContext", () => {
  it("extracts complete context from input", () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: {
        CommandLine: "npm test",
        Cwd: "/Users/dev/repo",
      },
      context: {
        workspace_root: "/Users/dev/repo",
        goal: "Run test suite",
      },
    };

    const context = buildCommandContext(input);
    expect(context.command).toBe("npm test");
    expect(context.cwd).toBe("/Users/dev/repo");
    expect(context.workspace_root).toBe("/Users/dev/repo");
    expect(context.goal).toBe("Run test suite");
  });

  it("handles fallback defaults for missing optional fields", () => {
    const input: PreToolUseInput = {
      tool_name: "run_command",
      arguments: {
        command: "ls -la",
      },
    };

    const context = buildCommandContext(input);
    expect(context.command).toBe("ls -la");
    expect(context.cwd.length).toBeGreaterThan(0);
    expect(context.workspace_root.length).toBeGreaterThan(0);
    expect(context.goal).toBeUndefined();
  });
});
