import { describe, expect, it } from "bun:test";

describe("CLI entrypoint", () => {
  it("processes hook JSON via stdin and emits JSON decision on stdout", async () => {
    const inputPayload = JSON.stringify({
      tool_name: "run_command",
      arguments: { CommandLine: "git status" },
    });

    const proc = Bun.spawn(["bun", "run", "src/index.ts"], {
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

  it("handles non-fast-path commands via stdin safely", async () => {
    const inputPayload = JSON.stringify({
      tool_name: "run_command",
      arguments: { CommandLine: "npm install" },
    });

    const proc = Bun.spawn(["bun", "run", "src/index.ts"], {
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
  });

  it("denies dangerous tokens via stdin", async () => {
    const inputPayload = JSON.stringify({
      tool_name: "run_command",
      arguments: { CommandLine: "rm -rf /critical" },
    });

    const proc = Bun.spawn(["bun", "run", "src/index.ts"], {
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
});
