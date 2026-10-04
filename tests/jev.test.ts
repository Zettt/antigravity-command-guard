import { describe, expect, it } from "bun:test";
import {
  buildJevBatteryRequest,
  createJevClient,
  parseJevBatteryResponse,
} from "../src/jev.ts";
import type { CommandContextState } from "../src/types.ts";

describe("buildJevBatteryRequest", () => {
  it("constructs judgment battery request matching schema", () => {
    const context: CommandContextState = {
      command: "rm -rf /tmp/test",
      cwd: "/workspace",
      workspace_root: "/workspace",
      goal: "Clean temporary files",
    };

    const req = buildJevBatteryRequest(context);
    expect(req.state).toBeDefined();
    expect(req.questions.severity).toBeDefined();
    expect(req.questions.severity.type).toBe("score");
    expect(req.questions.destructive.type).toBe("noul");
    expect(req.questions.outside_workspace.type).toBe("noul");
    expect(req.questions.intent_category.type).toBe("choice");
  });
});

describe("parseJevBatteryResponse", () => {
  it("extracts typed scores and probabilities from raw API response", () => {
    const rawApiResponse = {
      answers: {
        severity: { score: 1.2 },
        destructive: { noul: 0.15 },
        outside_workspace: { noul: 0.05 },
        intent_category: { choice: "build_and_test" },
      },
    };

    const result = parseJevBatteryResponse(rawApiResponse);
    expect(result.severity.score).toBe(1.2);
    expect(result.destructive.noul).toBe(0.15);
    expect(result.outside_workspace.noul).toBe(0.05);
    expect(result.intent_category.choice).toBe("build_and_test");
  });

  it("handles alternative response root envelopes", () => {
    const rawDirectResponse = {
      severity: { score: 2.8 },
      destructive: { noul: 0.85 },
      outside_workspace: { noul: 0.72 },
      intent_category: { choice: "destructive_deletion" },
    };

    const result = parseJevBatteryResponse(rawDirectResponse);
    expect(result.severity.score).toBe(2.8);
    expect(result.destructive.noul).toBe(0.85);
    expect(result.outside_workspace.noul).toBe(0.72);
    expect(result.intent_category.choice).toBe("destructive_deletion");
  });
});

describe("createJevClient", () => {
  it("executes evaluation via injected fetch mock", async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          answers: {
            severity: { score: 0.2 },
            destructive: { noul: 0.01 },
            outside_workspace: { noul: 0.01 },
            intent_category: { choice: "read_only_query" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = createJevClient({
      apiKey: "test-key",
      endpoint: "https://api.typesafe.ai/v1/battery",
      fetchFn: mockFetch as typeof fetch,
    });

    const result = await client.evaluate({
      command: "echo hello",
      cwd: "/repo",
      workspace_root: "/repo",
    });

    expect(result.severity.score).toBe(0.2);
    expect(result.destructive.noul).toBe(0.01);
    expect(result.outside_workspace.noul).toBe(0.01);
    expect(result.intent_category.choice).toBe("read_only_query");
  });
});
