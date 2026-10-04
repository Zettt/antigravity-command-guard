import { beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

describe("Bundle integration smoke test (dist/index.js)", () => {
  beforeAll(() => {
    if (!existsSync("dist/index.js")) {
      Bun.spawnSync(["bun", "run", "build"]);
    }
  });

  it("allows fast-path commands with green tier badge", async () => {
    const inputPayload = JSON.stringify({
      tool_name: "run_command",
      arguments: { CommandLine: "git status" },
    });

    const proc = Bun.spawn(["bun", "run", "dist/index.js"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(inputPayload);
    proc.stdin.end();

    const outputText = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    const result = JSON.parse(outputText.trim());
    expect(result.decision).toBe("allow");
    expect(result.reason).toContain("[GREEN - ALLOWED]");
  });

  it("denies dangerous tokens with red tier badge", async () => {
    const inputPayload = JSON.stringify({
      tool_name: "run_command",
      arguments: { CommandLine: "rm -rf /critical" },
    });

    const proc = Bun.spawn(["bun", "run", "dist/index.js"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(inputPayload);
    proc.stdin.end();

    const outputText = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    const result = JSON.parse(outputText.trim());
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("[RED - DENIED]");
    expect(result.reason).toContain("rm -rf");
  });

  it("asks on empty command string", async () => {
    const inputPayload = JSON.stringify({
      tool_name: "run_command",
      arguments: { CommandLine: "" },
    });

    const proc = Bun.spawn(["bun", "run", "dist/index.js"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(inputPayload);
    proc.stdin.end();

    const outputText = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    const result = JSON.parse(outputText.trim());
    expect(result.decision).toBe("force_ask");
    expect(result.reason).toContain("[YELLOW - REVIEW]");
  });

  it("asks on empty stdin stream", async () => {
    const proc = Bun.spawn(["bun", "run", "dist/index.js"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write("");
    proc.stdin.end();

    const outputText = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    const result = JSON.parse(outputText.trim());
    expect(result.decision).toBe("force_ask");
    expect(result.reason).toContain("Empty hook input stream");
  });

  it("executes packaged plugin bundle in global or workspace distribution", async () => {
    const globalPath = join(
      homedir(),
      ".gemini",
      "config",
      "plugins",
      "command-guard",
      "dist",
      "index.js",
    );
    const localPath = ".agents/plugins/command-guard/dist/index.js";
    const bundlePath = existsSync(localPath)
      ? localPath
      : existsSync(globalPath)
        ? globalPath
        : "dist/index.js";

    const inputPayload = JSON.stringify({
      tool_name: "run_command",
      arguments: { CommandLine: "git diff" },
    });

    const proc = Bun.spawn(["bun", "run", bundlePath], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(inputPayload);
    proc.stdin.end();

    const outputText = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    const result = JSON.parse(outputText.trim());
    expect(result.decision).toBe("allow");
    expect(result.reason).toContain("[GREEN - ALLOWED]");
  });
});
