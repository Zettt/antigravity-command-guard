import { describe, expect, it } from "bun:test";
import {
  evaluateSettingsPermission,
  parseSettingsPermissions,
} from "../src/settings.ts";

describe("parseSettingsPermissions", () => {
  it("extracts command rules from settings object", () => {
    const rawSettings = {
      permissions: {
        allow: ["command(rtk ls)", "mcp(tool_name)"],
        ask: ["command(rtk run)"],
        deny: ["command(find)", "command(grep)"],
      },
    };

    const parsed = parseSettingsPermissions(rawSettings);
    expect(parsed.allow).toEqual(["rtk ls"]);
    expect(parsed.ask).toEqual(["rtk run"]);
    expect(parsed.deny).toEqual(["find", "grep"]);
  });

  it("handles empty or missing permissions gracefully", () => {
    expect(parseSettingsPermissions(null)).toEqual({
      allow: [],
      ask: [],
      deny: [],
    });
    expect(parseSettingsPermissions({})).toEqual({
      allow: [],
      ask: [],
      deny: [],
    });
    expect(parseSettingsPermissions({ permissions: {} })).toEqual({
      allow: [],
      ask: [],
      deny: [],
    });
  });
});

describe("evaluateSettingsPermission", () => {
  const permissions = {
    allow: ["rtk ls", "cat"],
    ask: ["rtk run", "cat sensitive.txt"],
    deny: ["find", "grep", "cat blocked.txt"],
  };

  it("matches exact commands and prefix commands with spaces", () => {
    const res = evaluateSettingsPermission("rtk ls", permissions);
    expect(res).not.toBeNull();
    expect(res?.decision).toBe("allow");
    expect(res?.rule).toBe("command(rtk ls)");

    const resArgs = evaluateSettingsPermission("rtk ls -la src", permissions);
    expect(resArgs).not.toBeNull();
    expect(resArgs?.decision).toBe("allow");
  });

  it("enforces deny precedence over ask and allow", () => {
    const res = evaluateSettingsPermission("find . -name foo", permissions);
    expect(res?.decision).toBe("deny");
    expect(res?.rule).toBe("command(find)");

    const conflict = evaluateSettingsPermission("cat blocked.txt", permissions);
    expect(conflict?.decision).toBe("deny");
  });

  it("enforces ask precedence over allow", () => {
    const res = evaluateSettingsPermission("rtk run script.ts", permissions);
    expect(res?.decision).toBe("ask");
    expect(res?.rule).toBe("command(rtk run)");

    const conflict = evaluateSettingsPermission(
      "cat sensitive.txt",
      permissions,
    );
    expect(conflict?.decision).toBe("ask");
  });

  it("avoids false positives on word boundaries", () => {
    // "find" rule should not match "finder"
    expect(evaluateSettingsPermission("finder .", permissions)).toBeNull();
    // "grep" rule should not match "grep-tool"
    expect(evaluateSettingsPermission("grep-tool -r", permissions)).toBeNull();
  });

  it("returns null when no rule matches", () => {
    expect(evaluateSettingsPermission("git status", permissions)).toBeNull();
  });

  describe("chained command segmentation", () => {
    it("denies chained command if any segment matches deny", () => {
      const res = evaluateSettingsPermission(
        "rtk ls && find . -name secret",
        permissions,
      );
      expect(res?.decision).toBe("deny");
      expect(res?.rule).toBe("command(find)");
    });

    it("requires review if any segment matches ask", () => {
      const res = evaluateSettingsPermission(
        "rtk ls && rtk run script.ts",
        permissions,
      );
      expect(res?.decision).toBe("ask");
      expect(res?.rule).toBe("command(rtk run)");
    });

    it("allows chained command only if all segments match allow rules", () => {
      const res = evaluateSettingsPermission(
        "rtk ls && rtk ls -la",
        permissions,
      );
      expect(res?.decision).toBe("allow");
      expect(res?.rule).toBe("command(rtk ls) && command(rtk ls)");
    });

    it("does not auto-allow chained command when a segment lacks an allow rule", () => {
      const res = evaluateSettingsPermission(
        "rtk ls && curl http://example.com",
        permissions,
      );
      expect(res).toBeNull();
    });
  });
});
