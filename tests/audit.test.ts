import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeAuditLog } from "../src/audit.ts";
import type { AuditLogEntry } from "../src/types.ts";

describe("writeAuditLog", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `audit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("writes valid JSON line to specified file path", async () => {
    const logPath = join(testDir, "audit.jsonl");
    const entry: AuditLogEntry = {
      timestamp: "2026-10-03T12:00:00.000Z",
      command: "git status",
      cwd: "/repo",
      workspace_root: "/repo",
      decision: "allow",
      reason: "[GREEN - ALLOWED] Intent: read_only_query | Detail: Static fast-path pass",
      tier: "GREEN",
      latency_ms: 2,
    };

    await writeAuditLog(entry, { logPath });

    expect(existsSync(logPath)).toBe(true);
    const content = readFileSync(logPath, "utf-8");
    expect(content.endsWith("\n")).toBe(true);

    const parsed = JSON.parse(content.trim());
    expect(parsed).toEqual(entry);
  });

  it("appends multiple entries as discrete JSON lines", async () => {
    const logPath = join(testDir, "audit.jsonl");
    const entry1: AuditLogEntry = {
      timestamp: "2026-10-03T12:00:00.000Z",
      command: "ls",
      decision: "allow",
    };
    const entry2: AuditLogEntry = {
      timestamp: "2026-10-03T12:00:01.000Z",
      command: "rm -rf /",
      decision: "deny",
      reason: "[RED - DENIED] Blocked token",
      tier: "RED",
    };

    await writeAuditLog(entry1, { logPath });
    await writeAuditLog(entry2, { logPath });

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual(entry1);
    expect(JSON.parse(lines[1])).toEqual(entry2);
  });

  it("creates target log directory if non-existent", async () => {
    const logPath = join(testDir, "nested", "deep", "dir", "audit.jsonl");
    const entry: AuditLogEntry = {
      timestamp: "2026-10-03T12:00:00.000Z",
      command: "pwd",
      decision: "allow",
    };

    await writeAuditLog(entry, { logPath });

    expect(existsSync(logPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(logPath, "utf-8").trim());
    expect(parsed.command).toBe("pwd");
  });

  it("rotates file when current file size exceeds maxBytes", async () => {
    const logPath = join(testDir, "audit.jsonl");
    const rotatedPath = join(testDir, "audit.1.jsonl");

    const entry1: AuditLogEntry = {
      timestamp: "2026-10-03T12:00:00.000Z",
      command: "npm install",
      cwd: "/repo",
      workspace_root: "/repo",
      decision: "ask",
      reason: "[YELLOW - REVIEW] Intent: dependency_management | Detail: mutating command",
      tier: "YELLOW",
      latency_ms: 15,
    };

    const entry2: AuditLogEntry = {
      timestamp: "2026-10-03T12:00:01.000Z",
      command: "cargo build",
      decision: "allow",
      tier: "GREEN",
    };

    // Write entry 1
    await writeAuditLog(entry1, { logPath });
    const sizeBefore = statSync(logPath).size;
    expect(sizeBefore).toBeGreaterThan(50);

    // Set maxBytes smaller than sizeBefore so entry 2 triggers rotation
    await writeAuditLog(entry2, { logPath, maxBytes: sizeBefore });

    // Expect audit.1.jsonl to contain entry1
    expect(existsSync(rotatedPath)).toBe(true);
    const rotatedContent = readFileSync(rotatedPath, "utf-8").trim();
    expect(JSON.parse(rotatedContent)).toEqual(entry1);

    // Expect active audit.jsonl to contain only entry2
    const activeContent = readFileSync(logPath, "utf-8").trim();
    expect(JSON.parse(activeContent)).toEqual(entry2);
  });

  it("handles cascading rotation when archive files already exist", async () => {
    const logPath = join(testDir, "audit.jsonl");
    const rotated1 = join(testDir, "audit.1.jsonl");
    const rotated2 = join(testDir, "audit.2.jsonl");

    const entry1: AuditLogEntry = {
      timestamp: "2026-10-03T12:00:01.000Z",
      command: "cmd-1",
      decision: "allow",
    };
    const entry2: AuditLogEntry = {
      timestamp: "2026-10-03T12:00:02.000Z",
      command: "cmd-2",
      decision: "allow",
    };
    const entry3: AuditLogEntry = {
      timestamp: "2026-10-03T12:00:03.000Z",
      command: "cmd-3",
      decision: "allow",
    };

    // Tiny maxBytes to trigger rotation on every subsequent write
    const maxBytes = 10;

    await writeAuditLog(entry1, { logPath, maxBytes });
    await writeAuditLog(entry2, { logPath, maxBytes });
    await writeAuditLog(entry3, { logPath, maxBytes });

    expect(existsSync(rotated2)).toBe(true);
    expect(JSON.parse(readFileSync(rotated2, "utf-8").trim()).command).toBe(
      "cmd-1",
    );

    expect(existsSync(rotated1)).toBe(true);
    expect(JSON.parse(readFileSync(rotated1, "utf-8").trim()).command).toBe(
      "cmd-2",
    );

    expect(existsSync(logPath)).toBe(true);
    expect(JSON.parse(readFileSync(logPath, "utf-8").trim()).command).toBe(
      "cmd-3",
    );
  });
});
